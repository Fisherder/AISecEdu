"""Transactional conversation event capture and single-writer projection.

The source transaction appends an outbox row through PostgreSQL triggers. A
reader projects only committed rows while holding the owning thread row lock.
It marks individual outbox rows instead of storing a high-water outbox ID:
sequences allocated by concurrent transactions need not commit in ID order.
"""

from __future__ import annotations

import datetime
import hashlib
import json
from types import SimpleNamespace

from sqlalchemy import func, text

from CTFd.models import db

from ..models import (
    TeachingAgentEventOutbox,
    TeachingAgentMessages,
    TeachingAgentSessionEvents,
    TeachingAgentThreads,
)


def turn_lifecycle_transition(previous, effective_status):
    """Return the next durable turn state and its event, if it changed.

    A worker job is only one step of a turn. The caller supplies the status of
    the *last reachable execution job*, so a completed planning job followed
    by a queued tool driver cannot close the teacher's turn prematurely.
    """

    previous = previous if isinstance(previous, dict) else {}
    prior_state = str(previous.get('state') or '')
    has_started = bool(previous.get('hasStarted'))
    status = str(effective_status or '').upper()
    # A settled turn or step stays settled until an explicit queued retry.
    # A late worker notification must not append a contradictory second end.
    if prior_state in {'completed', 'failed', 'canceled'} and status != 'QUEUED':
        return None
    if status == 'QUEUED':
        if prior_state == '':
            event_type, state = 'turn.accepted', 'queued'
        elif prior_state in {'completed', 'failed', 'canceled'}:
            event_type, state = 'turn.reopened', 'queued'
        elif prior_state in {'running', 'cancel_requested'}:
            event_type, state = 'turn.waiting', 'queued'
        else:
            return None
    elif status == 'RUNNING':
        if prior_state == 'running':
            return None
        event_type = 'turn.resumed' if has_started else 'turn.started'
        state, has_started = 'running', True
    elif status == 'CANCEL_REQUESTED':
        if prior_state == 'cancel_requested':
            return None
        event_type, state = 'turn.cancel_requested', 'cancel_requested'
    elif status in {'SUCCEEDED', 'FAILED', 'CANCELED'}:
        state = {'SUCCEEDED': 'completed', 'FAILED': 'failed', 'CANCELED': 'canceled'}[status]
        if prior_state == state:
            return None
        event_type = f'turn.{state}'
    else:
        return None
    return {'state': state, 'hasStarted': has_started}, event_type


def record_turn_lifecycle(root, execution, *, source_job_id, job_event_sequence):
    """Write a typed turn transition alongside the job event transaction.

    The caller holds the root job row lock. Updating its lifecycle state and
    appending the outbox event in that same transaction makes retries and
    duplicate worker notifications idempotent without trusting the browser.
    """

    if not root.thread_id:
        return None
    previous = (root.payload or {}).get('harnessLifecycle')
    transition = turn_lifecycle_transition(previous, execution.status)
    if transition is None:
        return None
    state, event_type = transition
    root.payload = {**(root.payload or {}), 'harnessLifecycle': state}
    event = TeachingAgentEventOutbox(
        thread_id=root.thread_id,
        event_type=event_type,
        payload={
            'turnId': root.id,
            'rootJobId': root.id,
            'executionJobId': execution.id,
            'sourceJobId': source_job_id,
            'jobEventSequence': job_event_sequence,
            'status': execution.status,
            'attemptCount': execution.attempt_count,
        },
    )
    db.session.add(event)
    return event


def record_step_lifecycle(root, step, execution, *, source_job_id, job_event_sequence):
    """Close a model step only after its optional tool driver has settled.

    A step is one ``agent.chat`` model job and the ``agent.advance`` driver it
    spawned. Child tool jobs are observed by that driver; their individual
    terminal statuses cannot settle the step. A turn canceled before its first
    model call has no step boundaries.
    """

    if not root.thread_id or step.kind != 'agent.chat':
        return None
    previous_steps = (root.payload or {}).get('harnessStepLifecycles') or {}
    previous = previous_steps.get(step.id)
    if previous is None and execution.status != 'RUNNING':
        return None
    transition = turn_lifecycle_transition(previous, execution.status)
    if transition is None:
        return None
    state, turn_event_type = transition
    if turn_event_type == 'turn.accepted':
        return None
    event_type = turn_event_type.replace('turn.', 'step.', 1)
    root.payload = {
        **(root.payload or {}),
        'harnessStepLifecycles': {**previous_steps, step.id: state},
    }
    event = TeachingAgentEventOutbox(
        thread_id=root.thread_id,
        event_type=event_type,
        payload={
            'turnId': root.id,
            'rootJobId': root.id,
            'stepJobId': step.id,
            'executionJobId': execution.id,
            'sourceJobId': source_job_id,
            'jobEventSequence': job_event_sequence,
            'status': execution.status,
            'attemptCount': execution.attempt_count,
        },
    )
    db.session.add(event)
    return event


_CAPTURE_FUNCTIONS = (
    """
    CREATE OR REPLACE FUNCTION aisecedu_capture_agent_thread_event()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.title IS NOT DISTINCT FROM OLD.title AND
           NEW.status IS NOT DISTINCT FROM OLD.status AND
           NEW.pinned IS NOT DISTINCT FROM OLD.pinned AND
           NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at AND
           NEW.phase IS NOT DISTINCT FROM OLD.phase AND
           NEW.dojo_id IS NOT DISTINCT FROM OLD.dojo_id AND
           NEW.module_index IS NOT DISTINCT FROM OLD.module_index AND
           NEW.context IS NOT DISTINCT FROM OLD.context THEN
          RETURN NEW;
        END IF;
      END IF;
      INSERT INTO teaching_agent_event_outbox
        (thread_id, event_type, payload, created)
      VALUES
        (NEW.id, CASE WHEN TG_OP = 'INSERT' THEN 'thread.created' ELSE 'thread.updated' END,
         jsonb_build_object('threadId', NEW.id, 'title', NEW.title,
           'status', NEW.status, 'pinned', NEW.pinned,
           'archivedAt', NEW.archived_at, 'phase', NEW.phase,
           'dojoId', NEW.dojo_id, 'moduleIndex', NEW.module_index,
           'context', NEW.context), timezone('UTC', now()));
      RETURN NEW;
    END
    $body$
    """,
    """
    CREATE OR REPLACE FUNCTION aisecedu_capture_agent_message_event()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.content IS NOT DISTINCT FROM OLD.content AND
           NEW.metadata IS NOT DISTINCT FROM OLD.metadata THEN
          RETURN NEW;
        END IF;
      END IF;
      INSERT INTO teaching_agent_event_outbox
        (thread_id, event_type, payload, created)
      VALUES
        (NEW.thread_id,
         CASE WHEN TG_OP = 'INSERT' THEN 'message.created' ELSE 'message.updated' END,
         jsonb_build_object('messageId', NEW.id, 'role', NEW.role,
           'content', NEW.content, 'metadata', NEW.metadata,
           'created', NEW.created), timezone('UTC', now()));
      RETURN NEW;
    END
    $body$
    """,
    """
    CREATE OR REPLACE FUNCTION aisecedu_capture_agent_action_event()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        IF NEW.status IS NOT DISTINCT FROM OLD.status AND
           NEW.result IS NOT DISTINCT FROM OLD.result AND
           NEW.error IS NOT DISTINCT FROM OLD.error AND
           NEW.completed IS NOT DISTINCT FROM OLD.completed THEN
          RETURN NEW;
        END IF;
      END IF;
      INSERT INTO teaching_agent_event_outbox
        (thread_id, event_type, payload, created)
      VALUES
        (NEW.thread_id,
         CASE WHEN TG_OP = 'INSERT' THEN 'tool.started' ELSE 'tool.updated' END,
         jsonb_build_object('actionId', NEW.id, 'actionType', NEW.action_type,
           'status', NEW.status, 'riskLevel', NEW.risk_level,
           'targetType', NEW.target_type, 'targetId', NEW.target_id,
           'request', to_jsonb(NEW)->'request', 'result', NEW.result,
           'error', NEW.error, 'created', NEW.created,
           'completed', NEW.completed), timezone('UTC', now()));
      RETURN NEW;
    END
    $body$
    """,
    """
    CREATE OR REPLACE FUNCTION aisecedu_capture_agent_approval_event()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE target_thread_id varchar(48);
    BEGIN
      SELECT thread_id INTO target_thread_id
      FROM teaching_agent_actions WHERE id = NEW.action_id;
      IF target_thread_id IS NOT NULL THEN
        INSERT INTO teaching_agent_event_outbox
          (thread_id, event_type, payload, created)
        VALUES
          (target_thread_id, 'approval.recorded',
           jsonb_build_object('approvalId', NEW.id, 'actionId', NEW.action_id,
             'approverId', NEW.approver_id, 'decision', NEW.decision,
             'comment', NEW.comment, 'created', NEW.created),
           timezone('UTC', now()));
      END IF;
      RETURN NEW;
    END
    $body$
    """,
    """
    CREATE OR REPLACE FUNCTION aisecedu_capture_agent_job_event()
    RETURNS trigger LANGUAGE plpgsql AS $body$
    DECLARE target_thread_id varchar(48);
    DECLARE target_kind varchar(80);
    BEGIN
      SELECT thread_id, kind INTO target_thread_id, target_kind
      FROM teaching_jobs WHERE id = NEW.job_id;
      IF target_thread_id IS NOT NULL AND
         target_kind NOT IN ('material.analyze', 'material.enrich') THEN
        INSERT INTO teaching_agent_event_outbox
          (thread_id, event_type, payload, created)
        VALUES
          (target_thread_id, 'job.event',
           jsonb_build_object('jobId', NEW.job_id, 'jobSequence', NEW.sequence,
             'stage', NEW.stage, 'status', NEW.status,
             'message', NEW.message, 'details', NEW.details,
             'created', NEW.created), timezone('UTC', now()));
      END IF;
      RETURN NEW;
    END
    $body$
    """,
)

_CAPTURE_TRIGGERS = (
    ('teaching_agent_threads', 'aisecedu_agent_thread_event', 'aisecedu_capture_agent_thread_event', 'INSERT OR UPDATE'),
    ('teaching_agent_messages', 'aisecedu_agent_message_event', 'aisecedu_capture_agent_message_event', 'INSERT OR UPDATE'),
    ('teaching_agent_actions', 'aisecedu_agent_action_event', 'aisecedu_capture_agent_action_event', 'INSERT OR UPDATE'),
    ('teaching_agent_approvals', 'aisecedu_agent_approval_event', 'aisecedu_capture_agent_approval_event', 'INSERT'),
    ('teaching_job_events', 'aisecedu_agent_job_event', 'aisecedu_capture_agent_job_event', 'INSERT'),
)


def install_session_event_capture():
    """Install capture only after ``db.create_all`` under the schema DDL lock."""

    if db.engine.dialect.name != 'postgresql':
        return
    for statement in _CAPTURE_FUNCTIONS:
        db.session.execute(text(statement))
    for table, trigger, function, operations in _CAPTURE_TRIGGERS:
        # CREATE TRIGGER has no OR REPLACE on the supported PostgreSQL image.
        # Probe first so service restarts do not take table-wide DDL locks.
        exists = db.session.execute(
            text('SELECT 1 FROM pg_trigger WHERE tgname = :trigger AND tgrelid = to_regclass(:table) AND NOT tgisinternal'),
            {'trigger': trigger, 'table': table},
        ).scalar()
        if exists:
            continue
        db.session.execute(text(
            f'CREATE TRIGGER {trigger} AFTER {operations} ON {table} '
            f'FOR EACH ROW EXECUTE FUNCTION {function}()'
        ))
    from .event_integrity import install_event_integrity
    install_event_integrity()


def project_session_events(thread_id, *, limit=500):
    """Append committed source events in one serialized, atomic transaction.

    The caller owns the transaction and commits the new log plus outbox marks
    together. A late-committing lower outbox ID remains unprojected and will
    receive a later session sequence on the next read.
    """

    thread = (
        db.session.query(TeachingAgentThreads)
        .filter_by(id=thread_id)
        .with_for_update()
        .first()
    )
    if thread is None:
        return None
    sequence = db.session.query(func.max(TeachingAgentSessionEvents.sequence)).filter_by(
        thread_id=thread_id
    ).scalar() or 0
    pending = (
        db.session.query(TeachingAgentEventOutbox)
        .filter_by(thread_id=thread_id, projected_sequence=None)
        .order_by(TeachingAgentEventOutbox.id)
        .limit(max(1, min(int(limit), 1000)))
        .all()
    )
    for source in pending:
        sequence += 1
        db.session.add(TeachingAgentSessionEvents(
            thread_id=thread_id,
            sequence=sequence,
            source_outbox_id=source.id,
            event_type=source.event_type,
            payload=source.payload,
            created=source.created,
        ))
        source.projected_sequence = sequence
    db.session.flush()
    return {'lastSequence': sequence, 'projected': len(pending)}


def session_history_complete(thread_id):
    """Only threads born after capture was installed can replay their origin."""

    return db.session.query(TeachingAgentEventOutbox.id).filter_by(
        thread_id=thread_id, event_type='thread.created'
    ).first() is not None


def session_history_origin(thread_id):
    """Distinguish captured history from a sourced legacy transcript cut."""

    if session_history_complete(thread_id):
        return 'captured'
    baseline = db.session.query(TeachingAgentEventOutbox.id).filter_by(
        thread_id=thread_id, event_type='thread.baseline'
    ).first()
    return 'legacy-baseline' if baseline is not None else 'legacy-relational'


def session_history_replayable(thread_id):
    return session_history_origin(thread_id) != 'legacy-relational'


def append_legacy_thread_baseline(thread_id):
    """Capture an old thread's *current* transcript in one serialized cut.

    First lock this thread, then the message table. The table lock waits for
    earlier message writers to commit and blocks later writes until this
    transaction commits, including workers that do not lock the thread row.
    Future writes continue through the normal message trigger. The caller
    verifies replay parity and commits or rolls back this transaction.
    """

    if db.engine.dialect.name != 'postgresql':
        raise RuntimeError('Legacy baseline requires PostgreSQL table locking')
    thread = TeachingAgentThreads.query.filter_by(id=thread_id).with_for_update().populate_existing().first()
    if thread is None:
        raise LookupError('Conversation no longer exists')
    if session_history_replayable(thread_id):
        return None
    db.session.execute(text('LOCK TABLE teaching_agent_messages IN SHARE ROW EXCLUSIVE MODE'))
    # Recheck after acquiring the writer barrier, while the thread row lock
    # still serializes another baseline migration of this same conversation.
    if session_history_replayable(thread_id):
        return None
    rows = TeachingAgentMessages.query.filter_by(thread_id=thread_id).order_by(
        TeachingAgentMessages.id
    ).populate_existing().all()
    messages = [{
        'messageId': row.id,
        'role': row.role,
        'content': row.content,
        'metadata': row.metadata_json or {},
        'created': row.created.isoformat() + 'Z',
    } for row in rows]
    canonical = json.dumps(messages, ensure_ascii=False, sort_keys=True,
                           separators=(',', ':')).encode('utf-8')
    if len(canonical) > 2 * 1024 * 1024:
        raise ValueError('Legacy conversation exceeds the 2 MiB baseline limit')
    source_digest = hashlib.sha256(canonical).hexdigest()
    event = TeachingAgentEventOutbox(
        thread_id=thread_id,
        event_type='thread.baseline',
        payload={
            'schemaVersion': 1,
            'source': 'legacy-relational',
            'sourceDigest': source_digest,
            'capturedAt': datetime.datetime.utcnow().isoformat() + 'Z',
            'thread': {
                'threadId': thread.id, 'title': thread.title,
                'status': thread.status, 'pinned': thread.pinned,
                'archivedAt': thread.archived_at.isoformat() + 'Z' if thread.archived_at else None,
                'phase': thread.phase, 'dojoId': thread.dojo_id,
                'moduleIndex': thread.module_index, 'context': thread.context or {},
            },
            'messages': messages,
        },
    )
    db.session.add(event)
    db.session.flush()
    return {'messageCount': len(messages), 'sourceDigest': source_digest}


def _snapshot_message_rows(messages):
    return [{
        'messageId': row.id,
        'role': row.role,
        'content': row.content,
        'metadata': row.metadata_json or {},
        'created': row.created.isoformat() + 'Z',
    } for row in messages]


def fold_session_message_events(rows):
    """Fold an event anchor and later message events without consulting rows."""

    messages = {}
    for row in rows:
        payload = row.payload or {}
        if row.event_type in {'thread.baseline', 'projection.checkpoint'}:
            source_messages = payload.get('messages')
            expected_source = (
                'legacy-relational' if row.event_type == 'thread.baseline' else 'event-log'
            )
            if (payload.get('schemaVersion') != 1
                    or payload.get('source') != expected_source
                    or not isinstance(source_messages, list)):
                raise ValueError('Unsupported conversation event anchor')
            if row.event_type == 'projection.checkpoint' and (
                    not isinstance(payload.get('sourceThroughSequence'), int)
                    or payload['sourceThroughSequence'] + 1 != row.sequence):
                raise ValueError('Conversation checkpoint has an invalid event boundary')
            canonical = json.dumps(source_messages, ensure_ascii=False, sort_keys=True,
                                   separators=(',', ':')).encode('utf-8')
            if hashlib.sha256(canonical).hexdigest() != payload.get('sourceDigest'):
                raise ValueError('Conversation event anchor failed integrity verification')
            messages = {}
            source_rows = source_messages
        else:
            source_rows = (payload,)
        for item in source_rows:
            message_id = int(item['messageId'])
            raw_created = str(item['created'])
            created = datetime.datetime.fromisoformat(raw_created.replace('Z', '+00:00'))
            if created.tzinfo is not None:
                created = created.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            messages[message_id] = SimpleNamespace(
                id=message_id,
                role=item['role'],
                content=item['content'],
                metadata_json=item.get('metadata') or {},
                created=created,
            )
    return sorted(messages.values(), key=lambda message: message.id)


def append_message_checkpoint(thread_id, messages, *, source_through_sequence):
    """Write a replay checkpoint at the next sequence under the thread lock.

    This must be called after ``project_session_events`` in the same database
    transaction. It projects its own outbox row immediately: a lower-ID event
    that commits late is therefore projected *after* this checkpoint rather
    than being overwritten by it.
    """

    source_messages = _snapshot_message_rows(messages)
    canonical = json.dumps(source_messages, ensure_ascii=False, sort_keys=True,
                           separators=(',', ':')).encode('utf-8')
    if len(canonical) > 8 * 1024 * 1024:
        return None
    sequence = int(source_through_sequence) + 1
    payload = {
        'schemaVersion': 1,
        'source': 'event-log',
        'sourceThroughSequence': int(source_through_sequence),
        'sourceDigest': hashlib.sha256(canonical).hexdigest(),
        'messageCount': len(source_messages),
        'messages': source_messages,
    }
    source = TeachingAgentEventOutbox(
        thread_id=thread_id, event_type='projection.checkpoint', payload=payload,
        projected_sequence=sequence,
    )
    db.session.add(source)
    db.session.flush()
    db.session.add(TeachingAgentSessionEvents(
        thread_id=thread_id, sequence=sequence, source_outbox_id=source.id,
        event_type='projection.checkpoint', payload=payload, created=source.created,
    ))
    db.session.flush()
    return sequence


def replay_session_messages(thread_id, *, max_batches=10, checkpoint_every=200):
    """Derive visible message state from the durable event log.

    A legacy baseline replays its current transcript plus every later event;
    it remains explicitly marked as lacking pre-baseline event history.
    The caller commits the projection and any other in-flight writes together.
    """

    if not session_history_replayable(thread_id):
        raise ValueError('This conversation has no event origin or baseline')
    for _ in range(max_batches):
        projection = project_session_events(thread_id, limit=1000)
        if projection is None:
            raise LookupError('Conversation no longer exists')
        if projection['projected'] < 1000:
            break
    else:
        raise RuntimeError('Conversation event backlog exceeds replay bound')
    anchor = (
        db.session.query(TeachingAgentSessionEvents)
        .filter_by(thread_id=thread_id)
        .filter(TeachingAgentSessionEvents.event_type.in_(
            ('thread.baseline', 'projection.checkpoint')
        ))
        .order_by(TeachingAgentSessionEvents.sequence.desc())
        .first()
    )
    query = (
        db.session.query(TeachingAgentSessionEvents)
        .filter_by(thread_id=thread_id)
        .filter(TeachingAgentSessionEvents.event_type.in_(
            ('message.created', 'message.updated')
        ))
    )
    if anchor is not None:
        query = query.filter(TeachingAgentSessionEvents.sequence > anchor.sequence)
    delta_rows = (
        query.order_by(TeachingAgentSessionEvents.sequence)
        .all()
    )
    messages = fold_session_message_events(
        ([anchor] if anchor is not None else []) + delta_rows
    )
    if len(delta_rows) >= checkpoint_every:
        append_message_checkpoint(
            thread_id, messages, source_through_sequence=projection['lastSequence'],
        )
    return messages


def messages_at_turn(messages, user_message_id, *, limit=30):
    """Exclude later user turns and their assistant placeholders."""

    boundary = int(user_message_id)
    if boundary < 1:
        raise ValueError('A queued turn requires its user message ID')
    return sorted(
        (message for message in messages if message.id <= boundary),
        key=lambda message: message.id,
    )[-limit:]
