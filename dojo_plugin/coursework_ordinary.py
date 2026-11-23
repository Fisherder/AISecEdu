from .agent_runtime.upstream_turn import invoke_turn, ordinary_teaching_course, request_body, result_object, upstream_enabled


LEGACY_ASSIGNMENT_ROUTE = "legacy"
ORDINARY_ASSIGNMENT_ROUTE = "ordinary-dsh"
ORDINARY_ASSIGNMENT_SOURCE = "official-dsh-text-turn"
ORDINARY_ASSIGNMENT_KINDS = {"HOMEWORK", "QUIZ"}
ITEM_CONFIG_FIELDS = {
    "MULTIPLE_CHOICE": {"choices", "correctAnswer", "explanation"},
    "TRUE_FALSE": {"correctAnswer", "explanation"},
    "SHORT_ANSWER": {"referenceAnswer", "keywords", "rubric"},
    "DEBATE": {"referenceAnswer", "keywords", "rubric"},
}
ORDINARY_DRAFT_ROLE = (
    "你是普通知识课程的作业设计教师。仅根据课程和教师要求编写学生用文字作答的独立题目。"
    "请依据相关学科原理出题，涉及数学算例时逐题复算。"
    "不生成实践、实验、平台挑战、需要外部工具或实时数据的任务。"
    "如果要求超出普通知识测验范围，返回空的 items 数组。每道题只填写该题型要求的 config 字段。"
    "简答和辩论的 rubric 用文字，keywords 用文字数组。"
    "不要在题干、标题、描述或学生说明中泄露教师答案和评分细则。"
)


def use_ordinary_assignment(dojo_id, kind, challenge_ids):
    return kind in ORDINARY_ASSIGNMENT_KINDS and (challenge_ids is None or challenge_ids == []) and ordinary_teaching_course(dojo_id)


def ordinary_assignment_turn(system, context):
    if not upstream_enabled():
        raise ValueError("普通作业的教学模型服务当前未启用")
    turn = invoke_turn(request_body(system, context))
    try:
        return result_object(turn["text"]), turn["model"]
    except ValueError:
        raise ValueError("普通作业的教学模型服务未返回有效的 JSON 对象") from None


def _nonempty_text(value, limit):
    return isinstance(value, str) and 0 < len(value.strip()) <= limit


def normalize_ordinary_item(raw, index, normalize_item):
    if not isinstance(raw, dict) or set(raw) - {"type", "title", "prompt", "points", "config"}:
        return None
    kind, config = raw.get("type"), raw.get("config")
    if not isinstance(kind, str) or kind not in ITEM_CONFIG_FIELDS:
        return None
    if not isinstance(config, dict) or set(config) != ITEM_CONFIG_FIELDS[kind]:
        return None
    if not _nonempty_text(raw.get("title"), 240) or not _nonempty_text(raw.get("prompt"), 16000):
        return None
    points = raw.get("points")
    if type(points) not in {int, float} or not 1 <= points <= 1000:
        return None
    if kind == "MULTIPLE_CHOICE":
        choices = config["choices"]
        if (
            not isinstance(choices, list) or not 2 <= len(choices) <= 12
            or not all(_nonempty_text(choice, 1000) and choice == choice.strip() for choice in choices)
            or len(set(choices)) != len(choices) or config["correctAnswer"] not in choices
        ):
            return None
    elif kind == "TRUE_FALSE" and type(config["correctAnswer"]) is not bool:
        return None
    if kind in {"MULTIPLE_CHOICE", "TRUE_FALSE"}:
        if not _nonempty_text(config["explanation"], 16000):
            return None
    else:
        if not all(_nonempty_text(config[key], 16000) for key in ("referenceAnswer", "rubric")):
            return None
        keywords = config["keywords"]
        if not isinstance(keywords, list) or not 1 <= len(keywords) <= 30 or not all(
            _nonempty_text(keyword, 240) for keyword in keywords
        ):
            return None
    return normalize_item(raw, index)
