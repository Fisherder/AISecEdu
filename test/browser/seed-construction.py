import datetime as dt
import json
import secrets
import sys

from CTFd import create_app

import os

ACCOUNTS = json.loads(os.environ['ACCOUNTS_JSON']) if os.environ.get('ACCOUNTS_JSON') else json.load(open('/opt/pwn.college/.cache/construction/accounts.json'))

app = create_app()
with app.app_context():
    from CTFd.models import Users, db
    from CTFd.plugins.dojo_plugin.models import Dojos, DojoModules, DojoAdmins, MaterialCollections
    from CTFd.plugins.dojo_plugin.construction import Batch, Member, Course, Task, CHECKS

    def user(key):
        name = ACCOUNTS[key]['name']
        row = Users.query.filter_by(name=name).first()
        if not row:
            raise SystemExit(f'缺少教师账号 {name}，请先运行 provision-teachers.mjs')
        return row

    def workspace(key):
        slug = ACCOUNTS[key]['courseReference'].split('~')[0]
        dojo = Dojos.query.filter_by(id=slug).first()
        if not dojo:
            raise SystemExit(f'缺少教师创作空间 {slug}')
        if not DojoModules.query.filter_by(dojo_id=dojo.dojo_id, module_index=0).first():
            db.session.add(DojoModules(dojo=dojo, module_index=0, id='authoring', name='课程素材创作',
                                       description='在建设任务中心领取任务后，在此空间创作并自测。',
                                       show_scoreboard=False, show_challenges=True))
            db.session.flush()
        return dojo

    lead, author, peer, final = user('lead'), user('author'), user('peer'), user('final')
    ws = {key: workspace(key) for key in ('lead', 'author', 'peer', 'final')}

    existing = Batch.query.filter_by(name='建设任务端到端验收批次').first()
    if existing:
        print(json.dumps({'skipped': True, 'batchId': existing.id}, ensure_ascii=False))
        sys.exit(0)

    publisher = Users(name='build-publisher', email='build-publisher@example.invalid',
                      password=secrets.token_urlsafe(48), type='user', banned=True, hidden=True)
    db.session.add(publisher)
    db.session.flush()
    publisher_space = Dojos(id='build-publisher-space', name='建设素材发布空间', type='course',
                            private_key=secrets.token_hex(32))
    publisher_space.admins = [DojoAdmins(user=publisher)]
    db.session.add(publisher_space)
    db.session.flush()
    db.session.add(DojoModules(dojo=publisher_space, module_index=0, id='published', name='验收入库',
                               show_scoreboard=False, show_challenges=True))

    today = dt.date.today()
    batch = Batch(name='建设任务端到端验收批次', starts=today, ends=today + dt.timedelta(days=13),
                  publisher_id=publisher.id, status='active',
                  settings={'initialized': True, 'coordinatorIds': [lead.id],
                            'notice': '端到端验收：领取 → 创作 → 提交 → 复核 → 终审 → 入库。'})
    db.session.add(batch)
    db.session.flush()

    members = {
        'lead': Member(batch_id=batch.id, user_id=lead.id, name=ACCOUNTS['lead']['realName'],
                       role='coordinator', workspace_id=ws['lead'].dojo_id, active=True, wip_limit=3),
        'author': Member(batch_id=batch.id, user_id=author.id, name=ACCOUNTS['author']['realName'],
                         role='author', workspace_id=ws['author'].dojo_id, active=True, wip_limit=3),
        'peer': Member(batch_id=batch.id, user_id=peer.id, name=ACCOUNTS['peer']['realName'],
                       role='reviewer', workspace_id=ws['peer'].dojo_id, active=True, wip_limit=3),
        'final': Member(batch_id=batch.id, user_id=final.id, name=ACCOUNTS['final']['realName'],
                        role='reviewer', workspace_id=ws['final'].dojo_id, active=True, wip_limit=3),
    }
    for member in members.values():
        db.session.add(member)
    db.session.flush()

    collection = MaterialCollections(owner_id=publisher.id, name='计算机网络基础 · 验收素材')
    db.session.add(collection)
    db.session.flush()

    plan = {
        'audience': '计算机类专业二年级学生；已修完程序设计基础，未系统学习过计算机网络。',
        'chapters': [
            {'code': 'CH01', 'name': '网络分层与协议基础'},
            {'code': 'CH02', 'name': '传输层：TCP 与 UDP'},
        ],
        'objectives': [
            {'id': 'OBJ-01', 'chapter': 'CH01', 'text': '能说出 TCP/IP 四层模型各层职责并各举两个典型协议', 'requiredKinds': ['slides', 'practice']},
            {'id': 'OBJ-02', 'chapter': 'CH01', 'text': '能用抓包工具观察并解释一次完整的三次握手', 'requiredKinds': ['demo']},
            {'id': 'OBJ-03', 'chapter': 'CH02', 'text': '能根据场景在 TCP 与 UDP 之间做出选择并说明理由', 'requiredKinds': ['quiz']},
        ],
        'sources': [
            {'id': 'SRC-01', 'title': '计算机网络：自顶向下方法（第8版）', 'location': '课程资料区 / networking-topdown-8e.pdf 第 1 章 P12–P48', 'version': '2024 印刷版', 'permission': '可摘录概念与图示用于课件，须注明出处，不得整章复制'},
            {'id': 'SRC-02', 'title': 'Wireshark 官方用户指南', 'location': 'https://www.wireshark.org/docs/wsug_html_chunked/ 第 2–3 章', 'version': '4.2', 'permission': '可用于演示步骤与截图'},
        ],
    }
    course = Course(batch_id=batch.id, code='CN-BASE', name='计算机网络基础', final_user_id=final.id,
                    collection_id=collection.id, plan=plan, revision=1)
    db.session.add(course)
    db.session.flush()

    common = {
        'audience': '计算机类专业二年级学生，已修完程序设计基础；能使用命令行但不熟悉网络工具。',
        'sourceIds': ['SRC-01', 'SRC-02'],
        'collaboratorIds': [],
        'dependencies': [],
        'estimatedMinutes': 30,
        'exclusions': '不包含 IPv6 过渡技术与路由协议配置。',
    }
    specs = [
        dict(code='CN-BASE-CH01-01', title='网络分层模型核心概念课件', chapter='CH01', kind='slides',
             weight=3, days=4, peer=peer.id,
             objectiveIds=['OBJ-01'], minutes=45,
             objective='学习者能说出 TCP/IP 四层模型每层的职责，并为每层各举两个典型协议。',
             deliverables='一份可编辑的幻灯片课件（slide-deck），含分层概念、协议归属、常见误区与两道带解析的练习。',
             sourceNotes='以 SRC-01 第 1 章 P12–P48 的分层图与协议栈表为准；协议例子可补 SRC-02 第 2 章的抓包截图。',
             acceptance='逐页可读；分层职责表述与教材一致；两道练习均给出答案与解析；引用位置标注到页码。'),
        dict(code='CN-BASE-CH01-02', title='三次握手抓包观察实践题', chapter='CH01', kind='practice',
             weight=3, days=8, peer=peer.id,
             objectiveIds=['OBJ-02'], minutes=60,
             objective='学习者能用抓包工具捕获一次完整的 TCP 三次握手，并指出每个报文的作用与关键字段。',
             deliverables='完整题面、容器环境与起始文件、参考解或自动检查器、评分规则与重置方法。',
             sourceNotes='依据 SRC-02 第 3 章的抓包操作步骤；握手字段含义以 SRC-01 第 3 章为准。',
             acceptance='干净环境可运行；正确解通过、典型错误解失败；有边界测试与重置说明；学生视图不泄露答案。'),
    ]
    created = []
    for spec in specs:
        brief = {k: v for k, v in common.items()}
        brief.update({
            'objective': spec['objective'], 'deliverables': spec['deliverables'],
            'sourceNotes': spec['sourceNotes'], 'acceptance': spec['acceptance'],
            'objectiveIds': spec['objectiveIds'], 'estimatedMinutes': spec['minutes'],
        })
        task = Task(course_id=course.id, code=spec['code'], title=spec['title'], chapter=spec['chapter'],
                    kind=spec['kind'], status='open', peer_id=spec['peer'], final_id=final.id,
                    due=today + dt.timedelta(days=spec['days']), weight=spec['weight'], revision=0, brief=brief)
        db.session.add(task)
        created.append(spec['code'])

    db.session.commit()
    print(json.dumps({
        'batchId': batch.id, 'courseId': course.id, 'tasks': created,
        'members': {k: m.id for k, m in members.items()},
        'workspaces': {k: d.dojo_id for k, d in ws.items()},
        'kinds': list(CHECKS),
    }, ensure_ascii=False))
