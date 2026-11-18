BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $retire$
DECLARE remaining integer;
BEGIN
  SELECT count(*) INTO remaining FROM pg_tables
  WHERE schemaname = 'public' AND tablename IN (
    'construction_batches', 'construction_members', 'construction_courses',
    'construction_tasks', 'construction_submissions', 'construction_spaces',
    'construction_releases', 'construction_events', 'construction_notices'
  );
  IF remaining = 0 THEN RETURN; END IF;
  IF remaining <> 9 THEN
    RAISE EXCEPTION 'Incomplete legacy task schema: % tables. Restore or inspect it before migrating.', remaining;
  END IF;
INSERT INTO assigned_account_activations (user_id, completed_at)
SELECT user_id, CASE WHEN bool_and(activated IS NOT NULL) THEN max(activated) ELSE NULL END
FROM construction_members WHERE active GROUP BY user_id
ON CONFLICT (user_id) DO NOTHING;

DO $guards$
DECLARE item record;
BEGIN
  FOR item IN SELECT tgrelid::regclass AS relation, tgname FROM pg_trigger WHERE tgname IN ('construction_frozen', 'readonly_course') AND NOT tgisinternal LOOP
    EXECUTE format('DROP TRIGGER %I ON %s', item.tgname, item.relation);
  END LOOP;
END; $guards$;
DROP FUNCTION IF EXISTS construction_frozen_guard();

UPDATE dojos SET data = COALESCE(data, '{}'::jsonb) || '{"readOnly":true,"archived":true}'::jsonb
WHERE dojo_id IN (SELECT course_id FROM construction_spaces);
UPDATE dojos SET data = COALESCE(data, '{}'::jsonb) || '{"type":"hidden","archived":true}'::jsonb
WHERE data->>'type' = 'construction';
UPDATE dojos SET data = data - 'constructionBatchId' - 'constructionCourseId' - 'constructionOwnerId'
WHERE data ?| ARRAY['constructionBatchId','constructionCourseId','constructionOwnerId'];
UPDATE dojos SET description = '用于课程内容创作与自测。'
WHERE description LIKE '%建设任务%';
UPDATE dojo_modules SET description = '用于课程内容创作与自测。'
WHERE description LIKE '%建设任务%';
UPDATE dojo_modules SET description = '历史只读副本，供预览与素材复用。'
WHERE dojo_id IN (SELECT course_id FROM construction_spaces);

UPDATE material_library_versions AS version
SET provenance = (version.provenance - 'taskId' - 'submissionId') || jsonb_build_object('type','material-library','revoked',release.revoked)
FROM construction_releases AS release
WHERE release.material_id = version.item_id AND release.version = version.version;
UPDATE material_library_items SET description = split_part(description, E'\n', 1)
WHERE description LIKE '%建设任务%';

DROP TABLE construction_notices, construction_releases, construction_spaces, construction_events,
           construction_submissions, construction_tasks, construction_courses, construction_members, construction_batches;

END;
$retire$;
COMMIT;
