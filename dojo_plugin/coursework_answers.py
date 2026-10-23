import re


def resolve_choice_answer(answer, choices):
    if not isinstance(choices, list) or len(choices) < 2 or len(set(choices)) != len(choices):
        raise ValueError("选择题必须包含至少两个互不重复的选项。")
    if isinstance(answer, int) and not isinstance(answer, bool):
        if 0 <= answer < len(choices):
            return choices[answer]
        raise ValueError("选择题答案下标超出选项范围。")
    if not isinstance(answer, str) or not answer.strip():
        raise ValueError("选择题缺少可确认的正确答案。")
    answer = answer.strip()
    if answer in choices:
        return answer
    label = re.fullmatch(r"([A-L])[.)、：:]?", answer, re.I)
    if label:
        index = ord(label.group(1).upper()) - ord("A")
        labeled = [choice for choice in choices if re.match(r"^" + label.group(1) + r"[.)、：:\s]", choice, re.I)]
        if len(labeled) == 1:
            return labeled[0]
        if not labeled and not any(re.match(r"^[A-L][.)、：:\s]", choice, re.I) for choice in choices) and index < len(choices):
            return choices[index]
        raise ValueError("选择题答案标签不能唯一对应选项。")
    matched = [choice for choice in choices if re.sub(r"^[A-L][.)、：:]\s*", "", choice, flags=re.I) == answer]
    if len(matched) == 1:
        return matched[0]
    raise ValueError("选择题答案不能唯一对应选项，不能默认选择第一项。")


def resolve_boolean_answer(answer):
    if isinstance(answer, bool):
        return answer
    if isinstance(answer, int) and answer in {0, 1}:
        return bool(answer)
    if isinstance(answer, str):
        value = answer.strip().casefold()
        if value in {"true", "1", "yes", "是", "正确", "对"}:
            return True
        if value in {"false", "0", "no", "否", "错误", "错"}:
            return False
    raise ValueError("判断题必须有明确的正确或错误答案。")
