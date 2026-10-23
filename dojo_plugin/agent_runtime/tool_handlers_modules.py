def handle_module_create(context):
    from ..models import DojoModules
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from ..api.v1.teaching import _module_slug
    from CTFd.models import db
    from sqlalchemy import func
    import secrets
    outcome = ToolResult()
    action = context.action
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    name = str(arguments.get('name') or '').strip()
    if not 1 <= len(name) <= 128:
        raise ValueError('Module name must contain 1-128 characters')
    module_id = _module_slug(arguments.get('id') or name, f'module-{secrets.token_hex(3)}')
    if DojoModules.query.filter_by(dojo_id=dojo.dojo_id, id=module_id).first():
        raise ValueError('A module with this id already exists')
    description = str(arguments.get('description') or '').strip()
    if len(description) > 24000:
        raise ValueError('Module description exceeds 24,000 characters')
    maximum = db.session.query(func.max(DojoModules.module_index)).filter_by(dojo_id=dojo.dojo_id).scalar()
    module = DojoModules(dojo=dojo, module_index=maximum + 1 if maximum is not None else 0, id=module_id, name=name, description=description or None, show_scoreboard=True, show_challenges=True)
    db.session.add(module)
    db.session.flush()
    thread.module_index = module.module_index
    outcome.result = {'course': _course_tool_snapshot(dojo), 'module': next((item for item in _course_tool_snapshot(dojo)['modules'] if item['index'] == module.module_index))}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}'
    outcome.card_title = '章节已创建'
    action.target_id = f'{dojo.reference_id}/{module.id}'
    return outcome

def handle_module_update(context):
    from ..models import DojoModules
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_module
    from ..api.v1.teaching import _course_tool_snapshot
    from ..api.v1.teaching import _module_slug
    outcome = ToolResult()
    action = context.action
    dojo = context.dojo
    arguments = context.operation['arguments']
    module = _course_tool_module(dojo, arguments)
    if 'name' in arguments:
        name = str(arguments.get('name') or '').strip()
        if not 1 <= len(name) <= 128:
            raise ValueError('Module name must contain 1-128 characters')
        module.name = name
    if 'id' in arguments:
        module_id = _module_slug(arguments.get('id'), '')
        if not module_id:
            raise ValueError('Module id is required')
        conflict = DojoModules.query.filter(DojoModules.dojo_id == dojo.dojo_id, DojoModules.id == module_id, DojoModules.module_index != module.module_index).first()
        if conflict is not None:
            raise ValueError('A module with this id already exists')
        module.id = module_id
    if 'description' in arguments:
        description = str(arguments.get('description') or '').strip()
        if len(description) > 24000:
            raise ValueError('Module description exceeds 24,000 characters')
        module.description = description or None
    if 'showChallenges' in arguments:
        module.show_challenges = bool(arguments['showChallenges'])
    if 'showScoreboard' in arguments:
        module.show_scoreboard = bool(arguments['showScoreboard'])
    module_view = {'index': module.module_index, 'id': module.id, 'name': module.name, 'description': module.description, 'url': f'/{dojo.reference_id}/{module.id}'}
    outcome.result = {'course': _course_tool_snapshot(dojo), 'module': module_view}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}'
    outcome.card_title = '章节已更新'
    action.target_id = f'{dojo.reference_id}/{module.id}'
    return outcome

def handle_module_delete(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_module
    from ..api.v1.teaching import _course_tool_snapshot
    from CTFd.models import db
    outcome = ToolResult()
    user = context.user
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    module = _course_tool_module(dojo, arguments)
    deleted_name = module.name
    deleted_count = len(module.challenges)
    affected_users = set()
    for challenge in list(module.challenges):
        module_id = module.id
        challenge_id = challenge.id
        from ..learning.authoring import delete_published_challenge
        deletion = delete_published_challenge(challenge, user)
        affected_users.update(deletion.pop('_affectedUserIds', []))
        package_root = deletion.pop('_packageRoot', None)
        if package_root:
            outcome.cleanup_packages.append(package_root)
        outcome.cleanup_workspaces.append((dojo, module_id, challenge_id))
    if affected_users:
        from ..learning.assessment import rebuild_skill_states
        rebuild_skill_states(dojo.dojo_id, sorted(affected_users))
    db.session.delete(module)
    if thread.module_index == module.module_index:
        thread.module_index = None
    db.session.flush()
    db.session.expire(dojo, ['_modules'])
    outcome.result = {'course': _course_tool_snapshot(dojo), 'deletedModuleName': deleted_name, 'deletedChallengeCount': deleted_count}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions'
    outcome.card_title = '章节已删除'
    return outcome
