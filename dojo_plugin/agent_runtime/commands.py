from __future__ import annotations

import datetime
import hashlib
import json

from CTFd.models import Users, db

from ..models import TeachingAgentActions, TeachingAgentEventOutbox, TeachingJobs
from .approval_journal import action_request, request_reference, require_approved


COMMAND_JOB_KINDS = frozenset({'agent.command', 'agent.command.publish', 'agent.command.image-pull', 'agent.command.tool', 'agent.command.tool-authoring', 'agent.command.cleanup'})
TERMINAL_STATES = frozenset({'SUCCEEDED', 'FAILED', 'CANCELED'})
EVENT_STATES = {
    'command.accepted': 'QUEUED',
    'command.attempt.started': 'RUNNING',
    'command.retry.scheduled': 'QUEUED',
    'command.reopened': 'QUEUED',
    'command.succeeded': 'SUCCEEDED',
    'command.failed': 'FAILED',
    'command.canceled': 'CANCELED',
}


def _digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def command_rows(thread_id, command_id):
    return TeachingAgentEventOutbox.query.filter_by(thread_id=thread_id).filter(
        TeachingAgentEventOutbox.event_type.like('command.%'),
        TeachingAgentEventOutbox.payload['commandId'].astext == command_id,
    ).order_by(TeachingAgentEventOutbox.id).populate_existing().all()


def reduce_command(rows):
    state = None
    accepted = None
    outcome = None
    attempts = []
    for row in rows:
        kind, payload = row.event_type, row.payload
        if kind == 'command.accepted':
            if accepted is not None:
                raise ValueError('Command has more than one admission')
            accepted = payload
        if kind == 'command.attempt.started':
            attempts.append({'attemptCount': payload['attemptCount'], 'attemptId': payload['attemptId'], 'state': 'RUNNING'})
        if kind in {'command.attempt.failed', 'command.attempt.interrupted'}:
            for attempt in reversed(attempts):
                if attempt['attemptId'] == payload['attemptId']:
                    attempt['state'] = 'INTERRUPTED' if kind.endswith('interrupted') else 'FAILED'
                    break
        next_state = EVENT_STATES.get(kind)
        if next_state is None:
            continue
        if kind == 'command.reopened' and state == 'SUCCEEDED':
            raise ValueError('Successful command cannot be reopened')
        if state in TERMINAL_STATES and kind != 'command.reopened':
            if next_state != state:
                raise ValueError('Command has conflicting terminal outcomes')
            continue
        state = next_state
        if kind == 'command.reopened':
            outcome = None
        if next_state in TERMINAL_STATES:
            outcome = payload
            if attempts and attempts[-1]['state'] == 'RUNNING':
                attempts[-1]['state'] = next_state
    return {'status': state, 'accepted': accepted, 'outcome': outcome, 'attempts': attempts}


def _append(job, kind, detail=None):
    accepted = accepted_command(job)
    event = TeachingAgentEventOutbox(
        thread_id=job.thread_id, event_type=kind,
        payload={'commandId': accepted['commandId'], 'jobId': job.id,
                 'actionId': accepted.get('actionId'), 'attemptCount': job.attempt_count,
                 'attemptId': f'{job.id}:{job.trace_id}:{job.attempt_count}',
                 **(detail or {})})
    db.session.add(event)
    db.session.flush()
    return event


def accepted_command(job):
    rows = TeachingAgentEventOutbox.query.filter_by(
        thread_id=job.thread_id, event_type='command.accepted',
    ).filter(TeachingAgentEventOutbox.payload['jobId'].astext == job.id).populate_existing().all()
    if len(rows) != 1:
        raise ValueError('Durable command admission not found')
    accepted = rows[0].payload
    if accepted.get('actorId') != job.owner_id or accepted.get('jobKind') != job.kind:
        raise ValueError('Command ownership or executor changed')
    if _digest(accepted['operation']) != accepted.get('operationSha256'):
        raise ValueError('Command request digest does not match')
    return accepted


def _admit(*, command_id, actor_id, thread_id, action_id, operation, kind, dojo_id, module_index):
    from .jobs import enqueue_job

    existing = TeachingJobs.query.filter_by(idempotency_key=command_id).populate_existing().first()
    if existing is not None:
        accepted = accepted_command(existing)
        if accepted['operation'] != operation or existing.owner_id != actor_id:
            raise ValueError('Command identity belongs to a different request')
        return existing
    if command_rows(thread_id, command_id):
        raise ValueError('Admitted command no longer has its durable execution job')
    job, created = enqueue_job(
        owner_id=actor_id, thread_id=thread_id, action_id=action_id,
        dojo_id=dojo_id, module_index=module_index, kind=kind,
        idempotency_key=command_id, priority=10, max_attempts=3,
        payload={'commandId': command_id, 'taskListHidden': True},
        commit=False, publish=False,
    )
    if not created:
        raise ValueError('Command admission raced without its serialization lock')
    db.session.add(TeachingAgentEventOutbox(
        thread_id=thread_id, event_type='command.accepted',
        payload={'commandId': command_id, 'jobId': job.id, 'actionId': action_id,
                 'actorId': actor_id, 'jobKind': kind, 'operation': operation,
                 'operationSha256': _digest(operation), 'version': 1}))
    db.session.flush()
    return job


def admit_action(action, approver):
    from .approved_actions import prepare_action

    envelope = action_request(action)
    reference = require_approved(envelope, request_reference(envelope))
    operation = {'kind': 'approved-action', 'request': envelope, 'approvalRequest': reference,
                 'initialResult': action.result or {}}
    if action.action_type == 'publish-question-artifact':
        operation['validationBinding'] = _question_binding(prepare_action(action, approver)['draft'])
    return _admit(
        command_id=f'command:{action.id}', actor_id=approver.id,
        thread_id=action.thread_id, action_id=action.id,
        operation=operation,
        kind='agent.command.publish' if action.action_type == 'publish-question-artifact' else 'agent.command',
        dojo_id=(action.request_json or {}).get('dojoId'),
        module_index=(action.request_json or {}).get('moduleIndex'),
    )


def _question_binding(draft):
    return _digest({'draftId': draft.id, 'revision': draft.revision,
                    'spec': draft.spec, 'validation': draft.validation})


def admit_teacher_tool(action, actor, operation):
    from .tool_registry import TOOL_HANDLERS

    if operation['tool'] not in TOOL_HANDLERS:
        raise ValueError('Unsupported executable teacher tool')
    if operation['tool'] == 'challenge.publish':
        from ..models import LearningDrafts
        from ..learning.authoring import _publish_validation_is_current

        draft = LearningDrafts.query.filter_by(
            id=str(operation['arguments'].get('draftId') or ''), author_id=actor.id,
            dojo_id=operation['scope']['dojoId'],
        ).with_for_update().populate_existing().first()
        if draft is None or not _publish_validation_is_current(draft):
            raise ValueError('实践题尚未通过当前版本的发布检查。')
        operation = {**operation, 'validationBinding': _question_binding(draft)}
    return _admit(
        command_id=f'command:{action.id}', actor_id=actor.id,
        thread_id=action.thread_id, action_id=action.id, operation=operation,
        kind='agent.command.tool-authoring' if operation['tool'] in {'assignment.generate', 'challenge.publish', 'course.sync'} else 'agent.command.tool',
        dojo_id=operation['scope']['dojoId'], module_index=operation['scope']['moduleIndex'],
    )


def admit_image_pull(action, actor, challenge, *, suffix='image-pull'):
    return _admit(
        command_id=f'command:{action.id}:{suffix}', actor_id=actor.id,
        thread_id=action.thread_id, action_id=None,
        operation={'kind': 'image-pull', 'parentActionId': action.id,
                   'challengeId': challenge.challenge_id, 'dojoId': challenge.dojo_id,
                   'image': challenge.image, 'dojoReferenceId': challenge.dojo.reference_id},
        kind='agent.command.image-pull', dojo_id=challenge.dojo_id,
        module_index=challenge.module_index,
    )


def action_execution(action):
    rows = command_rows(action.thread_id, f'command:{action.id}')
    if not rows:
        return None
    state = reduce_command(rows)
    accepted, outcome = state['accepted'], state['outcome'] or {}
    if accepted is None:
        raise ValueError('Command admission missing from its history')
    return {
        'commandId': accepted['commandId'], 'jobId': accepted['jobId'],
        'kind': accepted['operation']['kind'],
        'status': state['status'], 'attempts': state['attempts'],
        'result': outcome.get('result'), 'error': outcome.get('error'),
        'errorCode': outcome.get('errorCode'),
    }


def execute_command(job):
    from .jobs import JobCanceled, assert_job_lease
    from .approved_actions import apply_action, prepare_action

    job = assert_job_lease(job)
    accepted = accepted_command(job)
    state = reduce_command(command_rows(job.thread_id, accepted['commandId']))
    if state['status'] in TERMINAL_STATES:
        if state['status'] == 'SUCCEEDED':
            return (state['outcome'] or {}).get('result') or {}
        raise ValueError('Command already has a terminal outcome')
    for attempt in state['attempts']:
        if attempt['state'] == 'RUNNING' and attempt['attemptId'] != f'{job.id}:{job.trace_id}:{job.attempt_count}':
            _append(job, 'command.attempt.interrupted', {'attemptCount': attempt['attemptCount'], 'attemptId': attempt['attemptId'], 'reason': 'execution-lease-replaced'})
    _append(job, 'command.attempt.started')
    db.session.commit()
    job = assert_job_lease(job)
    if job.canceled is not None or job.status == 'CANCEL_REQUESTED':
        raise JobCanceled('Command canceled before applying its effect')
    accepted = accepted_command(job)
    actor = Users.query.filter_by(id=job.owner_id).populate_existing().first()
    if actor is None or actor.banned:
        raise ValueError('Command actor no longer exists')
    operation = accepted['operation']
    if operation['kind'] == 'teacher-tool':
        from .tool_executor import apply_teacher_tool
        from .scope import dojo_for_user
        from ..api.v1.teaching import _require_teacher
        from ..models import TeachingAgentThreads, Dojos

        _require_teacher(actor)
        prepared = None
        if operation['tool'] == 'assignment.generate':
            from .tool_executor import prepare_assignment
            from .jobs import AUTHORING_LEASE_SECONDS, _job_cancellation_requested

            prepared_event = next((row for row in command_rows(job.thread_id, accepted['commandId'])
                                   if row.event_type == 'command.prepared'), None)
            if prepared_event:
                prepared = prepared_event.payload['prepared']
            else:
                job.lease_expires = datetime.datetime.utcnow() + datetime.timedelta(seconds=AUTHORING_LEASE_SECONDS)
                db.session.commit()
                prepared = prepare_assignment(operation, actor, job.thread_id)
                job = assert_job_lease(job)
                if _job_cancellation_requested(job):
                    raise JobCanceled('Command canceled while preparing assignment')
                _append(job, 'command.prepared', {'prepared': prepared})
                db.session.commit()
                job = assert_job_lease(job)
            actor = Users.query.filter_by(id=job.owner_id).populate_existing().first()
            if actor is None or actor.banned:
                raise ValueError('Command actor no longer exists')
            _require_teacher(actor)
        action = TeachingAgentActions.query.filter_by(id=accepted['actionId']).with_for_update().populate_existing().first()
        thread = TeachingAgentThreads.query.filter_by(id=job.thread_id, user_id=actor.id).with_for_update().populate_existing().first()
        if action is None or thread is None or thread.status != 'ACTIVE':
            raise ValueError('对话已归档或操作已不存在。')
        if action.request_json != operation['request']:
            raise ValueError('操作请求在提交后发生变化，请重新确认。')
        scope = operation['scope']
        if thread.dojo_id != scope['threadDojoId'] or thread.module_index != scope['moduleIndex']:
            raise ValueError('目标课程或章节在提交后发生变化，请重新确认。')
        dojo = None
        if scope['dojoId'] is not None:
            dojo = Dojos.query.filter_by(dojo_id=scope['dojoId']).with_for_update().populate_existing().first()
            dojo_for_user(actor, scope['dojoId'], teacher=True)
        if operation.get('approvalRequest'):
            reference = operation['approvalRequest']
            from .approval_journal import recorded_decision
            decision = recorded_decision(thread.id, reference['id'])
            if not decision or decision['decision'] != 'APPROVED' or decision['requestSha256'] != reference['sha256']:
                raise ValueError('操作批准已失效。')
        if operation['tool'] == 'challenge.publish':
            from ..models import LearningDrafts

            draft = LearningDrafts.query.filter_by(id=str(operation['arguments'].get('draftId') or ''), author_id=actor.id,
                                                 dojo_id=scope['dojoId']).with_for_update().populate_existing().first()
            if draft is None or _question_binding(draft) != operation.get('validationBinding'):
                raise ValueError('已确认的实践题内容发生变化，请重新检查并确认。')
        return apply_teacher_tool(job, operation, action, actor, thread, dojo, prepared=prepared)
    if operation['kind'] == 'cleanup':
        from .tool_effects import apply_cleanup

        return apply_cleanup(operation)
    if operation['kind'] == 'approved-action':
        action = TeachingAgentActions.query.filter_by(id=accepted['actionId']).with_for_update().populate_existing().first()
        if action is None or action.thread_id != job.thread_id:
            raise ValueError('Command action no longer exists')
        if action_request(action) != operation['request']:
            raise ValueError('Approved command request changed before execution')
        require_approved(operation['request'], operation['approvalRequest'])
        if action.action_type == 'publish-question-artifact':
            draft = prepare_action(action, actor, initial_result=operation['initialResult'])['draft']
            if _question_binding(draft) != operation.get('validationBinding'):
                raise ValueError('Validated practice content changed after command admission')
        result, challenge = apply_action(action, actor, 'APPROVED', initial_result=operation['initialResult'])
        if challenge is not None:
            from ..learning.exercise_modes import exercise_mode
            from ..learning.solution_agent import enqueue_solution_run

            if not (challenge.image or '').startswith(('mac:', 'pwncollege-', 'pwncollege/', 'challenges.pwn.college/')):
                image_job = admit_image_pull(action, actor, challenge)
                result['imagePullJobId'] = image_job.id
            if exercise_mode(challenge) != 'SIMULATION':
                run = enqueue_solution_run(challenge, actor, commit=False, publish=False)
                result['solutionRunId'] = run.id
        action.status = 'APPROVED'
        action.result = result
        action.error = None
        action.completed = datetime.datetime.utcnow()
        return result
    if operation['kind'] == 'image-pull':
        from ..worker.handlers.image_pulls import handle_image_pull_event
        from .scope import dojo_for_user
        from .jobs import PermanentJobError, RetryableJobError

        dojo_for_user(actor, operation['dojoId'], teacher=True)
        success, retry = handle_image_pull_event({'image': operation['image'], 'dojo_reference_id': operation['dojoReferenceId']})
        if not success:
            error = RetryableJobError if retry else PermanentJobError
            raise error('Published challenge image could not be prepared')
        return {'image': operation['image'], 'prepared': True}
    raise ValueError('Unsupported durable command operation')


def finish_command_job(job, status, *, result=None, error=None, error_code=None, retry=False):
    if job.kind not in COMMAND_JOB_KINDS:
        return
    accepted = accepted_command(job)
    state = reduce_command(command_rows(job.thread_id, accepted['commandId']))
    if state['status'] in TERMINAL_STATES:
        return
    if status == 'FAILED':
        _append(job, 'command.attempt.failed', {'error': str(error or '')[:16000], 'errorCode': error_code})
        if retry:
            _append(job, 'command.retry.scheduled')
            return
    kind = {'SUCCEEDED': 'command.succeeded', 'FAILED': 'command.failed', 'CANCELED': 'command.canceled'}[status]
    _append(job, kind, {'result': result, 'error': str(error)[:16000] if error else None, 'errorCode': error_code})
    if accepted.get('actionId') and status != 'SUCCEEDED':
        action = TeachingAgentActions.query.filter_by(id=accepted['actionId']).with_for_update().populate_existing().first()
        if action:
            action.status = 'EXECUTION_FAILED' if status == 'FAILED' else 'EXECUTION_CANCELED'
            action.error = str(error or '')[:16000] or None
            action.completed = datetime.datetime.utcnow()


def reopen_command_job(job):
    if job.kind in COMMAND_JOB_KINDS:
        _append(job, 'command.reopened')


def recover_command_job(job, reason):
    if job.kind in COMMAND_JOB_KINDS:
        _append(job, 'command.retry.scheduled', {'reason': reason})
