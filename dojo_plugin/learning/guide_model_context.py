import math
import re

from .evidence import redact_text
from .tutor_context import RESTRICTED_TUTOR_REQUEST


CONTEXT_VERSION = "guide-teaching-context-v1"
RAW_TECHNICAL_TEXT = re.compile(
    r"```|-----BEGIN [^-]+ KEY-----|(?im:^[ \t]*(?:\$ |PS [^>\n]*>|(?:INFO|ERROR|DEBUG|WARN|TRACE)\s*[:\[]))"
    r"|Traceback \(most recent call last\):|(?:提交|查看|分析|检查).{0,8}(?:终端日志|命令输出|容器状态|真实实验过程)"
    r"|\b(?:student[_ -]?id|learner[_ -]?id|user[_ -]?id)\s*[:=]|(?:学号|用户编号)\s*[:：=]",
    re.IGNORECASE,
)


def guide_teaching_text(value, limit):
    if not isinstance(value, str) or RESTRICTED_TUTOR_REQUEST.search(value) or RAW_TECHNICAL_TEXT.search(value):
        return ""
    return redact_text(value, limit=limit).strip()


def _aggregates(value, fields):
    return {
        key: value[key] for key in fields
        if key in value and type(value[key]) in (int, float) and (type(value[key]) is int or math.isfinite(value[key])) and value[key] >= 0
    }


def guide_model_context(question, history, scope, profile, references, navigation):
    profile_summary = profile.get("summary")
    if not isinstance(profile_summary, dict):
        profile_summary = {}
    return {
        "question": guide_teaching_text(question, 6000),
        "conversation": [
            {"role": item["role"], "content": content}
            for item in history[-4:]
            if item.get("role") in {"user", "assistant"}
            and (content := guide_teaching_text(item.get("content"), 700))
        ],
        "scope": {"mode": scope["mode"], "referenceIds": list(scope["referenceIds"])},
        "learningProfile": _aggregates(profile_summary, (
            "enrolledCourses", "completedExercises", "attempts", "averageMastery",
        )) if not references else {},
        "referencedStudyContexts": [
            {
                "id": item["id"],
                "course": guide_teaching_text(item.get("course"), 160),
                "unit": guide_teaching_text(item.get("unit"), 160),
                "exercise": guide_teaching_text(item.get("exercise"), 160),
                "completed": item.get("completed") is True,
                "objectives": [
                    content for objective in (item.get("objectives") or [])[:8]
                    if (content := guide_teaching_text(objective, 180))
                ],
                **_aggregates(item, ("attemptCount",)),
            }
            for item in references
        ],
        "navigationOptions": [
            {"id": identifier, "title": title}
            for identifier, item in navigation.items()
            if (title := guide_teaching_text(item.get("title"), 160))
        ],
    }
