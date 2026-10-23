from CTFd.models import db

from ..models import TeachingAgentEventOutbox, TeachingAgentThreads
from .tool_plan import _copy, _digest


class ModelInputError(ValueError):
    pass


EXECUTION_FIELDS = frozenset({
    'harnessCanceled', 'harnessLifecycle', 'harnessStepLifecycles', 'harnessNextJobId',
    'manualRetry', 'manualRetryToken', 'manualRetryAttempt', 'manualRetryStartedAt',
    'taskListHidden',
    'steeringBoundaryJobId',
})


def _input_rows(job, event_type, *, execution=False):
    query = TeachingAgentEventOutbox.query.filter_by(thread_id=job.thread_id, event_type=event_type).filter(
        TeachingAgentEventOutbox.payload['jobId'].as_string() == job.id,
    )
    if execution:
        query = query.filter(TeachingAgentEventOutbox.payload['traceId'].as_string() == job.trace_id)
    return query.populate_existing().one_or_none()


def _validate(job, row, *, execution=False):
    if row is None:
        return None
    saved = _copy(row.payload)
    digest = saved.pop('inputSha256', None)
    scope = saved.get('scope')
    expected = {'ownerId': job.owner_id, 'threadId': job.thread_id,
                'dojoId': job.dojo_id, 'moduleIndex': job.module_index}
    if (saved.get('version') != 1 or _digest(saved) != digest
            or saved.get('jobId') != job.id or saved.get('kind') != job.kind
            or saved.get('idempotencyKey') != job.idempotency_key
            or scope != expected or row.thread_id != job.thread_id
            or not isinstance(saved.get('payload'), dict)
            or (execution and (saved.get('traceId') != job.trace_id or not isinstance(saved.get('modelRoute'), dict)))):
        raise ModelInputError('模型任务与保存的原始请求不一致，未继续执行。')
    if execution:
        admitted = accepted_input(job)
        if admitted is None or saved.get('acceptedInputSha256') != admitted['inputSha256']:
            raise ModelInputError('模型执行输入不属于已接收的原始请求。')
    return {**saved, 'inputSha256': digest}


def accepted_input(job):
    if job.kind != 'agent.chat' or not job.thread_id:
        return None
    accepted = _validate(job, _input_rows(job, 'model.input'))
    revisions = TeachingAgentEventOutbox.query.filter_by(
        thread_id=job.thread_id, event_type='model.input.revised',
    ).filter(TeachingAgentEventOutbox.payload['jobId'].as_string() == job.id).order_by(
        TeachingAgentEventOutbox.id,
    ).populate_existing().all()
    for row in revisions:
        revised = _validate(job, row)
        if (accepted is None or revised.get('previousInputSha256') != accepted['inputSha256']
                or revised.get('revision') != int(accepted.get('revision') or 0) + 1):
            raise ModelInputError('排队输入的修改记录不连续，未继续执行。')
        accepted = revised
    return accepted


def revise_pending_input(job, payload, *, reason):
    accepted = accepted_input(job)
    if job.status != 'QUEUED' or accepted is None or prepared_input(job) is not None:
        raise ModelInputError('这条要求已开始执行，不能再编辑。')
    allowed = {'prompt', 'inputRevision', 'waitForJobIds'}
    if any(payload.get(key) != accepted['payload'].get(key)
           for key in set(payload) | set(accepted['payload']) if key not in allowed):
        raise ModelInputError('排队输入的修改改变了原始任务范围。')
    value = {key: _copy(accepted[key]) for key in
             ('version', 'jobId', 'kind', 'idempotencyKey', 'scope')}
    value.update({'origin': reason, 'revision': int(accepted.get('revision') or 0) + 1,
                  'previousInputSha256': accepted['inputSha256'], 'payload': _copy(payload)})
    value['inputSha256'] = _digest(value)
    db.session.add(TeachingAgentEventOutbox(thread_id=job.thread_id,
                                         event_type='model.input.revised', payload=value))
    control = {key: item for key, item in (job.payload or {}).items() if key in EXECUTION_FIELDS}
    job.payload = {**_copy(payload), **control}
    db.session.flush()
    return _copy(value)


def prepared_input(job):
    return _validate(job, _input_rows(job, 'model.prepared', execution=True), execution=True)


def freeze_input(job, *, origin='admission'):
    existing = accepted_input(job)
    if existing:
        return existing
    if job.kind != 'agent.chat' or not job.thread_id:
        return None
    thread = TeachingAgentThreads.query.filter_by(id=job.thread_id, user_id=job.owner_id).first()
    if thread is None or not isinstance(job.payload, dict):
        raise ModelInputError('原始模型请求缺少有效的账号、对话或内容。')
    value = {'version': 1, 'jobId': job.id, 'kind': job.kind, 'origin': origin,
             'idempotencyKey': job.idempotency_key,
             'scope': {'ownerId': job.owner_id, 'threadId': job.thread_id,
                       'dojoId': job.dojo_id, 'moduleIndex': job.module_index},
             'payload': _copy(job.payload)}
    value['inputSha256'] = _digest(value)
    db.session.add(TeachingAgentEventOutbox(thread_id=job.thread_id, event_type='model.input', payload=value))
    db.session.flush()
    return _copy(value)


def freeze_prepared(job, payload, model_route):
    admitted = accepted_input(job)
    if admitted is None:
        raise ModelInputError('模型请求尚未保存，未开始模型调用。')
    existing = prepared_input(job)
    if existing:
        return existing
    fixed = {'prompt', 'phase', 'constraints', 'allowDegraded', 'generationRefinement',
             'userMessageId', 'submissionFingerprint', 'harnessVersion', 'harnessRootJobId',
             'harnessInternal', 'waitForJobIds', 'dependsOnJobIds'}
    if any(payload.get(key) != admitted['payload'].get(key) for key in fixed):
        raise ModelInputError('组装后的模型请求改变了已接收的创作要求。')
    value = {key: _copy(admitted[key]) for key in ('version', 'jobId', 'kind', 'idempotencyKey', 'scope')}
    value.update({'traceId': job.trace_id, 'acceptedInputSha256': admitted['inputSha256'],
                  'payload': _copy(payload), 'modelRoute': _copy(model_route)})
    value['inputSha256'] = _digest(value)
    db.session.add(TeachingAgentEventOutbox(thread_id=job.thread_id, event_type='model.prepared', payload=value))
    db.session.flush()
    return _copy(value)


def request_payload(job):
    admitted = accepted_input(job)
    if admitted is None:
        return _copy(job.payload or {})
    prepared = prepared_input(job)
    if prepared and prepared.get('acceptedInputSha256') != admitted['inputSha256']:
        raise ModelInputError('模型执行输入不属于已接收的原始请求。')
    return _copy((prepared or admitted)['payload'])


def restore_input_cache(job, *, bootstrap=False):
    admitted = accepted_input(job)
    if admitted is None:
        if not bootstrap or job.kind != 'agent.chat':
            return False
        if not job.thread_id:
            raise ModelInputError('模型对话不存在，任务未执行。')
        admitted = freeze_input(job, origin='legacy-first-execution')
    payload = request_payload(job)
    control = {key: value for key, value in (job.payload or {}).items() if key in EXECUTION_FIELDS}
    job.payload = {**payload, **control}
    return True
