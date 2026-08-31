"""Dependency-free helpers for deterministic open-answer grade mapping."""


def build_open_grade_questions(items, answers):
    return [
        {
            "itemIndex": index,
            "itemId": item.id,
            "question": item.prompt or item.title,
            "answer": str(answers.get(item.id) or "")[:12000],
            "points": float(item.points),
            "referenceAnswer": str(
                (item.config or {}).get("referenceAnswer") or ""
            )[:12000],
            "rubric": str((item.config or {}).get("rubric") or "")[:8000],
            "keywords": (item.config or {}).get("keywords") or [],
        }
        for index, item in enumerate(items, 1)
    ]


def map_open_grade_rows(rows, items):
    """Map model rows onto server-owned ids, falling back to a bounded index.

    Model-returned identifiers are untrusted.  A valid one-based ``itemIndex``
    keeps grading deterministic when a provider rewrites or omits ``itemId``.
    """

    by_id = {}
    points = {item.id: float(item.points) for item in items}
    ordered_ids = [item.id for item in items]
    for row in rows:
        if not isinstance(row, dict):
            continue
        item_id = str(row.get("itemId") or "")
        if item_id not in points:
            try:
                item_index = int(row.get("itemIndex") or 0)
            except (TypeError, ValueError):
                item_index = 0
            item_id = (
                ordered_ids[item_index - 1]
                if 1 <= item_index <= len(ordered_ids)
                else ""
            )
        if not item_id and len(ordered_ids) == 1 and len(rows) == 1:
            item_id = ordered_ids[0]
        if item_id not in points or item_id in by_id:
            continue
        try:
            score = max(0.0, min(points[item_id], float(row.get("score") or 0)))
            confidence = max(
                0.0,
                min(1.0, float(row.get("confidence") or 0.7)),
            )
        except (TypeError, ValueError):
            continue
        feedback = str(row.get("feedback") or "").strip()
        if len(feedback) > 4000:
            continue
        by_id[item_id] = {
            "score": score,
            "feedback": feedback,
            "confidence": confidence,
        }
    return by_id
