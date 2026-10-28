#!/usr/bin/python3 -I
import argparse
import contextlib
import dataclasses
import grp
import json
import os
from pathlib import Path
import pwd
import re
import shutil
import sqlite3
import sys
import time
import uuid


TEAM_ROOT = Path('/srv/aisecedu-team')
TASK_KINDS = ('check', 'build', 'browser', 'workspace')


@dataclasses.dataclass(frozen=True)
class Actor:
    uid: int
    name: str
    admin: bool = False


def commit_id(value):
    if not re.fullmatch(r'[a-f0-9]{40}', value):
        raise ValueError('请提供完整的 40 位 Git commit。')
    return value


def capacity(kind):
    if kind == 'check':
        return
    memory = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
    available = int(memory['MemAvailable'].split()[0]) * 1024
    peak = {'build': 6, 'browser': 2, 'workspace': 4}[kind] * 1024 ** 3
    if available < peak + 8 * 1024 ** 3:
        raise ValueError('内存余量不足，任务继续排队。')
    if shutil.disk_usage(TEAM_ROOT).free < 110 * 1024 ** 3:
        raise ValueError('存储余量不足 110 GiB，重型任务继续排队。')


def public_text(value, limit=800):
    value = str(value).strip()
    value = re.sub(r'(?i)(password|token|secret|api[_-]?key)\s*[:=]\s*\S+', r'\1=[REDACTED]', value)
    if not value or len(value) > limit:
        raise ValueError(f'说明须为 1 至 {limit} 个字符。')
    return value


class Coordinator:
    def __init__(self, database, clock=time.time):
        self.clock = clock
        self.db = sqlite3.connect(database, timeout=10, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
            CREATE TABLE IF NOT EXISTS lease (
                singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                uid INTEGER NOT NULL, owner TEXT NOT NULL, commit_id TEXT NOT NULL,
                purpose TEXT NOT NULL, created REAL NOT NULL, expires REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY, uid INTEGER NOT NULL, owner TEXT NOT NULL,
                kind TEXT NOT NULL, commit_id TEXT NOT NULL, purpose TEXT NOT NULL,
                status TEXT NOT NULL, created REAL NOT NULL, updated REAL NOT NULL,
                note TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL,
                payload TEXT NOT NULL, created REAL NOT NULL
            );
        ''')

    @contextlib.contextmanager
    def transaction(self):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            yield
        except BaseException:
            self.db.rollback()
            raise
        else:
            self.db.commit()

    def event(self, actor, action, payload):
        self.db.execute('INSERT INTO events(actor, action, payload, created) VALUES(?,?,?,?)',
                        (actor.name, action, json.dumps(payload, ensure_ascii=False), self.clock()))

    def status(self, actor):
        lease = self.db.execute('SELECT * FROM lease').fetchone()
        where, values = ('', ()) if actor.admin else (' WHERE uid=?', (actor.uid,))
        tasks = self.db.execute('SELECT * FROM tasks' + where + ' ORDER BY created DESC LIMIT 30', values).fetchall()
        current = dict(lease) if lease else None
        if current:
            current['expired'] = current['expires'] <= self.clock()
        return {'lease': current, 'tasks': [dict(row) for row in tasks],
                'executor': 'manual', 'notice': '任务登记不自动构建或部署；由维护者领取执行。'}

    def reserve(self, actor, commit, purpose, minutes):
        commit, purpose = commit_id(commit), public_text(purpose)
        if not 15 <= minutes <= 240:
            raise ValueError('预约时长须为 15 至 240 分钟。')
        with self.transaction():
            if self.db.execute('SELECT 1 FROM lease').fetchone():
                raise ValueError('开发环境已有预约；过期预约也须显式交还，不能覆盖正在运行的工作。')
            now = self.clock()
            self.db.execute('INSERT INTO lease VALUES(1,?,?,?,?,?,?)',
                            (actor.uid, actor.name, commit, purpose, now, now + minutes * 60))
            self.event(actor, 'reserve', {'commit': commit, 'minutes': minutes})
        return self.status(actor)

    def release(self, actor, note):
        note = public_text(note)
        with self.transaction():
            lease = self.db.execute('SELECT * FROM lease').fetchone()
            if lease is None:
                raise ValueError('当前没有预约。')
            if lease['uid'] != actor.uid and not actor.admin:
                raise PermissionError('只能交还自己的预约。')
            if self.db.execute("SELECT 1 FROM tasks WHERE status='RUNNING'").fetchone():
                raise ValueError('仍有运行中任务；维护者核对实际进程与结果后再交还。')
            self.db.execute('DELETE FROM lease')
            self.event(actor, 'release', {'owner': lease['owner'], 'note': note})
        return self.status(actor)

    def request(self, actor, kind, commit, purpose):
        commit, purpose = commit_id(commit), public_text(purpose)
        if kind not in TASK_KINDS:
            raise ValueError('不支持的任务类型。')
        task_id, now = uuid.uuid4().hex, self.clock()
        with self.transaction():
            self.db.execute('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?,?,?)',
                            (task_id, actor.uid, actor.name, kind, commit, purpose, 'QUEUED', now, now, ''))
            self.event(actor, 'request', {'id': task_id, 'kind': kind, 'commit': commit})
        return {'id': task_id, 'status': 'QUEUED', 'executor': 'manual'}

    def resolve(self, actor, task_id, status, note):
        if not actor.admin:
            raise PermissionError('只有维护者可以领取或结束任务。')
        if not re.fullmatch(r'[a-f0-9]{32}', task_id):
            raise ValueError('任务编号无效。')
        note = public_text(note)
        with self.transaction():
            task = self.db.execute('SELECT * FROM tasks WHERE id=?', (task_id,)).fetchone()
            if task is None:
                raise ValueError('任务不存在。')
            allowed = {'QUEUED': {'RUNNING', 'CANCELED'}, 'RUNNING': {'SUCCEEDED', 'FAILED', 'CANCELED'}}
            if status not in allowed.get(task['status'], set()):
                raise ValueError('任务状态变化无效。')
            if status == 'RUNNING':
                if self.db.execute("SELECT 1 FROM tasks WHERE status='RUNNING'").fetchone():
                    raise ValueError('另一个任务正在运行；第一阶段采用串行人工调度。')
                if task['kind'] in {'browser', 'workspace'}:
                    lease = self.db.execute('SELECT * FROM lease').fetchone()
                    if lease is None or lease['commit_id'] != task['commit_id'] or lease['uid'] != task['uid']:
                        raise ValueError('完整验收必须绑定同一申请人和 commit 的预约。')
            self.db.execute('UPDATE tasks SET status=?, updated=?, note=? WHERE id=?',
                            (status, self.clock(), note, task_id))
            self.event(actor, 'resolve', {'id': task_id, 'status': status, 'note': note})
        return {'id': task_id, 'status': status}


def system_actor():
    if os.geteuid() != 0:
        raise PermissionError('请使用服务器安装的 aisecedu-dev 入口。')
    uid = int(os.environ.get('SUDO_UID', '0'))
    account = pwd.getpwuid(uid)
    groups = {grp.getgrgid(gid).gr_name for gid in os.getgrouplist(account.pw_name, account.pw_gid)}
    admin = uid == 0 or 'aisecedu-maintainers' in groups
    if not admin and 'aisecedu-dev' not in groups:
        raise PermissionError('当前账号尚未接入开发团队。')
    return Actor(uid, account.pw_name, admin)


def main():
    parser = argparse.ArgumentParser(description='AISecEdu 共享开发预约与人工任务登记；不执行用户代码或部署。')
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('status')
    reserve = sub.add_parser('reserve')
    reserve.add_argument('commit')
    reserve.add_argument('--purpose', required=True)
    reserve.add_argument('--minutes', type=int, default=90)
    release = sub.add_parser('release')
    release.add_argument('--note', required=True)
    request = sub.add_parser('request')
    request.add_argument('kind', choices=TASK_KINDS)
    request.add_argument('commit')
    request.add_argument('--purpose', required=True)
    resolve = sub.add_parser('resolve')
    resolve.add_argument('id')
    resolve.add_argument('status', choices=('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED'))
    resolve.add_argument('--note', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    actor = system_actor()
    coordinator = Coordinator(TEAM_ROOT / 'control' / 'coordination.sqlite3')
    try:
        if args.command == 'status':
            result = coordinator.status(actor)
            environment = TEAM_ROOT / 'public' / 'environment.json'
            result['environment'] = json.loads(environment.read_text()) if environment.is_file() else None
        elif args.command == 'reserve':
            result = coordinator.reserve(actor, args.commit, args.purpose, args.minutes)
        elif args.command == 'release':
            result = coordinator.release(actor, args.note)
        elif args.command == 'request':
            result = coordinator.request(actor, args.kind, args.commit, args.purpose)
        else:
            if not actor.admin:
                raise PermissionError('只有维护者可以领取或结束任务。')
            if args.status == 'RUNNING':
                task = coordinator.db.execute('SELECT kind FROM tasks WHERE id=?', (args.id,)).fetchone()
                if task is not None:
                    capacity(task['kind'])
            result = coordinator.resolve(actor, args.id, args.status, args.note)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        coordinator.db.close()


if __name__ == '__main__':
    try:
        main()
    except (ValueError, PermissionError, OSError, sqlite3.Error) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
