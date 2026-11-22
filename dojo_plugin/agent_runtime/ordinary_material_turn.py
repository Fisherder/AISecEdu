"""Freeze the current-turn material excerpts for read-only teacher questions."""

import hashlib
import json
import re

from .. import config
from ..learning.evidence import redact_text
from ..learning.guide_model_context import guide_teaching_text
from .classroom_requests import requests_classroom_preparation
from .materials import MaterialContextError, build_course_material_context
from .teacher_documents import (
    FORBIDDEN_DOCUMENT_MARKUP, requested_document_formats, requests_lesson_plan_candidates,
)
from .upstream_turn import ordinary_teaching_course, upstream_enabled


PIN = "ordinaryMaterialQuestion"
MAX_MATERIALS = 4
EXCERPT_LENGTH = 2000
_CONTACT_DETAILS = re.compile(
    r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?<!\w)(?:\+86[ -]?)?1[3-9]\d{9}(?!\w)"
    r"|(?:姓名|电话号码|家庭住址|student\s+name)\s*[:：]\s*[^\n，,。；;]+",
    re.IGNORECASE,
)
_NON_TEACHING_TEXT = re.compile(
    r"私有答案|隐藏答案|教师备注|身份证号|真实靶标|攻击复现|漏洞利用|搭建.{0,8}(?:靶场|实验)|攻防演练"
    r"|(?:编写|生成|执行|运行|调用).{0,12}(?:代码|脚本|命令|工具|终端|浏览器)"
    r"|(?:新增|删除|更新|发布|提交|修改).{0,12}(?:课程|章节|课堂|成绩|资源)"
    r"|\b(?:private[_ -]?answers?|hidden[_ -]?answers?|answer[_ -]?key|exploit|payload|CTF)\b"
    r"|\b(?:run|execute|invoke|call|generate|write)\b.{0,24}\b(?:tools?|terminal|commands?|code|scripts?)\b"
    r"|(?:ignore|忽略).{0,16}(?:instructions|prompt|规则|指令|提示词)"
    r"|\b(?:password|passwd|token|secret|api[_-]?key|authorization|credential)\s*[:=]",
    re.IGNORECASE,
)
_SCOPE_CHANGED = "普通资料问答的课程、资料版本或指定模型已变化，请重新选择资料。"


def _disclosable_text(value, limit):
    if (
        _NON_TEACHING_TEXT.search(value) or FORBIDDEN_DOCUMENT_MARKUP.search(value)
        or redact_text(value, len(value)) != value
    ):
        raise ValueError("普通资料问答不能包含私有答案、凭据、实验现场或执行指令。")
    text = guide_teaching_text(_CONTACT_DETAILS.sub("[隐去联系或身份信息]", value), limit)
    text = "".join(ch for ch in text if ch.isprintable() or ch in "\n\t").strip()
    if not text:
        raise ValueError("普通资料问答只支持可披露的普通教学文字。")
    return text


def requested(body):
    if "materialQuestion" not in body:
        return False
    if body["materialQuestion"] is not True or body.get("executionMode") != "ask":
        raise ValueError("普通资料问答须明确选择“仅问答”。")
    if (
        any(body.get(key) for key in ("agentContinuation", "action", "generationSelection", "learningPattern"))
        or any(body.get(key) is not None for key in ("questionReply", "planSourceMessageId", "candidateCount"))
        or body.get("artifactType") not in (None, "", "auto")
        or body.get("candidateMode") not in (None, "", "auto")
        or body.get("delivery") == "next-step"
    ):
        raise ValueError("普通资料问答只能单独提交，请移除生成、规划或补充执行要求。")
    refs = body.get("sourceRefs")
    if (
        not isinstance(refs, list) or not 1 <= len(refs) <= MAX_MATERIALS
        or not all(isinstance(ref, dict) and ref.get("type") == "material"
                   and isinstance(ref.get("id"), str) and ref["id"].strip() for ref in refs)
        or len({ref["id"] for ref in refs}) != len(refs)
    ):
        raise ValueError("普通资料问答须在本轮明确选择 1 到 4 份资料。")
    prompt = body.get("content")
    if not isinstance(prompt, str):
        raise ValueError("请输入普通资料问答的问题。")
    validate_question(prompt)
    return True


def materials_digest(materials):
    encoded = json.dumps(materials, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _snapshot(owner_id, dojo_id, refs):
    # Resolve only the explicitly selected IDs, always against the latest
    # ready revision. A pinned old revision may still be readable elsewhere.
    ids = [ref["id"] for ref in refs]
    context = build_course_material_context(
        owner_id=owner_id, dojo_id=dojo_id,
        source_refs=[{"type": "material", "id": material_id} for material_id in ids],
        require_complete=True, excerpt_budget=EXCERPT_LENGTH * len(ids),
    )
    by_id = {source["id"]: source for source in context["sourceMaterials"]}
    resolved = {ref["id"]: ref for ref in context["sourceRefs"]}
    if set(ids) != set(resolved) or set(ids) != set(by_id):
        raise MaterialContextError(_SCOPE_CHANGED)
    materials = []
    for material_id in ids:
        excerpt = "\n\n".join(row["content"] for row in by_id[material_id]["excerpts"])
        excerpt = _disclosable_text(excerpt, EXCERPT_LENGTH)
        materials.append({"text": excerpt})
    return [resolved[material_id] for material_id in ids], materials


def question_text(value):
    question = _disclosable_text(str(value or ""), 501)
    if not question or len(question) > 500 or len(question.encode("utf-8")) > 2048:
        raise ValueError("普通资料问答仅支持 1 到 500 字的当前问题。")
    return question


def validate_question(prompt):
    question = question_text(prompt)
    if (requests_classroom_preparation(prompt) or requests_lesson_plan_candidates(prompt)
            or requested_document_formats({"prompt": prompt, "executionMode": "auto"})):
        raise ValueError("普通资料问答不接受课堂准备、文档或教案生成要求。")
    return question


def answer_text(value):
    return _disclosable_text(value, 48000)


def require_course(dojo_id):
    if not ordinary_teaching_course(dojo_id):
        raise ValueError("所选课程未开通普通资料问答，请选择已开通的课程。")
    model = config.HARNESS_DEEPSEEK_MODEL
    if not model or not upstream_enabled():
        raise ValueError("普通资料问答服务当前不可用。")
    return model


def admit(owner_id, dojo_id, refs, prompt):
    """Called after the owner, course, mode, and explicit references are checked."""
    if not 1 <= len(refs) <= MAX_MATERIALS:
        raise ValueError("普通资料问答每次请选择 1 到 4 份资料。")
    validate_question(prompt)
    model = require_course(dojo_id)
    frozen_refs, materials = _snapshot(owner_id, dojo_id, refs)
    return {"model": model, "refs": frozen_refs, "materialsSha256": materials_digest(materials)}


def require_current(job, payload):
    validate_question(payload.get("prompt"))
    pin = payload.get(PIN)
    if (not isinstance(pin, dict) or payload.get("executionMode") != "ask"
            or payload.get("chatBackend") != "upstream" or payload.get("classroomPreparation")
            or pin.get("model") != config.HARNESS_DEEPSEEK_MODEL or not upstream_enabled()
            or not ordinary_teaching_course(job.dojo_id)):
        raise ValueError(_SCOPE_CHANGED)
    refs = pin.get("refs")
    if (not isinstance(refs, list) or not 1 <= len(refs) <= MAX_MATERIALS
            or refs != payload.get("sourceRefs")
            or not all(isinstance(ref, dict) and ref.get("id") and ref.get("revisionId") and ref.get("sha256")
                       for ref in refs)):
        raise ValueError(_SCOPE_CHANGED)
    try:
        current_refs, materials = _snapshot(job.owner_id, job.dojo_id, refs)
    except MaterialContextError:
        raise ValueError(_SCOPE_CHANGED) from None
    if refs != current_refs or pin.get("materialsSha256") != materials_digest(materials):
        raise ValueError(_SCOPE_CHANGED)
    return materials


def request_body(payload, materials):
    return {"messages": [{"role": "user", "content": question_text(payload.get("prompt"))}], "materials": materials}


def dispatch_descriptor(payload):
    # The job/event log stores the excerpt digest, never another copy of the excerpts.
    return {
        "endpoint": "/v1/teaching-material-turn",
        "questionSha256": hashlib.sha256(question_text(payload.get("prompt")).encode("utf-8")).hexdigest(),
        "materialsSha256": payload[PIN]["materialsSha256"],
    }
