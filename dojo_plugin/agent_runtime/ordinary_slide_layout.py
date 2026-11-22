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


_PALETTE_DECK = r"(?:整套|整份|全套|整个|全部)(?:课件|幻灯片|PPT)"
_PALETTE_STYLE = (
    r"(?:暖色(?:调)?|冷色(?:调)?|浅色|深色|高对比(?:度)?|低饱和(?:度)?|黑白|"
    r"蓝白(?:色)?|蓝绿(?:色)?|红白(?:色)?|蓝色|绿色|橙色|紫色|棕色)"
)
_PALETTE_REQUEST = re.compile(
    rf"(?:请\s*)?(?:只|仅)?\s*(?:"
    rf"(?:把|将)?\s*(?P<direct_target>{_PALETTE_DECK}|{_PAGE_NUMBERS.pattern})"
    r"\s*(?:的)?(?:配色|色调|颜色|色彩|主题)?\s*"
    rf"(?:改成|改为|换成|换为|调整为|统一成|统一为|使用|采用)\s*{_PALETTE_STYLE}(?:配色|色调|主题)?"
    rf"|(?:调整|修改|更换|统一|切换)\s*(?P<other_target>{_PALETTE_DECK}|{_PAGE_NUMBERS.pattern})"
    r"\s*(?:的)?(?:配色|色调|颜色|色彩|主题)"
    rf"\s*(?:：|:|为|成)\s*{_PALETTE_STYLE}(?:配色|色调|主题)?"
    r")[。！!]?",
    re.I,
)
_PALETTE_FIELDS = ("background", "foreground", "muted", "accent", "secondary", "surface")
_PALETTE_HEX = re.compile(r"#[a-fA-F0-9]{6}")
_PALETTE_TEXT_STYLE = re.compile(r'\A<p style="[^"]*?;color:(#[a-fA-F0-9]{6});[^"]*">')


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


def _palette_request(instruction):
    """Return the explicitly requested display pages, or the whole-deck marker."""
    original, _ = split_source_selection(instruction)
    match = _PALETTE_REQUEST.fullmatch(original)
    if match is None:
        return None
    target = match["direct_target"] or match["other_target"]
    if not target.startswith("第"):
        return "all"
    if not target.endswith("页"):
        raise OrdinarySlideLayoutError("请完整指定要调整配色的显示页码，例如“第1、2页”。")
    pages = sorted(int(value) for value in re.findall(r"[0-9]+", target))
    if not all(1 <= page <= 120 for page in pages) or len(pages) != len(set(pages)):
        raise OrdinarySlideLayoutError("按页配色需要有效且不重复的显示页码。")
    return pages


def _palette_colors(theme):
    if not isinstance(theme, dict) or not isinstance(theme.get("name"), str) or not theme["name"].strip():
        return None
    colors = {key: theme.get(key) for key in _PALETTE_FIELDS}
    return colors if all(isinstance(color, str) and _PALETTE_HEX.fullmatch(color) for color in colors.values()) else None


def _palette_source(content, lesson):
    if "subjectProfile" in content:
        return False
    design = content.get("coursewareDesign")
    if isinstance(design, dict) and "theme" in design and _palette_colors(design["theme"]) is None:
        return False
    for slide in lesson["artifacts"]:
        native = slide["content"]
        colors = _palette_colors(native["studio"].get("theme"))
        if colors is None:
            return False
        if "background" in native:
            background = native["background"]
            if (not isinstance(background, dict) or background.get("type") != "solid"
                    or background.get("color") != colors["background"]):
                return False
    return True


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
    palette_pages = _palette_request(payload.get("instruction")) if is_deck else None
    is_palette = palette_pages is not None
    if is_deck:
        if (ordinary_slide_wording_request(payload.get("instruction"))
                or not (is_palette or _ordinary_deck_request(payload.get("instruction")))):
            return payload
        source = payload.get("currentContent")
        lesson = ordinary_static_lesson(source, allow_missing_layout=True)
        if lesson is None or (is_palette and not _palette_source(source, lesson)):
            return payload
        _deck_instruction(payload.get("instruction"))
    _scope(user, artifact)
    if not config.HARNESS_DEEPSEEK_MODEL or not upstream_enabled():
        raise OrdinarySlideLayoutError("当前课程未配置普通课件修订服务。")
    pages = (palette_pages or "all") if is_deck else command[1]
    revision, lesson = _source(artifact, payload["expectedRevision"], pages)
    if is_palette and not _palette_source(revision.content, lesson):
        return payload
    return {
        **payload, "allowDegraded": False, "revisionBackend": DECK_BACKEND if is_deck else BACKEND,
        (DECK_PIN if is_deck else PIN): {
            "artifactId": artifact.id, "revisionId": revision.id,
            "revisionSha256": revision.content_hash,
            "instructionSha256": content_hash(payload["instruction"]),
            "model": config.HARNESS_DEEPSEEK_MODEL,
            **({"operation": "palette"} if is_palette else {}),
            **({"pageSelection": palette_pages} if isinstance(palette_pages, list) else {}),
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
    operation = pin.get("operation")
    if "operation" in pin or "pageSelection" in pin:
        palette_pages = _palette_request(instruction)
        if (not is_deck or operation != "palette" or palette_pages is None
                or ("pageSelection" in pin) != isinstance(palette_pages, list)
                or not _palette_equal(palette_pages, pin.get("pageSelection", "all"))):
            raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
        pages = palette_pages
    revision, lesson = _source(artifact, payload.get("expectedRevision"), pages)
    if ((revision.id, revision.content_hash) != (pin.get("revisionId"), pin.get("revisionSha256"))
            or (operation == "palette" and not _palette_source(revision.content, lesson))):
        raise OrdinarySlideLayoutError(_SOURCE_CHANGED)
    return {
        pin_key: pin, "revisionBackend": backend, "artifactType": "slide-deck",
        "artifactId": artifact.id, "expectedRevision": revision.revision,
        "instruction": intent, "currentContent": revision.content,
        **({"deckOperation": operation} if operation == "palette" else {}),
        **({"pageSelection": pages} if not is_deck or isinstance(pages, list) else {}),
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
    pin = payload.get(DECK_PIN)
    if isinstance(pin, dict) and pin.get("operation") == "palette":
        if (
            not isinstance(pin.get("model"), str) or not pin["model"] or route.get("required_model") != pin["model"]
            or content_hash(payload["currentContent"]) != pin.get("revisionSha256")
            or ("pageSelection" in pin) != ("pageSelection" in payload)
            or not _palette_equal(pin.get("pageSelection"), payload.get("pageSelection"))
        ):
            raise OrdinarySlideLayoutError("配色修订回执与已锁定的课件和页码不一致。")
        _validate_palette_receipt(
            payload["currentContent"], content, before, after, revision, pin.get("pageSelection", "all"),
        )
        return
    if revision.get("operation") == "palette":
        raise OrdinarySlideLayoutError("课件修订回执与已锁定的请求不一致。")
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


def _palette_equal(left, right):
    # JavaScript round-trips numbers without preserving int/float spelling.
    # Boolean values must still remain distinct from numeric geometry and data.
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(_palette_equal(value, right[key]) for key, value in left.items())
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(_palette_equal(a, b) for a, b in zip(left, right))
    return isinstance(left, bool) == isinstance(right, bool) and left == right


def _palette_element_matches(before, after, original, palette):
    element_type = before["type"]
    if element_type == "text":
        old_color, new_color = before.get("defaultColor"), after.get("defaultColor")
        source = before["content"]
        style = _PALETTE_TEXT_STYLE.match(source)
        roles = [role for role in ("foreground", "muted") if old_color == original[role]]
        if not roles:
            return _palette_equal(before, after)
        if not style or style.group(1) != old_color or not any(new_color == palette[role] for role in roles):
            return False
        return _palette_equal({
            **before, "defaultColor": new_color,
            "content": source[:style.start(1)] + new_color + source[style.end(1):],
        }, after)
    element_id = before.get("id")
    if element_type == "shape" and isinstance(element_id, str) and element_id.startswith("image-label-backdrop-"):
        return before.get("fill") == original["surface"] and _palette_equal({**before, "fill": palette["surface"]}, after)
    if element_type == "line":
        role = ("accent" if element_id == "table-header-rule"
                else "surface" if isinstance(element_id, str) and re.fullmatch(r"row-rule-[0-9]+", element_id)
                else None)
        if role:
            return before.get("color") == original[role] and _palette_equal({**before, "color": palette[role]}, after)
    if element_type == "chart" and element_id == "evidence-chart":
        roles = ("accent", "secondary", "muted")
        return (
            before.get("themeColors") == [original[role] for role in roles]
            and before.get("textColor") == original["foreground"] and before.get("lineColor") == original["surface"]
            and _palette_equal({
                **before, "themeColors": [palette[role] for role in roles],
                "textColor": palette["foreground"], "lineColor": palette["surface"],
            }, after)
        )
    return _palette_equal(before, after)


def _palette_slide_matches(before, after, palette):
    old, new = before["content"], after["content"]
    old_studio, new_studio = old["studio"], new["studio"]
    original = _palette_colors(old_studio.get("theme"))
    if (
        original is None or not _palette_equal({**old_studio["theme"], **palette}, new_studio.get("theme"))
        or not _palette_equal(_except_fields(old_studio, "theme"), _except_fields(new_studio, "theme"))
        or not _palette_equal(_except_fields(before, "content"), _except_fields(after, "content"))
        or not _palette_equal(_except_fields(old, "studio", "background", "elements"),
                              _except_fields(new, "studio", "background", "elements"))
        or ("background" in old) != ("background" in new)
        or ("elements" in old) != ("elements" in new)
    ):
        return False
    if "background" in old and not _palette_equal({**old["background"], "color": palette["background"]}, new["background"]):
        return False
    left, right = old.get("elements", []), new.get("elements", [])
    return len(left) == len(right) and all(
        _palette_element_matches(source, output, original, palette) for source, output in zip(left, right)
    )


def _validate_palette_receipt(source, result, before, after, revision, pages):
    old, new = before["artifacts"], after["artifacts"]
    displayed = [_page_id(slide) for slide in _displayed_pages(old)]
    if pages == "all":
        selected = displayed
    elif (
        not isinstance(pages, list) or not pages
        or any(type(page) is not int or not 1 <= page <= len(displayed) for page in pages)
        or pages != sorted(set(pages))
    ):
        raise OrdinarySlideLayoutError("配色修订回执缺少有效的显示页码。")
    else:
        selected = [displayed[page - 1] for page in pages]
    selected_ids = set(selected)
    returned = {_page_id(slide): slide for slide in new}
    first = returned.get(selected[0])
    palette = _palette_colors(first["content"]["studio"].get("theme")) if first else None
    if (
        set(revision) != {"mode", "operation", "recomposed", "pageIds", "renderEvidence"}
        or revision.get("operation") != "palette" or revision.get("recomposed") is not False
        or revision.get("pageIds") != selected or palette is None or not _palette_source(source, before)
        or not _palette_equal(_except_fields(source, "lesson", "revisionMetadata", "coursewareDesign"),
                              _except_fields(result, "lesson", "revisionMetadata", "coursewareDesign"))
        or not _palette_equal(_except_fields(before, "artifacts", "updatedAt"), _except_fields(after, "artifacts", "updatedAt"))
        or type(after.get("updatedAt")) is not int or after["updatedAt"] < 0
        or len(old) != len(new)
        or not all(
            _palette_slide_matches(left, right, palette) if _page_id(left) in selected_ids else _palette_equal(left, right)
            for left, right in zip(old, new)
        )
    ):
        raise OrdinarySlideLayoutError("配色修订改变了颜色以外的课件内容，或未覆盖指定页面。")

    old_design, new_design = source.get("coursewareDesign"), result.get("coursewareDesign")
    if pages == "all" and isinstance(old_design, dict) and "theme" in old_design:
        old_design = {**old_design, "theme": {**old_design["theme"], **palette}}
    if ("coursewareDesign" in source) != ("coursewareDesign" in result) or not _palette_equal(old_design, new_design):
        raise OrdinarySlideLayoutError("整套配色修订改变了颜色以外的设计信息。")
    if not any(
        any(slide["content"]["studio"]["theme"][key].lower() != color.lower() for key, color in palette.items())
        for slide in old if _page_id(slide) in selected_ids
    ):
        raise OrdinarySlideLayoutError("所选页面没有可保存的颜色变化。")
    _validate_render_evidence(revision, selected)
