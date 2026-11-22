"""Dependency-free helpers for deterministic open-answer grade mapping."""

import math


def build_open_grade_questions(items, answers):
    return [
        {
            "itemIndex": index,
            "itemId": item.id,
            "question": item.prompt or item.title,
            "answer": "" if answers.get(item.id) is None else str(answers[item.id])[:12000],
            "points": float(item.points),
            "referenceAnswer": str(
                (item.config or {}).get("referenceAnswer") or ""
            )[:12000],
            "rubric": str((item.config or {}).get("rubric") or "")[:8000],
            "keywords": (item.config or {}).get("keywords") or [],
        }
        for index, item in enumerate(items, 1)
    ]


def _grade_item_index(value):
    if type(value) is int:
        return value
    if isinstance(value, str) and value.strip().isdecimal():
        try:
            return int(value)
        except ValueError:
            return None
    return None


def map_open_grade_rows(rows, items):
    """Map model rows onto server-owned ids, falling back to a bounded index.

    Model-returned identifiers are untrusted.  A valid one-based ``itemIndex``
    keeps grading deterministic when a provider rewrites or omits ``itemId``.
    If both identify different questions, there is no reliable mapping.
    """

    by_id = {}
    seen = set()
    points = {item.id: float(item.points) for item in items}
    ordered_ids = [item.id for item in items]
    for row in rows:
        if not isinstance(row, dict):
            continue
        supplied_id = row.get("itemId")
        item_id = str(supplied_id or "")
        item_index = _grade_item_index(row.get("itemIndex"))
        indexed_id = (
            ordered_ids[item_index - 1]
            if item_index is not None and 1 <= item_index <= len(ordered_ids)
            else None
        )
        if row.get("itemIndex") is not None and indexed_id is None:
            continue
        if item_id not in points:
            item_id = indexed_id
        elif indexed_id is not None and item_id != indexed_id:
            continue
        if (
            item_id is None and supplied_id in (None, "") and row.get("itemIndex") is None
            and len(ordered_ids) == 1 and len(rows) == 1
        ):
            item_id = ordered_ids[0]
        if item_id not in points:
            continue
        if item_id in seen:
            # Competing rows cannot choose a student's grade by response order.
            by_id.pop(item_id, None)
            continue
        seen.add(item_id)
        raw_score = row.get("score")
        raw_confidence = row.get("confidence", 0.7)
        if isinstance(raw_score, bool) or isinstance(raw_confidence, bool):
            continue
        try:
            score = float(raw_score)
            confidence = float(raw_confidence)
        except (TypeError, ValueError, OverflowError):
            continue
        if not math.isfinite(score) or not math.isfinite(confidence):
            continue
        feedback = str(row.get("feedback") or "").strip()
        if len(feedback) > 4000:
            continue
        by_id[item_id] = {
            "score": max(0.0, min(points[item_id], score)),
            "feedback": feedback,
            "confidence": max(0.0, min(1.0, confidence)),
        }
    return by_id
