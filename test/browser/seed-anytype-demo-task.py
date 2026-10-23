import datetime as dt
import json
import os

from CTFd import create_app

ACCOUNTS = json.loads(os.environ['ACCOUNTS_JSON'])

app = create_app()
with app.app_context():
    from CTFd.models import Users, db
    from CTFd.plugins.dojo_plugin.construction import Batch, Course, Task

    batch = Batch.query.filter_by(name='建设任务端到端验收批次').one()
    course = Course.query.filter_by(batch_id=batch.id, code='CN-BASE').one()
    peer = Users.query.filter_by(name=ACCOUNTS['peer']['name']).one()
    final = Users.query.filter_by(name=ACCOUNTS['final']['name']).one()

    existing = Task.query.filter_by(course_id=course.id, code='CN-BASE-CH02-02').first()
    if existing:
        print(json.dumps({'skipped': True, 'taskId': existing.id, 'status': existing.status}, ensure_ascii=False))
    else:
        task = Task(course_id=course.id, code='CN-BASE-CH02-02', title='传输层场景选择练习',
                    chapter='CH02', kind='quiz', status='open', peer_id=peer.id, final_id=final.id,
                    due=dt.date.today() + dt.timedelta(days=7), weight=2, revision=0,
                    brief={
                        'objective': '学习者能针对给定场景选择 TCP 或 UDP，并说明取舍理由。',
                        'audience': '计算机类专业二年级学生，已理解端口与分层概念。',
                        'deliverables': '一份可用于课堂的交付物，形态不限（课件、演示、实践题或测验均可）。',
                        'acceptance': '内容完整可读；结论与讲义一致；含答案或解析；标明引用位置。',
                        'sourceNotes': '依据 SRC-01 课程组讲义第 3 节 TCP/UDP 对比表。',
                        'sourceIds': ['SRC-01'], 'objectiveIds': ['OBJ-03'],
                        'collaboratorIds': [], 'dependencies': [], 'estimatedMinutes': 20,
                        'exclusions': '不包含拥塞控制算法细节。',
                    })
        db.session.add(task)
        db.session.commit()
        print(json.dumps({'taskId': task.id, 'code': task.code, 'kind': task.kind, 'status': task.status}, ensure_ascii=False))
