def handle_inquiry_create(context):
    from .tool_registry import ToolResult
    from ..learning.inquiry_service import create_project
    from ..agent_runtime.scope import validate_module

    arguments = context.operation["arguments"]
    dojo = context.dojo
    module_index = arguments.get("moduleIndex", context.thread.module_index)
    if dojo and module_index is None and len(dojo.modules) == 1:
        module_index = dojo.modules[0].module_index
    if dojo:
        validate_module(dojo, module_index)
    artifact = create_project(context.user, arguments.get("spec") or {}, dojo=dojo, module_index=module_index,
                              source_refs=context.operation.get("sourceRefs"))
    context.action.target_type = "artifact"
    context.action.target_id = artifact.id
    outcome = ToolResult()
    outcome.result = {"artifact": {"id": artifact.id, "title": artifact.title, "type": artifact.artifact_type,
                                    "status": artifact.status, "revision": artifact.current_revision}}
    outcome.href = "/teacher/artifacts/" + artifact.id
    outcome.card_title = "流程探究式学习草稿已创建"
    return outcome
