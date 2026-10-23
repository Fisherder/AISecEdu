import copy
import datetime as dt
import json
import secrets
from urllib.parse import quote, urlencode

from CTFd.models import Users, db
from sqlalchemy import func, or_

from .agent_runtime.scope import ScopeError
from .construction_files import FILE_CHECKS, FILE_CONTENT_TYPE, file_limits, file_snapshot
from .material_library import CONTENT_TYPES, LibraryConflict, _hash, _text, _integer, require_library_teacher
from .models import (
    Dojos, DojoAdmins, DojoModules, TeachingArtifacts, TeachingAssignments, LearningDrafts,
    MaterialCollections, MaterialCollectionItems, MaterialLibraryItems, MaterialLibraryVersions, MaterialLibraryImports,
)
from .models.construction import (
    ConstructionBatches as Batch, ConstructionMembers as Member, ConstructionCourses as Course,
    ConstructionTasks as Task, ConstructionSubmissions as Submission, ConstructionSpaces as Space,
    ConstructionReleases as Release, ConstructionEvents as Event, ConstructionNotices as Notice,
)

KINDS = {'slides': '课件', 'demo': '演示', 'practice': '实践题目', 'quiz': '测验', 'any': '不限（任意类型）'}
PRODUCT_KINDS = ('slides', 'demo', 'practice', 'quiz')
STATES = {'planning': '待完善', 'open': '可领取', 'working': '创作中', 'peer_review': '待复核',
          'final_review': '待终审', 'changes_requested': '待返修', 'release_pending': '待入库',
          'released': '已入库', 'canceled': '已取消'}
ACTIVE = ('working', 'peer_review', 'final_review', 'changes_requested', 'release_pending')
CHECKS = {
    'slides': ['逐页预览可读', '事实公式代码正确', '例题答案核对', '来源与目标覆盖'],
    'demo': ['完整运行与关键状态', '交互控制和重置', '预期现象符合原理', '资源依赖可获取'],
    'practice': ['干净环境运行', '正确解通过', '典型错误解失败', '边界测试与重置', '学生视图无答案泄露'],
    'quiz': ['独立完成全部题目', '答案及解析核对', '无歧义或等价答案规则', '计分与随机顺序检查'],
}
SOURCE_KINDS = {'artifact': '课件、演示及其他项目', 'practice': '实践题目草稿',
                'assignment': '测验与作业', 'challenge': '已发布实践题目'}
TYPE_KINDS = {'slide-deck': 'slides', 'lesson-plan': 'slides', 'interactive-lesson': 'slides',
              'learning-path': 'slides', 'classroom-scenario': 'slides',
              'simulation': 'demo', 'attack-defense-scene': 'demo', 'debate': 'demo', 'roleplay': 'demo', 'vulnerable-lab': 'demo',
              'practice': 'practice', 'challenge': 'practice',
              'quiz': 'quiz', 'question-set': 'quiz', 'knowledge-test': 'quiz',
              'assessment': 'quiz', 'assignment': 'quiz'}


CHECK_FAMILY = TYPE_KINDS


def check_family(content_type, fallback):
    if content_type in PRODUCT_KINDS:
        return content_type
    return TYPE_KINDS.get(content_type, fallback if fallback in PRODUCT_KINDS else 'slides')


def submission_checks(content_type):
    return FILE_CHECKS if content_type == FILE_CONTENT_TYPE else CHECKS[check_family(content_type, 'slides')]


def now():
    return dt.datetime.utcnow()


def stamp(value):
    return value.isoformat() + ('Z' if isinstance(value, dt.datetime) else '') if value else None


def date(value):
    try:
        return dt.date.fromisoformat(value)
    except (ValueError, TypeError):
        raise ValueError('请填写有效日期。') from None


def access(user, batch_id, *, manage=False, lock=False):
    query = Batch.query.filter_by(id=batch_id)
    batch = (query.with_for_update().populate_existing() if lock else query).first()
    if not batch:
        raise ScopeError('建设批次不存在。')
    member = Member.query.filter_by(batch_id=batch.id, user_id=user.id, active=True).first()
    admin = getattr(user, 'type', None) == 'admin' or user.id in batch.settings.get('coordinatorIds', [])
    if not admin and (not member or (manage and member.role != 'coordinator')):
        raise ScopeError('没有此建设批次的操作权限。')
    return batch, member


def audit(batch, user, action, task=None, **data):
    db.session.add(Event(batch_id=batch.id, actor_id=user.id, task_id=task.id if task else None,
                         action=action, data=data))


def task_access(user, task_id, *, lock=False):
    task = Task.query.filter_by(id=task_id).first()
    if not task:
        raise ScopeError('任务不存在。')
    course = Course.query.filter_by(id=task.course_id).one()
    batch, member = access(user, course.batch_id, lock=lock)
    if lock:
        db.session.refresh(task)
    return task, course, batch, member


def revision(row, body):
    if body.get('revision') != row.revision:
        raise LibraryConflict('页面内容已变化，请刷新后重试。')


def touch(task):
    task.revision += 1
    task.updated = now()


def member_for(batch, user_id, *, activated=False):
    member = Member.query.filter_by(batch_id=batch.id, user_id=user_id, active=True).first()
    if not member or (activated and not member.activated):
        raise ValueError('请选择已启用并完成激活的团队成员。' if activated else '请选择有效团队成员。')
    return member


def is_manager(user, member, batch):
    return getattr(user, 'type', None) == 'admin' or user.id in batch.settings.get('coordinatorIds', []) or bool(member and member.role == 'coordinator')


def task_view(task):
    return {'id': task.id, 'courseId': task.course_id, 'code': task.code, 'title': task.title,
            'chapter': task.chapter, 'kind': task.kind, 'status': task.status, 'ownerId': task.owner_id,
            'peerId': task.peer_id, 'finalId': task.final_id, 'due': stamp(task.due), 'weight': task.weight,
            'revision': task.revision, 'brief': task.brief, 'blocked': task.blocked,
            'submissionId': task.current_submission, 'materialId': task.material_id,
            'releaseError': task.release_error, 'updated': stamp(task.updated)}


def context(user, batch_id=None):
    batches = [b for b in Batch.query.order_by(Batch.starts.desc()).all() if user.type == 'admin' or user.id in b.settings.get('coordinatorIds', []) or Member.query.filter_by(batch_id=b.id, user_id=user.id, active=True).first()]
    if not batches:
        return {'batches': [], 'user': {'id': user.id, 'name': user.name}, 'notices': notices(user)}
    batch_id = batch_id or batches[0].id
    batch, member = access(user, batch_id)
    courses = Course.query.filter_by(batch_id=batch.id).order_by(Course.code).all()
    tasks = Task.query.filter(Task.course_id.in_([c.id for c in courses])).order_by(Task.code).all()
    people = Member.query.filter_by(batch_id=batch.id).order_by(Member.name).all()
    user_names = dict(db.session.query(Users.id, Users.name).filter(Users.id.in_([m.user_id for m in people])).all())
    live = [t for t in tasks if t.status != 'canceled']
    released = {r.submission_id for r in Release.query.filter_by(revoked=False).all()}
    done_ids = {s.task_id for s in Submission.query.filter(Submission.id.in_(released)).all()}
    total_weight = sum(t.weight for t in live)
    return {
        'batches': [{'id': b.id, 'name': b.name, 'starts': stamp(b.starts), 'ends': stamp(b.ends), 'status': b.status} for b in batches],
        'batch': {'id': batch.id, 'name': batch.name, 'starts': stamp(batch.starts), 'ends': stamp(batch.ends), 'status': batch.status, 'settings': batch.settings},
        'user': {'id': user.id, 'name': user.name, 'canManage': is_manager(user, member, batch), 'activated': bool(member and member.activated), 'memberId': member.id if member else None,
                 'workspaceId': member.workspace_id if member else None,
                 'courseBindings': (member.data or {}).get('courseBindings', {}) if member else {}},
        'members': [{'id': m.id, 'userId': m.user_id, 'name': m.name, 'username': user_names.get(m.user_id), 'role': m.role, 'active': m.active, 'activated': bool(m.activated), 'wipLimit': m.wip_limit,
                     'inProgress': sum(t.owner_id == m.user_id and t.status in ACTIVE for t in tasks)} for m in people],
        'courses': [course_view(c) for c in courses], 'tasks': [task_view(t) for t in tasks],
        'kinds': KINDS, 'states': STATES, 'checks': CHECKS, 'types': CONTENT_TYPES,
        'metrics': {'planned': len(live), 'released': len(done_ids & {t.id for t in live}), 'totalWeight': total_weight,
                    'releasedWeight': sum(t.weight for t in live if t.id in done_ids), 'blocked': sum(bool(t.blocked) for t in live),
                    'overdue': sum(t.due < dt.date.today() and t.status not in ('released', 'canceled') for t in tasks),
                    'peerPending': sum(t.status == 'peer_review' for t in tasks), 'finalPending': sum(t.status == 'final_review' for t in tasks),
                    'releasePending': sum(t.status == 'release_pending' for t in tasks)},
        'notices': notices(user),
    }


def course_view(course):
    tasks = Task.query.filter_by(course_id=course.id).all()
    valid_submissions = Submission.query.join(Release, Release.submission_id == Submission.id).filter(Release.revoked.is_(False), Submission.task_id.in_([t.id for t in tasks])).all()
    objectives = course.plan.get('objectives', [])
    coverage = [{'id': o['id'], 'text': o['text'], 'chapter': o['chapter'], 'requiredKinds': o.get('requiredKinds', []),
                 'coveredKinds': sorted({s.snapshot.get('constructionTask', {}).get('kind') for s in valid_submissions if any(saved.get('id') == o['id'] and saved.get('chapter') == o['chapter'] and saved.get('text') == o['text'] for saved in s.snapshot.get('constructionTask', {}).get('objectives', []))})} for o in objectives]
    return {'id': course.id, 'code': course.code, 'name': course.name, 'finalId': course.final_user_id,
            'revision': course.revision, 'plan': course.plan, 'coverage': coverage}


def detail(user, task_id):
    task, course, batch, member = task_access(user, task_id)
    rows = Submission.query.filter_by(task_id=task.id).order_by(Submission.number.desc()).all()
    manager = is_manager(user, member, batch)
    visible = manager or user.id in {task.owner_id, task.peer_id, task.final_id} or user.id in task.brief.get('collaboratorIds', [])
    submissions = []
    for row in rows:
        if not visible and user.id not in {row.author_id, row.peer_id, row.final_id}:
            continue
        release = Release.query.filter_by(submission_id=row.id).first()
        construction = row.snapshot.get('constructionTask') or {}
        submissions.append({'id': row.id, 'number': row.number, 'authorId': row.author_id, 'authors': row.authors,
                            'source': row.source, 'contentHash': row.content_hash, 'evidence': row.evidence,
                            'checks': submission_checks(row.snapshot['type']), 'contentType': row.snapshot['type'],
                            'productKind': construction.get('kind') or task.kind,
                            'taskKind': construction.get('taskKind') or task.kind,
                            'peer': row.peer, 'final': row.final, 'created': stamp(row.created),
                            'nativeHref': row.native_copy.get('href'),
                            'release': {'id': release.id, 'version': release.version, 'revoked': release.revoked, 'reason': release.reason} if release else None})
    events = Event.query.filter_by(task_id=task.id).order_by(Event.created.desc()).limit(100).all()
    return {'task': task_view(task), 'submissions': submissions, 'events': [{'action': e.action, 'actorId': e.actor_id, 'created': stamp(e.created), 'data': e.data} for e in events]}


def save_course(user, course_id, body):
    course = Course.query.filter_by(id=course_id).first()
    if not course:
        raise ScopeError('课程不存在。')
    batch, member = access(user, course.batch_id, lock=True)
    if not is_manager(user, member, batch) and course.final_user_id != user.id:
        raise ScopeError('仅统筹人员和课程终审可调整课程规划。')
    db.session.refresh(course)
    revision(course, body)
    name = _text(body.get('name'), 160, '课程名称')
    plan = body.get('plan')
    if not isinstance(plan, dict) or len(json.dumps(plan, ensure_ascii=False)) > 80000:
        raise ValueError('课程规划格式或长度无效。')
    chapters, objectives, sources = plan.get('chapters', []), plan.get('objectives', []), plan.get('sources', [])
    if not isinstance(chapters, list) or not chapters or len(chapters) > 60:
        raise ValueError('请设置 1–60 个章节。')
    if len({c['code'] for c in chapters}) != len(chapters):
        raise ValueError('章节编码不能重复。')
    chapter_ids = {c['code'] for c in chapters}
    if not isinstance(objectives, list) or len(objectives) > 300 or len({o['id'] for o in objectives}) != len(objectives):
        raise ValueError('学习目标编号不能重复，最多 300 项。')
    for c in chapters:
        _text(c.get('code'), 32, '章节编码'); _text(c.get('name'), 120, '章节名称')
    for o in objectives:
        _text(o.get('id'), 48, '目标编号'); _text(o.get('text'), 1000, '学习目标')
        if o.get('chapter') not in chapter_ids or not isinstance(o.get('requiredKinds'), list) or set(o['requiredKinds']) - set(PRODUCT_KINDS):
            raise ValueError('目标章节或产物要求无效。')
        if not o['requiredKinds'] and not o.get('waiverReason'):
            raise ValueError('无需产物的目标必须注明豁免理由。')
    if not isinstance(sources, list) or len({s['id'] for s in sources}) != len(sources):
        raise ValueError('资料编号不能重复。')
    for s in sources:
        for key in ('id', 'title', 'location', 'version', 'permission'):
            _text(s.get(key), 2000, '资料的编号、名称、位置、版本和使用范围')
    existing_tasks = Task.query.filter_by(course_id=course.id).filter(Task.status != 'canceled').all()
    objective_ids = {o['id'] for o in objectives}
    if any(t.chapter not in chapter_ids or set(t.brief.get('objectiveIds', [])) - objective_ids for t in existing_tasks):
        raise ValueError('现有任务仍引用被删除的章节或目标，请先调整任务。')
    final_id = body.get('finalId', course.final_user_id)
    if final_id != course.final_user_id:
        if not is_manager(user, member, batch):
            raise ScopeError('只有统筹人员可交接课程终审。')
        target = member_for(batch, final_id)
        if target.role not in ('reviewer', 'coordinator'):
            raise ValueError('请选择终审角色。')
        if any(t.status in ('peer_review', 'final_review', 'release_pending') for t in existing_tasks):
            raise ValueError('请先完成或退回当前审核，再交接终审。')
        if any(final_id in {t.owner_id, t.peer_id} or final_id in t.brief.get('collaboratorIds', []) for t in existing_tasks):
            raise ValueError('接任终审与现有任务创作或复核存在冲突。')
        course.final_user_id = final_id
        for t in existing_tasks:
            t.final_id = final_id
            touch(t)
    course.name = name
    course.plan = {**copy.deepcopy(plan), 'chapterAcceptances': {}}
    course.revision += 1
    MaterialCollections.query.filter_by(id=course.collection_id).one().name = name
    audit(batch, user, 'course.update', courseId=course.id, revision=course.revision, plan=plan)
    return course_view(course)


def validate_brief(task, course, batch):
    brief = task.brief
    for key, label in [('objective', '学习目标'), ('audience', '学习者与前置知识'), ('deliverables', '交付范围'), ('acceptance', '验收标准'), ('sourceNotes', '准确的资料引用位置')]:
        _text(brief.get(key), 6000, label)
    if not brief.get('objectiveIds') or set(brief['objectiveIds']) - {o['id'] for o in course.plan.get('objectives', []) if o['chapter'] == task.chapter}:
        raise ValueError('请关联本章实际学习目标。')
    if not brief.get('sourceIds') or set(brief['sourceIds']) - {s['id'] for s in course.plan.get('sources', [])}:
        raise ValueError('请关联已登记的真实课程资料。')
    if not brief.get('estimatedMinutes') or not isinstance(brief['estimatedMinutes'], int) or not 1 <= brief['estimatedMinutes'] <= 1440:
        raise ValueError('请填写 1–1440 分钟的学习时长。')
    final = member_for(batch, task.final_id)
    if final.role not in ('reviewer', 'coordinator'):
        raise ValueError('终审人员须具有终审角色。')
    peer = member_for(batch, task.peer_id)
    authors = set(brief.get('collaboratorIds', [])) | ({task.owner_id} if task.owner_id else set())
    for author in authors:
        member_for(batch, author)
    if task.peer_id == task.final_id or authors & {peer.user_id, final.user_id}:
        raise ValueError('作者、协作者、复核人与终审人员必须独立。')
    dependencies = brief.get('dependencies', [])
    if not isinstance(dependencies, list) or len(dependencies) > 30:
        raise ValueError('依赖任务数量无效。')
    pending, seen = list(dependencies), set()
    while pending:
        identity = pending.pop()
        if identity == task.id:
            raise ValueError('任务依赖不能形成环。')
        if identity in seen:
            continue
        seen.add(identity)
        dep = Task.query.filter_by(id=identity).first()
        if not dep or Course.query.filter_by(id=dep.course_id, batch_id=batch.id).first() is None:
            raise ValueError('依赖任务必须属于本批次。')
        pending.extend(dep.brief.get('dependencies', []))


def save_task(user, course_id, body, task_id=None):
    course = Course.query.filter_by(id=course_id).first()
    if not course:
        raise ScopeError('课程不存在。')
    batch, member = access(user, course.batch_id, lock=True)
    if not is_manager(user, member, batch) and user.id != course.final_user_id:
        raise ScopeError('只有课程负责人或统筹人员可以规划任务。')
    if task_id:
        task = Task.query.filter_by(id=task_id, course_id=course.id).one()
        revision(task, body)
        if task.status not in ('planning', 'open', 'working', 'changes_requested'):
            raise LibraryConflict('审核中的任务需求不能修改；请先退回或开始新版本。')
    else:
        task = Task(course_id=course.id, code=_text(body.get('code'), 48, '任务编号'), revision=0)
        if Task.query.filter_by(course_id=course.id, code=task.code).first():
            raise LibraryConflict('任务编号已存在。')
        db.session.add(task)
    task.title = _text(body.get('title'), 240, '任务名称')
    task.chapter = _text(body.get('chapter'), 120, '章节')
    if task.chapter not in {c['code'] for c in course.plan.get('chapters', [])}:
        raise ValueError('请选择课程已登记的章节。')
    task.kind = body.get('kind') or 'any'
    if task.kind not in KINDS:
        raise ValueError('请选择产物类型，或选择“不限”。')
    task.due = date(body.get('due'))
    task.weight = _integer(body.get('weight', 1), '工作量')
    if task.weight > 20:
        raise ValueError('单项工作量最多 20 点，请拆分较大任务。')
    brief = body.get('brief')
    if not isinstance(brief, dict) or len(json.dumps(brief, ensure_ascii=False)) > 32000:
        raise ValueError('任务说明格式或长度无效。')
    if task_id:
        historical = {uid for submitted in Submission.query.filter_by(task_id=task.id).all() for uid in submitted.authors}
        historical.update(task.brief.get('collaboratorIds', []))
        historical.discard(task.owner_id)
        brief = {**brief, 'collaboratorIds': sorted(set(brief.get('collaboratorIds', [])) | historical)}
    task.brief = copy.deepcopy(brief)
    task.peer_id = body.get('peerId')
    task.final_id = course.final_user_id
    if not task.status:
        task.status = 'planning'
    db.session.flush()
    if task.status != 'planning' or body.get('open'):
        validate_brief(task, course, batch)
    if body.get('open') and task.status == 'planning':
        task.status = 'open'
    touch(task)
    audit(batch, user, 'task.plan', task, details=task_view(task))
    return task_view(task)



def dependencies_ready(task):
    for identity in task.brief.get('dependencies', []):
        valid = Release.query.join(Submission, Release.submission_id == Submission.id).filter(Submission.task_id == identity, Release.revoked.is_(False)).first()
        if not valid:
            raise LibraryConflict('阻断依赖尚无有效验收版本，请先处理依赖任务。')


def capacity(batch, target, task):
    rows = Task.query.join(Course, Task.course_id == Course.id).filter(Course.batch_id == batch.id, Task.owner_id == target.user_id, Task.status.in_(ACTIVE), Task.id != task.id).all()
    if len(rows) >= target.wip_limit:
        raise LibraryConflict('该成员在制任务已达上限，请先完成现有任务。')
    if task.kind == 'practice' and any(t.kind == 'practice' for t in rows):
        raise LibraryConflict('每位成员同时最多承担 1 项实践题。')


def action(user, task_id, body):
    task, course, batch, member = task_access(user, task_id, lock=True)
    revision(task, body)
    name = body.get('action')
    manager = is_manager(user, member, batch)
    if name == 'claim':
        if batch.status != 'active' or task.status != 'open' or not member or not member.activated:
            raise LibraryConflict('任务当前不可领取，或账号尚未激活。')
        if user.id in {task.peer_id, task.final_id} or user.id in task.brief.get('collaboratorIds', []):
            raise ValueError('复核、终审或已登记协作者不能领取此主责任务。')
        validate_brief(task, course, batch)
        dependencies_ready(task)
        capacity(batch, member, task)
        task.owner_id = user.id
        task.status = 'working'
    elif name == 'block':
        if user.id != task.owner_id and not manager:
            raise ScopeError('只有主责人或统筹人员可以记录阻塞。')
        task.blocked = _text(body.get('reason', ''), 3000, '阻塞说明', required=False)
    elif name == 'progress':
        if user.id != task.owner_id and user.id not in task.brief.get('collaboratorIds', []):
            raise ScopeError('仅任务作者可以记录进展。')
        _text(body.get('reason'), 6000, '进展、交接内容或释放申请')
    elif name == 'handover':
        if not manager or task.status not in ('working', 'changes_requested', 'open'):
            raise ScopeError('请由统筹人员在创作或返修阶段交接。')
        _text(body.get('reason'), 6000, '交接说明')
        target = member_for(batch, body.get('userId'), activated=True)
        if target.user_id in {task.peer_id, task.final_id}:
            raise ValueError('接手人不能担任本任务审核人员。')
        capacity(batch, target, task)
        authors = set(task.brief.get('collaboratorIds', []))
        if task.owner_id:
            authors.add(task.owner_id)
        authors.discard(target.user_id)
        task.brief = {**task.brief, 'collaboratorIds': sorted(authors)}
        previous = Submission.query.filter_by(task_id=task.id).order_by(Submission.number.desc()).first()
        if previous:
            from .library_sources import instantiate_snapshot
            workspace = Dojos.query.filter_by(dojo_id=target.workspace_id).one()
            copied = instantiate_snapshot(Users.query.get(target.user_id), workspace, 0, previous.snapshot['payload'], {'type': 'construction-handover', 'submissionId': previous.id})
            task.brief = {**task.brief, 'handoverProject': copied}
        task.owner_id = target.user_id
        task.status = 'working'
        task.current_submission = None
    elif name == 'cancel':
        if not manager and user.id != task.final_id:
            raise ScopeError('仅统筹和终审可以取消任务。')
        if task.material_id:
            raise ValueError('已入库任务请使用撤销验收，并开始新版本修正。')
        _text(body.get('reason'), 3000, '范围变更理由')
        task.status = 'canceled'
    elif name == 'new_version':
        if task.status != 'released' or user.id != task.owner_id:
            raise ValueError('仅主责人可为已入库任务开始修订。')
        capacity(batch, member_for(batch, user.id, activated=True), task)
        task.status = 'working'
        task.current_submission = None
    elif name == 'reopen':
        if not manager or task.status != 'canceled':
            raise ScopeError('仅统筹可以恢复已取消任务。')
        task.status = 'planning'
        task.owner_id = None
    else:
        raise ValueError('未知任务操作。')
    touch(task)
    audit(batch, user, 'task.' + name, task, reason=body.get('reason', ''), ownerId=task.owner_id)
    return task_view(task)


def manual_creation_href(member, kind, workspace=None):
    if kind != 'practice':
        return None
    workspace = workspace or Dojos.query.filter_by(dojo_id=member.workspace_id).first()
    if workspace is None or not workspace.modules:
        return None
    module = workspace.modules[0]
    return f'/teacher/courses/{workspace.reference_id}/practices/new?module={quote(module.id)}'


def creation_context(user, task_id):
    task, course, batch, member = task_access(user, task_id)
    if user.id != task.owner_id or task.status not in ('working', 'changes_requested'):
        raise ScopeError('请先领取任务。')
    brief = task.brief
    sources = [s for s in course.plan.get('sources', []) if s['id'] in brief.get('sourceIds', [])]
    wanted = KINDS[task.kind] if task.kind in PRODUCT_KINDS else '课程素材'
    prompt = f"为建设任务 {task.code} 创作{wanted}：{task.title}\n课程：{course.name}；章节：{task.chapter}\n" + '\n'.join(f'{k}：{v}' for k, v in {
        '学习目标': brief.get('objective'), '学习者与前置知识': brief.get('audience'), '交付范围': brief.get('deliverables'),
        '验收要求': brief.get('acceptance'), '来源位置': brief.get('sourceNotes'), '学习时长（分钟）': brief.get('estimatedMinutes'),
        '资料登记': json.dumps(sources, ensure_ascii=False), '不包含': brief.get('exclusions', ''),
    }.items()) + '\n请先核实你能读取资料；不能访问的资料应明确要求补充，不得编造。先给设计再生成；答案与学习者视图分离，完成后执行自测。保持草稿，由任务中心提交审核。'
    workspace = authoring_course(user, member, course.id)
    module_index = workspace.modules[0].module_index if workspace.modules else None
    params = {'view': 'conversation', 'dojo': workspace.dojo_id, 'constructionTask': task.id}
    if module_index is not None:
        params['module'] = module_index
    return {'prompt': prompt, 'href': '/teacher?' + urlencode(params), 'workspaceId': workspace.dojo_id,
            'courseName': workspace.name, 'artifactType': None, 'taskKind': task.kind,
            'acceptedKinds': sorted(PRODUCT_KINDS), 'manualHref': manual_creation_href(member, task.kind, workspace)}


def authoring_course(user, member, construction_course_id):
    from .agent_runtime.scope import dojo_for_user
    identity = (member.data or {}).get('courseBindings', {}).get(construction_course_id, member.workspace_id)
    dojo = dojo_for_user(user, identity, teacher=True)
    if (dojo.data or {}).get('archived') or Space.query.filter_by(course_id=dojo.dojo_id).first():
        raise ScopeError('创作课程已不可用，请联系统筹人员重新分配。')
    return dojo


def submission_options(user, task_id):
    from .library_sources import library_courses
    from .material_library import CONTENT_TYPES
    task, _, _, _ = task_access(user, task_id)
    if task.owner_id != user.id:
        raise ScopeError('只有任务主责人可以选择提交内容。')
    frozen = {row.course_id for row in Space.query.all()}
    return {'courses': [c for c in library_courses(user) if c['id'] not in frozen],
            'sourceKinds': SOURCE_KINDS, 'types': CONTENT_TYPES,
            'checks': {key: submission_checks(key) for key in CONTENT_TYPES}, 'fileLimits': file_limits()}


def submission_sources(user, task_id, **filters):
    from .library_sources import list_sources
    task, _, _, _ = task_access(user, task_id)
    if task.owner_id != user.id:
        raise ScopeError('只有任务主责人可以选择提交内容。')
    result = list_sources(user, for_submission=True, **filters)
    return result


def source_owned(user, source):
    from .agent_runtime.scope import dojo_for_user
    from .models import DojoChallenges
    if not isinstance(source, dict) or source.get('kind') not in SOURCE_KINDS:
        raise ValueError('请选择本人账号下的生成项目。')
    if source['kind'] == 'challenge':
        try:
            identity = [int(part) for part in source.get('id', '').split(':')]
            if len(identity) != 3:
                raise ValueError()
        except (AttributeError, TypeError, ValueError):
            raise ValueError('已发布题目的标识无效。') from None
        row = DojoChallenges.query.filter_by(dojo_id=identity[0], module_index=identity[1], challenge_id=identity[2]).first()
        owner = None
    else:
        model, owner = {'artifact': (TeachingArtifacts, 'owner_id'), 'practice': (LearningDrafts, 'author_id'), 'assignment': (TeachingAssignments, 'owner_id')}[source['kind']]
        row = model.query.filter_by(id=source.get('id')).first()
    if not row or Space.query.filter_by(course_id=row.dojo_id).first():
        raise ScopeError('只能提交本人账号下可编辑的原始项目。')
    if row.dojo_id is not None:
        dojo = dojo_for_user(user, row.dojo_id, teacher=True)
        if (dojo.data or {}).get('archived'):
            raise ScopeError('已归档课程中的项目不可提交。')
    elif owner is None or getattr(row, owner) != user.id:
        raise ScopeError('只能提交本人账号下的项目。')
    return row


def create_space(publisher, title, reviewers):
    dojo = Dojos(id='review-' + secrets.token_hex(10), name=title[:128], type='course', private_key=secrets.token_hex(32))
    dojo.admins = [DojoAdmins(user_id=uid) for uid in set(reviewers) | {publisher.id}]
    db.session.add(dojo)
    db.session.flush()
    db.session.add(DojoModules(dojo=dojo, module_index=0, id='review', name='固定版本审核', description='此副本由任务中心冻结，只供预览。', show_scoreboard=False, show_challenges=True))
    db.session.flush()
    return dojo


def verify_snapshot(submission, batch):
    from .library_sources import snapshot_source
    if _hash(submission.snapshot['payload']) != submission.content_hash:
        raise LibraryConflict('提交快照校验失败，请联系管理员。')
    space = Space.query.filter_by(submission_id=submission.id).one()
    publisher = Users.query.get(batch.publisher_id)
    current = snapshot_source(publisher, {k: submission.native_copy[k] for k in ('kind', 'id')})
    if _hash(current['payload']) != space.fingerprint:
        raise LibraryConflict('审核副本发生变化，禁止通过；请重新提交。')


def submit(user, task_id, body, *, files=None):
    from .library_sources import snapshot_source, instantiate_snapshot
    task, course, batch, member = task_access(user, task_id, lock=True)
    key = _text(body.get('requestKey'), 128, '提交请求号')
    previous = Submission.query.filter_by(task_id=task.id, request_key=key).first()
    source = body.get('source')
    if not isinstance(source, dict):
        raise ValueError('请选择文件提交或生成项目提交。')
    is_file = source.get('kind') == 'file'
    if not is_file and files:
        raise ValueError('生成项目提交不能同时包含上传文件。')
    if previous:
        if previous.author_id != user.id:
            raise LibraryConflict('重复提交请求的内容不一致。')
        actual_source, _ = file_snapshot(task, files) if is_file else (source, None)
        if previous.source != actual_source or previous.evidence != body.get('evidence', {}):
            raise LibraryConflict('重复提交请求的内容不一致。')
        return {'submissionId': previous.id, 'number': previous.number, 'task': task_view(task)}
    revision(task, body)
    if task.owner_id != user.id or task.status not in ('working', 'changes_requested') or task.blocked:
        raise ValueError('仅主责人可提交创作中或返修任务；请先处理阻塞。')
    validate_brief(task, course, batch)
    dependencies_ready(task)
    if not is_file:
        source_owned(user, source)
    evidence = body.get('evidence', {})
    if not isinstance(evidence, dict):
        raise ValueError('请填写自测证据。')
    for k, label in [('sources', '资料引用与使用说明'), ('tests', '具体测试步骤、输入和实际结果'), ('answers', '参考答案与评分依据的位置'), ('environment', '运行环境和依赖'), ('changes', '本次内容与修订说明')]:
        _text(evidence.get(k, ''), 12000, label, required=False)
    if is_file:
        source, snapshot = file_snapshot(task, files)
    else:
        snapshot = snapshot_source(user, source)
    if evidence.get('checks') and evidence['checks'] != submission_checks(snapshot['type']):
        raise ValueError('自测记录与实际提交的成果类型不一致。')
    product = check_family(snapshot['type'], task.kind)
    snapshot['constructionTask'] = {'kind': product, 'productKind': product, 'taskKind': task.kind,
                                    'contentType': snapshot['type'], 'plannedKind': task.kind, 'chapter': task.chapter, 'title': task.title, 'brief': copy.deepcopy(task.brief), 'objectives': [copy.deepcopy(o) for o in course.plan.get('objectives', []) if o['id'] in task.brief.get('objectiveIds', [])], 'sources': [copy.deepcopy(s) for s in course.plan.get('sources', []) if s['id'] in task.brief.get('sourceIds', [])]}
    if len(json.dumps(snapshot, ensure_ascii=False).encode()) > 64 * 1024 * 1024:
        raise ValueError('单项提交不得超过 64 MB，请拆分。')
    publisher = Users.query.get(batch.publisher_id)
    number = (db.session.query(func.max(Submission.number)).filter_by(task_id=task.id).scalar() or 0) + 1
    space = create_space(publisher, f'审核 · {task.code} · v{number}', [task.peer_id, task.final_id, user.id])
    native = instantiate_snapshot(publisher, space, 0, snapshot['payload'], {'type': 'construction-review', 'taskId': task.id, 'number': number})
    if native['kind'] == 'practice':
        native['href'] += '&studentPreview=1'
    db.session.flush()
    fingerprint = _hash(snapshot_source(publisher, {k: native[k] for k in ('kind', 'id')})['payload'])
    submission = Submission(task_id=task.id, number=number, request_key=key, author_id=user.id,
                            authors=sorted(set(task.brief.get('collaboratorIds', [])) | {user.id}), source=copy.deepcopy(source),
                            snapshot=snapshot, content_hash=_hash(snapshot['payload']), evidence=evidence, native_copy=native,
                            peer_id=task.peer_id, final_id=task.final_id, peer={}, final={})
    db.session.add(submission)
    db.session.flush()
    db.session.add(Space(course_id=space.dojo_id, submission_id=submission.id, fingerprint=fingerprint))
    task.current_submission = submission.id
    task.status = 'peer_review'
    touch(task)
    audit(batch, user, 'submission.create', task, submissionId=submission.id, number=number, contentHash=submission.content_hash)
    return {'submissionId': submission.id, 'number': number, 'task': task_view(task)}


def review(user, task_id, body):
    task, course, batch, member = task_access(user, task_id, lock=True)
    revision(task, body)
    submission = Submission.query.filter_by(id=task.current_submission).first()
    if not submission or body.get('submissionId') != submission.id:
        raise LibraryConflict('请审核当前提交版本。')
    stage = 'peer' if task.status == 'peer_review' else 'final' if task.status == 'final_review' else None
    if stage is None or user.id != getattr(submission, stage + '_id') or not member or not member.activated:
        raise ScopeError('当前账号不是本轮指定审核人员。')
    if user.id in submission.authors or (stage == 'final' and user.id == submission.peer_id):
        raise ScopeError('作者、协作者和审核人员必须独立。')
    decision = body.get('decision')
    if decision not in ('pass', 'return'):
        raise ValueError('请选择通过或退回。')
    note = _text(body.get('note'), 12000, '审核依据、实际测试或明确的修改意见')
    previewed = Event.query.filter_by(batch_id=batch.id, task_id=task.id, actor_id=user.id, action='submission.preview').filter(Event.data['submissionId'].as_string() == submission.id).first()
    if decision == 'pass' and (body.get('checks') != submission_checks(submission.snapshot['type']) or body.get('previewed') is not True or not previewed):
        raise ValueError('请打开固定版本原生预览并完成全部核验。')
    dependencies_ready(task)
    verify_snapshot(submission, batch)
    record = {'decision': decision, 'note': note, 'checks': body.get('checks', []), 'actorId': user.id,
              'contentHash': submission.content_hash, 'created': stamp(now())}
    setattr(submission, stage, record)
    task.status = 'changes_requested' if decision == 'return' else 'final_review' if stage == 'peer' else 'release_pending'
    touch(task)
    audit(batch, user, 'review.' + stage, task, submissionId=submission.id, **record)
    return task_view(task)


def publish(user, task_id, body):
    task, course, batch, member = task_access(user, task_id, lock=True)
    submission = Submission.query.filter_by(id=task.current_submission).first()
    if not submission:
        raise ValueError('任务尚无提交。')
    if user.id != submission.final_id and not is_manager(user, member, batch):
        raise ScopeError('仅终审或统筹可以将已验收版本入库。')
    prior = Release.query.filter_by(submission_id=submission.id).first()
    if prior:
        return {'task': task_view(task), 'releaseId': prior.id, 'version': prior.version}
    revision(task, body)
    if task.status != 'release_pending' or any(getattr(submission, stage).get('decision') != 'pass' for stage in ('peer', 'final')):
        raise ValueError('必须完成独立复核与终审后才能入库。')
    try:
        with db.session.begin_nested():
            dependencies_ready(task)
            verify_snapshot(submission, batch)
            snapshot = submission.snapshot
            item = MaterialLibraryItems.query.filter_by(id=task.material_id).first() if task.material_id else None
            if not item:
                item = MaterialLibraryItems(owner_id=batch.publisher_id, source_kind=submission.native_copy['kind'], source_id=submission.native_copy['id'], content_type=snapshot['type'], title=task.title, version=0, metadata_version=0)
                db.session.add(item)
                db.session.flush()
                task.material_id = item.id
                db.session.add(MaterialCollectionItems(item_id=item.id, collection_id=course.collection_id))
            item.version = (db.session.query(func.max(MaterialLibraryVersions.version)).filter_by(item_id=item.id).scalar() or 0) + 1
            item.metadata_version += 1
            item.title = task.title
            item.content_type = snapshot['type']
            item.description = f'{course.name} / {task.chapter} · {task.brief.get("objective", "")}\n已通过建设任务复核与终审；任务 {task.code}。'
            item.visibility = 'teachers'
            item.archived = False
            item.source_kind = submission.native_copy['kind']
            item.source_id = submission.native_copy['id']
            item.updated = now()
            db.session.add(MaterialLibraryVersions(item_id=item.id, version=item.version, payload=copy.deepcopy(snapshot['payload']), content_hash=submission.content_hash,
                                                  provenance={'type': 'construction', 'taskId': task.id, 'submissionId': submission.id, 'authors': submission.authors,
                                                              'peerId': submission.peer_id, 'finalId': submission.final_id, 'source': submission.source}, created_by=user.id))
            released = Release(submission_id=submission.id, material_id=item.id, version=item.version, content_hash=submission.content_hash)
            db.session.add(released)
            db.session.flush()
            task.status = 'released'
            course.plan = {**course.plan, 'chapterAcceptances': {key: value for key, value in course.plan.get('chapterAcceptances', {}).items() if key != task.chapter}}
            course.revision += 1
            task.release_error = None
            touch(task)
            audit(batch, user, 'release.create', task, releaseId=released.id, version=item.version, contentHash=submission.content_hash)
        return {'task': task_view(task), 'releaseId': released.id, 'version': released.version}
    except (ValueError, OSError) as exc:
        task.release_error = str(exc)[:2000]
        touch(task)
        audit(batch, user, 'release.failed', task, error=task.release_error)
        return {'task': task_view(task), 'failed': True}


def revoke(user, release_id, body):
    release = Release.query.filter_by(id=release_id).first()
    if not release:
        raise ScopeError('验收记录不存在。')
    submission = Submission.query.get(release.submission_id)
    task, course, batch, member = task_access(user, submission.task_id, lock=True)
    if user.id != course.final_user_id:
        raise ScopeError('只有该课程的终审人员可以撤销验收。')
    reason = _text(body.get('reason'), 4000, '撤销原因和处理建议')
    db.session.refresh(release)
    item = MaterialLibraryItems.query.filter_by(id=release.material_id).with_for_update().populate_existing().one()
    if not release.revoked:
        release.revoked = True
        release.reason = reason
        valid = Release.query.filter_by(material_id=item.id, revoked=False).filter(Release.id != release.id).order_by(Release.version.desc()).first()
        if valid:
            old = Submission.query.get(valid.submission_id)
            item.version = valid.version
            item.source_kind, item.source_id = old.native_copy['kind'], old.native_copy['id']
        else:
            item.visibility = 'private'
            item.archived = True
            if task.status == 'released':
                task.status = 'changes_requested'
        item.metadata_version += 1
        for imported in MaterialLibraryImports.query.all():
            if import_uses(imported, release.material_id, release.version):
                db.session.add(Notice(user_id=imported.owner_id, release_id=release.id, import_id=imported.id))
        course.plan = {**course.plan, 'chapterAcceptances': {key: value for key, value in course.plan.get('chapterAcceptances', {}).items() if key != task.chapter}}
        course.revision += 1
        touch(task)
        audit(batch, user, 'release.revoke', task, releaseId=release.id, reason=reason)
    return task_view(task)


def import_uses(imported, material_id, version):
    return any(row.get('itemId') == material_id and row.get('version') == version for row in imported.result.get('imports', []))


def notices(user):
    result = []
    for n in Notice.query.filter_by(user_id=user.id).order_by(Notice.id).all():
        release = Release.query.get(n.release_id)
        imported = MaterialLibraryImports.query.get(n.import_id)
        item = MaterialLibraryItems.query.get(release.material_id)
        result.append({'id': n.id, 'title': item.title, 'version': release.version, 'reason': release.reason,
                       'courseId': imported.course_id, 'resolution': n.resolution, 'resolved': stamp(n.resolved)})
    return result


def resolve_notice(user, identity, body):
    notice = Notice.query.filter_by(id=identity, user_id=user.id).first()
    if not notice:
        raise ScopeError('通知不存在。')
    notice.resolution = _text(body.get('resolution'), 4000, '目标课程处理结果')
    notice.resolved = now()
    return {'resolved': True}


def native_preview(user, submission_id=None, material_id=None):
    if material_id:
        require_library_teacher(user)
        item = MaterialLibraryItems.query.filter_by(id=material_id, archived=False, visibility='teachers').first()
        released = Release.query.filter_by(material_id=material_id, version=item.version, revoked=False).first() if item else None
        if not released:
            raise ScopeError('素材当前无可用验收版本。')
        submission = Submission.query.get(released.submission_id)
        task = Task.query.get(submission.task_id)
        course = Course.query.get(task.course_id)
        batch = Batch.query.get(course.batch_id)
    else:
        submission = Submission.query.get(submission_id)
        if not submission:
            raise ScopeError('提交不存在。')
        task, course, batch, member = task_access(user, submission.task_id)
        if user.id not in submission.authors + [submission.peer_id, submission.final_id] and not is_manager(user, member, batch):
            raise ScopeError('只有本轮参与人员可以预览候选稿。')
    verify_snapshot(submission, batch)
    space = Space.query.filter_by(submission_id=submission.id).one()
    if not DojoAdmins.query.filter_by(dojo_id=space.course_id, user_id=user.id).first():
        db.session.add(DojoAdmins(dojo_id=space.course_id, user_id=user.id))
        db.session.flush()
    audit(batch, user, 'submission.preview', task, submissionId=submission.id, contentHash=submission.content_hash)
    return {'href': submission.native_copy['href'], 'number': submission.number, 'contentHash': submission.content_hash}


def library_status(item):
    release = Release.query.filter_by(material_id=item.id, version=item.version, revoked=False).first()
    if not release:
        return None
    submission = Submission.query.get(release.submission_id)
    task = Task.query.get(submission.task_id)
    return {'taskId': task.id, 'code': task.code, 'submissionId': submission.id, 'verified': True, 'version': release.version}


def guard_library_write(user, visibility):
    if visibility == 'teachers' and Member.query.filter_by(user_id=user.id).first():
        raise ValueError('团队创作账号请通过建设任务提交与终审入库；不能直接共享候选稿。')


def guard_import(item_id, version):
    if Release.query.filter_by(material_id=item_id).first() and not Release.query.filter_by(material_id=item_id, version=version, revoked=False).first():
        raise ValueError('该素材版本已撤销验收或尚未验收，不能导入。')


def activate(user, batch_id, body):
    batch, member = access(user, batch_id, lock=True)
    if not member:
        raise ScopeError('账号尚未绑定成员。')
    name = _text(body.get('name'), 120, '真实姓名或确认使用的成员编号')
    password = _text(body.get('password'), 128, '新密码')
    if len(password) < 8 or password == user.name:
        raise ValueError('新密码至少 8 个字符，不能与用户名相同。')
    from CTFd.utils.crypto import verify_password
    if verify_password(password, user.password):
        raise ValueError('请设置与初始密码不同的新密码。')
    user.password = password
    member.name = name
    from .account_activation import complete_password_change
    complete_password_change(user)
    audit(batch, user, 'member.activate', memberId=member.id)
    return {'activated': True}


def edit_member(user, member_id, body):
    target = Member.query.get(member_id)
    if not target:
        raise ScopeError('成员不存在。')
    batch, _ = access(user, target.batch_id, manage=True, lock=True)
    target.name = _text(body.get('name', target.name), 120, '成员姓名')
    target.wip_limit = _integer(body.get('wipLimit', target.wip_limit), '在制上限')
    if target.wip_limit > 5:
        raise ValueError('在制上限最多 5 项。')
    if body.get('active') is False:
        outstanding = Task.query.join(Course, Task.course_id == Course.id).filter(Course.batch_id == batch.id, Task.status.notin_(['released', 'canceled', 'planning']), or_(Task.owner_id == target.user_id, Task.peer_id == target.user_id, Task.final_id == target.user_id)).count()
        if outstanding or Course.query.filter_by(batch_id=batch.id, final_user_id=target.user_id).count():
            raise ValueError('请先交接未完成任务及课程终审职责，再停用成员。')
        if target.user_id == user.id:
            raise ValueError('不能停用自己的统筹账号。')
        target.active = False
        Users.query.get(target.user_id).banned = True
    elif body.get('active') is True:
        target.active = True
        Users.query.get(target.user_id).banned = False
    if body.get('resetPassword'):
        password = _text(body['resetPassword'], 128, '临时密码')
        if len(password) < 12:
            raise ValueError('临时密码至少 12 个字符。')
        Users.query.get(target.user_id).password = password
        from .account_activation import require_password_change
        require_password_change(Users.query.get(target.user_id))
    audit(batch, user, 'member.update', memberId=target.id, name=target.name, active=target.active, wipLimit=target.wip_limit, passwordReset=bool(body.get('resetPassword')))
    return {'updated': True}


def chapter_accept(user, course_id, body):
    course = Course.query.get(course_id)
    if not course:
        raise ScopeError('课程不存在。')
    batch, member = access(user, course.batch_id, lock=True)
    if user.id != course.final_user_id:
        raise ScopeError('仅课程终审人员可验收章节。')
    chapter = body.get('chapter')
    coverage = [c for c in course_view(course)['coverage'] if c['chapter'] == chapter]
    if not coverage or any(set(c['requiredKinds']) - set(c['coveredKinds']) for c in coverage):
        raise ValueError('本章必需学习目标尚未完整覆盖。')
    note = _text(body.get('note'), 6000, '术语、顺序、答案、时长及整合课程试用记录')
    checks = ['目标覆盖', '术语一致', '先后顺序', '答案一致', '时长合理', '目标课程试用']
    if body.get('checks') != checks:
        raise ValueError('请完成章节联调全部检查。')
    plan = copy.deepcopy(course.plan)
    plan.setdefault('chapterAcceptances', {})[chapter] = {'actorId': user.id, 'note': note, 'created': stamp(now()), 'coverage': coverage, 'courseRevision': course.revision}
    course.plan = plan
    course.revision += 1
    audit(batch, user, 'chapter.accept', courseId=course.id, chapter=chapter, note=note)
    return course_view(course)


def report(user, batch_id):
    batch, member = access(user, batch_id)
    courses = Course.query.filter_by(batch_id=batch.id).all()
    tasks = Task.query.filter(Task.course_id.in_([c.id for c in courses])).all()
    task_by_material = {t.material_id: t for t in tasks if t.material_id}
    adoptions = []
    for imported in MaterialLibraryImports.query.order_by(MaterialLibraryImports.created.desc()).all():
        if not is_manager(user, member, batch) and imported.owner_id != user.id and user.id not in {c.final_user_id for c in courses}:
            continue
        for row in imported.result.get('imports', []):
            if row.get('itemId') in task_by_material:
                dojo = Dojos.query.get(imported.course_id)
                owner = Users.query.get(imported.owner_id)
                adoptions.append({'title': task_by_material[row['itemId']].title, 'version': row['version'],
                                  'courseName': dojo.name if dojo else '原课程已移除', 'ownerName': owner.name if owner else '原教师', 'created': stamp(imported.created)})
    events = Event.query.filter_by(batch_id=batch.id).order_by(Event.created.desc()).limit(200).all()
    return {'adoptions': adoptions, 'events': [{'action': e.action, 'actorId': e.actor_id, 'created': stamp(e.created)} for e in events]}


def edit_batch(user, batch_id, body):
    batch, member = access(user, batch_id, manage=True, lock=True)
    starts, ends = date(body.get('starts')), date(body.get('ends'))
    if ends < starts:
        raise ValueError('结束日期不能早于开始日期。')
    if body.get('status') not in ('active', 'paused', 'closed'):
        raise ValueError('批次状态无效。')
    batch.name = _text(body.get('name'), 160, '批次名称')
    batch.starts, batch.ends, batch.status = starts, ends, body['status']
    audit(batch, user, 'batch.update', starts=stamp(starts), ends=stamp(ends), status=batch.status)
    return {'updated': True}
