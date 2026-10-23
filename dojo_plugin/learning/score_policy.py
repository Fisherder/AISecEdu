import math


COMPLETION_SCORE_MINIMUM = 90
SCORE_POLICY_VERSION = "practice-bonus/2026-10-10"
SCORE_NOTICE = "本次 AI 智能评分为实践附加分，不代表课程总成绩。"


def completion_score_policy(objective_score, process_score, *, verified):
    objective = float(objective_score)
    process = float(process_score)
    if not math.isfinite(objective) or not math.isfinite(process):
        raise ValueError("评分必须是有限数值")
    base = round(max(0, min(60, objective)) + max(0, min(40, process)), 2)
    total = max(COMPLETION_SCORE_MINIMUM, base) if verified else base
    return {
        "version": SCORE_POLICY_VERSION,
        "kind": "BONUS",
        "notice": SCORE_NOTICE,
        "verified": bool(verified),
        "minimumScore": COMPLETION_SCORE_MINIMUM if verified else None,
        "baseScore": base,
        "completionCredit": round(total - base, 2),
        "totalScore": total,
        "maxScore": 100,
    }
