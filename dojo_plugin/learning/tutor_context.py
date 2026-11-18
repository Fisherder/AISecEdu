import re

from .evidence import redact_text


RESTRICTED_TUTOR_REQUEST = re.compile(
    r"利用链|可复制.{0,5}(?:命令|载荷)|复现.{0,8}(?:漏洞|攻击)|(?:漏洞|攻击).{0,8}复现|"
    r"生成.{0,8}(?:利用|载荷|攻击脚本)|(?:绕过|规避).{0,8}(?:检测|拦截|鉴权)|"
    r"(?:给我|写出|告诉我).{0,8}(?:命令|最终答案|验证答案|私有解法)|"
    r"\b(?:exploit payload|exploit chain|reproduce (?:the )?(?:exploit|attack)|reverse shell)\b",
    re.IGNORECASE,
)
SAFE_OBSERVATIONS = {
    "attempt.reflection.saved": ("PLATFORM", "已保存学习反思"),
    "attempt.submitted": ("PLATFORM", "已提交本次学习尝试"),
    "assessment.created": ("ASSESSMENT", "已有形成性评估"),
    "simulation.objective.evaluated": ("ORACLE", "已记录互动学习目标的核验"),
}


def tutor_observations(events, verified):
    if not verified:
        return []
    observations = []
    for event in reversed(events):
        expected = SAFE_OBSERVATIONS.get(event.event_type)
        if expected and event.source == expected[0] and event.trust_level >= 2 and expected[1] not in observations:
            observations.append(expected[1])
    return observations


def tutor_model_input(question, lesson, observations):
    def excerpts(value):
        return [
            redact_text(item, limit=300) for item in value[:12]
            if isinstance(item, str) and not RESTRICTED_TUTOR_REQUEST.search(item)
        ] if isinstance(value, list) else []

    return {
        "question": question,
        "course": redact_text(lesson.get("course") or "", limit=200),
        "unit": redact_text(lesson.get("unit") or "", limit=200),
        "exercise": redact_text(lesson.get("exercise") or "", limit=200),
        "objectives": excerpts(lesson.get("objectives")),
        "publicHints": excerpts(lesson.get("publicHints")),
        "verifiedObservations": observations,
    }
