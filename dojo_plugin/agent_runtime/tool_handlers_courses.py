def handle_course_list(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from ..api.v1.teaching import _teacher_dojos
    outcome = ToolResult()
    user = context.user
    courses = [_course_tool_snapshot(item) for item in _teacher_dojos(user)]
    outcome.result = {'courses': courses}
    outcome.href = '/teacher/courses?tab=overview'
    outcome.card_title = '可管理课程'
    return outcome

def handle_course_read(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    outcome = ToolResult()
    dojo = context.dojo
    outcome.result = {'course': _course_tool_snapshot(dojo, include_members=True)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    outcome.card_title = '课程详情'
    return outcome

def handle_course_members(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_members
    from ..api.v1.teaching import _course_tool_snapshot
    outcome = ToolResult()
    dojo = context.dojo
    members = _course_tool_members(dojo)
    outcome.result = {'course': _course_tool_snapshot(dojo), 'members': members}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    outcome.card_title = '课程成员'
    return outcome

def handle_course_create(context):
    from ..models import DojoAdmins
    from ..models import DojoModules
    from ..models import Dojos
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from ..api.v1.teaching import _module_slug
    from CTFd.models import db
    from ..course_codes import ensure_course_join_code
    import re
    import secrets
    outcome = ToolResult()
    action = context.action
    user = context.user
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    name = str(arguments.get('name') or '').strip()
    if not 1 <= len(name) <= 128:
        raise ValueError('Course name must contain 1-128 characters')
    description = str(arguments.get('description') or '').strip()
    if len(description) > 24000:
        raise ValueError('Course description exceeds 24,000 characters')
    slug = _module_slug(arguments.get('slug') or name, f'course-{secrets.token_hex(4)}')
    if not re.fullmatch('[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?', slug):
        raise ValueError('Course slug must use lowercase letters, digits, or hyphens')
    access = str(arguments.get('access') or 'private').lower()
    if access not in {'private', 'public'}:
        raise ValueError('Course access must be private or public')
    dojo = Dojos(id=slug, name=name, description=description or None, type='public' if access == 'public' else 'course', private_key=secrets.token_hex(32))
    ensure_course_join_code(dojo)
    dojo.admins = [DojoAdmins(user=user)]
    db.session.add(dojo)
    db.session.flush()
    thread.dojo_id = dojo.dojo_id
    thread.module_index = None
    initial_module = None
    initial_module_name = str(arguments.get('initialModuleName') or '').strip()
    if initial_module_name:
        if len(initial_module_name) > 128:
            raise ValueError('Initial module name exceeds 128 characters')
        initial_module_id = _module_slug(arguments.get('initialModuleId') or initial_module_name, 'course-content')
        initial_module = DojoModules(dojo=dojo, module_index=0, id=initial_module_id, name=initial_module_name, description='由全局教学智能体为本次内容生成自动建立。', show_scoreboard=True, show_challenges=True)
        db.session.add(initial_module)
        db.session.flush()
        thread.module_index = initial_module.module_index
    action.target_id = dojo.reference_id
    action.request_json = {**action.request_json, 'dojoId': dojo.dojo_id}
    outcome.result = {'course': _course_tool_snapshot(dojo)}
    if initial_module is not None:
        outcome.result['module'] = {'index': initial_module.module_index, 'id': initial_module.id, 'name': initial_module.name, 'description': initial_module.description, 'url': f'/{dojo.reference_id}/{initial_module.id}'}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    outcome.card_title = '课程已创建'
    return outcome

def handle_course_update(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    outcome = ToolResult()
    dojo = context.dojo
    arguments = context.operation['arguments']
    if 'name' in arguments:
        name = str(arguments.get('name') or '').strip()
        if not 1 <= len(name) <= 128:
            raise ValueError('Course name must contain 1-128 characters')
        dojo.name = name
    if 'description' in arguments:
        description = str(arguments.get('description') or '').strip()
        if len(description) > 24000:
            raise ValueError('Course description exceeds 24,000 characters')
        dojo.description = description or None
    if 'access' in arguments:
        access = str(arguments.get('access') or '').lower()
        if access not in {'private', 'public'}:
            raise ValueError('Course access must be private or public')
        dojo.type = 'public' if access == 'public' else 'course'
    if 'showScoreboard' in arguments:
        dojo.show_scoreboard = bool(arguments['showScoreboard'])
    outcome.result = {'course': _course_tool_snapshot(dojo)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    outcome.card_title = '课程已更新'
    return outcome

def handle_course_sync(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from ..utils.dojo import dojo_update
    from .tool_effects import prepare_course_images
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    if not dojo.repository:
        raise ValueError('This native course is not backed by a Git repository')
    dojo_update(dojo)
    prepare_course_images(action, user, dojo)
    outcome.result = {'course': _course_tool_snapshot(dojo)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    outcome.card_title = '课程已同步'
    return outcome

def handle_course_promote(context):
    from ..models import Dojos
    from ..agent_runtime.scope import ScopeError
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    if getattr(user, 'type', None) != 'admin':
        raise ScopeError('Platform administrator permission required')
    conflict = Dojos.query.filter(Dojos.id == dojo.id, Dojos.official.is_(True), Dojos.dojo_id != dojo.dojo_id).first()
    if conflict is not None:
        raise ValueError('Another recommended course already uses this slug')
    dojo.official = True
    action.target_id = dojo.reference_id
    outcome.result = {'course': _course_tool_snapshot(dojo)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    outcome.card_title = '推荐课程已更新'
    return outcome

def handle_course_delete(context):
    from CTFd.models import Challenges
    from ..models import DojoChallenges
    from ..models import DojoUsers
    from ..models import Dojos
    from ..models import LearningAuthoringJobs
    from ..agent_runtime.scope import ScopeError
    from ..models import TeachingJobs
    from ..models import TeachingSessions
    from .tool_registry import ToolResult
    from .. import config
    from CTFd.models import db
    import pathlib
    from ..utils import get_all_containers
    outcome = ToolResult()
    job = context.job
    user = context.user
    thread = context.thread
    dojo = context.dojo
    if getattr(user, 'type', None) != 'admin':
        raise ScopeError('Platform administrator permission required')
    if TeachingSessions.query.filter_by(dojo_id=dojo.dojo_id, status='LIVE').first():
        raise ValueError('End the live classroom before deleting this course')
    active_jobs = TeachingJobs.query.filter(
        TeachingJobs.dojo_id == dojo.dojo_id,
        TeachingJobs.status.in_(['QUEUED', 'RUNNING', 'CANCEL_REQUESTED']),
        TeachingJobs.id != job.id,
    ).all()
    root_id = (job.payload or {}).get('harnessRootJobId')
    active_teaching_job = next((candidate for candidate in active_jobs if not (
        candidate.kind == 'agent.advance' and candidate.status == 'QUEUED'
        and candidate.owner_id == job.owner_id and candidate.thread_id == job.thread_id
        and root_id and (candidate.payload or {}).get('harnessRootJobId') == root_id
        and job.id in ((candidate.payload or {}).get('waitForJobIds') or [])
    )), None)
    active_authoring_job = LearningAuthoringJobs.query.filter(LearningAuthoringJobs.dojo_id == dojo.dojo_id, LearningAuthoringJobs.status.in_(['QUEUED', 'RUNNING'])).first()
    if active_teaching_job is not None or active_authoring_job is not None:
        raise ValueError('Course has active generation or validation tasks; wait for them to finish before deletion')
    deleted_name = dojo.name
    deleted_reference = dojo.reference_id
    dojo_id = dojo.dojo_id
    challenge_ids = [row.challenge_id for row in DojoChallenges.query.filter_by(dojo_id=dojo_id).all() if row.challenge_id is not None]
    outcome.cleanup_course_path = pathlib.Path(config.DOJOS_DIR) / '.learning' / dojo.hex_dojo_id
    outcome.cleanup_workspaces = list(get_all_containers(dojo))
    thread.dojo_id = None
    thread.module_index = None
    TeachingJobs.query.filter_by(dojo_id=dojo_id).update(
        {TeachingJobs.dojo_id: None, TeachingJobs.module_index: None},
        synchronize_session='fetch',
    )
    DojoUsers.query.filter_by(dojo_id=dojo_id).delete(synchronize_session=False)
    Dojos.query.filter_by(dojo_id=dojo_id).delete(synchronize_session=False)
    db.session.flush()
    if challenge_ids:
        referenced = {challenge_id for challenge_id, in db.session.query(DojoChallenges.challenge_id).filter(DojoChallenges.challenge_id.in_(challenge_ids)).all()}
        orphan_ids = set(challenge_ids) - referenced
        if orphan_ids:
            Challenges.query.filter(Challenges.id.in_(orphan_ids)).delete(synchronize_session=False)
    outcome.result = {'deletedCourseName': deleted_name, 'deletedReferenceId': deleted_reference}
    outcome.href = '/teacher/courses?tab=overview'
    outcome.card_title = '课程已删除'
    return outcome

def handle_course_member_add(context):
    from ..models import DojoAdmins
    from ..models import DojoMembers
    from ..models import DojoUsers
    from ..agent_runtime.scope import ScopeError
    from .tool_registry import ToolResult
    from CTFd.models import Users
    from ..api.v1.teaching import _course_tool_snapshot
    from CTFd.models import db
    outcome = ToolResult()
    user = context.user
    dojo = context.dojo
    tool = context.operation['tool']
    arguments = context.operation['arguments']
    username = str(arguments.get('username') or '').strip()
    target_user = Users.query.filter_by(name=username).first()
    if target_user is None:
        raise ValueError('Target username was not found')
    membership = DojoUsers.query.filter_by(dojo_id=dojo.dojo_id, user_id=target_user.id).first()
    if tool == 'course.member.add':
        role = str(arguments.get('role') or 'student').lower()
        if role not in {'student', 'teacher'}:
            raise ValueError('Member role must be student or teacher')
        target_type = 'admin' if role == 'teacher' else 'member'
        if membership is None:
            membership = DojoAdmins(dojo=dojo, user=target_user) if target_type == 'admin' else DojoMembers(dojo=dojo, user=target_user)
            db.session.add(membership)
        else:
            membership.type = target_type
        outcome.result = {'course': _course_tool_snapshot(dojo), 'member': {'username': target_user.name, 'role': role}}
        outcome.card_title = '课程成员已添加'
    else:
        if membership is None:
            raise ValueError('Target user is not a course member')
        if target_user.id == user.id:
            raise ValueError('You cannot remove yourself from the current course')
        if membership.type == 'admin' and getattr(user, 'type', None) != 'admin':
            raise ScopeError('Only a platform administrator can remove another teacher')
        db.session.delete(membership)
        outcome.result = {'course': _course_tool_snapshot(dojo), 'removedUsername': target_user.name}
        outcome.card_title = '课程成员已移除'
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=overview'
    return outcome
