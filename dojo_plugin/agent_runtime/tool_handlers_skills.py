def handle_skill_list(context):
    from .tool_registry import ToolResult
    from ..agent_runtime.skills import builtin_catalog
    from ..agent_runtime.skills import skill_summaries
    outcome = ToolResult()
    user = context.user
    outcome.result = {'skills': skill_summaries(user), 'builtinCatalog': [{'name': item['name'], 'description': item['description']} for item in builtin_catalog()]}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '我的技能'
    return outcome

def handle_skill_read(context):
    from .tool_registry import ToolResult
    from ..agent_runtime.skills import owned_skill
    from ..agent_runtime.skills import skill_view
    outcome = ToolResult()
    action = context.action
    user = context.user
    arguments = context.operation['arguments']
    skill = owned_skill(user, arguments.get('name'))
    outcome.result = {'skill': skill_view(skill, include_instructions=True)}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '技能详情'
    action.target_id = skill.name
    return outcome

def handle_skill_create(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _skill_tool_arguments
    from ..agent_runtime.skills import create_skill
    from ..agent_runtime.skills import skill_view
    outcome = ToolResult()
    action = context.action
    user = context.user
    arguments = context.operation['arguments']
    payload = _skill_tool_arguments(arguments, require_name=True)
    skill = create_skill(user, name=payload['name'], description=payload.get('description'), instructions=payload.get('instructions'), references=payload.get('references'), model_invocable=payload.get('model_invocable', True), user_invocable=payload.get('user_invocable', True), commit=False)
    outcome.result = {'skill': skill_view(skill, include_instructions=False)}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '技能已安装'
    action.target_id = skill.name
    return outcome

def handle_skill_update(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _skill_tool_arguments
    from ..agent_runtime.skills import skill_view
    from ..agent_runtime.skills import update_skill
    outcome = ToolResult()
    action = context.action
    user = context.user
    arguments = context.operation['arguments']
    payload = _skill_tool_arguments(arguments, require_name=True)
    name = payload.pop('name')
    skill = update_skill(user, name, **{key: value for key, value in payload.items() if key in {'description', 'instructions', 'references', 'enabled', 'model_invocable', 'user_invocable'}}, commit=False)
    outcome.result = {'skill': skill_view(skill, include_instructions=False)}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '技能已更新'
    action.target_id = skill.name
    return outcome

def handle_skill_toggle(context):
    from .tool_registry import ToolResult
    from ..agent_runtime.skills import skill_view
    from ..agent_runtime.skills import update_skill
    outcome = ToolResult()
    action = context.action
    user = context.user
    arguments = context.operation['arguments']
    skill = update_skill(user, arguments.get('name'), enabled=arguments.get('enabled', True), commit=False)
    outcome.result = {'skill': skill_view(skill, include_instructions=False)}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '技能已启用' if skill.enabled else '技能已停用'
    action.target_id = skill.name
    return outcome

def handle_skill_import(context):
    from .tool_registry import ToolResult
    from ..agent_runtime.skills import import_builtin
    from ..agent_runtime.skills import skill_view
    outcome = ToolResult()
    action = context.action
    user = context.user
    arguments = context.operation['arguments']
    skill = import_builtin(user, arguments.get('name'), commit=False)
    outcome.result = {'skill': skill_view(skill, include_instructions=False)}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '内置技能已加入我的账号'
    action.target_id = skill.name
    return outcome

def handle_skill_delete(context):
    from .tool_registry import ToolResult
    from ..agent_runtime.skills import delete_skill
    outcome = ToolResult()
    action = context.action
    user = context.user
    arguments = context.operation['arguments']
    skill = delete_skill(user, arguments.get('name'), commit=False)
    outcome.result = {'deleted': skill.name}
    outcome.href = '/teacher?view=conversation'
    outcome.card_title = '技能已删除'
    action.target_id = skill.name
    return outcome
