-- Run against the intended development copy:
--   psql -X -v ON_ERROR_STOP=1 -f ops/staging/teaching-worker-preflight.sql
--
-- Counts describe the PostgreSQL snapshot seen by teaching worker startup
-- sweeps. They do not establish Redis ownership, stream contents, approval
-- decisions, dependency readiness, or that enabling workers is safe.
-- Heartbeat candidates use the default 90s TTL (see teaching worker settings).
\set QUIET 1
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL idle_in_transaction_session_timeout = '20s';

WITH snapshot AS (
    SELECT CURRENT_TIMESTAMP AT TIME ZONE 'UTC' AS utc_now
), active_jobs AS (
    SELECT job.status, job.updated, job.lease_expires, job.heartbeat,
           job.attempt_count, job.max_attempts, job.canceled,
           outbox.job_id IS NOT NULL AS has_outbox,
           outbox.published,
           job.result #>> '{_executionRecovery,nextAttemptAt}' AS retry_text,
           CASE
               WHEN jsonb_typeof(job.payload -> 'waitForJobIds') = 'array'
               THEN jsonb_array_length(job.payload -> 'waitForJobIds') > 0
               ELSE FALSE
           END
           OR CASE
               WHEN jsonb_typeof(job.payload -> 'dependsOnJobIds') = 'array'
               THEN jsonb_array_length(job.payload -> 'dependsOnJobIds') > 0
               ELSE FALSE
           END
           OR COALESCE(jsonb_typeof(job.payload -> 'waitForApproval') = 'object'
                       AND job.payload -> 'waitForApproval' <> '{}'::jsonb, FALSE) AS has_wait_marker
    FROM teaching_jobs AS job
    LEFT JOIN teaching_job_outbox AS outbox ON outbox.job_id = job.id
    WHERE job.status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED')
), candidates AS (
    SELECT active_jobs.*, snapshot.utc_now,
           CASE WHEN status = 'QUEUED'
                     AND retry_text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]{1,6})?Z$'
                     AND pg_input_is_valid(retry_text, 'timestamp without time zone')
                THEN retry_text::timestamp
           END AS retry_at
    FROM active_jobs CROSS JOIN snapshot
), job_counts AS (
    SELECT
        count(*) FILTER (WHERE status = 'QUEUED') AS queued,
        count(*) FILTER (WHERE status = 'RUNNING') AS running,
        count(*) FILTER (WHERE status = 'CANCEL_REQUESTED') AS cancel_requested,
        count(*) FILTER (WHERE status = 'QUEUED' AND NOT has_outbox) AS queued_without_outbox,
        count(*) FILTER (
            WHERE status = 'QUEUED' AND has_outbox AND published IS NULL
        ) AS unpublished_outbox_for_queued,
        count(*) FILTER (
            WHERE status = 'QUEUED' AND has_outbox AND published IS NULL
              AND retry_at > utc_now
        ) AS unpublished_queued_with_future_retry,
        count(*) FILTER (
            WHERE status = 'QUEUED' AND has_outbox AND published IS NULL
              AND retry_text IS NOT NULL AND retry_at IS NULL
        ) AS unpublished_queued_with_unrecognized_retry_timestamp,
        count(*) FILTER (
            WHERE status = 'QUEUED' AND has_wait_marker
        ) AS queued_with_wait_markers,
        -- The stale queued sweep resets published, then the publisher rechecks waits.
        count(*) FILTER (
            WHERE status = 'QUEUED' AND published IS NOT NULL
              AND updated < utc_now - interval '2 minutes'
        ) AS queued_published_outbox_reset_candidates,
        count(*) FILTER (
            WHERE status IN ('RUNNING', 'CANCEL_REQUESTED') AND lease_expires < utc_now
        ) AS expired_running_or_cancel_requested_lease_candidates,
        count(*) FILTER (
            WHERE status IN ('RUNNING', 'CANCEL_REQUESTED') AND lease_expires >= utc_now
              AND heartbeat < utc_now - interval '90 seconds'
        ) AS nonexpired_lease_stale_heartbeat_candidates_default_ttl,
        -- Redis liveness and cancellation from a parent job are checked separately.
        count(*) FILTER (
            WHERE status = 'RUNNING' AND lease_expires < utc_now AND canceled IS NULL
              AND attempt_count < max_attempts
        ) AS expired_running_lease_with_retry_budget
    FROM candidates
), outbox_counts AS (
    SELECT count(*) AS unpublished_outbox
    FROM teaching_job_outbox
    WHERE published IS NULL
)
SELECT metric.name AS metric, metric.total
FROM job_counts CROSS JOIN outbox_counts
CROSS JOIN LATERAL (VALUES
    (1,  'queued', queued),
    (2,  'running', running),
    (3,  'cancel_requested', cancel_requested),
    (4,  'queued_without_outbox', queued_without_outbox),
    (5,  'unpublished_outbox', unpublished_outbox),
    (6,  'unpublished_outbox_for_queued', unpublished_outbox_for_queued),
    (7,  'unpublished_outbox_other_cleanup_candidates', unpublished_outbox - unpublished_outbox_for_queued),
    (8,  'unpublished_queued_with_future_retry', unpublished_queued_with_future_retry),
    (9,  'unpublished_queued_with_unrecognized_retry_timestamp', unpublished_queued_with_unrecognized_retry_timestamp),
    (10, 'queued_with_wait_markers', queued_with_wait_markers),
    (11, 'queued_published_outbox_reset_candidates', queued_published_outbox_reset_candidates),
    (12, 'expired_running_or_cancel_requested_lease_candidates', expired_running_or_cancel_requested_lease_candidates),
    (13, 'nonexpired_lease_stale_heartbeat_candidates_default_ttl', nonexpired_lease_stale_heartbeat_candidates_default_ttl),
    (14, 'expired_running_lease_with_retry_budget', expired_running_lease_with_retry_budget)
) AS metric(position, name, total)
ORDER BY metric.position;

COMMIT;
