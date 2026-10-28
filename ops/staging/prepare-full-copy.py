#!/usr/bin/env python3
import datetime
import json
import os
from pathlib import Path
import secrets
import shutil
import sqlite3
import subprocess
import sys

PRODUCTION = 'pwncollege-dojo'
CONTAINER = 'aisecedu-development'
DATASET = 'rpool/aisecedu-development'
SOURCE_DATASET = 'rpool/ROOT/ubuntu_ce07l6/srv'
MOUNT = Path('/srv/aisecedu-development-volume')
CONTROL = Path('/srv/aisecedu-development-control')
SOURCE = MOUNT / 'aisecedu-dojo'
DATA = SOURCE / 'data'
ORIGIN = 'http://127.0.0.1:28080'


def run(args, **kwargs):
    return subprocess.run(args, check=True, text=True, **kwargs)


def read(args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()


def private_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    path.chmod(0o600)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run this preparation as root on the deployment host')
    CONTROL.mkdir(mode=0o700, exist_ok=True)
    marker = CONTROL / 'state.json'
    if marker.exists():
        print(marker.read_text())
        return
    if subprocess.run(['zfs', 'list', DATASET], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise RuntimeError('Unregistered development dataset already exists; inspect before continuing')
    production = json.loads(read(['docker', 'inspect', PRODUCTION]))[0]
    config = json.loads(read(['docker', 'exec', PRODUCTION, 'dojo', 'compose', 'config', '--format', 'json']))
    all_containers = json.loads(read(['docker', 'exec', PRODUCTION, 'docker', 'ps', '-aq']).join(['["', '"]']).replace('\n', '\",\"'))
    inspected = json.loads(read(['docker', 'exec', PRODUCTION, 'docker', 'inspect', *all_containers]))
    by_service = {c['Config'].get('Labels', {}).get('com.docker.compose.service'): c for c in inspected
                  if c['Config'].get('Labels', {}).get('com.docker.compose.service')}
    for c in inspected:
        if c['Name'].lstrip('/') in config['services']:
            by_service[c['Name'].lstrip('/')] = c
    ctfd_env = dict(item.split('=', 1) for item in by_service['ctfd']['Config']['Env'] if '=' in item)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    snapshot = SOURCE_DATASET + '@aisecedu-development-' + stamp
    run(['zfs', 'snapshot', snapshot])
    run(['zfs', 'clone', '-o', f'mountpoint={MOUNT}', '-o', 'quota=60G', snapshot, DATASET])
    if read(['findmnt', '-n', '-o', 'SOURCE', '-T', str(DATA)]) != DATASET:
        raise RuntimeError('Development data is not on the isolated clone')
    state = {'sourceContainer': PRODUCTION, 'container': CONTAINER, 'dataset': DATASET, 'snapshot': snapshot,
             'source': str(SOURCE), 'data': str(DATA), 'origin': ORIGIN, 'stage': 'snapshot-created',
             'productionImage': production['Image'], 'services': {}}
    private_json(marker, state)
    docker_root = DATA / 'docker'
    for relative in ['containers', 'image/overlay2/layerdb/mounts']:
        path = docker_root / relative
        if path.exists():
            path.rename(path.with_name(path.name + '.production-snapshot'))
        path.mkdir(parents=True, exist_ok=True)
    volume_metadata = docker_root / 'volumes/metadata.db'
    if volume_metadata.exists():
        volume_metadata.rename(volume_metadata.with_name('metadata.db.production-snapshot'))
    redis = DATA / 'redis'
    if redis.exists():
        redis.rename(DATA / 'redis.production-snapshot')
    redis.mkdir()
    (DATA / 'postgres/postmaster.pid').unlink(missing_ok=True)
    config_path = DATA / 'config.env'
    values = dict(line.split('=', 1) for line in config_path.read_text().splitlines() if '=' in line and not line.startswith('#'))
    shared = {'SECRET_KEY': secrets.token_hex(32), 'WORKSPACE_SECRET': secrets.token_hex(32),
              'DOJO_SSH_SERVICE_KEY': secrets.token_hex(32), 'GLOBAL_AGENT_RUNTIME_TICKET_SECRET': secrets.token_hex(32),
              'GLOBAL_AGENT_RUNTIME_SERVICE_SECRET': secrets.token_hex(32)}
    values.update(shared)
    values.update({'DOJO_HOST': '127.0.0.1', 'WORKSPACE_HOST': '127.0.0.1', 'WORKSPACE_HTTPS_PORT': '4443',
                   'DOJO_IP_MODE': 'true', 'DOJO_HTTP_ENABLED': 'true', 'DOJO_ENV': 'production', 'DOJO_OFFLINE': 'true',
                   'WORKSPACE_NODE': '0', 'WORKSPACE_KEY': '', 'GLOBAL_AGENT_RUNTIME_PUBLIC_ORIGIN': ORIGIN + '/agent-runtime',
                   'AISECEDU_PUBLIC_ORIGIN': ORIGIN, 'GLOBAL_AGENT_RUNTIME_FRAME_ANCESTORS': ORIGIN,
                   'GLOBAL_AGENT_RUNTIME_DATA_VOLUME': 'pwncollege_agent-runtime-data'})
    disabled = ['MAIL_SERVER', 'MAIL_PORT', 'MAIL_USERNAME', 'MAIL_PASSWORD', 'MAIL_ADDRESS', 'DISCORD_CLIENT_ID',
                'DISCORD_CLIENT_SECRET', 'DISCORD_BOT_TOKEN', 'DISCORD_GUILD_ID', 'S3_BACKUP_BUCKET',
                'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'DOCKER_USERNAME', 'DOCKER_TOKEN']
    values.update({key: '' for key in disabled})
    config_path.write_text(''.join(f'{key}={value}\n' for key, value in values.items()))
    config_path.chmod(0o600)
    (DATA / 'workspace_nodes.json').write_text('{}\n')
    wireguard = DATA / 'wireguard'
    if wireguard.exists():
        wireguard.rename(DATA / 'wireguard.production-snapshot')
    overrides = {'services': {}}
    for name, service in config['services'].items():
        current = by_service.get(name)
        if not current:
            raise RuntimeError('Production image is missing for service: ' + name)
        env = dict(item.split('=', 1) for item in current['Config']['Env'] if '=' in item)
        for key in list(env):
            if key in disabled:
                env[key] = ''
            elif key in shared:
                env[key] = shared[key]
            elif key in ['DOJO_HOST', 'WORKSPACE_HOST']:
                env[key] = '127.0.0.1'
            elif key == 'GLOBAL_AGENT_RUNTIME_PUBLIC_ORIGIN':
                env[key] = ORIGIN + '/agent-runtime'
            elif key == 'AISECEDU_PUBLIC_ORIGIN':
                env[key] = ORIGIN
            elif key == 'ALLOWED_FRAME_ANCESTORS':
                env[key] = ORIGIN
            elif key == 'AISECEDU_SERVICE_SECRET':
                env[key] = shared['GLOBAL_AGENT_RUNTIME_SERVICE_SECRET']
            elif key == 'WORKSPACE_HTTPS_PORT':
                env[key] = '4443'
        if name == 'agent-runtime':
            env['AISECEDU_TEACHING_DEMO_ENGINE'] = 'html-v1'
        if any(key in env for key in ['DOJO_AI_API_KEY', 'DEEPSEEK_API_KEY']):
            for key in ['DOJO_AI_API_KEY', 'DEEPSEEK_API_KEY', 'DOJO_AI_BASE_URL']:
                if key in env and ctfd_env.get(key):
                    env[key] = ctfd_env[key]
        entry = {'image': current['Image'], 'pull_policy': 'never', 'environment': env}
        if current['Config']['Cmd'] is not None:
            entry['command'] = current['Config']['Cmd']
        if current['Config']['Entrypoint'] is not None:
            entry['entrypoint'] = current['Config']['Entrypoint']
        overrides['services'][name] = entry
        state['services'][name] = {'image': current['Image'], 'reference': current['Config']['Image']}
    private_json(SOURCE / 'docker-compose.staging.yml', overrides)
    compose_wrapper = SOURCE / 'dojo/dojo'
    wrapper = compose_wrapper.read_text()
    needle = '        args=(--env-file=/data/config.env)'
    replacement = needle + '\n        args+=(-f docker-compose.yml -f docker-compose.override.yml -f docker-compose.staging.yml)'
    if needle not in wrapper:
        raise RuntimeError('Production Compose wrapper differs from expected source')
    compose_wrapper.write_text(wrapper.replace(needle, replacement))
    service_file = CONTROL / 'pwn.college.service'
    service_file.write_text('[Unit]\nDescription=AISecEdu full development stack\nRequires=docker.service\nAfter=docker.service\nConditionPathExists=/data/.staging-ready\n\n[Service]\nType=oneshot\nRemainAfterExit=true\nWorkingDirectory=/opt/pwn.college\nExecStart=/usr/local/bin/dojo up\nExecStop=/usr/local/bin/dojo compose down\n\n[Install]\nWantedBy=multi-user.target\n')
    state['stage'] = 'isolated-data-and-configuration-ready'
    private_json(marker, state)
    print(json.dumps({key: state[key] for key in ['container', 'source', 'data', 'snapshot', 'stage']}), flush=True)


if __name__ == '__main__':
    main()
