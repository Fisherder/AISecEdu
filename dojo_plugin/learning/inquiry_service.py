import copy
import datetime

from CTFd.models import Users, db

from ..agent_runtime.artifacts import artifact_course_teacher, content_hash
from ..agent_runtime.scope import ScopeError, build_scope, dojo_for_user, validate_module
from ..authoring_standards import prompt as standards_prompt, provenance, resolve
from ..construction_guards import frozen_course
from ..models import LearningAuditEvents, TeachingArtifactRevisions, TeachingArtifacts, TeachingMaterials
from ..models.inquiry import InquiryAttempts, InquiryEvents, InquiryReleases
from .aes128 import encrypt_trace
from .inquiry import ARTIFACT_TYPE, catalog, digest, make_spec, new_state, public_state, transition, validate_spec
from .student_experience import progress_contract


class InquiryConflict(ValueError):
    pass


def audit(user, action, artifact, details):
    db.session.add(LearningAuditEvents(actor_id=user.id, action="inquiry." + action,
                                      resource_type="artifact", resource_id=artifact.id,
                                      outcome="ALLOW", details=details))


def teacher_artifact(user, artifact_id):
    artifact = TeachingArtifacts.query.filter_by(id=artifact_id, artifact_type=ARTIFACT_TYPE).with_for_update().first()
    if artifact is None or artifact.owner_id != user.id or artifact.self_workspace_id is not None:
        raise ScopeError("项目不存在或无权修改。")
    build_scope(user, role="teacher", dojo_id=artifact.dojo_id)
    if artifact.status in {"ARCHIVED", "DELETED"} or frozen_course(artifact.dojo_id):
        raise InquiryConflict("这个项目目前不可修改。")
    return artifact


def revision_for(artifact, revision):
    row = TeachingArtifactRevisions.query.filter_by(artifact_id=artifact.id, revision=revision).first()
    if row is None or content_hash(row.content) != row.content_hash:
        raise InquiryConflict("项目版本不存在或内容摘要不一致。")
    return row


def release_for(artifact_id, revision=None):
    query = InquiryReleases.query.filter_by(artifact_id=artifact_id)
    if revision is not None:
        query = query.filter_by(revision=revision)
    return query.order_by(InquiryReleases.revision.desc()).first()


def standards(course_id):
    return provenance(resolve(course_id=course_id, question_type="simulation"))


def selected_pattern_context(course_id, selection):
    if not isinstance(selection, dict) or selection.get("id") != "process-inquiry":
        return None
    bundle = resolve(course_id=course_id, question_type="simulation")
    return {**catalog(), "authoringStandards": {"provenance": provenance(bundle), "instructions": standards_prompt(bundle)}}


def create_project(user, values, *, dojo=None, module_index=None, source_refs=None):
    build_scope(user, role="teacher", dojo_id=dojo.dojo_id if dojo else None)
    if isinstance(module_index, bool):
        raise ValueError("章节序号必须为整数。")
    if dojo:
        validate_module(dojo, module_index)
    if frozen_course(dojo.dojo_id if dojo else None):
        raise InquiryConflict("固定审核副本不能创建项目。")
    spec = make_spec(values)
    policy = standards(dojo.dojo_id if dojo else None)
    artifact = TeachingArtifacts(owner_id=user.id, dojo_id=dojo.dojo_id if dojo else None,
                                 module_index=module_index, artifact_type=ARTIFACT_TYPE,
                                 title=spec["title"], status="DRAFT", current_revision=1)
    db.session.add(artifact)
    db.session.flush()
    references = copy.deepcopy(spec["sources"])
    for reference in (source_refs or [])[:50]:
        material = TeachingMaterials.query.filter_by(id=reference.get("id"), owner_id=user.id).first()
        if material is None or material.status == "ARCHIVED" or material.dojo_id not in {None, dojo.dojo_id if dojo else None}:
            raise ScopeError("引用资料不存在或无权使用。")
        references.append({"type": "material", "id": material.id, "title": material.title,
                           "sha256": material.sha256, "statusAtCreation": material.status})
    row = TeachingArtifactRevisions(artifact_id=artifact.id, revision=1, content=spec,
                                    content_hash=content_hash(spec), source_refs=references,
                                    created_by=user.id, instruction="创建流程探究式学习项目",
                                    validation={"status": "PENDING", "standards": policy})
    db.session.add(row)
    audit(user, "create", artifact, {"revision": 1, "standards": policy})
    return artifact


def edit_project(user, artifact_id, values):
    artifact = teacher_artifact(user, artifact_id)
    if values.get("expectedRevision") != artifact.current_revision:
        raise InquiryConflict("项目已更新，请刷新后修改。")
    current = revision_for(artifact, artifact.current_revision)
    spec = make_spec(values)
    if spec == current.content:
        return artifact
    revision = artifact.current_revision + 1
    db.session.add(TeachingArtifactRevisions(artifact_id=artifact.id, revision=revision,
                                           parent_revision=artifact.current_revision, content=spec,
                                           content_hash=content_hash(spec), source_refs=copy.deepcopy(current.source_refs),
                                           created_by=user.id, instruction="修订学习流程与教学说明",
                                           validation={"status": "PENDING", "standards": standards(artifact.dojo_id)}))
    artifact.current_revision = revision
    artifact.title = spec["title"]
    if not release_for(artifact.id):
        artifact.status = "DRAFT"
    audit(user, "revise", artifact, {"revision": revision})
    return artifact


def review_project(user, artifact_id, expected_revision):
    artifact = teacher_artifact(user, artifact_id)
    if expected_revision != artifact.current_revision:
        raise InquiryConflict("项目版本已变化，请重新检查。")
    revision = revision_for(artifact, expected_revision)
    report = validate_spec(revision.content)
    revision.validation = {**report, "standards": standards(artifact.dojo_id),
                           "checkedBy": user.id, "checkedAt": datetime.datetime.utcnow().isoformat() + "Z",
                           "revisionHash": revision.content_hash}
    if not release_for(artifact.id):
        artifact.status = "READY"
    audit(user, "review", artifact, {"revision": expected_revision, "report": report})
    return revision.validation


def publish_project(user, artifact_id, values):
    artifact = teacher_artifact(user, artifact_id)
    if values.get("confirmed") is not True or values.get("teacherReviewed") is not True:
        raise InquiryConflict("请先预览内容并明确确认审核发布。")
    if values.get("expectedRevision") != artifact.current_revision:
        raise InquiryConflict("项目版本已变化，请重新审核。")
    if artifact.dojo_id is None or artifact.module_index is None:
        raise InquiryConflict("发布前请选择目标课程及章节。")
    dojo = dojo_for_user(user, artifact.dojo_id, teacher=True)
    validate_module(dojo, artifact.module_index)
    revision = revision_for(artifact, artifact.current_revision)
    report = revision.validation or {}
    if report.get("status") != "PASS" or report.get("revisionHash") != revision.content_hash or report.get("standards") != standards(artifact.dojo_id):
        raise InquiryConflict("当前版本尚未通过检查，或课程规范已变化，请重新检查。")
    validate_spec(revision.content)
    release = release_for(artifact.id, artifact.current_revision)
    if release is None:
        release = InquiryReleases(artifact_id=artifact.id, revision_id=revision.id,
                                  revision=revision.revision, content_hash=revision.content_hash,
                                  published_by=user.id,
                                  review={**copy.deepcopy(report), "teacherReviewed": True})
        db.session.add(release)
    artifact.status = "PUBLISHED"
    artifact.published = datetime.datetime.utcnow()
    audit(user, "publish", artifact, {"revision": revision.revision, "contentHash": revision.content_hash})
    return release


def project_for_viewer(user, artifact_id):
    artifact = TeachingArtifacts.query.filter_by(id=artifact_id, artifact_type=ARTIFACT_TYPE).first()
    if artifact is None or artifact.status in {"ARCHIVED", "DELETED"}:
        raise ScopeError("项目不存在或无权访问。")
    teacher = artifact.owner_id == user.id or artifact_course_teacher(artifact, user)
    if teacher:
        return artifact, True
    if artifact.dojo_id is None or release_for(artifact.id) is None:
        raise ScopeError("项目尚未发布或无权访问。")
    if artifact.dojo is not None and (artifact.dojo.data or {}).get("archived"):
        raise ScopeError("课程已归档。")
    build_scope(user, role="student", dojo_id=artifact.dojo_id, module_index=artifact.module_index)
    return artifact, False


def project_view(user, artifact_id):
    artifact, teacher = project_for_viewer(user, artifact_id)
    release = release_for(artifact.id)
    row = revision_for(artifact, artifact.current_revision if teacher else release.revision)
    return {"id": artifact.id, "title": row.content["title"], "revision": row.revision,
            "status": artifact.status, "spec": row.content,
            "canEdit": teacher and artifact.owner_id == user.id and not frozen_course(artifact.dojo_id),
            "teacher": teacher, "validation": row.validation if teacher else None,
            "publishedRevision": release.revision if release else None,
            "courseId": artifact.dojo_id, "moduleIndex": artifact.module_index,
            "courseName": artifact.dojo.name if artifact.dojo else None,
            "courseUrl": f"/{artifact.dojo.reference_id}" if artifact.dojo else None,
            "hasUnpublishedChanges": bool(release and release.revision != artifact.current_revision)}


def start_attempt(user, artifact_id, *, attempt_id=None):
    artifact, teacher = project_for_viewer(user, artifact_id)
    mode = "PREVIEW" if teacher else "LEARN"
    db.session.query(Users.id).filter_by(id=user.id).with_for_update().one()
    if attempt_id:
        attempt = InquiryAttempts.query.filter_by(id=attempt_id, user_id=user.id, artifact_id=artifact_id, mode=mode).first()
        if attempt is None:
            raise ScopeError("学习记录不存在。")
    else:
        revision = artifact.current_revision if teacher else release_for(artifact.id).revision
        attempt = InquiryAttempts.query.filter_by(user_id=user.id, artifact_id=artifact_id, revision=revision, mode=mode).first()
        if attempt is None:
            row = revision_for(artifact, revision)
            attempt = InquiryAttempts(user_id=user.id, artifact_id=artifact_id, revision=revision,
                                      content_hash=row.content_hash, mode=mode, state=new_state(row.content))
            db.session.add(attempt)
            db.session.flush()
    row = revision_for(artifact, attempt.revision)
    if not teacher and release_for(artifact.id, attempt.revision) is None:
        raise ScopeError("此版本尚未发布。")
    if attempt.content_hash != row.content_hash:
        raise InquiryConflict("学习版本摘要不一致，请联系教师。")
    return attempt, row


def attempt_view(attempt):
    return {"id": attempt.id, "revision": attempt.revision, "contentHash": attempt.content_hash,
            "mode": attempt.mode, "sequence": attempt.sequence, "state": public_state(attempt.state),
            "completedAt": attempt.completed.isoformat() + "Z" if attempt.completed else None}


def apply_action(user, artifact_id, values):
    artifact, teacher = project_for_viewer(user, artifact_id)
    attempt = InquiryAttempts.query.filter_by(id=values.get("attemptId"), user_id=user.id,
                                              artifact_id=artifact_id, mode="PREVIEW" if teacher else "LEARN").with_for_update().first()
    if attempt is None:
        raise ScopeError("学习记录不存在。")
    row = revision_for(artifact, attempt.revision)
    if attempt.content_hash != row.content_hash or (not teacher and release_for(artifact.id, attempt.revision) is None):
        raise InquiryConflict("学习版本不可用。")
    request_key = values.get("requestKey")
    if not isinstance(request_key, str) or not 8 <= len(request_key) <= 80:
        raise ValueError("操作缺少有效的请求编号。")
    action = values.get("action")
    if not isinstance(action, dict) or len(str(action)) > 4000:
        raise ValueError("学习操作格式无效。")
    request_hash = digest({"action": action, "sequence": values.get("expectedSequence")})
    existing = InquiryEvents.query.filter_by(attempt_id=attempt.id, request_key=request_key).first()
    if existing:
        if existing.request_hash != request_hash:
            raise InquiryConflict("请求编号已用于另一项操作。")
        return {**existing.response, "replayed": True}
    if values.get("expectedSequence") != attempt.sequence:
        raise InquiryConflict("学习状态已更新，请刷新后继续；你的已保存记录仍在。")
    state, event = transition(row.content, attempt.state, action)
    previous = InquiryEvents.query.filter_by(attempt_id=attempt.id).order_by(InquiryEvents.sequence.desc()).first()
    previous_hash = previous.event_hash if previous else "0" * 64
    attempt.state, attempt.sequence = state, attempt.sequence + 1
    if state["completed"] and attempt.completed is None:
        attempt.completed = datetime.datetime.utcnow()
    response = {"attempt": attempt_view(attempt), "feedback": event["feedback"],
                "feedbackLevel": "error" if event["details"].get("passed") is False else "success"}
    payload = {"event": event, "revision": attempt.revision, "contentHash": attempt.content_hash,
               "stateHash": digest(state), "serverVerified": True}
    event_hash = digest({"attemptId": attempt.id, "sequence": attempt.sequence,
                         "previousHash": previous_hash, "payload": payload})
    db.session.add(InquiryEvents(attempt_id=attempt.id, sequence=attempt.sequence, request_key=request_key,
                                request_hash=request_hash, payload=payload, response=response,
                                previous_hash=previous_hash, event_hash=event_hash))
    return response


def teacher_evidence(user, artifact_id):
    artifact, teacher = project_for_viewer(user, artifact_id)
    if not teacher:
        raise ScopeError("无权查看学生学习记录。")
    rows = db.session.query(InquiryAttempts, Users.name).join(Users, Users.id == InquiryAttempts.user_id).filter(
        InquiryAttempts.artifact_id == artifact.id, InquiryAttempts.mode == "LEARN").order_by(InquiryAttempts.updated.desc()).limit(500).all()
    result = []
    for attempt, name in rows:
        events = InquiryEvents.query.filter_by(attempt_id=attempt.id).order_by(InquiryEvents.sequence).all()
        previous_hash, valid = "0" * 64, True
        for index, event in enumerate(events, 1):
            expected = digest({"attemptId": attempt.id, "sequence": index, "previousHash": previous_hash, "payload": event.payload})
            valid = valid and event.sequence == index and event.previous_hash == previous_hash and event.event_hash == expected
            previous_hash = event.event_hash
        valid = valid and len(events) == attempt.sequence and (not events or events[-1].payload.get("stateHash") == digest(attempt.state))
        result.append({"student": name, "attempt": attempt_view(attempt), "chainValid": valid,
                       "events": [{"sequence": event.sequence, "payload": event.payload, "eventHash": event.event_hash,
                                   "previousHash": event.previous_hash, "created": event.created.isoformat() + "Z"} for event in events]})
    return result


def published_projects(user, dojo, module_index):
    if user is None:
        return []
    dojo_for_user(user, dojo.dojo_id)
    artifacts = TeachingArtifacts.query.filter_by(dojo_id=dojo.dojo_id, module_index=module_index,
                                                 artifact_type=ARTIFACT_TYPE, status="PUBLISHED").order_by(TeachingArtifacts.sort_order).all()
    result = []
    for artifact in artifacts:
        release = release_for(artifact.id)
        if release is None:
            continue
        row = revision_for(artifact, release.revision)
        attempt = InquiryAttempts.query.filter_by(user_id=user.id, artifact_id=artifact.id,
                                                  revision=release.revision, mode="LEARN").first()
        result.append({"id": artifact.id, "title": row.content["title"], "minutes": row.content["minutes"],
                       "revision": release.revision, "completed": bool(attempt and attempt.completed),
                       "started": bool(attempt), "href": "/learning/inquiry/" + artifact.id})
    return result


def augment_learning_courses(user, courses, dojos):
    references = {course["id"]: course for course in courses if course.get("enrolled")}
    pending = []
    for dojo in dojos:
        if dojo.reference_id not in references:
            continue
        course = references[dojo.reference_id]
        projects = [item for module in dojo.modules if module.visible() or dojo.is_admin(user)
                    for item in published_projects(user, dojo, module.module_index)]
        if not projects:
            continue
        unfinished = [item for item in projects if not item["completed"]]
        course["inquiryProjectCount"] = len(projects)
        course["inquiryCompletedCount"] = len(projects) - len(unfinished)
        course["publishedItemCount"] += len(projects)
        previous = course.get("progress") or {}
        previous_total = previous.get("total", 0)
        completed = len(projects) - len(unfinished)
        course["progress"] = progress_contract(previous.get("completed", 0) + completed, previous_total + len(projects),
                                               basis="required_runnable_and_inquiry_items")
        if not previous_total:
            course["progress"]["label"] = f"流程核验 {completed} / {len(projects)}"
            course["learningUrl"] = (unfinished or projects)[0]["href"]
        pending.extend({**item, "courseId": dojo.reference_id, "courseName": dojo.name} for item in unfinished)
    return sorted(pending, key=lambda item: not item["started"])


def inquiry_next_action(pending, existing):
    if not pending or existing.get("type") in {"CONTINUE_ATTEMPT", "ASSIGNMENT", "PRACTICE"}:
        return existing
    project = pending[0]
    return {"type": "COURSE_ITEM", "state": "READY", "title": project["title"],
            "label": "继续探究" if project["started"] else "开始探究", "href": project["href"],
            "reason": "这份课程学习项目尚有实验或独立操作目标未通过核验。",
            "reasonCode": "INQUIRY_PENDING", "estimatedMinutes": project["minutes"],
            "saved": project["started"], "savedState": "已保存当前版本的学习进度" if project["started"] else "尚未开始",
            "context": {"courseId": project["courseId"], "courseName": project["courseName"], "artifactId": project["id"]}}
