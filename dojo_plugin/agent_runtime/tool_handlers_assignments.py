def handle_assignment_list(context):
    from ..models import TeachingAssignments
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import assignment_view
    outcome = ToolResult()
    user = context.user
    dojo = context.dojo
    assignments = TeachingAssignments.query.filter_by(dojo_id=dojo.dojo_id).order_by(TeachingAssignments.updated.desc()).limit(300).all()
    outcome.result = {'course': _course_tool_snapshot(dojo), 'assignments': [assignment_view(item, user=user, teacher=True, include_items=False) for item in assignments]}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions'
    outcome.card_title = '课程作业'
    return outcome

def handle_assignment_read(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_assignment
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import assignment_view
    from ..coursework import roster_submissions
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    tool = context.operation['tool']
    arguments = context.operation['arguments']
    assignment = _course_tool_assignment(dojo, arguments)
    outcome.result = {'course': _course_tool_snapshot(dojo), 'assignment': assignment_view(assignment, user=user, teacher=True)}
    if tool == 'assignment.submissions':
        outcome.result['students'] = roster_submissions(assignment)
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}'
    outcome.card_title = '作业详情' if tool == 'assignment.read' else '提交与批改'
    action.target_id = assignment.id
    return outcome

def handle_assignment_generate(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import assignment_view
    from ..coursework import create_assignment
    from CTFd.models import db
    outcome = ToolResult()
    action = context.action
    user = context.user
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    prepared = context.prepared
    generation_request = dict(arguments)
    if generation_request.get('moduleIndex') is None and thread.module_index is not None:
        generation_request['moduleIndex'] = thread.module_index
    if prepared is None:
        raise ValueError('Assignment preparation has not been persisted')
    payload = prepared
    generation_meta = (payload.get('settings') or {}).get('generation') or {} if isinstance(payload.get('settings'), dict) else {}
    requested_question_count = int(generation_meta.get('requestedQuestionCount') or 0)
    generated_question_count = sum((1 for item in payload.get('items') or [] if isinstance(item, dict) and item.get('type') != 'CHALLENGE'))
    if requested_question_count < 1 or generated_question_count != requested_question_count:
        raise RuntimeError('Assignment generation did not satisfy the requested question count')
    assignment = create_assignment(user, dojo, payload)
    db.session.flush()
    outcome.result = {'course': _course_tool_snapshot(dojo), 'assignment': assignment_view(assignment, user=user, teacher=True), 'requestedQuestionCount': requested_question_count, 'questionCount': generated_question_count}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}'
    outcome.card_title = '作业草稿已生成'
    action.target_id = assignment.id
    return outcome

def handle_assignment_update(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_assignment
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import assignment_view
    from ..coursework import update_assignment
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    arguments = context.operation['arguments']
    assignment = _course_tool_assignment(dojo, arguments)
    update_assignment(assignment, {key: value for key, value in arguments.items() if key != 'assignmentId'}, user)
    outcome.result = {'course': _course_tool_snapshot(dojo), 'assignment': assignment_view(assignment, user=user, teacher=True)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}'
    outcome.card_title = '作业已更新'
    action.target_id = assignment.id
    return outcome

def handle_assignment_publish(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_assignment
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import assignment_view
    from ..coursework import close_assignment
    from ..coursework import publish_assignment
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    tool = context.operation['tool']
    arguments = context.operation['arguments']
    assignment = _course_tool_assignment(dojo, arguments)
    if tool == 'assignment.publish':
        publish_assignment(assignment, user)
        outcome.card_title = '作业已发布'
    else:
        close_assignment(assignment, user)
        outcome.card_title = '作业已关闭'
    outcome.result = {'course': _course_tool_snapshot(dojo), 'assignment': assignment_view(assignment, user=user, teacher=True)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}'
    action.target_id = assignment.id
    return outcome

def handle_assignment_delete(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_assignment
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import delete_assignment
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    arguments = context.operation['arguments']
    assignment = _course_tool_assignment(dojo, arguments)
    deleted_id = assignment.id
    deleted_title = assignment.title
    delete_assignment(assignment, user)
    outcome.result = {'course': _course_tool_snapshot(dojo), 'deletedAssignmentId': deleted_id, 'deletedAssignmentTitle': deleted_title}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions'
    outcome.card_title = '作业已删除'
    action.target_id = deleted_id
    return outcome

def handle_assignment_grade_override(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_assignment
    from ..api.v1.teaching import _course_tool_snapshot
    from ..coursework import assignment_view
    from ..coursework import override_submission_grade
    from ..coursework import roster_submissions
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    arguments = context.operation['arguments']
    assignment = _course_tool_assignment(dojo, arguments)
    submission = override_submission_grade(assignment, arguments.get('submissionId'), user, arguments.get('score'), arguments.get('feedback') if 'feedback' in arguments else None)
    outcome.result = {'course': _course_tool_snapshot(dojo), 'assignment': assignment_view(assignment, user=user, teacher=True), 'submissionId': submission.id, 'students': roster_submissions(assignment)}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&assignment={assignment.id}'
    outcome.card_title = '成绩已复核'
    action.target_id = submission.id
    return outcome
