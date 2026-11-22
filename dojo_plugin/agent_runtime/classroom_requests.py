"""Bind a teacher's explicit classroom request to one published courseware revision."""

import re


_ACTION = r"(?:准备|创建|建立)(?:一[个节间]?)?(?:待上课的)?(?:课堂|教室)(?:会话)?"
_SOURCE = r"(?:使用|用|根据|基于|选用)(?:已发布的?)?(?:课件)?[《「“]([^《》「」“”\n]{1,240})[》」”]"
_REQUEST = re.compile(
    rf"(?:请\s*)?(?:帮我\s*)?(?:{_SOURCE}\s*[,，]?\s*(?:来)?{_ACTION}|"
    rf"{_ACTION}(?:\s*[,，]?\s*{_SOURCE})?)\s*[。！!]?"
)


def requests_classroom_preparation(prompt):
    return bool(_REQUEST.fullmatch(str(prompt or "").strip()))


def pin_classroom_request(payload, owner_id, dojo_id, module_index):
    # The admission service owns this field. Never inherit a pin from a previous turn or edit.
    clean = {key: value for key, value in payload.items() if key != "classroomPreparation"}
    if clean.get("chatBackend") != "upstream" or clean.get("executionMode", "auto") not in {"auto", "execute"}:
        return clean
    if ((clean.get("context") or {}).get("agentLoop") or {}).get("trace"):
        return clean
    match = _REQUEST.fullmatch(str(clean.get("prompt") or "").strip())
    if not match:
        return clean
    selected = (match[1] or match[2] or "").strip()
    pin = find_published_deck(selected, owner_id, dojo_id, module_index) if selected else None
    return {**clean, "classroomPreparation": pin or {}}


def find_published_deck(selected, owner_id, dojo_id, module_index):
    from sqlalchemy import or_
    from ..models import TeachingArtifacts
    from .classroom_preparation import published_classroom_deck
    from .upstream_turn import ordinary_teaching_course

    if not ordinary_teaching_course(dojo_id):
        return None
    # A deck outside the ten recent items can still be named. Duplicate titles require the exact ID.
    matches = TeachingArtifacts.query.with_entities(TeachingArtifacts.id).filter_by(
        owner_id=owner_id, dojo_id=dojo_id, module_index=module_index, status="PUBLISHED",
        artifact_type="slide-deck", self_workspace_id=None,
    ).filter(or_(TeachingArtifacts.id == selected, TeachingArtifacts.title == selected)).order_by(
        (TeachingArtifacts.id == selected).desc()
    ).limit(2).all()
    if not matches or (len(matches) != 1 and matches[0].id != selected):
        return None
    found = published_classroom_deck(owner_id, dojo_id, module_index, matches[0].id)
    if found is None:
        return None
    artifact, revision = found
    if selected not in (artifact.id, artifact.title):
        return None
    return {"artifactId": artifact.id, "title": artifact.title,
            "expectedRevision": revision.revision, "contentHash": revision.content_hash}


def current_classroom_pin(job, payload):
    from .classroom_preparation import published_classroom_deck

    pin = payload.get("classroomPreparation")
    if not isinstance(pin, dict) or not pin.get("artifactId"):
        return None
    found = published_classroom_deck(job.owner_id, job.dojo_id, job.module_index, pin["artifactId"])
    if found is None:
        return None
    artifact, revision = found
    if (artifact.title, revision.revision, revision.content_hash) != (
        pin.get("title"), pin.get("expectedRevision"), pin.get("contentHash"),
    ):
        return None
    return pin


def classroom_request_body(pin, request_body):
    # A single choice is already pinned on the platform. The model needs no database identifier or title.
    public = {"artifactId": "selected-deck"} if pin else None
    return request_body(
        "教师要求用指定的已发布课件准备课堂。"
        "返回 JSON，包含 answer 与 proposal。仅当选择了课件时，提出单个 classroom.prepare 操作，"
        "arguments 只填给定 artifactId。请说明等待教师确认。未选中课件时返回 proposal:null，"
        "提示教师给出已发布课件的准确标题。此步骤不创建或启动课堂。",
        {"publishedClassroomDeck": public},
    )


def classroom_proposal_result(pin, proposal):
    def reply(answer, accepted=None):
        mode, intent = ("execute", "operate") if accepted else ("ask", "answer")
        result = {"answer": answer, "executionMode": mode, "intentDecision": {
            "version": "teacher-intent-v1", "intent": intent, "executionMode": mode,
            "clarification": {"state": "not-required"},
        }}
        if accepted:
            result["toolProposals"] = [accepted]
        return result

    if not pin:
        return reply("请用当前章节已发布课件的准确标题重新发起，例如「请用《植物观察》准备课堂」。"
                     "如果有重名课件，可以把书名号里的标题换成课件 ID。")
    if (not isinstance(proposal, dict) or proposal.get("tool") != "classroom.prepare" or
            not isinstance(proposal.get("arguments"), dict) or proposal["arguments"].get("artifactId") != "selected-deck"):
        return reply("本轮未取得与所选已发布课件一致的课堂提案。请重新发起准备课堂。")
    return reply(f"所选课件为《{pin['title']}》第 {pin['expectedRevision']} 版，确认后将创建待上课会话。",
                 {"tool": "classroom.prepare", "arguments": {"artifactId": pin["artifactId"]},
                  "reason": "使用教师选定的已发布课件准备课堂"})
