"""Revise only the visible prose of a verified ordinary lesson plan."""

import copy
import html
import re

from .. import config
from ..models import ModelInvocations, TeachingArtifactRevisions, TeachingArtifacts
from .artifacts import content_hash
from .model_router import UPSTREAM_LESSON_PLAN_ROUTE, UPSTREAM_LESSON_PLAN_REVISION_ROUTE
from .ordinary_lesson_plan import _require_scope
from .ordinary_slide_layout import split_source_selection
from .ordinary_project_queue import enabled as scoped_project_enabled
from .upstream_turn import upstream_enabled


MODEL = "ordinaryLessonPlanRevisionModel"
MODE = "ordinary-lesson-plan-revise"
_HASH = "ordinaryLessonPlanRevisionHash"
_CONFLICT = "教案版本、教师权限或教学模型已变化，请重新打开当前教案。"
_UNSUPPORTED = "普通教案修订只支持现有各节的讲解和学习要点。如需调整结构或标题，请重新生成教案。"
_BAD_RESULT = "教学服务未返回可核验的教案文字修订。"
_TENS = ("", "十", "二十", "三十")
_ONES = ("", "一", "二", "三", "四", "五", "六", "七", "八", "九")
_SECTION_NUMBERS = {_TENS[n // 10] + _ONES[n % 10]: n for n in range(1, 31)}
_SECTION = re.compile(r"第\s*([0-9０-９零〇一二两三四五六七八九十百]+)\s*(?:小节|节)")
_OTHER_SECTION_NUMBER = re.compile(r"第\s*[零〇一二三四五六七八九十百0-9]+\s*[节页]|第\s*[０-９0-9一二两三四五六七八九十]+\s*[、,，至到–—-]")
_STRUCTURE = re.compile(
    r"(?:新增|增加|添加|插入|删除|移除|合并|拆分|重排|重组|调换|补充)\s*"
    r"(?:第\s*[0-9]+\s*节|[一两二三四五六七八九十0-9]+个?(?:新)?(?:小节|节|章节|页面|页)|段落结构|小节|章节|页面)|"
    r"(?:改名|改为\s*[0-9]+\s*节)|"
    r"(?:更改|修改|重写|调整|替换|换|改)(?:这份教案的|整份教案的|各节的|[第0-9]+节的?)?(?:标题|名称|结构|顺序)|"
    r"(?:标题|名称|结构|顺序)(?:改成|改为|换成)"
)
_UNSAFE = re.compile(
    r"<\s*/?\s*[A-Za-z]|<!--|<!doctype\b|`{3,}|~{3,}|(?:https?|file|data|javascript):|"
    r"\bBearer\s+\S+|-----BEGIN [^-]+ KEY-----|\bflag\s*\{|pwn\.college\s*\{|"
    r"攻击复现|漏洞利用|实战攻击步骤|利用载荷|靶场|攻防演练|终端日志|命令输出|"
    r"学生(?:姓名|名单|成绩|账号|编号)|班级名册|家庭住址|联系方式|隐私信息",
    re.IGNORECASE,
)


class OrdinaryLessonPlanRevisionError(ValueError):
    pass


def _prose(value, maximum, error):
    if (not isinstance(value, str) or not value or value != value.strip()
            or len(value) > maximum or _UNSAFE.search(value)
            or any(ord(char) < 32 or 0xD800 <= ord(char) <= 0xDFFF for char in value)
            or len(value.encode("utf-16-le")) // 2 > maximum):
        raise OrdinaryLessonPlanRevisionError(error)
    return value


def _takeaways(values, error):
    if not isinstance(values, list) or not 1 <= len(values) <= 4:
        raise OrdinaryLessonPlanRevisionError(error)
    return [_prose(value, 64, error) for value in values]


def _indices(instruction, count):
    instruction, attached = split_source_selection(instruction)
    _prose(instruction, 1600, _UNSUPPORTED)
    matches = list(_SECTION.finditer(instruction))
    if (attached or _STRUCTURE.search(_SECTION.sub("第1节", instruction)) or len(matches) > 1
            or _OTHER_SECTION_NUMBER.search(_SECTION.sub("", instruction))):
        raise OrdinaryLessonPlanRevisionError(_UNSUPPORTED)
    if not matches:
        return range(count)
    numeral = matches[0][1]
    number = int(numeral) if numeral.isdecimal() and len(numeral) <= 3 else _SECTION_NUMBERS.get(numeral.replace("两", "二"))
    if number is None or not 1 <= number <= count:
        raise OrdinaryLessonPlanRevisionError("指定的小节超出当前教案范围，请核对小节编号。")
    return [number - 1]


def _source(artifact_id, number, owner_id):
    return TeachingArtifactRevisions.query.filter_by(
        artifact_id=artifact_id, revision=number, created_by=owner_id,
    ).populate_existing().first()


def _has_receipt(revision, owner_id, *routes):
    if revision is None:
        return False
    return ModelInvocations.query.filter_by(
        owner_id=owner_id, artifact_revision_id=revision.id, status="SUCCEEDED",
        provider="deepseek", degraded=False,
    ).filter(ModelInvocations.route.in_(routes)).first() is not None


def _section_markup(title, explanation, takeaways):
    def escaped(text):
        return html.escape(text).replace("&#x27;", "&#39;")

    return (
        '<p style="font-size:32px;font-weight:700">' + escaped(title) + '</p>'
        '<p style="font-size:22px">' + escaped(explanation) + '</p>'
        '<ul style="font-size:20px">' +
        ''.join('<li>' + escaped(item) + '</li>' for item in takeaways) + '</ul>'
    )


def _sections(revision, payload):
    content = revision.content
    if (not isinstance(content, dict) or content.get("schema") != "aisecedu.global-agent.artifact.v1"
            or content.get("artifactType") != "lesson-plan" or content.get("renderer") != "agent-runtime-stage"):
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    plan, lesson = content.get("plan"), content.get("lesson")
    if (not isinstance(plan, dict) or plan.get("experience") != {"mode": "ordinary-teaching-plan"}
            or not isinstance(lesson, dict)):
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    slides = lesson.get("artifacts")
    if not isinstance(slides, list) or not 1 <= len(slides) <= 30:
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    sections = []
    for index in _indices(payload["instruction"], len(slides)):
        slide = slides[index]
        expected_id = f"lesson-plan-{index + 1}"
        if (not isinstance(slide, dict) or slide.get("id") != expected_id or slide.get("type") != "slide"
                or slide.get("order") != index or not isinstance(slide.get("outline"), dict)
                or not isinstance(slide.get("content"), dict)):
            raise OrdinaryLessonPlanRevisionError(_CONFLICT)
        outline = slide["outline"]
        title = _prose(outline.get("title"), 80, _CONFLICT)
        explanation = _prose(outline.get("description"), 180, _CONFLICT)
        takeaways = _takeaways(outline.get("keyPoints"), _CONFLICT)
        elements = slide["content"].get("elements")
        if (slide.get("title") != title or not isinstance(elements, list) or len(elements) != 1
                or not isinstance(elements[0], dict) or elements[0].get("type") != "text"
                or elements[0].get("id") != expected_id + "-text"
                or elements[0].get("content") != _section_markup(title, explanation, takeaways)):
            raise OrdinaryLessonPlanRevisionError(_CONFLICT)
        sections.append({"index": index, "title": title, "explanation": explanation, "takeaways": takeaways})
    return sections


def admit(artifact, payload):
    if (artifact.artifact_type != "lesson-plan" or artifact.self_workspace_id is not None
            or artifact.dojo_id is None):
        return payload
    initial = _source(artifact.id, 2, artifact.owner_id)
    initial_receipt = _has_receipt(initial, artifact.owner_id, UPSTREAM_LESSON_PLAN_ROUTE)
    if not initial_receipt:
        if initial and (initial.validation or {}).get("modelRoute") == UPSTREAM_LESSON_PLAN_ROUTE:
            raise OrdinaryLessonPlanRevisionError(_CONFLICT)
        return payload
    revision = _source(artifact.id, payload["expectedRevision"], artifact.owner_id)
    model = config.HARNESS_DEEPSEEK_MODEL
    _require_scope(artifact.owner_id, artifact.dojo_id, artifact.module_index, None)
    if (not (upstream_enabled() or scoped_project_enabled(artifact.dojo_id)) or not model or not _has_receipt(
            revision, artifact.owner_id, UPSTREAM_LESSON_PLAN_ROUTE, UPSTREAM_LESSON_PLAN_REVISION_ROUTE,
        ) or content_hash(revision.content) != revision.content_hash
          or (scoped_project_enabled(artifact.dojo_id) and revision.source_refs)):
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    _sections(revision, payload)
    return {
        "artifactType": "lesson-plan", "artifactId": artifact.id,
        "expectedRevision": payload["expectedRevision"], "instruction": payload["instruction"],
        MODEL: model, _HASH: revision.content_hash,
    }


def _current(job, payload, *, lock=False):
    model = payload.get(MODEL)
    if (job.kind != "artifact.revise" or payload.get("artifactType") != "lesson-plan"
            or not (upstream_enabled() or scoped_project_enabled(job.dojo_id))
            or not model or model != config.HARNESS_DEEPSEEK_MODEL):
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    _require_scope(job.owner_id, job.dojo_id, job.module_index, job.thread_id)
    query = TeachingArtifacts.query.filter_by(
        id=payload.get("artifactId"), owner_id=job.owner_id, dojo_id=job.dojo_id,
        module_index=job.module_index, artifact_type="lesson-plan", self_workspace_id=None,
    )
    artifact = (query.with_for_update() if lock else query).populate_existing().first()
    expected = payload.get("expectedRevision")
    if artifact is None or type(expected) is not int or expected != artifact.current_revision:
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    revision = _source(artifact.id, expected, job.owner_id)
    if (not _has_receipt(revision, job.owner_id, UPSTREAM_LESSON_PLAN_ROUTE, UPSTREAM_LESSON_PLAN_REVISION_ROUTE)
            or revision.content_hash != payload.get(_HASH) or content_hash(revision.content) != revision.content_hash
            or (scoped_project_enabled(job.dojo_id) and revision.source_refs)):
        raise OrdinaryLessonPlanRevisionError(_CONFLICT)
    return revision


def prepare(job, payload):
    return {**payload, "sections": _sections(_current(job, payload), payload)}


def wire_payload(payload):
    return {key: payload[key] for key in ("artifactType", "artifactId", "expectedRevision", "instruction", MODEL, "sections")}


def validate_receipt(route, response):
    meta = response.get("model") or {}
    usage = meta.get("usage") if isinstance(meta, dict) else None
    if not isinstance(usage, dict):
        raise OrdinaryLessonPlanRevisionError(_BAD_RESULT)
    counts = [usage.get(field) for field in ("inputTokens", "outputTokens", "totalTokens")]
    if (meta.get("executionMode") != MODE or meta.get("provider") != "deepseek"
            or meta.get("degraded") is not False or meta.get("actualModel") != route.get("required_model")
            or any(type(value) is not int or value < 1 for value in counts) or counts[2] != sum(counts[:2])):
        raise OrdinaryLessonPlanRevisionError(_BAD_RESULT)


def content_for_save(job, result):
    payload = job.payload
    revision = _current(job, payload, lock=True)
    sections = {row["index"]: row for row in _sections(revision, payload)}
    patches = result.get("patches")
    if set(result) != {"patches"} or not isinstance(patches, list) or not 1 <= len(patches) <= len(sections):
        raise OrdinaryLessonPlanRevisionError(_BAD_RESULT)
    content = copy.deepcopy(revision.content)
    for patch in patches:
        if (not isinstance(patch, dict) or not {"index"} < set(patch) <= {"index", "explanation", "takeaways"}
                or type(patch["index"]) is not int or patch["index"] not in sections):
            raise OrdinaryLessonPlanRevisionError(_BAD_RESULT)
        index = patch["index"]
        current = sections.pop(index)
        explanation = _prose(patch.get("explanation", current["explanation"]), 180, _BAD_RESULT)
        takeaways = _takeaways(patch.get("takeaways", current["takeaways"]), _BAD_RESULT)
        if explanation == current["explanation"] and takeaways == current["takeaways"]:
            raise OrdinaryLessonPlanRevisionError(_BAD_RESULT)
        slide = content["lesson"]["artifacts"][index]
        slide["outline"].update(description=explanation, keyPoints=takeaways)
        slide["content"]["elements"][0]["content"] = _section_markup(current["title"], explanation, takeaways)
    return content
