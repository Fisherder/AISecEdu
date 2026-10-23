from sqlalchemy import text
from CTFd.models import db

from ..models import DojoChallenges, LearningDrafts
from . import validate_spec


def same_workspace(left, right):
    return isinstance(left, dict) and isinstance(right, dict) and bool(left.get("course") and left.get("assignment")) and (left.get("course"), left.get("assignment")) == (right.get("course"), right.get("assignment"))


def draft_checks(draft, spec, standards):
    checks = validate_spec(spec, standards)
    if standards["scope"]["questionType"] != "coding":
        return checks
    workspace = spec.get("coding_workspace")
    collisions = []
    for row in DojoChallenges.query.filter_by(dojo_id=draft.dojo_id).all():
        if row.challenge_id != draft.published_challenge_id and (row.data or {}).get("prepared_draft") != draft.id and same_workspace(workspace, (row.data or {}).get("coding_workspace")):
            collisions.append(row.id)
    for row in LearningDrafts.query.filter_by(dojo_id=draft.dojo_id).filter(LearningDrafts.id != draft.id, LearningDrafts.status.notin_(("PUBLISHED", "DELETED"))).all():
        if same_workspace(workspace, (row.spec or {}).get("coding_workspace")):
            collisions.append(row.id)
    checks.append({"id": "standard-workspace-unique", "stage": "AUTHORING_STANDARD", "status": "BLOCK" if collisions else "PASS", "message": "工程目录与其他题目冲突：" + ", ".join(collisions[:5]) if collisions else "工程目录在当前课程中独立，不与其他题目共用学生代码"})
    return checks


def lock_coding_publication(draft, standards):
    if standards["scope"]["questionType"] == "coding" and db.engine.dialect.name == "postgresql":
        db.session.execute(text("SELECT pg_advisory_xact_lock(166713, :course)"), {"course": draft.dojo_id})
