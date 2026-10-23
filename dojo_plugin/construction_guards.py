from flask import has_request_context, request, jsonify
from sqlalchemy import text
from CTFd.models import db


def install_guards():
    if db.engine.dialect.name != 'postgresql':
        return
    db.session.execute(text('''CREATE OR REPLACE FUNCTION construction_frozen_guard() RETURNS trigger AS $$
    DECLARE before_row jsonb; after_row jsonb; candidate jsonb; course integer;
    BEGIN
      before_row := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
      after_row := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
      FOR candidate IN SELECT before_row UNION ALL SELECT after_row LOOP
        course := NULL;
        IF TG_TABLE_NAME = 'teaching_artifact_revisions' THEN
          SELECT dojo_id INTO course FROM teaching_artifacts WHERE id = candidate->>'artifact_id';
        ELSIF TG_TABLE_NAME = 'teaching_assignment_items' THEN
          SELECT dojo_id INTO course FROM teaching_assignments WHERE id = candidate->>'assignment_id';
        ELSE
          course := COALESCE(candidate->>'dojo_id', candidate->>'course_id')::integer;
        END IF;
        IF EXISTS (SELECT 1 FROM construction_spaces WHERE course_id = course) THEN
          RAISE EXCEPTION '固定审核副本不可修改，请返回原稿创作。' USING ERRCODE = '23514';
        END IF;
      END LOOP;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END; $$ LANGUAGE plpgsql'''))
    for table in ('dojos', 'dojo_modules', 'dojo_challenges', 'teaching_artifacts', 'teaching_artifact_revisions',
                  'teaching_assignments', 'teaching_assignment_items', 'learning_drafts', 'material_asset_copies'):
        if table not in db.metadata.tables:
            continue
        exists = db.session.execute(text("SELECT 1 FROM pg_trigger WHERE tgname = 'construction_frozen' AND tgrelid = to_regclass(:table)"), {'table': table}).scalar()
        if exists:
            continue
        db.session.execute(text("SET LOCAL lock_timeout = '2s'"))
        db.session.execute(text(f'CREATE TRIGGER construction_frozen BEFORE INSERT OR UPDATE OR DELETE ON {table} FOR EACH ROW EXECUTE FUNCTION construction_frozen_guard()'))


def frozen_course(course_id):
    from .models.construction import ConstructionSpaces
    return course_id is not None and ConstructionSpaces.query.filter_by(course_id=course_id).first() is not None


def protect_request():
    if request.method in ('GET', 'HEAD', 'OPTIONS') or '/construction/' in request.path:
        return None
    if request.path.endswith(('/preview', '/launch', '/student-preview')):
        return None
    from .models import TeachingArtifacts, TeachingAssignments, LearningDrafts, Dojos
    data = request.get_json(silent=True) or {}
    data = data if isinstance(data, dict) else {}
    args = {**data, **(request.view_args or {})}
    course_ids = []
    for key in ('dojo_id', 'dojoId', 'course_id', 'courseId'):
        value = args.get(key)
        if value is not None:
            try:
                course_ids.append(int(value))
            except (ValueError, TypeError):
                try:
                    dojo = Dojos.from_id(str(value)).first()
                except (ValueError, TypeError):
                    dojo = None
                if dojo:
                    course_ids.append(dojo.dojo_id)
    for model, keys in ((TeachingArtifacts, ('artifact_id', 'artifactId')), (TeachingAssignments, ('assignment_id', 'assignmentId')), (LearningDrafts, ('draft_id', 'draftId'))):
        for key in keys:
            if isinstance(args.get(key), str):
                row = model.query.filter_by(id=args[key]).first()
                if row:
                    course_ids.append(row.dojo_id)
    if any(frozen_course(cid) for cid in course_ids):
        return jsonify(success=False, error={'code': 'FROZEN_REVIEW', 'message': '这是固定版本审核副本，只能预览。请在建设任务中返回原稿修改并重新提交。'}), 409
    return None
