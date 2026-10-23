def handle_challenge_generate(context):
    from ..models import TeachingGenerationBatchItems
    from ..models import TeachingGenerationBatches
    from ..models import TeachingJobs
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _challenge_batch_item_brief
    from ..api.v1.teaching import _course_tool_module
    from ..api.v1.teaching import _course_tool_snapshot
    from ..api.v1.teaching import _mark_thread_attachments_consumed
    from ..api.v1.teaching import _practice_challenge_constraints
    from ..agent_runtime.materials import build_course_material_context
    from ..agent_runtime.materials import compact_material_grounding
    import datetime
    from CTFd.models import db
    from ..agent_runtime.jobs import job_view
    from ..learning.evidence import scrub_payload
    import uuid
    from ..api.v1.learning import _authoring_job_view, _queue_authoring_job
    outcome = ToolResult()
    action = context.action
    user = context.user
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    confirmed_generation_plan = context.operation.get('generationPlan')
    proposal_source_refs = context.operation.get('sourceRefs') or []
    selected_generation = context.selection
    module = _course_tool_module(dojo, arguments, fallback_index=thread.module_index)
    brief = str(arguments.get('brief') or '').strip()
    if len(brief) < 12 or len(brief) > 24000:
        raise ValueError('CTF 实践题要求需包含 12 到 24,000 个字符。')
    raw_challenge_count = arguments.get('challengeCount')
    if raw_challenge_count is None:
        raw_challenge_count = 1
    try:
        if isinstance(raw_challenge_count, bool):
            raise ValueError
        challenge_count = int(raw_challenge_count)
        if isinstance(raw_challenge_count, float) and (not raw_challenge_count.is_integer()):
            raise ValueError
        if isinstance(raw_challenge_count, str) and (not raw_challenge_count.strip().isdigit()):
            raise ValueError
    except (TypeError, ValueError) as exc:
        raise ValueError('一次生成的 CTF 数量必须是 1 到 5。') from exc
    if challenge_count < 1 or challenge_count > 5:
        raise ValueError('一次生成的 CTF 数量必须是 1 到 5。')
    constraints = _practice_challenge_constraints(brief, arguments.get('constraints'))
    raw_batch_topics = constraints.get('batchTopics')
    batch_topics = []
    if isinstance(raw_batch_topics, list):
        batch_topics = [str(item or '').strip()[:80] for item in raw_batch_topics]
        if len(batch_topics) != challenge_count or any((len(item) < 2 for item in batch_topics)) or len(set(batch_topics)) != challenge_count:
            batch_topics = []
    if batch_topics:
        constraints['batchTopics'] = batch_topics
    else:
        constraints.pop('batchTopics', None)
    if arguments.get('difficulty') is not None:
        constraints = {**constraints, 'difficulty': str(arguments['difficulty'])[:80]}
    explicit_source_refs = selected_generation['bundle'].get('sourceRefs') or [] if selected_generation is not None else proposal_source_refs
    material_context = build_course_material_context(owner_id=user.id, dojo_id=dojo.dojo_id, prompt=brief, source_refs=explicit_source_refs, require_complete=True)
    constraints['sourceMaterialGrounding'] = compact_material_grounding(material_context)
    authoring_request = {'brief': brief, 'constraints': scrub_payload(constraints), 'sourceRefs': material_context['sourceRefs'], 'source': 'teacher-global-agent'}
    batch_id = f'practice_batch_{uuid.uuid4().hex}'
    confirmed_items = confirmed_generation_plan.get('items') if isinstance(confirmed_generation_plan, dict) else []
    item_specs = [{'itemIndex': batch_index, 'title': str(confirmed_items[batch_index - 1].get('title') or '').strip() if len(confirmed_items) == challenge_count else batch_topics[batch_index - 1] if len(batch_topics) == challenge_count else f'独立 CTF 题目 {batch_index}', 'difficulty': str(confirmed_items[batch_index - 1].get('difficulty') or arguments.get('difficulty') or '按要求递进')[:80] if len(confirmed_items) == challenge_count else str(arguments.get('difficulty') or '按要求递进')[:80]} for batch_index in range(1, challenge_count + 1)]
    generation_batch = TeachingGenerationBatches(id=batch_id, owner_id=user.id, dojo_id=dojo.dojo_id, module_index=module.module_index, thread_id=thread.id, action_id=action.id, operation='challenge.batch.generate', status='QUEUED', requested_count=challenge_count, independence='independent_challenges', exercise_mode='CTF', publish_mode='draft', difficulty_strategy={'mode': str(arguments.get('difficulty') or '')[:80], 'perItem': [item['difficulty'] for item in item_specs]}, plan={'brief': brief, 'items': item_specs, 'sourceRefs': material_context['sourceRefs']}, counts={'requested': challenge_count, 'created': 0, 'validated': 0, 'failed': 0}, idempotency_key=f'{action.id}:challenge-batch', confirmed=datetime.datetime.utcnow())
    db.session.add(generation_batch)
    batch_items = []
    for item_spec in item_specs:
        batch_item = TeachingGenerationBatchItems(batch_id=batch_id, item_index=item_spec['itemIndex'], status='PLANNED', spec=item_spec)
        db.session.add(batch_item)
        batch_items.append(batch_item)
    db.session.flush()
    base_title = next((line.strip() for line in brief.splitlines() if line.strip()), '题目生成')
    for batch_index in range(1, challenge_count + 1):
        batch_constraints = dict(constraints)
        item_spec = item_specs[batch_index - 1]
        item_difficulty = str(item_spec.get('difficulty') or '').strip()
        if item_difficulty:
            batch_constraints['difficulty'] = item_difficulty
        batch_topic = batch_topics[batch_index - 1] if batch_topics else None
        batch_brief = _challenge_batch_item_brief(brief, batch_id, batch_index, challenge_count, batch_topic)
        if challenge_count > 1:
            batch_constraints.update({'batchId': batch_id, 'batchIndex': batch_index, 'batchCount': challenge_count, 'independentChallenge': True, 'batchContract': {'requestedCount': challenge_count, 'itemIndex': batch_index, 'oneDraftPerItem': True, 'oneEnvironmentPerItem': True, 'oneDynamicFlagPerItem': True}, **({'batchTopic': batch_topic} if batch_topic else {})})
        current_request = {**authoring_request, 'brief': batch_brief, 'constraints': scrub_payload(batch_constraints), 'batch': {'id': batch_id, 'index': batch_index, 'count': challenge_count, 'sourceBrief': brief}}
        current_authoring_job, error = _queue_authoring_job(dojo=dojo, module=module, author=user, title=f'{batch_topic}（{batch_index}/{challenge_count}）' if batch_topic else f'CTF 实践题 {batch_index}/{challenge_count}' if challenge_count > 1 else base_title, request_json=current_request, durable_payload={'sourceRefs': material_context['sourceRefs'], 'materialContext': material_context['coverage'], 'batchId': batch_id, 'batchIndex': batch_index, 'batchCount': challenge_count, **({'batchTopic': batch_topic} if batch_topic else {})}, action_id=action.id, thread_id=thread.id, publish=False, commit=False)
        if error:
            raise RuntimeError('Unable to start every native challenge authoring job')
        current_queued_job = TeachingJobs.query.filter_by(idempotency_key=f'learning-authoring:{current_authoring_job.id}').first()
        if current_queued_job is None:
            raise RuntimeError('Unable to locate a queued challenge authoring job')
        batch_item = batch_items[batch_index - 1]
        batch_item.status = 'QUEUED'
        batch_item.task_id = current_queued_job.id
        batch_item.authoring_job_id = current_authoring_job.id
        outcome.authoring_jobs.append(current_authoring_job)
        outcome.queued_jobs.append(current_queued_job)
    if len(outcome.authoring_jobs) != challenge_count or len(outcome.queued_jobs) != challenge_count or len({item.id for item in outcome.queued_jobs}) != challenge_count:
        raise RuntimeError('CTF batch did not create one durable job per requested challenge')
    outcome.authoring_job = outcome.authoring_jobs[0]
    outcome.queued_job = outcome.queued_jobs[0]
    outcome.result = {'course': _course_tool_snapshot(dojo), 'module': {'index': module.module_index, 'id': module.id, 'name': module.name}, 'authoringJob': _authoring_job_view(outcome.authoring_job), 'job': job_view(outcome.queued_job), 'authoringJobs': [_authoring_job_view(item) for item in outcome.authoring_jobs], 'jobs': [job_view(item) for item in outcome.queued_jobs], 'authoringJobIds': [item.id for item in outcome.authoring_jobs], 'formalJobIds': [item.id for item in outcome.queued_jobs], 'challengeCount': challenge_count, 'batchId': batch_id, 'batchTopics': batch_topics, 'generationBatch': {'id': batch_id, 'status': 'queued', 'requestedCount': challenge_count, 'createdCount': 0, 'validatedCount': 0, 'failedCount': 0, 'items': [{'itemIndex': item.item_index, 'taskId': item.task_id, 'authoringJobId': item.authoring_job_id, 'draftId': None, 'status': 'queued', 'spec': item.spec} for item in batch_items]}}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}'
    outcome.card_title = f'{challenge_count} 道题目生成已启动' if challenge_count > 1 else '题目生成已启动'
    action.target_id = batch_id if challenge_count > 1 else str(outcome.authoring_job.id)
    _mark_thread_attachments_consumed(thread, [ref.get('id') for ref in material_context.get('sourceRefs', []) if isinstance(ref, dict) and ref.get('type') == 'material'], operation='generate:ctf-challenge', job_id=outcome.queued_job.id)
    return outcome

def handle_challenge_revise(context):
    from ..models import DojoModules
    from ..models import LearningAuthoringJobs
    from ..models import LearningDrafts
    from ..models import TeachingJobs
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from CTFd.models import db
    from ..agent_runtime.jobs import job_view
    import uuid
    from ..api.v1.learning import _authoring_job_view, _queue_authoring_job
    outcome = ToolResult()
    action = context.action
    user = context.user
    thread = context.thread
    dojo = context.dojo
    arguments = context.operation['arguments']
    raw_draft_ids = arguments.get('draftIds')
    if not isinstance(raw_draft_ids, list):
        raise ValueError('需要提供要修订的题目草稿列表。')
    draft_ids = []
    for raw_draft_id in raw_draft_ids:
        draft_id = str(raw_draft_id or '').strip()
        if draft_id and draft_id not in draft_ids:
            draft_ids.append(draft_id)
    if not 1 <= len(draft_ids) <= 5:
        raise ValueError('一次可以统一修订 1 到 5 道 CTF 实践题。')
    instruction = str(arguments.get('instruction') or '').strip()
    if not 3 <= len(instruction) <= 12000:
        raise ValueError('修订要求需包含 3 到 12,000 个字符。')
    drafts_by_id = {item.id: item for item in LearningDrafts.query.filter(LearningDrafts.id.in_(draft_ids), LearningDrafts.dojo_id == dojo.dojo_id, LearningDrafts.author_id == user.id).all()}
    if set(drafts_by_id) != set(draft_ids):
        raise ValueError('一个或多个目标题目草稿不存在或不属于当前课程。')
    drafts = [drafts_by_id[draft_id] for draft_id in draft_ids]
    active_draft_ids = {row[0] for row in db.session.query(LearningAuthoringJobs.draft_id).filter(LearningAuthoringJobs.draft_id.in_(draft_ids), LearningAuthoringJobs.status.in_(('QUEUED', 'RUNNING'))).all()}
    if active_draft_ids:
        raise ValueError('一个或多个题目已有生成或修订任务正在进行。')
    batch_id = f'ctf_revision_{uuid.uuid4().hex}'
    for batch_index, draft in enumerate(drafts, start=1):
        module = DojoModules.query.filter_by(dojo_id=dojo.dojo_id, module_index=draft.module_index).first()
        if module is None:
            raise ValueError('题目草稿所属章节已不存在。')
        draft.status = 'BUILDING'
        draft.validation = {}
        current_authoring_job, error = _queue_authoring_job(dojo=dojo, module=module, author=user, title='修订：' + str((draft.spec or {}).get('name') or draft.brief)[:220], kind='REVISE', draft_id=draft.id, request_json={'message': instruction}, durable_payload={'draftId': draft.id, 'batchId': batch_id, 'batchIndex': batch_index, 'batchCount': len(drafts)}, action_id=action.id, thread_id=thread.id, publish=False, commit=False)
        if error:
            raise RuntimeError('Unable to start every native challenge revision job')
        current_queued_job = TeachingJobs.query.filter_by(idempotency_key=f'learning-authoring:{current_authoring_job.id}').first()
        if current_queued_job is None:
            raise RuntimeError('Unable to locate a queued challenge revision job')
        outcome.authoring_jobs.append(current_authoring_job)
        outcome.queued_jobs.append(current_queued_job)
    outcome.authoring_job = outcome.authoring_jobs[0]
    outcome.queued_job = outcome.queued_jobs[0]
    outcome.result = {'course': _course_tool_snapshot(dojo), 'authoringJob': _authoring_job_view(outcome.authoring_job), 'job': job_view(outcome.queued_job), 'authoringJobs': [_authoring_job_view(item) for item in outcome.authoring_jobs], 'jobs': [job_view(item) for item in outcome.queued_jobs], 'authoringJobIds': [item.id for item in outcome.authoring_jobs], 'formalJobIds': [item.id for item in outcome.queued_jobs], 'draftIds': draft_ids, 'challengeCount': len(drafts), 'batchId': batch_id}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions'
    outcome.card_title = f'{len(drafts)} 道题目修订已启动'
    action.target_id = batch_id
    return outcome

def handle_challenge_publish(context):
    from ..models import DojoModules
    from ..models import LearningDrafts
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_snapshot
    from CTFd.models import db
    from ..learning.authoring import publish_draft
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    arguments = context.operation['arguments']
    draft = LearningDrafts.query.filter_by(id=str(arguments.get('draftId') or ''), dojo_id=dojo.dojo_id, author_id=user.id).first()
    if draft is None:
        raise ValueError('Target native challenge draft was not found')
    module = DojoModules.query.filter_by(dojo_id=dojo.dojo_id, module_index=draft.module_index).first()
    if module is None:
        raise ValueError('Draft module no longer exists')
    outcome.published_challenge = publish_draft(draft, user)
    db.session.flush()
    outcome.result = {'course': _course_tool_snapshot(dojo), 'module': {'index': module.module_index, 'id': module.id, 'name': module.name}, 'challenge': {'id': outcome.published_challenge.id, 'name': outcome.published_challenge.name, 'referenceId': outcome.published_challenge.reference_id, 'moduleId': module.id, 'exerciseMode': outcome.published_challenge.exercise_mode}, 'draftId': draft.id}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}'
    outcome.card_title = 'CTF 实践题已发布'
    action.target_id = outcome.published_challenge.reference_id
    return outcome

def handle_challenge_delete(context):
    from .tool_registry import ToolResult
    from ..api.v1.teaching import _course_tool_module
    from ..api.v1.teaching import _course_tool_snapshot
    from CTFd.models import db
    from ..learning.assessment import rebuild_skill_states
    from ..learning.authoring import delete_published_challenge
    outcome = ToolResult()
    action = context.action
    user = context.user
    dojo = context.dojo
    arguments = context.operation['arguments']
    module = _course_tool_module(dojo, arguments)
    challenge_id = str(arguments.get('challengeId') or '').strip()
    challenge = next((item for item in module.challenges if item.id == challenge_id), None)
    if challenge is None:
        raise ValueError('Target challenge was not found')
    challenge_name = challenge.name
    deletion = delete_published_challenge(challenge, user)
    rebuild_skill_states(dojo.dojo_id, deletion.pop('_affectedUserIds', []))
    package_root = deletion.pop('_packageRoot', None)
    if package_root:
        outcome.cleanup_packages.append(package_root)
    outcome.cleanup_workspaces.append((dojo, module.id, challenge_id))
    db.session.expire(module, ['_challenges'])
    outcome.result = {'course': _course_tool_snapshot(dojo), 'module': {'index': module.module_index, 'id': module.id, 'name': module.name}, 'challenge': {'id': challenge_id, 'name': challenge_name}, 'deletion': deletion}
    outcome.href = f'/teacher/courses?dojo={dojo.reference_id}&tab=questions&module={module.module_index}'
    outcome.card_title = '题目已删除'
    action.target_id = f'{dojo.reference_id}/{module.id}/{challenge_id}'
    return outcome
