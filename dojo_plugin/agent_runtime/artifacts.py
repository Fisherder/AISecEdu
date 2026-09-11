import datetime
import hashlib
import json
import re

from CTFd.models import db

from ..models import (
    ConversationCards,
    DojoAdmins,
    SelfLearningWorkspaces,
    TeachingAgentActions,
    TeachingAgentMessages,
    TeachingArtifactCandidates,
    TeachingArtifactRevisions,
    TeachingArtifacts,
    TeachingCandidateSets,
)
from .scope import ScopeError, dojo_for_user


class RevisionConflict(ValueError):
    pass


MAX_CANDIDATE_REQUEST_PROMPT_CHARS = 16000


def candidate_request_prompt(candidate_set):
    """Return the original bounded generation request for materialization policy.

    Candidate plans are intentionally compact and may omit an exact output contract
    such as "three personal single-choice questions".  Preserve that contract when
    the selected candidate becomes a durable artifact instead of asking the runtime
    to infer it from outline length.
    """

    request_json = getattr(candidate_set, "request_json", None)
    if not isinstance(request_json, dict):
        return ""
    return str(request_json.get("prompt") or "")[:MAX_CANDIDATE_REQUEST_PROMPT_CHARS]


_PRIVATE_ARTIFACT_KEYS = {
    "admin",
    "answer",
    "answers",
    "answerkey",
    "checker",
    "correctanswer",
    "correctanswers",
    "dynamicflag",
    "exploit",
    "exploitscript",
    "flag",
    "flags",
    "grading",
    "gradingrubric",
    "hiddentests",
    "internal",
    "instructornotes",
    "oracle",
    "private",
    "privatesolution",
    "referenceanswer",
    "secret",
    "secrets",
    "solution",
    "solutions",
    "speakernotes",
    "teachernotes",
    "validation",
}
_FLAG_TEXT_PATTERN = re.compile(
    r"(?i)(?:\bflag\s*[:=]\s*[^\s<]{3,}|(?:flag|pwn\.college)\{[^}\r\n]{1,512}\})"
)
_REDACTED = object()


def _normalized_content_key(value):
    return re.sub(r"[^a-z0-9]", "", str(value or "").casefold())


def _student_safe_content(value, *, parent_key=""):
    """Return a recursively redacted copy suitable for a learner client.

    Published lesson payloads are rendered in a separate runtime, so hiding a
    panel in the teacher UI is not a security boundary.  This serializer drops
    teacher-only answer material before it leaves the API and also masks Flag
    shaped values that were accidentally placed in an otherwise public field.
    """

    normalized = _normalized_content_key(parent_key)
    if normalized in _PRIVATE_ARTIFACT_KEYS:
        return _REDACTED
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            safe = _student_safe_content(item, parent_key=key)
            if safe is not _REDACTED:
                result[key] = safe
        return result
    if isinstance(value, list):
        result = []
        for item in value:
            safe = _student_safe_content(item, parent_key=parent_key)
            if safe is not _REDACTED:
                result.append(safe)
        return result
    if isinstance(value, str):
        return _FLAG_TEXT_PATTERN.sub("[已隐藏的验证值]", value)
    return value


def content_hash(content):
    return hashlib.sha256(
        json.dumps(
            content,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()


def candidate_set_view(candidate_set, *, include_content=False):
    candidates = TeachingArtifactCandidates.query.filter_by(
        candidate_set_id=candidate_set.id
    ).order_by(TeachingArtifactCandidates.ordinal).all()
    return {
        "id": candidate_set.id,
        "kind": candidate_set.kind,
        "status": candidate_set.status,
        "dojoId": candidate_set.dojo_id,
        "moduleIndex": candidate_set.module_index,
        "selfWorkspaceId": candidate_set.self_workspace_id,
        "selectedCandidateId": candidate_set.selected_candidate_id,
        "request": candidate_set.request_json,
        "sourceRefs": candidate_set.source_refs,
        "created": candidate_set.created.isoformat() + "Z",
        "updated": candidate_set.updated.isoformat() + "Z",
        "candidates": [candidate_view(item, include_content=include_content) for item in candidates],
    }


def candidate_view(candidate, *, include_content=False):
    result = {
        "id": candidate.id,
        "candidateSetId": candidate.candidate_set_id,
        "ordinal": candidate.ordinal,
        "title": candidate.title,
        "summary": candidate.summary,
        "strategy": candidate.strategy,
        "differences": candidate.differences,
        "recommendation": candidate.recommendation,
        "status": candidate.status,
        "parentCandidateId": candidate.parent_candidate_id,
        "materializedArtifactId": candidate.materialized_artifact_id,
        "created": candidate.created.isoformat() + "Z",
        "updated": candidate.updated.isoformat() + "Z",
    }
    if include_content:
        result["content"] = candidate.content
    return result


def create_candidate_set(
    *, owner_id, dojo_id, module_index, thread_id, kind, request_json,
    source_refs=None, self_workspace_id=None
):
    item = TeachingCandidateSets(
        owner_id=owner_id,
        dojo_id=dojo_id,
        module_index=module_index,
        thread_id=thread_id,
        kind=kind,
        request_json=request_json,
        source_refs=source_refs or [],
        self_workspace_id=self_workspace_id,
        status="GENERATING",
    )
    db.session.add(item)
    db.session.flush()
    return item


def replace_generated_candidates(candidate_set, candidates):
    if candidate_set.status not in {"GENERATING", "FAILED"}:
        return TeachingArtifactCandidates.query.filter_by(
            candidate_set_id=candidate_set.id
        ).order_by(TeachingArtifactCandidates.ordinal).all()
    if not isinstance(candidates, list) or not 1 <= len(candidates) <= 4:
        raise ValueError("Global agent runtime must return between 1 and 4 candidates")

    prepared = []
    titles = set()
    strategies = set()
    hashes = set()
    required_sections = {
        "type",
        "objectives",
        "outline",
        "activities",
        "assessment",
        "experience",
    }
    for ordinal, raw in enumerate(candidates, 1):
        if not isinstance(raw, dict) or not isinstance(raw.get("content"), dict):
            raise ValueError("Candidate content must be a JSON object")
        content = dict(raw["content"])
        if not isinstance(content.get("experience"), dict) and isinstance(
            content.get("openmaic"), dict
        ):
            content["experience"] = content.pop("openmaic")
        if not required_sections.issubset(content):
            missing = sorted(required_sections - set(content))
            raise ValueError(f"Candidate content is missing sections: {', '.join(missing)}")
        if not isinstance(content.get("objectives"), list) or not content["objectives"]:
            raise ValueError("Candidate objectives must be a non-empty array")
        if not isinstance(content.get("outline"), list) or not content["outline"]:
            raise ValueError("Candidate outline must be a non-empty array")
        if not isinstance(content.get("experience"), dict) or not content["experience"]:
            raise ValueError("Candidate interactive experience must be a non-empty object")
        title = str(raw.get("title") or f"方案 {ordinal}").strip()[:240]
        strategy = str(raw.get("strategy") or "").strip()[:80]
        normalized_title = " ".join(title.casefold().split())
        normalized_strategy = " ".join(strategy.casefold().split())
        digest = content_hash(content)
        if not normalized_strategy:
            raise ValueError("Each candidate must declare a distinct strategy")
        if normalized_title in titles or normalized_strategy in strategies or digest in hashes:
            raise ValueError("Candidate plans must have distinct titles, strategies, and content")
        titles.add(normalized_title)
        strategies.add(normalized_strategy)
        hashes.add(digest)
        prepared.append((ordinal, raw, content, title, strategy))

    TeachingArtifactCandidates.query.filter_by(candidate_set_id=candidate_set.id).delete()
    rows = []
    for ordinal, raw, content, title, strategy in prepared:
        row = TeachingArtifactCandidates(
            candidate_set_id=candidate_set.id,
            ordinal=ordinal,
            title=title,
            summary=str(raw.get("summary") or "")[:8000],
            strategy=strategy,
            content=content,
            differences=list(raw.get("differences") or []),
            recommendation=(str(raw.get("recommendation"))[:8000] if raw.get("recommendation") else None),
            status="READY",
        )
        db.session.add(row)
        rows.append(row)
    candidate_set.status = "READY"
    candidate_set.updated = datetime.datetime.utcnow()
    db.session.flush()
    return rows


def _candidate_for_user(candidate_id, user, *, lock=False):
    query = TeachingArtifactCandidates.query.filter_by(id=candidate_id)
    if lock:
        query = query.with_for_update()
    candidate = query.first()
    if not candidate:
        raise ScopeError("Candidate not found")
    candidate_set = TeachingCandidateSets.query.filter_by(
        id=candidate.candidate_set_id,
        owner_id=user.id,
    ).first()
    if not candidate_set:
        raise ScopeError("Candidate not found")
    return candidate, candidate_set


def select_candidate(candidate_id, user):
    candidate, candidate_set = _candidate_for_user(candidate_id, user)
    candidate_set.selected_candidate_id = candidate.id
    candidate_set.status = "SELECTED"
    candidate.status = "SELECTED"
    db.session.commit()
    return candidate, candidate_set


def materialize_candidate(candidate_id, user, *, title=None):
    candidate, candidate_set = _candidate_for_user(candidate_id, user, lock=True)
    if candidate.materialized_artifact_id:
        artifact = TeachingArtifacts.query.filter_by(
            id=candidate.materialized_artifact_id
        ).first()
        if artifact:
            return artifact, current_artifact_revision(artifact)

    artifact = TeachingArtifacts(
        owner_id=candidate_set.owner_id,
        dojo_id=candidate_set.dojo_id,
        module_index=candidate_set.module_index,
        self_workspace_id=candidate_set.self_workspace_id,
        candidate_id=candidate.id,
        artifact_type=candidate_set.kind,
        title=(title or candidate.title)[:240],
        status="DRAFT",
        current_revision=1,
    )
    db.session.add(artifact)
    db.session.flush()
    revision = TeachingArtifactRevisions(
        artifact_id=artifact.id,
        revision=1,
        parent_revision=None,
        instruction="从候选方案物化",
        content=candidate.content,
        content_hash=content_hash(candidate.content),
        source_refs=candidate_set.source_refs,
        validation={"status": "PENDING"},
        created_by=user.id,
    )
    db.session.add(revision)
    candidate.materialized_artifact_id = artifact.id
    candidate.status = "MATERIALIZED"
    candidate_set.selected_candidate_id = candidate.id
    candidate_set.status = "MATERIALIZED"
    db.session.commit()
    return artifact, revision


def current_artifact_revision(artifact):
    return TeachingArtifactRevisions.query.filter_by(
        artifact_id=artifact.id,
        revision=artifact.current_revision,
    ).first()


def artifact_for_user(artifact_id, user):
    artifact = TeachingArtifacts.query.filter_by(
        id=artifact_id,
        owner_id=user.id,
    ).first()
    if not artifact:
        raise ScopeError("Artifact not found")
    return artifact


def artifact_course_teacher(artifact, user):
    return bool(
        artifact.dojo_id is not None
        and (
            getattr(user, "type", None) == "admin"
            or DojoAdmins.query.filter_by(
                dojo_id=artifact.dojo_id,
                user_id=user.id,
            ).first()
        )
    )


def artifact_for_viewer(artifact_id, user):
    """Return an artifact the current identity may safely view.

    Owners keep access to personal drafts.  Course members may read only explicitly
    published course artifacts.  Teachers additionally retain the existing review path
    for student submissions.  These branches are intentionally independent so a public
    draft can never become visible merely because it is attached to a course.
    """

    artifact = TeachingArtifacts.query.filter_by(id=artifact_id).first()
    if artifact is None:
        raise ScopeError("Artifact not found")
    if artifact.owner_id == user.id:
        return artifact
    if artifact.self_workspace_id is None and artifact_course_teacher(artifact, user):
        return artifact
    if (
        artifact.status == "PUBLISHED"
        and artifact.dojo_id is not None
        and artifact.self_workspace_id is None
    ):
        dojo_for_user(user, artifact.dojo_id, teacher=False)
        return artifact
    if artifact.dojo_id is None or artifact.self_workspace_id is None:
        raise ScopeError("Artifact not found")

    dojo_for_user(user, artifact.dojo_id, teacher=True)
    workspace = SelfLearningWorkspaces.query.filter_by(
        id=artifact.self_workspace_id,
        student_id=artifact.owner_id,
        dojo_id=artifact.dojo_id,
    ).first()
    if workspace is None:
        raise ScopeError("Artifact not found")
    reviews = TeachingAgentActions.query.filter_by(
        action_type="review-self-artifact",
        target_type="self_workspace",
        target_id=workspace.id,
        actor_id=workspace.student_id,
    ).all()
    if not any(
        (row.request_json or {}).get("artifactId") == artifact.id
        and (row.request_json or {}).get("dojoId") == artifact.dojo_id
        for row in reviews
    ):
        raise ScopeError("Artifact not found")
    return artifact


PERSONAL_REVIEWABLE_ARTIFACT_STATUSES = frozenset(
    {"DRAFT", "PERSONAL_DRAFT", "CHANGES_REQUESTED"}
)


def artifact_capabilities(artifact, user):
    is_course_teacher = artifact_course_teacher(artifact, user)
    is_owner = artifact.owner_id == user.id
    is_personal = artifact.self_workspace_id is not None
    is_archived = artifact.status in {"ARCHIVED", "DELETED"}
    can_edit = bool(is_owner and not is_archived)
    can_publish = bool(
        is_owner
        and is_course_teacher
        and artifact.dojo_id is not None
        and not is_personal
        and not is_archived
    )
    can_request_review = bool(
        is_owner
        and is_personal
        and artifact.dojo_id is not None
        and not is_archived
        and str(artifact.status or "").upper()
        in PERSONAL_REVIEWABLE_ARTIFACT_STATUSES
    )
    return {
        "view": True,
        "edit": can_edit,
        "requestReview": can_request_review,
        "publishToCourse": can_publish,
    }


def artifact_view(artifact, *, include_content=True, student_safe=False):
    revision = current_artifact_revision(artifact)
    result = {
        "id": artifact.id,
        "type": artifact.artifact_type,
        "title": artifact.title,
        "status": artifact.status,
        "dojoId": artifact.dojo_id,
        "moduleIndex": artifact.module_index,
        "currentRevision": artifact.current_revision,
        "created": artifact.created.isoformat() + "Z",
        "updated": artifact.updated.isoformat() + "Z",
        "studentSafe": bool(student_safe),
    }
    if not student_safe:
        result.update(
            {
                "sortOrder": artifact.sort_order,
                "selfWorkspaceId": artifact.self_workspace_id,
                "candidateId": artifact.candidate_id,
                "publishedChallengeId": artifact.published_challenge_id,
            }
        )
    if revision:
        result["revision"] = revision_view(
            revision,
            include_content=include_content,
            student_safe=student_safe,
        )
    return result


def revision_view(revision, *, include_content=True, student_safe=False):
    result = {
        "revision": revision.revision,
        "created": revision.created.isoformat() + "Z",
        "studentSafe": bool(student_safe),
    }
    if not student_safe:
        result.update(
            {
                "id": revision.id,
                "parentRevision": revision.parent_revision,
                "instruction": revision.instruction,
                "contentHash": revision.content_hash,
                "sourceRefs": revision.source_refs,
                "validation": revision.validation,
            }
        )
    if include_content:
        result["content"] = (
            _student_safe_content(revision.content)
            if student_safe
            else revision.content
        )
    return result


def create_revision(artifact, user, *, expected_revision, instruction, content):
    artifact = TeachingArtifacts.query.filter_by(id=artifact.id).with_for_update().first()
    if artifact is None or artifact.owner_id != user.id:
        raise ScopeError("Artifact not found")
    if artifact.current_revision != expected_revision:
        raise RevisionConflict(
            f"Artifact changed from revision {expected_revision} to {artifact.current_revision}"
        )
    if not isinstance(content, dict):
        raise ValueError("Artifact revision content must be a JSON object")
    new_number = expected_revision + 1
    current = current_artifact_revision(artifact)
    revision = TeachingArtifactRevisions(
        artifact_id=artifact.id,
        revision=new_number,
        parent_revision=expected_revision,
        instruction=instruction[:16000],
        content=content,
        content_hash=content_hash(content),
        source_refs=current.source_refs if current else [],
        validation={"status": "PENDING"},
        created_by=user.id,
    )
    db.session.add(revision)
    artifact.current_revision = new_number
    artifact.status = "DRAFT"
    artifact.updated = datetime.datetime.utcnow()
    db.session.commit()
    return revision


def add_card(message: TeachingAgentMessages, *, card_type, object_type, object_id, revision_id=None, state=None, actions=None):
    card = ConversationCards(
        message_id=message.id,
        card_type=card_type,
        object_type=object_type,
        object_id=object_id,
        revision_id=revision_id,
        state=state or {},
        actions=actions or [],
    )
    db.session.add(card)
    db.session.flush()
    return card


def card_view(card):
    return {
        "id": card.id,
        "type": card.card_type,
        "objectType": card.object_type,
        "objectId": card.object_id,
        "revisionId": card.revision_id,
        "state": card.state,
        "actions": card.actions,
        "created": card.created.isoformat() + "Z",
    }
