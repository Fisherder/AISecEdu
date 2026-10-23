from sqlalchemy import text

from CTFd.models import db


INDEXES = (
    ('ix_agent_unique_model_input', "(payload->>'jobId')", "event_type = 'model.input'"),
    ('ix_agent_unique_model_prepared', "(payload->>'jobId'), (payload->>'traceId')", "event_type = 'model.prepared'"),
    ('ix_agent_unique_tool_plan_source', "thread_id, (payload->>'sourceMessageId')", "event_type = 'tool.plan'"),
    ('ix_agent_unique_tool_plan_driver', "(payload->>'driverJobId')", "event_type = 'tool.plan' AND payload->>'driverJobId' IS NOT NULL"),
    ('ix_agent_unique_tool_observation', "thread_id, (payload->>'observationId')", "event_type = 'tool.observed'"),
    ('ix_agent_unique_tool_progress', "thread_id, (payload->>'progressId')", "event_type = 'tool.progress'"),
    ('ix_agent_unique_approval_request', "thread_id, (payload->>'requestId')", "event_type = 'approval.requested' AND payload->>'version' = '1'"),
    ('ix_agent_unique_approval_decision', "thread_id, (payload->>'requestId')", "event_type = 'approval.decided' AND payload->>'version' = '1'"),
    ('ix_agent_unique_command_admission', "thread_id, (payload->>'commandId')", "event_type = 'command.accepted'"),
    ('ix_agent_unique_command_outcome', "thread_id, (payload->>'commandId'), (payload->>'attemptId')", "event_type IN ('command.succeeded', 'command.failed', 'command.canceled')"),
    ('ix_agent_unique_generation_decision', "thread_id, (payload->>'planId')", "event_type = 'generation.decided'"),
    ('ix_agent_unique_generation_admission', "thread_id, (payload->>'planId')", "event_type = 'generation.admitted'"),
    ('ix_agent_unique_generation_start', "thread_id, (payload->>'planId')", "event_type = 'generation.started'"),
)


GUARD = """
CREATE OR REPLACE FUNCTION aisecedu_guard_agent_event()
RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM teaching_agent_threads WHERE id = OLD.thread_id) THEN
      RAISE EXCEPTION 'Agent event history is append-only' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME = 'teaching_agent_event_outbox' THEN
    IF NEW.id IS DISTINCT FROM OLD.id OR NEW.thread_id IS DISTINCT FROM OLD.thread_id OR
       NEW.event_type IS DISTINCT FROM OLD.event_type OR NEW.payload IS DISTINCT FROM OLD.payload OR
       NEW.created IS DISTINCT FROM OLD.created OR
       (OLD.projected_sequence IS NOT NULL AND NEW.projected_sequence IS DISTINCT FROM OLD.projected_sequence) THEN
      RAISE EXCEPTION 'Agent source event is immutable' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Agent session event is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$body$
"""


def install_event_integrity():
    if db.engine.dialect.name != 'postgresql':
        return
    db.session.execute(text(GUARD))
    for table, trigger in (
        ('teaching_agent_event_outbox', 'aisecedu_agent_source_event_guard'),
        ('teaching_agent_session_events', 'aisecedu_agent_session_event_guard'),
    ):
        exists = db.session.execute(text(
            'SELECT 1 FROM pg_trigger WHERE tgname = :trigger AND tgrelid = to_regclass(:table) AND NOT tgisinternal'
        ), {'trigger': trigger, 'table': table}).scalar()
        if not exists:
            db.session.execute(text(
                f'CREATE TRIGGER {trigger} BEFORE UPDATE OR DELETE ON {table} '
                'FOR EACH ROW EXECUTE FUNCTION aisecedu_guard_agent_event()'
            ))
    for name, keys, condition in INDEXES:
        db.session.execute(text(
            f'CREATE UNIQUE INDEX IF NOT EXISTS {name} ON teaching_agent_event_outbox ({keys}) WHERE {condition}'
        ))
