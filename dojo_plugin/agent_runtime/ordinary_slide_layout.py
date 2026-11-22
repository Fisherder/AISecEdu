"""Admission and receipt checks for revisions to ordinary static slides."""

import math
import re

from CTFd.models import Users

from .. import config
from ..models import TeachingArtifacts
from .artifacts import content_hash, current_artifact_revision
from .classroom_preparation import ordinary_static_lesson
from .scope import ScopeError, build_scope
from .upstream_turn import ordinary_slide_wording_request, ordinary_teaching_course, upstream_enabled


BACKEND = "ordinary-slide-layout"
SCOPE = "slide-layout"
DECK_BACKEND = "ordinary-deck-revision"
DECK_SCOPE = "deck-revision"
DECK_PIN = "ordinaryDeckRevision"
PIN = "ordinarySlideLayout"
_SOURCE_CHANGED = "课件版本或课程权限已变化，请重新打开当前版本后再修改版式。"
_LAYOUT_REQUEST = re.compile(
    r"(?:请\s*)?(?:只|仅)?\s*(?:调整|修改|更改|优化|统一|重新设计)\s*"
    r"(?P<target>[^：:\n]*?)\s*(?:版式|布局|排版)\s*[：:]\s*(?P<intent>[\s\S]*)"
)
_SELECTION_SUFFIX = re.compile(r"\n\s*仅修改当前版本\s*V[^\n]{0,40}?中所选范围\s*[（(]", re.I)
_INVALID_INTENT = re.compile(
    r"[\r\n\u2028\u2029\x00-\x1f<>`]|(?:https?|ftp|file|data|javascript):|源码第|所选范围|原始源码"
    r"|靶场|攻防演练|漏洞复现|漏洞利用|攻击步骤|可执行载荷|\b(?:ctf|exploit)\b",
    re.I,
)
_ALL_PAGES = re.compile(r"(?:整份|整套|全套|整个|全部|所有|每一?|这份|当前)?\s*(?:课件|幻灯片|页面|页)?")
_PAGE_NUMBERS = re.compile(r"第\s*[0-9]{1,3}\s*页?(?:\s*(?:[、，,]|和|及|与)\s*(?:第\s*)?[0-9]{1,3}\s*页?)*")

_DECK_TEXT_REQUEST = re.compile(r"文字|正文|标题|文案|措辞|用词|表达|表述|润色|改写|可读性|语句|术语|说明")
_DECK_COUNT_INTENT = re.compile(
    r"(?:(?:扩展|扩充|压缩|缩减|扩|缩|调整|改)(?:到|为|成)|控制在|总页数(?:保持)?(?:为|是|在))"
    r"\s*[0-9０-９零〇一二两三四五六七八九十]"
)
_DECK_STYLE_INTENT = re.compile(
    r"(?:换|改|调整|修改|做成|重做|重新设计|统一|设置|使用|采用|更换)[^，。；！？,;!?\n]{0,14}"
    r"(?:主题|风格|颜色|色调|配色|强调色|背景色|版式|排版|布局|字体|字号|字色)"
    r"|(?:主题|风格|颜色|色调|配色|强调色|背景色|版式|排版|布局|字体|字号|字色)"
    r"\s*(?:调整|改|设|换|用|统一)"
    r"|\b(?:change|switch|redesign|use|update)\b[^,;.!?\n]{0,32}\b(?:theme|colors?|palette|layout|fonts?)\b",
    re.I,
)


class OrdinarySlideLayoutError(ValueError):
    pass


def split_source_selection(instruction):
    value = str(instruction or "").strip()
    match = _SELECTION_SUFFIX.search(value)
    return (value, False) if match is None else (value[:match.start()].rstrip(), True)


def reject_source_selection(instruction, *, include_wording=True):
    original, attached = split_source_selection(instruction)
    if attached and (_LAYOUT_REQUEST.fullmatch(original)
                     or (include_wording and ordinary_slide_wording_request(original))):
        raise OrdinarySlideLayoutError("原生课件版式或逐页文字修改请先取消源码选区，再重新提交要求。")


def layout_request(instruction):
    original, _ = split_source_selection(instruction)
    match = _LAYOUT_REQUEST.fullmatch(original)
    if match is None:
        return None
    reject_source_selection(instruction)
    target = match["target"].strip().removesuffix("的").strip()
    intent = match["intent"].strip()
    if not intent or len(intent) > 500 or _INVALID_INTENT.search(intent):
        raise OrdinarySlideLayoutError("请提供一条不超过 500 字的单行版式要求。")
    if _ALL_PAGES.fullmatch(target):
        return intent, "all"
    if not target.endswith("页") or not _PAGE_NUMBERS.fullmatch(target):
        raise OrdinarySlideLayoutError("请指定要调整的页码，例如“第1、2页”，或选择“整份课件”。")
    pages = [int(value) for value in re.findall(r"[0-9]+", target)]
    if not all(1 <= page <= 120 for page in pages) or len(pages) != len(set(pages)):
        raise OrdinarySlideLayoutError("版式修订需要有效且不重复的页码。")
    return intent, pages


def _scope(user, artifact):
    if (artifact.owner_id != user.id or artifact.self_workspace_id is not None or artifact.status == "ARCHIVED"
            or artifact.artifact_type != "slide-deck" or not ordinary_teaching_course(artifact.dojo_id)):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    try:
        build_scope(user, role="teacher", dojo_id=artifact.dojo_id, module_index=artifact.module_index)
    except ScopeError as exc:
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED) from exc


def _source(artifact, expected, pages):
    revision = current_artifact_revision(artifact)
    if (type(expected) is not int or artifact.current_revision != expected or revision is None
            or revision.revision != expected or content_hash(revision.content) != revision.content_hash):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    lesson = ordinary_static_lesson(revision.content, allow_missing_layout=True)
    if lesson is None or not isinstance(revision.content.get("lesson"), dict):
        raise OrdinarySlideLayoutError("版式修订仅支持已保存的普通原生静态课件。请先打开或转存该类课件。")
    if pages != "all" and any(page > len(lesson["artifacts"]) for page in pages):
        raise OrdinarySlideLayoutError("指定的页码超出当前课件范围。")
    return revision, lesson


def _ordinary_deck_request(instruction):
    original, _ = split_source_selection(instruction)
    if any(
        not re.search(r"(?:不|不要|不必|不用|无需|不需要|别|保留)\s*$", clause[:match.start()])
        for clause in re.split(r"[，。；！？,;!?]", original)
        for match in _DECK_STYLE_INTENT.finditer(clause)
    ):
        # Keep the existing native revision behavior for theme and other style requests.
        return False
    return bool(_DECK_TEXT_REQUEST.search(original) or _DECK_COUNT_INTENT.search(original))


def _deck_instruction(instruction):
    original, attached = split_source_selection(instruction)
    if (attached or not 1 <= len(original) <= 2000 or _INVALID_INTENT.search(original)
            or re.search(r"脚本|终端|浏览器代理", original)):
        raise OrdinarySlideLayoutError("请提交普通静态课件的单行修订要求，勿附源码或链接。")
    return original


def admit(user, artifact, payload):
    if artifact.artifact_type != "slide-deck" or artifact.self_workspace_id is not None:
        return payload
    enabled_course = ordinary_teaching_course(artifact.dojo_id)
    reject_source_selection(payload.get("instruction"), include_wording=enabled_course)
    if not enabled_course:
        return payload
    command = layout_request(payload.get("instruction"))
    is_deck = command is None
    if is_deck:
        if (ordinary_slide_wording_request(payload.get("instruction"))
                or not _ordinary_deck_request(payload.get("instruction"))):
            return payload
        if not isinstance(payload.get("currentContent"), dict) or not ordinary_static_lesson(
            payload["currentContent"], allow_missing_layout=True,
        ):
            return payload
        _deck_instruction(payload.get("instruction"))
    _scope(user, artifact)
    if not config.HARNESS_DEEPSEEK_MODEL or not upstream_enabled():
        raise OrdinarySlideLayoutError("当前课程未配置普通课件版式修订服务。")
    revision, _ = _source(artifact, payload["expectedRevision"], "all" if is_deck else command[1])
    return {
        **payload, "allowDegraded": False, "revisionBackend": DECK_BACKEND if is_deck else BACKEND,
        (DECK_PIN if is_deck else PIN): {
            "artifactId": artifact.id, "revisionId": revision.id,
            "revisionSha256": revision.content_hash,
            "instructionSha256": content_hash(payload["instruction"]),
            "model": config.HARNESS_DEEPSEEK_MODEL,
        },
    }


def deck_pinned(payload):
    return DECK_PIN in payload or payload.get("revisionBackend") == DECK_BACKEND


def pinned(payload):
    return deck_pinned(payload) or PIN in payload or payload.get("revisionBackend") == BACKEND


def model(payload):
    return (payload.get(DECK_PIN if deck_pinned(payload) else PIN) or {}).get("model")


def prepare(job, payload, *, lock=False):
    reject_source_selection(payload.get("instruction"))
    is_deck = deck_pinned(payload)
    pin_key = DECK_PIN if is_deck else PIN
    backend = DECK_BACKEND if is_deck else BACKEND
    pin = payload.get(pin_key)
    if ((is_deck and PIN in payload) or payload.get("revisionBackend") != backend or not isinstance(pin, dict)
            or not config.HARNESS_DEEPSEEK_MODEL or pin.get("model") != config.HARNESS_DEEPSEEK_MODEL
            or not upstream_enabled() or job.kind != "artifact.revise" or payload.get("workspaceId")):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    owner = Users.query.filter_by(id=job.owner_id).populate_existing().first()
    artifacts = TeachingArtifacts.query.filter_by(
        id=payload.get("artifactId"), owner_id=job.owner_id, dojo_id=job.dojo_id,
        module_index=job.module_index, self_workspace_id=None, artifact_type="slide-deck",
    )
    if lock:
        artifacts = artifacts.with_for_update()
    artifact = artifacts.populate_existing().first()
    if owner is None or artifact is None or artifact.id != pin.get("artifactId"):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    _scope(owner, artifact)
    instruction = payload.get("instruction")
    command = (_deck_instruction(instruction), "all") if is_deck else layout_request(instruction)
    if command is None or pin.get("instructionSha256") != content_hash(instruction):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    intent, pages = command
    revision, _ = _source(artifact, payload.get("expectedRevision"), pages)
    if (revision.id, revision.content_hash) != (pin.get("revisionId"), pin.get("revisionSha256")):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    return {
        pin_key: pin, "revisionBackend": backend, "artifactType": "slide-deck",
        "artifactId": artifact.id, "expectedRevision": revision.revision,
        "instruction": intent, "currentContent": revision.content,
        **({} if is_deck else {"pageSelection": pages}),
    }


def wire_payload(payload):
    return {key: value for key, value in payload.items() if key not in {PIN, DECK_PIN}}


def _except_fields(record, *fields):
    return {key: value for key, value in record.items() if key not in fields}


def _slide_semantics(slide, *, legacy_migration=False):
    native = slide["content"]
    studio = native["studio"]
    semantic_page = _except_fields(studio["page"], "layout")
    if legacy_migration:
        semantic_page.pop("legacyCompositionTypography", None)
    return (
        _except_fields(slide, "content"),
        _except_fields(native, "studio", "elements"),
        _except_fields(studio, "page"),
        semantic_page,
    )


def _legacy_migration(old, new):
    source = old["content"]["studio"]["page"]
    revised = new["content"]["studio"]["page"]
    return (
        "layout" not in source and "legacyCompositionTypography" not in source
        and isinstance(revised.get("layout"), dict) and revised.get("legacyCompositionTypography") is True
    )


def _displayed_pages(slides):
    def rank(row):
        index, slide = row
        order = slide.get("order")
        if type(order) in (int, float) and abs(order) <= 1.7976931348623157e308 and math.isfinite(order):
            return order
        return index
    return [slide for _, slide in sorted(enumerate(slides), key=rank)]


def _page_id(slide):
    return slide["content"]["studio"]["page"]["id"]


def validate_receipt(route, payload, response):
    meta = response.get("model") or {}
    result = response.get("result") or {}
    content = result.get("content")
    if deck_pinned(payload):
        _validate_deck_receipt(route, payload, meta, content)
        return
    before = ordinary_static_lesson(payload["currentContent"], allow_missing_layout=True)
    after = ordinary_static_lesson(content, allow_missing_layout=True)
    revision = content.get("revisionMetadata") if isinstance(content, dict) else None
    if (meta.get("executionMode") != BACKEND or meta.get("provider") != "deepseek"
            or meta.get("degraded") is not False or meta.get("actualModel") != route.get("required_model")
            or not isinstance(revision, dict) or revision.get("mode") != BACKEND
            or before is None or after is None):
        raise OrdinarySlideLayoutError("版式修订未取得指定教学模型和浏览器检查的成功回执。")
    if (_except_fields(payload["currentContent"], "lesson", "revisionMetadata")
            != _except_fields(content, "lesson", "revisionMetadata")
            or _except_fields(before, "artifacts", "updatedAt") != _except_fields(after, "artifacts", "updatedAt")):
        raise OrdinarySlideLayoutError("版式修订改变了课件正文或其他元数据。")
    source = before["artifacts"]
    output = after["artifacts"]
    ids = [_page_id(slide) for slide in source]
    if [_page_id(slide) for slide in output] != ids:
        raise OrdinarySlideLayoutError("版式修订改变了课件页标识或顺序。")
    displayed = [_page_id(slide) for slide in _displayed_pages(source)]
    selection = payload["pageSelection"]
    selected = displayed if selection == "all" else [item for index, item in enumerate(displayed, 1) if index in selection]
    changed_ids = {page_id for page_id, old, new in zip(ids, source, output) if old != new}
    changed = [page_id for page_id in displayed if page_id in changed_ids]
    if (revision.get("pageIds") != selected or not changed or revision.get("changedPageIds") != changed
            or not set(changed).issubset(selected)):
        raise OrdinarySlideLayoutError("版式修订修改了未选择的页面，或未生成可保存的变更。")
    for old, new in zip(source, output):
        legacy_migration = _legacy_migration(old, new)
        if _slide_semantics(old, legacy_migration=legacy_migration) != _slide_semantics(new, legacy_migration=legacy_migration):
            raise OrdinarySlideLayoutError("版式修订改变了教学文字、素材或其他页面信息。")
    _validate_render_evidence(revision, selected)


def _validate_render_evidence(revision, selected):
    evidence = revision.get("renderEvidence")
    if (not isinstance(evidence, list)
            or any(not isinstance(item, dict) or item.get("mode") != "headless-chromium-dom-and-pixels"
                   or not re.fullmatch(r"[a-f0-9]{64}", str(item.get("sourceSha256") or ""))
                   or not item.get("inspectedAt")
                   or not isinstance(item.get("frames"), list) or not item["frames"]
                   or any(not isinstance(frame, dict) or frame.get("step") != -1
                          or not re.fullmatch(r"[a-f0-9]{64}", str(frame.get("screenshotSha256") or ""))
                          for frame in item["frames"])
                   for item in evidence)):
        raise OrdinarySlideLayoutError("版式修订缺少浏览器检查回执。")
    if [item.get("pageId") for item in evidence] != selected:
        raise OrdinarySlideLayoutError("版式修订的浏览器检查范围与本次选择不一致。")


def _validate_deck_receipt(route, payload, meta, content):
    before = ordinary_static_lesson(payload["currentContent"], allow_missing_layout=True)
    after = ordinary_static_lesson(content, allow_missing_layout=True)
    revision = content.get("revisionMetadata") if isinstance(content, dict) else None
    usage = meta.get("usage")
    if (
        meta.get("executionMode") != DECK_BACKEND or meta.get("provider") != "deepseek"
        or meta.get("actualModel") != route.get("required_model") or meta.get("degraded") is not False
        or not isinstance(usage, dict) or not all(
            type(usage.get(key)) is int and usage[key] >= 0 for key in ("inputTokens", "outputTokens", "totalTokens")
        ) or usage["inputTokens"] + usage["outputTokens"] <= 0
        or not isinstance(revision, dict) or revision.get("mode") != DECK_BACKEND
        or before is None or after is None or before.get("id") != after.get("id")
    ):
        raise OrdinarySlideLayoutError("整套课件修订缺少指定模型或静态课件的有效回执。")
    old, new = before["artifacts"], after["artifacts"]
    output_ids = [_page_id(slide) for slide in new]
    if revision.get("recomposed") is False:
        target_ids = revision.get("pageIds")
        if (
            [_page_id(slide) for slide in old] != output_ids or old == new
            or not isinstance(target_ids, list) or not target_ids
            or any(not isinstance(page_id, str) or page_id not in output_ids for page_id in target_ids)
            or len(set(target_ids)) != len(target_ids)
            or any(source != output and page_id not in target_ids
                   for page_id, source, output in zip(output_ids, old, new))
        ):
            raise OrdinarySlideLayoutError("文字修订改变了课件页标识、超出所选范围或未产生有效修改。")
    elif revision.get("recomposed") is True:
        requested = revision.get("requestedPages")
        if (not isinstance(requested, dict) or requested.get("explicit") is not True
                or type(requested.get("min")) is not int or type(requested.get("max")) is not int
                or not 1 <= requested["min"] <= len(new) <= requested["max"] <= 120
                or requested["min"] <= len(old) <= requested["max"]):
            raise OrdinarySlideLayoutError("整套课件修订回执与请求的页数不一致。")
        target_ids = output_ids
    else:
        raise OrdinarySlideLayoutError("整套课件修订回执缺少修订方式。")
    _validate_render_evidence(revision, target_ids)
