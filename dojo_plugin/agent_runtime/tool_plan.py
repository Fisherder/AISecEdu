from __future__ import annotations

import hashlib
import json

from CTFd.models import db

from ..models import TeachingAgentEventOutbox, TeachingAgentThreads, TeachingJobs


class ToolPlanError(ValueError):
    pass


def _encode(value):
    encoded = json.dumps(value, sort_keys=True, ensure_ascii=False,
                         separators=(',', ':'), allow_nan=False).encode()
    if len(encoded) > 8 * 1024 * 1024:
        raise ToolPlanError('操作记录过大，未继续执行。')
    return encoded


def _digest(value):
    return hashlib.sha256(_encode(value)).hexdigest()


def _copy(value):
    return json.loads(_encode(value))


def _plan(row):
    if row is None:
        return None
    payload = _copy(row.payload)
    digest = payload.pop('planSha256', None)
    if payload.get('version') != 1 or _digest(payload) != digest:
        raise ToolPlanError('保存的工具计划不完整，未继续执行。')
    return {**payload, 'planSha256': digest}


def source_plan(source, *, thread_id=None):
    bound_thread_id = getattr(source, 'thread_id', None) or thread_id
    if not bound_thread_id:
        raise ToolPlanError('工具计划缺少会话范围。')
    row = TeachingAgentEventOutbox.query.filter_by(thread_id=bound_thread_id, event_type='tool.plan').filter(
        TeachingAgentEventOutbox.payload['sourceMessageId'].as_integer() == source.id,
    ).populate_existing().one_or_none()
    plan = _plan(row)
    owner_id = getattr(source, 'user_id', None)
    if plan and owner_id is not None and plan['ownerId'] != owner_id:
        raise ToolPlanError('工具计划不属于当前账号。')
    return plan


def driver_plan(job):
    row = TeachingAgentEventOutbox.query.filter_by(event_type='tool.plan').filter(
        TeachingAgentEventOutbox.payload['driverJobId'].as_string() == job.id,
    ).populate_existing().one_or_none()
    plan = _plan(row)
    if plan and (plan['ownerId'] != job.owner_id or plan['threadId'] != job.thread_id):
        raise ToolPlanError('工具执行范围与保存的计划不一致。')
    return plan


def freeze_plan(source, *, source_job=None, driver=None, generation_options=None):
    thread = TeachingAgentThreads.query.filter_by(id=source.thread_id, user_id=source.user_id).with_for_update().one_or_none()
    if thread is None:
        raise ToolPlanError('工具计划的对话不存在。')
    existing = source_plan(source)
    if existing:
        if driver and existing.get('driverJobId') not in {None, driver.id}:
            raise ToolPlanError('工具计划已经登记了另一条执行链。')
        return existing
    metadata = _copy(source.metadata_json or {})
    if generation_options is not None:
        metadata['generationOptions'] = _copy(generation_options)
    proposals = metadata.get('toolProposals') or []
    if not isinstance(proposals, list) or any(not isinstance(item, dict) for item in proposals):
        raise ToolPlanError('工具提议格式无效。')
    proposals = proposals[:8]
    from .approval_journal import journal_rows, proposal_request, request_reference

    prefix = f'proposal:{source.thread_id}:{source.id}:'
    for row in journal_rows(source.thread_id):
        if row.event_type != 'approval.requested' or not row.payload.get('requestId', '').startswith(prefix):
            continue
        suffix = row.payload['requestId'][len(prefix):]
        if not suffix.isdigit() or int(suffix) >= len(proposals) or request_reference(
            proposal_request(source.thread_id, source.id, int(suffix), proposals[int(suffix)])
        )['sha256'] != row.payload['requestSha256']:
            raise ToolPlanError('已登记的批准内容与工具计划不一致。')
    if source_job is None and metadata.get('jobId'):
        source_job = TeachingJobs.query.filter_by(id=str(metadata['jobId']), owner_id=source.user_id,
                                                 thread_id=source.thread_id, kind='agent.chat').first()
    fields = ('jobId', 'agentLoopDepth', 'agentLoopTrace', 'agentRootJobId', 'harnessManaged',
              'generationOptions', 'generationRound', 'refinementSourceMessageId',
              'generationSelection', 'generationRefinement', 'executionMode')
    projected = {key: metadata[key] for key in fields if key in metadata}
    projected.update({'toolProposals': proposals, 'pending': False})
    if source_job:
        projected['jobId'] = source_job.id
        if isinstance(metadata.get('generationOptions'), dict):
            projected['generationOrigin'] = 'validated-legacy' if generation_options is not None else 'result-commit'
            from .model_inputs import request_payload
            projected['generationRequest'] = _copy({key: value for key, value in request_payload(source_job).items()
                                                  if key in {'prompt', 'phase', 'constraints', 'sourceRefs', 'generationRefinement', 'allowDegraded'}})
            projected['generationScope'] = {'dojoId': source_job.dojo_id, 'moduleIndex': source_job.module_index}
    root_id = projected.get('agentRootJobId')
    if not root_id and driver:
        root_id = (driver.payload or {}).get('harnessRootJobId')
    if not root_id and source_job:
        root_id = source_job.id
    payload = {'version': 1, 'planId': f'tool-plan:{source.thread_id}:{source.id}',
               'ownerId': source.user_id, 'threadId': source.thread_id,
               'sourceMessageId': source.id, 'sourceJobId': source_job.id if source_job else None,
               'driverJobId': driver.id if driver else None, 'rootJobId': str(root_id or ''),
               'metadata': projected}
    payload['planSha256'] = _digest(payload)
    db.session.add(TeachingAgentEventOutbox(thread_id=source.thread_id, event_type='tool.plan', payload=payload))
    db.session.flush()
    return _copy(payload)


def plan_rows(plan, event_type):
    return TeachingAgentEventOutbox.query.filter_by(thread_id=plan['threadId'], event_type=event_type).filter(
        TeachingAgentEventOutbox.payload['planId'].as_string() == plan['planId'],
    ).order_by(TeachingAgentEventOutbox.id).populate_existing().all()


def observations(plan):
    output = {}
    predecessors = {}
    for row in plan_rows(plan, 'tool.observed'):
        payload = _copy(row.payload)
        identity = payload.pop('observationId', None)
        key = str(payload['toolIndex'])
        if not 0 <= payload['toolIndex'] < len(plan['metadata']['toolProposals']) or payload['result'].get('tool') != plan['metadata']['toolProposals'][payload['toolIndex']]['tool']:
            raise ToolPlanError('工具结果与保存的计划不一致。')
        if payload.get('version') != 1 or payload['planSha256'] != plan['planSha256'] or payload.get('previousId') != predecessors.get(key) or (
            identity != 'tool-observation:' + _digest(payload)
        ):
            raise ToolPlanError('工具结果记录不完整，未继续执行。')
        predecessors[key] = identity
        output[key] = payload['result']
    return output


def record_observation(plan, job, index, result):
    TeachingAgentThreads.query.filter_by(id=plan['threadId'], user_id=job.owner_id).with_for_update().one()
    if plan['ownerId'] != job.owner_id or plan['threadId'] != job.thread_id or not 0 <= index < len(plan['metadata']['toolProposals']):
        raise ToolPlanError('工具结果不属于当前计划。')
    rows = [row for row in plan_rows(plan, 'tool.observed') if row.payload['toolIndex'] == index]
    previous = rows[-1].payload if rows else None
    result = _copy(result)
    if result.get('tool') != plan['metadata']['toolProposals'][index]['tool'] or result.get('status') not in {
        'DISPATCHING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'REJECTED',
    }:
        raise ToolPlanError('工具结果格式无效。')
    if previous and previous['result'] == result:
        return previous
    payload = {'version': 1, 'planId': plan['planId'], 'planSha256': plan['planSha256'],
               'toolIndex': index, 'driverJobId': job.id,
               'attemptId': f'{job.id}:{job.trace_id}:{job.attempt_count}',
               'previousId': previous['observationId'] if previous else None, 'result': result}
    payload['observationId'] = 'tool-observation:' + _digest(payload)
    db.session.add(TeachingAgentEventOutbox(thread_id=plan['threadId'], event_type='tool.observed', payload=payload))
    db.session.flush()
    return payload


def record_progress(plan, job, state):
    if plan['ownerId'] != job.owner_id or plan['threadId'] != job.thread_id:
        raise ToolPlanError('执行状态不属于当前计划。')
    rows = plan_rows(plan, 'tool.progress')
    value = {'state': state, 'jobId': job.id, 'waitForJobIds': (job.payload or {}).get('waitForJobIds') or [],
             'waitForApproval': (job.payload or {}).get('waitForApproval')}
    if rows and rows[-1].payload['progress'] == value:
        return
    payload = {'version': 1, 'planId': plan['planId'], 'planSha256': plan['planSha256'],
               'progress': value, 'previousId': rows[-1].payload['progressId'] if rows else None}
    payload['progressId'] = 'tool-progress:' + _digest(payload)
    db.session.add(TeachingAgentEventOutbox(thread_id=plan['threadId'], event_type='tool.progress', payload=payload))
    db.session.flush()


def progress(plan):
    previous = None
    value = None
    for row in plan_rows(plan, 'tool.progress'):
        payload = _copy(row.payload)
        identity = payload.pop('progressId', None)
        if payload.get('version') != 1 or payload['planSha256'] != plan['planSha256'] or payload['previousId'] != previous or identity != 'tool-progress:' + _digest(payload):
            raise ToolPlanError('工具执行状态记录不完整。')
        previous = identity
        value = payload['progress']
    return value


def message_metadata(source, plan=None, *, thread_id=None):
    metadata = _copy(source.metadata_json or {})
    plan = plan or source_plan(source, thread_id=thread_id)
    if plan is None:
        return metadata
    metadata.update(plan['metadata'])
    metadata['toolExecutionResults'] = observations(plan)
    metadata['toolPlan'] = {'id': plan['planId'], 'sha256': plan['planSha256']}
    if isinstance(plan['metadata'].get('generationOptions'), dict):
        from .generation_events import generation_state
        for key in ('generationSelection', 'generationRefinement'):
            metadata.pop(key, None)
        metadata.update(generation_state(plan))
    state = progress(plan)
    if state:
        metadata['harnessExecution'] = {'state': state['state'], 'jobId': state['jobId']}
    return metadata


def settled_job(job):
    from .commands import COMMAND_JOB_KINDS

    if job.kind in COMMAND_JOB_KINDS:
        from .commands import accepted_command, command_rows, reduce_command
        admission = accepted_command(job)
        state = reduce_command(command_rows(job.thread_id, admission['commandId']))
        if state['status'] != job.status:
            raise ToolPlanError('命令状态与已保存的执行结果不一致。')
        return (state['outcome'] or {}).get('result') or {}
    row = TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id, event_type='job.event').filter(
        TeachingAgentEventOutbox.payload['jobId'].as_string() == job.id,
    ).order_by(TeachingAgentEventOutbox.id.desc()).populate_existing().first()
    if row is None or row.payload.get('status') != job.status:
        raise ToolPlanError('任务完成记录尚未完整保存，未继续执行。')
    return _copy(row.payload.get('details') or {})
