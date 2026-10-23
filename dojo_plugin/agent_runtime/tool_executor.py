def prepare_assignment(operation, user, thread_id):
    from CTFd.models import db
    from ..coursework import generate_assignment_payload
    from ..models import TeachingAgentThreads
    from .scope import dojo_for_user
    scope = operation['scope']
    thread = TeachingAgentThreads.query.filter_by(id=thread_id, user_id=user.id).first()
    if thread is None or thread.status != 'ACTIVE' or thread.dojo_id != scope['threadDojoId'] or (thread.module_index != scope['moduleIndex']):
        raise ValueError('目标课程或章节在提交后发生变化，请重新确认。')
    dojo = dojo_for_user(user, scope['dojoId'], teacher=True)
    request = dict(operation['arguments'])
    if request.get('moduleIndex') is None:
        request['moduleIndex'] = scope['moduleIndex']
    db.session.commit()
    return generate_assignment_payload(request, dojo)

def apply_teacher_tool(job, operation, action, user, thread, dojo, *, prepared=None):
    from .tool_registry import ToolContext, execute_handler
    from ..api.v1.teaching import TeachingAgentApprovals, TeachingAgentMessages, _course_tool_destination_label, _course_tool_message, _generation_option_context, _timestamp, add_card, clear_challenges, clear_standings, datetime, db, exercise_mode, job_view, record_execution, scrub_payload
    tool = operation['tool']
    arguments = operation['arguments']
    risk = operation['risk']
    confirmed_generation_plan = operation.get('generationPlan')
    proposal_source_refs = operation.get('sourceRefs') or []
    approval_reference = operation.get('approvalRequest')
    selected_generation = None
    if operation.get('generationSelection'):
        selection = operation['generationSelection']
        selected_generation = _generation_option_context(user, thread, selection['sourceMessageId'], selection['optionId'], require_selected=True, require_current=True, lock=True)
    outcome = execute_handler(ToolContext(job, operation, action, user, thread, dojo, selected_generation, prepared))
    result = outcome.result
    href = outcome.href
    card_title = outcome.card_title
    published_challenge = outcome.published_challenge
    cleanup_packages = outcome.cleanup_packages
    cleanup_workspaces = outcome.cleanup_workspaces
    cleanup_course_path = outcome.cleanup_course_path
    queued_job = outcome.queued_job
    queued_jobs = outcome.queued_jobs
    authoring_job = outcome.authoring_job
    authoring_jobs = outcome.authoring_jobs
    root_id = (job.payload or {}).get('harnessRootJobId')
    if root_id:
        for child in queued_jobs:
            child.payload = {**(child.payload or {}), 'harnessRootJobId': root_id,
                             'harnessInternal': True, 'taskListHidden': True}
    if published_challenge is not None:
        from .commands import admit_image_pull
        from ..learning.solution_agent import enqueue_solution_run, solution_run_view
        if not (published_challenge.image or '').startswith(('mac:', 'pwncollege-', 'pwncollege/', 'challenges.pwn.college/')):
            result['imagePullJobId'] = admit_image_pull(action, user, published_challenge).id
        if exercise_mode(published_challenge) != 'SIMULATION':
            solution_run = enqueue_solution_run(published_challenge, user, commit=False, publish=False)
            result['solutionRunId'] = solution_run.id
            result['solutionRun'] = solution_run_view(solution_run)
    if cleanup_packages or cleanup_workspaces or cleanup_course_path:
        from .tool_effects import admit_cleanup
        result['cleanupJobId'] = admit_cleanup(action, user, cleanup_packages, cleanup_workspaces, cleanup_course_path).id
    message_text = _course_tool_message(tool, result)
    assistant = TeachingAgentMessages(thread_id=thread.id, user_id=user.id, role='assistant', content=message_text, metadata_json={'courseTool': tool, 'actionId': action.id, 'riskLevel': risk, **({'generationContract': {'kind': 'independent-ctf-batch', 'requestedCount': result.get('challengeCount'), 'createdJobCount': len(queued_jobs), 'batchId': result.get('batchId')}} if tool == 'challenge.generate' else {'generationContract': {'kind': 'question-set', 'requestedCount': result.get('requestedQuestionCount'), 'createdQuestionCount': result.get('questionCount')}} if tool == 'assignment.generate' else {})})
    db.session.add(assistant)
    db.session.flush()
    if queued_jobs:
        for current_queued_job, current_authoring_job in zip(queued_jobs, authoring_jobs):
            add_card(assistant, card_type='job', object_type='job', object_id=current_queued_job.id, state={**job_view(current_queued_job), 'tool': tool, 'title': current_authoring_job.title, 'artifactType': 'ctf-challenge', 'batchId': result.get('batchId'), 'batchCount': len(queued_jobs), 'batchIndex': (current_queued_job.payload or {}).get('batchIndex'), 'batchTopic': (current_queued_job.payload or {}).get('batchTopic')}, actions=['open', 'cancel'])
    else:
        add_card(assistant, card_type='course_operation', object_type=action.target_type, object_id=action.id, state={'tool': tool, 'status': 'COMPLETED', 'title': card_title, 'summary': message_text, 'href': href, 'destinationLabel': _course_tool_destination_label(tool), 'riskLevel': risk}, actions=['open'] if href else [])
    if queued_jobs:
        action.status = 'PENDING'
        action.completed = None
    elif risk == 'R3':
        db.session.add(TeachingAgentApprovals(action_id=action.id, approver_id=user.id, decision='APPROVED', comment='教师在全局智能体对话中明确确认'))
        action.status = 'APPROVED'
    else:
        action.status = 'COMPLETED'
    action.result = scrub_payload(result)
    action.error = None
    if not queued_jobs:
        action.completed = datetime.datetime.utcnow()
    if selected_generation is not None:
        source_message = selected_generation['sourceMessage']
        source_metadata = dict(selected_generation['metadata'])
        source_selection = dict(selected_generation['selection'] or {})
        source_selection.update({'status': 'STARTED', 'formalJobId': queued_job.id, 'authoringJobId': str(authoring_job.id), 'formalJobIds': [item.id for item in queued_jobs], 'authoringJobIds': [item.id for item in authoring_jobs], 'startedAt': _timestamp(datetime.datetime.utcnow())})
        from .generation_events import record_generation
        record_generation(selected_generation, 'started', source_selection)
        source_metadata['generationSelection'] = source_selection
        source_message.metadata_json = source_metadata
    record_execution(action, 'started', approval_reference)
    thread.updated = datetime.datetime.utcnow()
    record_execution(action, 'committed', approval_reference)
    clear_challenges()
    clear_standings()
    return {'result': scrub_payload(result), 'actionStatus': action.status, 'message': message_text, 'messageId': assistant.id, 'childJobIds': [item.id for item in queued_jobs]}
