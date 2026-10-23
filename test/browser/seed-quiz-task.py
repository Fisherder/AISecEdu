import datetime as dt
import json
import os

from CTFd import create_app

ACCOUNTS = json.loads(os.environ['ACCOUNTS_JSON'])

app = create_app()
with app.app_context():
    from CTFd.models import Users, db
    from CTFd.plugins.dojo_plugin.construction import Batch, Member, Course, Task

    def user(key):
        return Users.query.filter_by(name=ACCOUNTS[key]['name']).one()

    batch = Batch.query.filter_by(name='建设任务端到端验收批次').one()
    course = Course.query.filter_by(batch_id=batch.id, code='CN-BASE').one()
    author, peer, final = user('author'), user('peer'), user('final')

    existing = Task.query.filter_by(course_id=course.id, code='CN-BASE-CH02-01').first()
    if existing:
        print(json.dumps({'skipped': True, 'taskId': existing.id}, ensure_ascii=False))
    else:
        today = dt.date.today()
        brief = {
            'objective': '学习者能根据场景在 TCP 与 UDP 之间做出选择，并说明可靠性与时延上的取舍理由。',
            'audience': '计算机类专业二年级学生，已理解分层模型与端口概念。',
            'deliverables': '一份小测验：不少于 5 道题，含题干、选项、标准答案、解析与评分规则。',
            'acceptance': '题目独立可完成；每题有答案与解析；无歧义或等价答案；计分与随机顺序已检查。',
            'sourceNotes': '依据 SRC-01 课程组讲义第 3 节中 TCP 与 UDP 的对比表；协议示例取自 SRC-02 第 2 章。',
            'sourceIds': ['SRC-01', 'SRC-02'],
            'objectiveIds': ['OBJ-03'],
            'collaboratorIds': [],
            'dependencies': [],
            'estimatedMinutes': 20,
            'exclusions': '不包含拥塞控制算法细节与 TCP 选项字段。',
        }
        task = Task(course_id=course.id, code='CN-BASE-CH02-01', title='TCP 与 UDP 选择测验',
                    chapter='CH02', kind='quiz', status='open', peer_id=peer.id, final_id=final.id,
                    due=today + dt.timedelta(days=6), weight=2, revision=0, brief=brief)
        db.session.add(task)
        db.session.commit()
        print(json.dumps({'taskId': task.id, 'code': task.code, 'kind': task.kind, 'status': task.status}, ensure_ascii=False))
