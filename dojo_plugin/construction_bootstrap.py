import datetime as dt
import secrets

from CTFd.models import Users, db
from .models import Dojos, DojoModules, DojoAdmins, MaterialCollections
from .construction import Batch, Member, Course, Task, CHECKS
from .account_activation import require_password_change


INITIAL_COURSES = ['密码学基础', '网络安全基础', 'Web 应用安全', '软件安全与逆向分析', '系统安全与综合实践']


def bootstrap(prefix='coursebuild26', coordinator_id=None):
    existing = Batch.query.filter_by(name='课程素材共建 · 两周首批').first() if prefix == 'coursebuild26' else None
    if existing:
        raise ValueError('首批团队已经建立，不会重复创建或覆盖密码。')
    credentials = []
    publisher = Users(name=prefix + '-publisher', email=prefix + '-publisher@example.invalid', password=secrets.token_urlsafe(48), type='user', banned=True, hidden=True)
    db.session.add(publisher)
    db.session.flush()
    start = dt.date.today()
    batch = Batch(name='课程素材共建 · 两周首批' if prefix == 'coursebuild26' else prefix,
                  starts=start, ends=start+dt.timedelta(days=13), publisher_id=publisher.id, status='active',
                  settings={'initialized': True, 'coordinatorIds': [coordinator_id] if coordinator_id else [],
                            'notice': '初始化课程名称及任务模板，正式领取前须按真实在授课程补齐资料与目标。',
                            'milestones': ['第 1–2 天：资料与首件校准', '第 3–5 天：首批自测互审', '第 6–10 天：修订与终审', '第 11–14 天：入库、选用、章节联调']})
    db.session.add(batch)
    db.session.flush()
    members = []
    for index in range(1,9):
        username = prefix + '-%02d' % index
        password = secrets.token_urlsafe(18)
        name = ('创作者 ' if index<=6 else '终审教师 ') + ('%02d' % (index if index<=6 else index-6))
        user = Users(name=username, email=username+'@example.invalid', password=password, type='user', verified=True)
        db.session.add(user)
        db.session.flush()
        workspace = Dojos(id=prefix+'-%02d'%index, name=name+' · 独立创作空间', type='course', private_key=secrets.token_hex(32))
        workspace.admins = [DojoAdmins(user=user)]
        db.session.add(workspace)
        db.session.flush()
        db.session.add(DojoModules(dojo=workspace, module_index=0, id='authoring', name='课程素材创作', description='在任务中心领取任务，再使用此空间创作；完成自测后提交固定版本。', show_scoreboard=False, show_challenges=True))
        member = Member(batch_id=batch.id, user_id=user.id, name=name, role='author' if index<=6 else 'reviewer' if index==7 else 'coordinator', workspace_id=workspace.dojo_id, active=True, wip_limit=2, data={'initialized': True})
        db.session.add(member)
        require_password_change(user)
        members.append(member)
        credentials.append({'name':name,'username':username,'password':password,'role':member.role})
    db.session.flush()
    publisher_space = Dojos(id=prefix+'-pub', name='建设素材发布空间', type='course', private_key=secrets.token_hex(32))
    publisher_space.admins = [DojoAdmins(user=publisher)]
    db.session.add(publisher_space)
    db.session.flush()
    db.session.add(DojoModules(dojo=publisher_space, module_index=0, id='published', name='验收入库', show_scoreboard=False, show_challenges=True))
    for index, name in enumerate(INITIAL_COURSES,1):
        final = members[6+(index-1)%2]
        collection = MaterialCollections(owner_id=publisher.id, name=f'初始化 {index:02d} · {name}')
        db.session.add(collection)
        db.session.flush()
        course = Course(batch_id=batch.id, code=f'C{index:02d}', name=collection.name, final_user_id=final.user_id,
                        collection_id=collection.id, plan={'audience':'待按实际在授课程确认','chapters':[{'code':'CH01','name':'首个试点教学单元（待对齐实际章节）'}], 'objectives':[], 'sources':[]}, revision=1)
        db.session.add(course)
        db.session.flush()
        for offset, kind in enumerate(CHECKS):
            title={'slides':'核心概念与例题课件','demo':'关键过程演示','practice':'知识应用实践题','quiz':'目标达成测验'}[kind]
            task=Task(course_id=course.id, code=f'C{index:02d}-CH01-{offset+1:02d}', title=title+'（待对齐真实课程）', chapter='CH01', kind=kind, status='planning',
                      peer_id=members[(index+offset)%6].user_id, final_id=final.user_id, due=start+dt.timedelta(days=4 if kind in ('slides','quiz') else 8), weight=3 if kind=='practice' else 2,
                      brief={'objective':'','audience':'','deliverables':{'slides':'一份可编辑小节课件，包含概念、例子、误区与练习解析。','demo':'一个完整可运行演示，包含操作说明、观察问题、关键状态和重置。','practice':'完整题面、环境、起始文件、参考解或检查器、评分和重置方法。','quiz':'围绕一个学习目标的小题组，每题含答案、解析与评分规则。'}[kind],
                             'acceptance':'；'.join(CHECKS[kind]),'sourceNotes':'','sourceIds':[],'objectiveIds':[],'collaboratorIds':[],'dependencies':[],'estimatedMinutes':30,'exclusions':'不包含与实际教学目标无关的拓展内容。'})
            db.session.add(task)
    db.session.flush()
    return {'batchId':batch.id,'credentials':credentials,'members':len(members),'courses':5,'plannedTasks':20}
