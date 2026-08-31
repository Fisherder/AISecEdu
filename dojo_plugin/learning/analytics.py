import datetime

from sqlalchemy import func
from sqlalchemy.orm import joinedload

from CTFd.models import Solves, db

from ..models import (
    DojoChallenges,
    DojoModules,
    DojoUsers,
    LearningAssessments,
    LearningAttempts,
    LearningAuditEvents,
    LearningEvidenceEvents,
    LearningSkillStates,
    ObjectiveMappings,
    TeachingAssignments,
    TeachingAssignmentSubmissions,
)
from .standards import ABILITY_DIMENSIONS, ABILITY_LABELS


ANALYTICS_DEFINITION_VERSION = "2026-08-27.v1"
ANALYTICS_THRESHOLDS = {
    "minimumReliableClassSample": 3,
    "minimumReliableQuestionSample": 3,
    "riskHighScore": 45,
    "riskMediumScore": 25,
    "stalledActiveDays": 7,
    "stalledInterruptedDays": 3,
    "stalledMinimumInterruptions": 3,
    "masteryMinimumConfidence": 0.35,
    "masteryConcernScore": 60,
    "masteryHighRiskScore": 45,
    "evidenceCoverageMinimum": 45,
}


EVENT_LABELS = {
    "terminal.command.completed": "有效命令",
    "terminal.command.failed": "失败命令",
    "runtime.state.snapshot": "环境快照",
    "milestone.observed": "里程碑",
    "lab.started": "实验启动",
    "lab.interrupted": "实验中断",
    "lab.reset.requested": "环境重置",
    "lab.stopped": "实验停止",
    "simulation.started": "演示启动",
    "simulation.interrupted": "演示中断",
    "simulation.action.completed": "演示操作",
    "simulation.objective.evaluated": "目标验证",
    "attempt.reflection.saved": "学习反思",
    "attempt.submitted": "提交尝试",
    "assessment.created": "形成评估",
    "oracle.observed": "判题观测",
    "flag.compared": "Flag 校验",
    "policy.egress.denied": "安全策略拦截",
    "tutor.chat.assistant": "辅导回应",
    "tutor.chat.user": "辅导提问",
}


def _mean(values, digits=2):
    numbers = [float(value) for value in values if value is not None]
    return round(sum(numbers) / len(numbers), digits) if numbers else None


def _median(values):
    numbers = sorted(float(value) for value in values if value is not None)
    if not numbers:
        return 0.0
    middle = len(numbers) // 2
    if len(numbers) % 2:
        return numbers[middle]
    return (numbers[middle - 1] + numbers[middle]) / 2


def _rate(numerator, denominator):
    return round(float(numerator) / float(denominator), 4) if denominator else 0.0


def _timestamp(value):
    return value.isoformat() + "Z" if value else None


def _latest(*values):
    candidates = [value for value in values if value is not None]
    return max(candidates) if candidates else None


def _days_since(value, now):
    if not value:
        return None
    if value.tzinfo is not None:
        value = value.replace(tzinfo=None)
    return max(0, (now - value).days)


def _week_start(value):
    if value.tzinfo is not None:
        value = value.replace(tzinfo=None)
    day = value.date() - datetime.timedelta(days=value.weekday())
    return datetime.datetime.combine(day, datetime.time.min)


def _parse_timestamp(value):
    if not value:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed.replace(tzinfo=None) if parsed.tzinfo is not None else parsed


def _delta(current, baseline, digits=1):
    if current is None or baseline is None:
        return None
    return round(float(current) - float(baseline), digits)


def _metric(
    *,
    value,
    numerator,
    denominator,
    evidence_count,
    time_range,
    confidence,
    updated_at,
    definition,
    unavailable_reason=None,
    sample_size=None,
    coverage=None,
):
    unavailable = str(unavailable_reason or "").strip() or None
    return {
        "value": None if unavailable else value,
        "numerator": numerator,
        "denominator": denominator,
        "evidenceCount": max(0, int(evidence_count or 0)),
        "sampleSize": max(
            0,
            int(evidence_count if sample_size is None else sample_size or 0),
        ),
        "coverage": round(
            max(
                0.0,
                min(
                    1.0,
                    float(
                        coverage
                        if coverage is not None
                        else 1.0
                        if evidence_count
                        else 0.0
                    ),
                ),
            ),
            4,
        ),
        "timeRange": time_range,
        "confidence": round(max(0.0, min(1.0, float(confidence or 0))), 4),
        "updatedAt": _timestamp(updated_at),
        "definition": definition,
        "definitionVersion": ANALYTICS_DEFINITION_VERSION,
        "unavailableReason": unavailable,
    }


def learning_intervention_snapshot(student):
    return {
        "verifiedCompletion": student.get("verifiedCompletion"),
        "requiredSolved": student.get("requiredSolved"),
        "requiredTotal": student.get("requiredTotal"),
        "masteryScore": student.get("masteryScore"),
        "masteryConfidence": student.get("masteryConfidence"),
        "averageProcessScore": student.get("averageProcessScore"),
        "evidenceCount": student.get("evidenceCount"),
        "evidenceConfidence": student.get("evidenceConfidence"),
        "riskLevel": student.get("riskLevel"),
        "riskScore": student.get("riskScore"),
        "riskSignals": [
            item.get("code")
            for item in student.get("riskSignals", [])
            if isinstance(item, dict) and item.get("code")
        ],
        "lastActivity": student.get("lastActivity"),
    }


def _intervention_trend(changes):
    if int(changes.get("evidenceCount") or 0) <= 0:
        return "no_new_evidence", "尚无新增证据"
    positive = any(
        (
            (changes.get("completionPoints") or 0) >= 5,
            (changes.get("masteryPoints") or 0) >= 3,
            (changes.get("processPoints") or 0) >= 3,
            (changes.get("riskScoreReduction") or 0) >= 8,
        )
    )
    negative = any(
        (
            (changes.get("completionPoints") or 0) <= -5,
            (changes.get("masteryPoints") or 0) <= -3,
            (changes.get("processPoints") or 0) <= -3,
            (changes.get("riskScoreReduction") or 0) <= -8,
        )
    )
    if positive and negative:
        return "mixed", "变化不一致"
    if positive:
        return "improving", "同期改善"
    if negative:
        return "declining", "同期下降"
    return "unchanged", "暂无明显变化"


def _criterion_gaps(assessments):
    aggregates = {}
    for assessment in assessments:
        for criterion in assessment.criteria or []:
            if not isinstance(criterion, dict):
                continue
            maximum = float(criterion.get("maxScore") or 0)
            if maximum <= 0:
                continue
            identifier = str(criterion.get("id") or criterion.get("title") or "unknown")
            row = aggregates.setdefault(
                identifier,
                {
                    "id": identifier,
                    "label": str(criterion.get("title") or identifier),
                    "ratios": [],
                },
            )
            row["ratios"].append(float(criterion.get("score") or 0) / maximum)
    rows = [
        {
            "id": row["id"],
            "label": row["label"],
            "mastery": round(100 * sum(row["ratios"]) / len(row["ratios"]), 1),
            "evidenceCount": len(row["ratios"]),
        }
        for row in aggregates.values()
        if row["ratios"]
    ]
    return sorted(rows, key=lambda item: (item["mastery"], item["label"]))


def _student_risk(student, cohort_median):
    signals = []
    if student["evidenceCount"] == 0 and student["attemptCount"] == 0 and not student["solvedChallengeIds"]:
        signals.append(
            {
                "code": "EVIDENCE_GAP",
                "label": "尚无可解释证据",
                "detail": "没有判题、尝试或过程证据，不能据此判断学生能力。",
                "severity": "unknown",
                "weight": 0,
            }
        )
        return "unknown", None, signals

    days_inactive = student["daysInactive"]
    if (
        student["activeAttempts"] > 0
        and days_inactive is not None
        and days_inactive >= ANALYTICS_THRESHOLDS["stalledActiveDays"]
    ) or (
        student["activitySignals"]["interruptions"]
        >= ANALYTICS_THRESHOLDS["stalledMinimumInterruptions"]
        and days_inactive is not None
        and days_inactive >= ANALYTICS_THRESHOLDS["stalledInterruptedDays"]
    ):
        signals.append(
            {
                "code": "STALLED",
                "label": "学习进程停滞",
                "detail": f"仍有未完成尝试，最近 {days_inactive} 天没有新的可核验活动。",
                "severity": "high",
                "weight": 30,
            }
        )

    completed_commands = student["activitySignals"]["completedCommands"]
    failed_commands = student["activitySignals"]["failedCommands"]
    resets = student["activitySignals"]["resets"]
    fail_ratio = _rate(failed_commands, completed_commands + failed_commands)
    if (failed_commands >= 3 and fail_ratio >= 0.15) or resets >= 2:
        signals.append(
            {
                "code": "REPEATED_STRUGGLE",
                "label": "反复试错仍未收敛",
                "detail": f"记录到 {failed_commands} 次失败命令、{resets} 次环境重置，失败占比 {round(fail_ratio * 100)}%。",
                "severity": "medium",
                "weight": 20,
            }
        )

    if (
        student["masteryScore"] is not None
        and student["masteryConfidence"]
        >= ANALYTICS_THRESHOLDS["masteryMinimumConfidence"]
        and student["masteryScore"] < ANALYTICS_THRESHOLDS["masteryConcernScore"]
    ):
        weak = "、".join(item["label"] for item in student["weakSkills"][:2]) or "核心能力"
        signals.append(
            {
                "code": "LOW_MASTERY",
                "label": "能力掌握度偏低",
                "detail": f"在已有评估证据中，{weak}相对薄弱；综合掌握度 {round(student['masteryScore'])}%。",
                "severity": (
                    "high"
                    if student["masteryScore"]
                    < ANALYTICS_THRESHOLDS["masteryHighRiskScore"]
                    else "medium"
                ),
                "weight": (
                    25
                    if student["masteryScore"]
                    < ANALYTICS_THRESHOLDS["masteryHighRiskScore"]
                    else 18
                ),
            }
        )

    if student["averageProcessScore"] is not None and student["averageProcessScore"] < 50:
        gap = student["weakCriteria"][0]["label"] if student["weakCriteria"] else "学习过程"
        signals.append(
            {
                "code": "PROCESS_GAP",
                "label": "过程能力需要补强",
                "detail": f"过程评分为 {round(student['averageProcessScore'])} 分，主要缺口为“{gap}”。",
                "severity": "medium",
                "weight": 18,
            }
        )

    if student["assignmentSummary"]["overdue"] > 0:
        signals.append(
            {
                "code": "OVERDUE_ASSIGNMENT",
                "label": "存在逾期任务",
                "detail": f"有 {student['assignmentSummary']['overdue']} 项已到期任务尚未提交。",
                "severity": "high",
                "weight": 22,
            }
        )

    if student["averageTrust"] is not None and student["averageTrust"] < 0.75:
        signals.append(
            {
                "code": "LOW_TRUST",
                "label": "证据可信度不足",
                "detail": f"证据链平均可信度为 {round(student['averageTrust'] * 100)}%，结论需人工复核。",
                "severity": "medium",
                "weight": 16,
            }
        )

    if (
        student["attemptCount"] > 0
        and cohort_median >= 0.25
        and student["verifiedCompletion"] <= max(0, cohort_median - 0.25)
    ):
        signals.append(
            {
                "code": "BEHIND_COHORT",
                "label": "进度显著落后于同班",
                "detail": f"真实完成率 {round(student['verifiedCompletion'] * 100)}%，低于班级中位数 {round(cohort_median * 100)}%。",
                "severity": "medium",
                "weight": 14,
            }
        )

    tutor_messages = student["activitySignals"]["tutorMessages"]
    if tutor_messages >= 5 and completed_commands > 0 and tutor_messages / completed_commands >= 0.25 and student["verifiedCompletion"] < 1:
        signals.append(
            {
                "code": "HIGH_SUPPORT_NEED",
                "label": "需要较多脚手架支持",
                "detail": f"已使用 {tutor_messages} 次辅导回应且尚未完成；这只是支持需求信号，不单独代表能力不足。",
                "severity": "low",
                "weight": 8,
            }
        )

    score = min(100, sum(item["weight"] for item in signals))
    level = (
        "high"
        if score >= ANALYTICS_THRESHOLDS["riskHighScore"]
        else "medium"
        if score >= ANALYTICS_THRESHOLDS["riskMediumScore"]
        else "low"
    )
    return level, score, sorted(signals, key=lambda item: item["weight"], reverse=True)


def _assessment_ability_score(assessment, dimension):
    abilities = assessment.abilities if isinstance(assessment.abilities, dict) else {}
    value = abilities.get(dimension)
    if isinstance(value, dict):
        value = value.get("score")
    try:
        return max(0.0, min(100.0, float(value)))
    except (TypeError, ValueError):
        return None


def build_course_learning_analytics(dojo, filters=None, *, summary_only=False):
    now = datetime.datetime.utcnow()
    filters = filters if isinstance(filters, dict) else {}
    student_id = filters.get("studentId")
    module_index = filters.get("moduleIndex")
    challenge_filter = str(filters.get("challengeId") or "").strip() or None
    time_key = str(filters.get("timeRange") or "12w").strip().lower()
    time_days = {"7d": 7, "30d": 30, "90d": 90, "12w": 84}.get(time_key)
    time_start = now - datetime.timedelta(days=time_days) if time_days else None
    time_label = {
        "7d": "过去 7 天",
        "30d": "过去 30 天",
        "90d": "过去 90 天",
        "12w": "过去 12 周",
        "lifetime": "课程全部时间",
    }.get(time_key, "过去 12 周")
    challenge_rows = (
        DojoChallenges.query.options(joinedload(DojoChallenges.challenge))
        .filter_by(dojo_id=dojo.dojo_id)
        .all()
    )
    if module_index is not None:
        challenge_rows = [
            row for row in challenge_rows if row.module_index == int(module_index)
        ]
    if challenge_filter:
        challenge_rows = [
            row
            for row in challenge_rows
            if str(row.challenge_id) == challenge_filter
            or str(row.id) == challenge_filter
        ]
    module_rows = (
        []
        if summary_only
        else DojoModules.query.filter_by(dojo_id=dojo.dojo_id).all()
    )
    student_query = DojoUsers.query.filter(
        DojoUsers.dojo_id == dojo.dojo_id,
        DojoUsers.type != "admin",
    )
    if student_id is not None:
        student_query = student_query.filter(DojoUsers.user_id == int(student_id))
    student_memberships = student_query.options(joinedload(DojoUsers.user)).all()
    student_ids = {row.user_id for row in student_memberships}
    modules = {
        row.module_index: {
            "index": row.module_index,
            "id": row.id,
            "name": row.name or f"章节 {row.module_index + 1}",
        }
        for row in module_rows
    }
    challenges = {
        row.challenge_id: {
            "id": row.challenge_id,
            "slug": row.id,
            "name": row.name or (row.challenge.name if row.challenge else "未命名题目"),
            "moduleIndex": row.module_index,
            "moduleName": modules.get(row.module_index, {}).get("name", f"章节 {row.module_index + 1}"),
            "challengeIndex": row.challenge_index,
            "required": bool(row.required),
        }
        for row in challenge_rows
        if row.challenge_id
    }
    challenge_ids = list(challenges)
    required_ids = {challenge_id for challenge_id, item in challenges.items() if item["required"]}

    solve_query = db.session.query(
        Solves.user_id, Solves.challenge_id, func.max(Solves.date)
    ).filter(
        Solves.challenge_id.in_(challenge_ids or [-1]),
        Solves.user_id.in_(student_ids or [-1]),
    )
    if time_start is not None:
        solve_query = solve_query.filter(Solves.date >= time_start)
    solve_rows = solve_query.group_by(Solves.user_id, Solves.challenge_id).all()
    attempt_query = LearningAttempts.query.filter(
        LearningAttempts.dojo_id == dojo.dojo_id,
        LearningAttempts.user_id.in_(student_ids or [-1]),
        LearningAttempts.challenge_id.in_(challenge_ids or [-1]),
    )
    if time_start is not None:
        attempt_query = attempt_query.filter(LearningAttempts.started >= time_start)
    attempts = attempt_query.all()
    attempts_by_id = {row.id: row for row in attempts}
    assessment_rows = (
        LearningAssessments.query.filter(
            LearningAssessments.attempt_id.in_(list(attempts_by_id) or [""])
        ).all()
        if attempts_by_id
        else []
    )
    latest_assessment_by_attempt = {}
    for assessment in assessment_rows:
        current = latest_assessment_by_attempt.get(assessment.attempt_id)
        if current is None or assessment.revision > current.revision:
            latest_assessment_by_attempt[assessment.attempt_id] = assessment
    assessments = list(latest_assessment_by_attempt.values())
    evidence_query = (
        db.session.query(
            LearningAttempts.user_id,
            LearningAttempts.challenge_id,
            LearningEvidenceEvents.event_type,
            func.count(LearningEvidenceEvents.id),
            func.avg(LearningEvidenceEvents.trust_level),
            func.max(LearningEvidenceEvents.occurred),
        )
        .join(LearningEvidenceEvents, LearningEvidenceEvents.attempt_id == LearningAttempts.id)
        .filter(
            LearningAttempts.dojo_id == dojo.dojo_id,
            LearningAttempts.user_id.in_(student_ids or [-1]),
            LearningAttempts.challenge_id.in_(challenge_ids or [-1]),
        )
    )
    if time_start is not None:
        evidence_query = evidence_query.filter(
            LearningEvidenceEvents.occurred >= time_start
        )
    evidence_groups = evidence_query.group_by(
        LearningAttempts.user_id,
        LearningAttempts.challenge_id,
        LearningEvidenceEvents.event_type,
    ).all()
    skill_query = LearningSkillStates.query.filter(
        LearningSkillStates.dojo_id == dojo.dojo_id,
        LearningSkillStates.user_id.in_(student_ids or [-1]),
    )
    skill_rows = skill_query.all()
    scoped_ability_evidence = bool(
        module_index is not None or challenge_filter or time_start is not None
    )
    if summary_only:
        mappings = []
    else:
        mapping_query = ObjectiveMappings.query.filter_by(
            dojo_id=dojo.dojo_id,
            active=True,
        )
        if module_index is not None:
            mapping_query = mapping_query.filter(
                ObjectiveMappings.module_index == int(module_index)
            )
        mappings = mapping_query.all()
    if challenge_filter:
        challenge_target_ids = {
            str(value)
            for item in challenges.values()
            for value in (item["id"], item["slug"])
        }
        mappings = [
            row
            for row in mappings
            if row.target_type != "challenge"
            or str(row.target_id) in challenge_target_ids
        ]
    assignment_query = TeachingAssignments.query.filter(
        TeachingAssignments.dojo_id == dojo.dojo_id,
        TeachingAssignments.status.in_(("PUBLISHED", "CLOSED")),
    )
    if module_index is not None:
        assignment_query = assignment_query.filter(
            TeachingAssignments.module_index == int(module_index)
        )
    assignments = [] if challenge_filter else assignment_query.all()
    assignment_ids = [row.id for row in assignments]
    if assignment_ids:
        submission_query = TeachingAssignmentSubmissions.query.filter(
            TeachingAssignmentSubmissions.assignment_id.in_(assignment_ids),
            TeachingAssignmentSubmissions.student_id.in_(student_ids or [-1]),
        )
        if time_start is not None:
            submission_query = submission_query.filter(
                TeachingAssignmentSubmissions.updated >= time_start
            )
        submissions = submission_query.all()
    else:
        submissions = []

    student_data = {
        row.user_id: {
            "userId": row.user_id,
            "name": row.user.name if row.user else str(row.user_id),
            "solves": {},
            "attempts": [],
            "assessments": [],
            "events": [],
            "skills": {},
            "submissions": [],
        }
        for row in student_memberships
    }
    for user_id, challenge_id, solved_at in solve_rows:
        student_data[user_id]["solves"][challenge_id] = solved_at
    for attempt in attempts:
        student_data[attempt.user_id]["attempts"].append(attempt)
    for assessment in assessments:
        attempt = attempts_by_id.get(assessment.attempt_id)
        if attempt:
            student_data[attempt.user_id]["assessments"].append(assessment)
    for user_id, challenge_id, event_type, count, trust, occurred in evidence_groups:
        student_data[user_id]["events"].append(
            {
                "challengeId": challenge_id,
                "type": event_type,
                "count": int(count),
                "averageTrustLevel": float(trust or 0),
                "lastOccurred": occurred,
            }
        )
    for skill in skill_rows:
        student_data[skill.user_id]["skills"][skill.dimension] = skill
    for submission in submissions:
        student_data[submission.student_id]["submissions"].append(submission)

    response_students = []
    for source in student_data.values():
        solved_ids = set(source["solves"])
        user_attempts = source["attempts"]
        user_assessments = source["assessments"]
        user_events = source["events"]
        user_submissions = source["submissions"]
        event_counts = {}
        event_trust_total = 0.0
        event_total = 0
        for event in user_events:
            event_counts[event["type"]] = event_counts.get(event["type"], 0) + event["count"]
            event_total += event["count"]
            event_trust_total += event["averageTrustLevel"] * event["count"]
        activity_dates = list(source["solves"].values())
        for attempt in user_attempts:
            activity_dates.extend([attempt.started, attempt.submitted, attempt.completed])
        for assessment in user_assessments:
            activity_dates.append(assessment.created)
        activity_dates.extend(event["lastOccurred"] for event in user_events)
        activity_dates.extend(submission.updated for submission in user_submissions)
        last_activity = _latest(*activity_dates)

        skill_items = []
        for dimension in ABILITY_DIMENSIONS:
            state = source["skills"].get(dimension)
            scoped_scores = [
                score
                for score in (
                    _assessment_ability_score(assessment, dimension)
                    for assessment in user_assessments
                )
                if score is not None
            ]
            scoped_updated = _latest(
                *[
                    assessment.created
                    for assessment in user_assessments
                    if _assessment_ability_score(assessment, dimension) is not None
                ]
            )
            mastery = (
                _mean(scoped_scores, 1)
                if scoped_ability_evidence
                else round(float(state.mastery), 1)
                if state
                else None
            )
            confidence = (
                round(min(1.0, len(scoped_scores) / 4), 4)
                if scoped_ability_evidence
                else round(float(state.confidence), 4)
                if state
                else 0.0
            )
            evidence_count = (
                len(scoped_scores)
                if scoped_ability_evidence
                else int(state.evidence_count)
                if state
                else 0
            )
            updated = scoped_updated if scoped_ability_evidence else state.updated if state else None
            skill_items.append(
                {
                    "dimension": dimension,
                    "label": ABILITY_LABELS[dimension],
                    "mastery": mastery,
                    "confidence": confidence,
                    "evidenceCount": evidence_count,
                    "updated": _timestamp(updated),
                }
            )
        observed_skills = [item for item in skill_items if item["evidenceCount"] > 0]
        mastery_score = _mean([item["mastery"] for item in observed_skills], 1)
        mastery_confidence = _mean([item["confidence"] for item in observed_skills], 4) or 0.0
        weak_skills = sorted(
            observed_skills,
            key=lambda item: (item["mastery"], -item["confidence"]),
        )
        weak_criteria = _criterion_gaps(user_assessments)
        assessment_scores = [float(item.total_score) for item in user_assessments]
        process_scores = [float(item.process_score) for item in user_assessments]
        objective_scores = [float(item.objective_score) for item in user_assessments]
        trust_values = [float(item.trust_score) for item in user_attempts]
        trust_values.extend(float(item.trust_score) for item in user_submissions)
        average_trust = _mean(trust_values, 4)
        if average_trust is None and event_total:
            average_trust = round((event_trust_total / event_total) / 4, 4)

        submission_by_assignment = {row.assignment_id: row for row in user_submissions}
        assignment_items = []
        overdue = 0
        assignment_scores = []
        for assignment in assignments:
            submission = submission_by_assignment.get(assignment.id)
            completed = bool(submission and submission.status in {"SUBMITTED", "GRADED"})
            is_overdue = bool(assignment.due_at and assignment.due_at < now and not completed)
            if is_overdue:
                overdue += 1
            score_percent = None
            if submission and submission.max_score:
                score_percent = round(100 * float(submission.total_score) / float(submission.max_score), 1)
                assignment_scores.append(score_percent)
            assignment_items.append(
                {
                    "id": assignment.id,
                    "title": assignment.title,
                    "status": submission.status if submission else "NOT_STARTED",
                    "dueAt": _timestamp(assignment.due_at),
                    "overdue": is_overdue,
                    "scorePercent": score_percent,
                    "updated": _timestamp(submission.updated) if submission else None,
                }
            )

        attempts_by_challenge = {}
        for attempt in user_attempts:
            attempts_by_challenge.setdefault(attempt.challenge_id, []).append(attempt)
        assessments_by_challenge = {}
        for assessment in user_assessments:
            attempt = attempts_by_id.get(assessment.attempt_id)
            if attempt:
                assessments_by_challenge.setdefault(attempt.challenge_id, []).append(assessment)
        events_by_challenge = {}
        for event in user_events:
            bucket = events_by_challenge.setdefault(event["challengeId"], {})
            bucket[event["type"]] = bucket.get(event["type"], 0) + event["count"]
        challenge_performance = []
        for challenge_id in sorted(set(attempts_by_challenge) | solved_ids):
            meta = challenges.get(challenge_id)
            if not meta:
                continue
            challenge_attempts = attempts_by_challenge.get(challenge_id, [])
            challenge_assessments = assessments_by_challenge.get(challenge_id, [])
            challenge_events = events_by_challenge.get(challenge_id, {})
            challenge_last = _latest(
                source["solves"].get(challenge_id),
                *[item.started for item in challenge_attempts],
                *[item.submitted for item in challenge_attempts],
                *[item.completed for item in challenge_attempts],
            )
            challenge_performance.append(
                {
                    **meta,
                    "solved": challenge_id in solved_ids,
                    "attemptCount": len(challenge_attempts),
                    "completedAttempts": sum(1 for item in challenge_attempts if item.status in {"SOLVED", "SUBMITTED"}),
                    "failedCommands": challenge_events.get("terminal.command.failed", 0),
                    "resets": challenge_events.get("lab.reset.requested", 0),
                    "averageAssessment": _mean([item.total_score for item in challenge_assessments], 1),
                    "averageProcessScore": _mean([item.process_score for item in challenge_assessments], 1),
                    "lastActivity": _timestamp(challenge_last),
                }
            )
        challenge_performance.sort(
            key=lambda item: (
                item["solved"],
                -item["failedCommands"],
                -item["resets"],
                -item["attemptCount"],
            )
        )

        objective_status = []
        for mapping in mappings:
            complete = False
            if mapping.target_type == "challenge":
                try:
                    complete = int(mapping.target_id) in solved_ids
                except (TypeError, ValueError):
                    complete = False
            objective_status.append(
                {
                    "id": mapping.objective_id,
                    "name": mapping.objective_name,
                    "moduleIndex": mapping.module_index,
                    "complete": complete,
                    "weight": mapping.weight,
                }
            )

        required_solved = len(solved_ids & required_ids)
        source_count = sum(
            (
                bool(solved_ids),
                bool(user_attempts),
                bool(user_events),
                bool(user_assessments),
                bool(observed_skills),
            )
        )
        volume_score = min(1.0, (event_total + len(user_attempts) * 2 + len(solved_ids) * 3) / 20)
        freshness_days = _days_since(last_activity, now)
        freshness_score = (
            1.0
            if freshness_days is not None and freshness_days <= 7
            else 0.7
            if freshness_days is not None and freshness_days <= 21
            else 0.4
            if freshness_days is not None and freshness_days <= 45
            else 0.15
            if freshness_days is not None
            else 0.0
        )
        trust_component = average_trust if average_trust is not None else 0.0
        evidence_confidence = round(
            100
            * (
                source_count / 5 * 0.45
                + volume_score * 0.25
                + trust_component * 0.2
                + freshness_score * 0.1
            )
        )
        evidence_level = "充分" if evidence_confidence >= 75 else "基础" if evidence_confidence >= 45 else "不足"
        active_attempts = sum(1 for item in user_attempts if item.status == "ACTIVE")
        recent_evidence = sorted(
            (
                {
                    "type": item["type"],
                    "label": EVENT_LABELS.get(item["type"], item["type"]),
                    "count": item["count"],
                    "challengeId": item["challengeId"],
                    "challengeName": challenges.get(item["challengeId"], {}).get("name", "课程活动"),
                    "averageTrustLevel": round(item["averageTrustLevel"], 1),
                    "lastOccurred": _timestamp(item["lastOccurred"]),
                }
                for item in user_events
            ),
            key=lambda item: item["lastOccurred"] or "",
            reverse=True,
        )[:8]
        current_attempts = sorted(
            (item for item in user_attempts if item.status == "ACTIVE"),
            key=lambda item: item.started,
            reverse=True,
        )
        current_focus = None
        if current_attempts:
            active = current_attempts[0]
            current_focus = {
                "challengeId": active.challenge_id,
                "challengeName": challenges.get(active.challenge_id, {}).get("name", "未命名题目"),
                "moduleName": challenges.get(active.challenge_id, {}).get("moduleName", "未分章"),
                "started": _timestamp(active.started),
            }
        response_students.append(
            {
                "userId": source["userId"],
                "name": source["name"],
                "solvedChallengeIds": sorted(solved_ids),
                "solvedByModule": {
                    str(module_index): len(
                        [challenge_id for challenge_id in solved_ids if challenges.get(challenge_id, {}).get("moduleIndex") == module_index]
                    )
                    for module_index in sorted(modules)
                },
                "requiredSolved": required_solved,
                "requiredTotal": len(required_ids),
                "verifiedCompletion": _rate(required_solved, len(required_ids)),
                "attemptCount": len(user_attempts),
                "activeAttempts": active_attempts,
                "completedAttempts": sum(1 for item in user_attempts if item.status in {"SOLVED", "SUBMITTED"}),
                "averageAssessment": _mean(assessment_scores, 1),
                "averageObjectiveScore": _mean(objective_scores, 1),
                "averageProcessScore": _mean(process_scores, 1),
                "averageTrust": average_trust,
                "masteryScore": mastery_score,
                "masteryConfidence": mastery_confidence,
                "skills": skill_items,
                "weakSkills": weak_skills,
                "weakCriteria": weak_criteria,
                "evidence": event_counts,
                "evidenceCount": event_total,
                "evidenceConfidence": evidence_confidence,
                "evidenceLevel": evidence_level,
                "recentEvidence": recent_evidence,
                "activitySignals": {
                    "completedCommands": event_counts.get("terminal.command.completed", 0),
                    "failedCommands": event_counts.get("terminal.command.failed", 0),
                    "resets": event_counts.get("lab.reset.requested", 0),
                    "interruptions": event_counts.get("lab.interrupted", 0) + event_counts.get("simulation.interrupted", 0),
                    "tutorMessages": event_counts.get("tutor.chat.assistant", 0),
                    "reflections": sum(1 for item in user_attempts if str(item.reflection or "").strip()),
                    "assessments": len(user_assessments),
                },
                "assignmentSummary": {
                    "assigned": len(assignments),
                    "submitted": sum(1 for item in user_submissions if item.status in {"SUBMITTED", "GRADED"}),
                    "overdue": overdue,
                    "averageScore": _mean(assignment_scores, 1),
                    "items": assignment_items,
                },
                "objectives": objective_status,
                "challengePerformance": challenge_performance,
                "currentFocus": current_focus,
                "lastSolve": _timestamp(_latest(*source["solves"].values())),
                "lastActivity": _timestamp(last_activity),
                "daysInactive": freshness_days,
            }
        )

    cohort_median = _median(item["verifiedCompletion"] for item in response_students)
    for student in response_students:
        level, score, signals = _student_risk(student, cohort_median)
        student["riskLevel"] = level
        student["riskScore"] = score
        student["riskSignals"] = signals
        student["primaryStatus"] = {
            "high": "优先干预",
            "medium": "持续关注",
            "low": "进展稳定",
            "unknown": "证据不足",
        }[level]
    response_students.sort(
        key=lambda item: (
            {"high": 0, "medium": 1, "unknown": 2, "low": 3}[item["riskLevel"]],
            -(item["riskScore"] or 0),
            item["name"],
        )
    )

    students_by_id = {int(item["userId"]): item for item in response_students}
    for student in response_students:
        student["interventionHistory"] = []
    audit_rows = (
        []
        if summary_only
        else LearningAuditEvents.query.filter(
            LearningAuditEvents.resource_type == "learning_intervention",
            LearningAuditEvents.resource_id.like(f"{dojo.dojo_id}:%"),
            LearningAuditEvents.action.in_(
                ("teacher.intervention.started", "teacher.intervention.reviewed")
            ),
        )
        .order_by(LearningAuditEvents.created.asc(), LearningAuditEvents.id.asc())
        .all()
    )
    audit_by_intervention = {}
    for audit in audit_rows:
        details = audit.details if isinstance(audit.details, dict) else {}
        if str(details.get("dojoId")) != str(dojo.dojo_id):
            continue
        audit_by_intervention.setdefault(audit.resource_id, []).append(audit)

    teacher_outcome_labels = {
        "IMPROVED": "教师判断：已有改善",
        "UNCHANGED": "教师判断：无明显变化",
        "DECLINED": "教师判断：有所下降",
        "UNCERTAIN": "教师判断：暂不确定",
    }
    tracked_interventions = []
    for intervention_id, event_rows in audit_by_intervention.items():
        started = next(
            (
                event
                for event in event_rows
                if event.action == "teacher.intervention.started"
            ),
            None,
        )
        if started is None:
            continue
        details = started.details if isinstance(started.details, dict) else {}
        try:
            student_id = int(details.get("studentId"))
        except (TypeError, ValueError):
            continue
        student = students_by_id.get(student_id)
        if student is None:
            continue
        baseline = details.get("baseline") if isinstance(details.get("baseline"), dict) else {}
        current = learning_intervention_snapshot(student)
        reviews = [
            event
            for event in event_rows
            if event.action == "teacher.intervention.reviewed"
        ]
        latest_review = reviews[-1] if reviews else None
        review_details = (
            latest_review.details
            if latest_review is not None and isinstance(latest_review.details, dict)
            else {}
        )
        review_snapshot = (
            review_details.get("current")
            if isinstance(review_details.get("current"), dict)
            else None
        )
        comparison = review_snapshot or current
        completion_delta = _delta(
            None
            if comparison.get("verifiedCompletion") is None
            else float(comparison["verifiedCompletion"]) * 100,
            None
            if baseline.get("verifiedCompletion") is None
            else float(baseline["verifiedCompletion"]) * 100,
        )
        changes = {
            "completionPoints": completion_delta,
            "masteryPoints": _delta(
                comparison.get("masteryScore"), baseline.get("masteryScore")
            ),
            "processPoints": _delta(
                comparison.get("averageProcessScore"),
                baseline.get("averageProcessScore"),
            ),
            "riskScoreReduction": _delta(
                baseline.get("riskScore"), comparison.get("riskScore")
            ),
            "evidenceCount": int(comparison.get("evidenceCount") or 0)
            - int(baseline.get("evidenceCount") or 0),
        }
        trend, trend_label = _intervention_trend(changes)
        follow_up_at = _parse_timestamp(details.get("followUpAt"))
        status = (
            "reviewed"
            if latest_review is not None
            else "ready_for_review"
            if follow_up_at is not None and follow_up_at <= now
            else "tracking"
        )
        teacher_outcome = str(review_details.get("teacherOutcome") or "").upper()
        record = {
            "id": intervention_id,
            "studentId": student_id,
            "title": str(details.get("title") or "学习干预"),
            "kind": str(details.get("kind") or "TEACHER_PLAN"),
            "plan": str(details.get("plan") or ""),
            "startedAt": _timestamp(started.created),
            "followUpAt": _timestamp(follow_up_at),
            "status": status,
            "baseline": baseline,
            "current": current,
            "reviewSnapshot": review_snapshot,
            "changes": changes,
            "observedTrend": trend,
            "observedTrendLabel": trend_label,
            "teacherOutcome": teacher_outcome or None,
            "teacherOutcomeLabel": teacher_outcome_labels.get(teacher_outcome),
            "reviewNote": str(review_details.get("note") or ""),
            "reviewedAt": _timestamp(latest_review.created) if latest_review else None,
            "reviewCount": len(reviews),
        }
        student["interventionHistory"].append(record)
        tracked_interventions.append(record)
    for student in response_students:
        student["interventionHistory"].sort(
            key=lambda item: item.get("startedAt") or "", reverse=True
        )
    intervention_tracking = {
        "totalCount": len(tracked_interventions),
        "activeCount": sum(
            1 for item in tracked_interventions if item["status"] != "reviewed"
        ),
        "readyForReviewCount": sum(
            1 for item in tracked_interventions if item["status"] == "ready_for_review"
        ),
        "reviewedCount": sum(
            1 for item in tracked_interventions if item["status"] == "reviewed"
        ),
        "improvingCount": sum(
            1
            for item in tracked_interventions
            if item["status"] == "reviewed"
            and item["observedTrend"] == "improving"
        ),
        "studentCount": len({item["studentId"] for item in tracked_interventions}),
        "caveat": "干预前后的同期变化用于支持复查，不等同于干预造成了该变化。",
    }

    skill_by_student = {
        item["userId"]: {skill["dimension"]: skill for skill in item["skills"]}
        for item in response_students
    }
    ability_overview = []
    for dimension in ABILITY_DIMENSIONS:
        observed = [
            row[dimension]
            for row in skill_by_student.values()
            if row[dimension]["evidenceCount"] > 0
        ]
        ability_overview.append(
            {
                "dimension": dimension,
                "label": ABILITY_LABELS[dimension],
                "averageMastery": (
                    _mean([item["mastery"] for item in observed], 1)
                    if len(observed)
                    >= ANALYTICS_THRESHOLDS["minimumReliableClassSample"]
                    else None
                ),
                "averageConfidence": _mean([item["confidence"] for item in observed], 4) or 0.0,
                "studentsWithEvidence": len(observed),
                "studentCount": len(response_students),
                "lowMasteryCount": sum(
                    1
                    for item in observed
                    if item["mastery"]
                    < ANALYTICS_THRESHOLDS["masteryConcernScore"]
                    and item["confidence"]
                    >= ANALYTICS_THRESHOLDS["masteryMinimumConfidence"]
                ),
                "evidenceCount": sum(item["evidenceCount"] for item in observed),
            }
        )

    attempts_by_challenge = {}
    solves_by_challenge = {}
    assessments_by_challenge = {}
    events_by_challenge_user = {}
    for attempt in attempts:
        attempts_by_challenge.setdefault(attempt.challenge_id, []).append(attempt)
    for user_id, challenge_id, solved_at in solve_rows:
        solves_by_challenge.setdefault(challenge_id, set()).add(user_id)
    for assessment in assessments:
        attempt = attempts_by_id.get(assessment.attempt_id)
        if attempt:
            assessments_by_challenge.setdefault(attempt.challenge_id, []).append(assessment)
    for user_id, challenge_id, event_type, count, _trust, _occurred in evidence_groups:
        bucket = events_by_challenge_user.setdefault((challenge_id, user_id), {})
        bucket[event_type] = bucket.get(event_type, 0) + int(count)

    challenge_diagnostics = []
    for challenge_id, meta in challenges.items():
        challenge_attempts = attempts_by_challenge.get(challenge_id, [])
        attempted_students = {item.user_id for item in challenge_attempts}
        solved_students = solves_by_challenge.get(challenge_id, set())
        unsolved_active = {item.user_id for item in challenge_attempts if item.status == "ACTIVE" and item.user_id not in solved_students}
        struggling_students = set()
        for user_id in attempted_students:
            counts = events_by_challenge_user.get((challenge_id, user_id), {})
            failed = counts.get("terminal.command.failed", 0)
            completed = counts.get("terminal.command.completed", 0)
            if (failed >= 3 and _rate(failed, failed + completed) >= 0.15) or counts.get("lab.reset.requested", 0) >= 2:
                struggling_students.add(user_id)
        challenge_assessments = assessments_by_challenge.get(challenge_id, [])
        gaps = _criterion_gaps(challenge_assessments)
        success_rate = _rate(len(solved_students), len(attempted_students))
        struggle_rate = _rate(len(struggling_students), len(attempted_students))
        active_rate = _rate(len(unsolved_active), len(attempted_students))
        attention_score = round((1 - success_rate) * 55 + struggle_rate * 35 + active_rate * 10) if attempted_students else 0
        diagnostic_status = (
            "insufficient"
            if len(attempted_students)
            < ANALYTICS_THRESHOLDS["minimumReliableQuestionSample"]
            else "attention"
            if attention_score >= 45
            else "watch"
            if attention_score >= 25
            else "stable"
        )
        challenge_diagnostics.append(
            {
                **meta,
                "attemptedStudents": len(attempted_students),
                "solvedStudents": len(solved_students),
                "studentCount": len(response_students),
                "participationRate": _rate(len(attempted_students), len(response_students)),
                "courseSolveRate": _rate(len(solved_students), len(response_students)),
                "attemptSuccessRate": success_rate,
                "activeUnsolvedStudents": len(unsolved_active),
                "strugglingStudents": len(struggling_students),
                "attemptCount": len(challenge_attempts),
                "averageAttemptsPerLearner": _mean(
                    [sum(1 for item in challenge_attempts if item.user_id == user_id) for user_id in attempted_students],
                    1,
                ),
                "averageAssessment": _mean([item.total_score for item in challenge_assessments], 1),
                "averageProcessScore": _mean([item.process_score for item in challenge_assessments], 1),
                "commonGaps": [item for item in gaps if item["mastery"] < 70][:3],
                "attentionScore": attention_score,
                "diagnosticStatus": diagnostic_status,
                "diagnosticConfidence": round(
                    min(1.0, len(attempted_students) / 10), 4
                ),
                "minimumReliableSample": ANALYTICS_THRESHOLDS[
                    "minimumReliableQuestionSample"
                ],
            }
        )
    challenge_diagnostics.sort(
        key=lambda item: (
            item["diagnosticStatus"] == "insufficient",
            -item["attentionScore"],
            -item["attemptedStudents"],
            item["moduleIndex"],
            item["challengeIndex"],
        )
    )

    module_diagnostics = []
    for module_index, module in sorted(modules.items()):
        rows = [item for item in challenge_diagnostics if item["moduleIndex"] == module_index]
        required_rows = [item for item in rows if item["required"]]
        observed = [item for item in rows if item["attemptedStudents"] > 0]
        bottleneck = max(observed, key=lambda item: item["attentionScore"], default=None)
        module_diagnostics.append(
            {
                **module,
                "challengeCount": len(rows),
                "requiredChallengeCount": len(required_rows),
                "requiredCompletionRate": _mean([item["courseSolveRate"] for item in required_rows], 4) or 0.0,
                "participationRate": _mean([item["participationRate"] for item in rows], 4) or 0.0,
                "attemptSuccessRate": _mean([item["attemptSuccessRate"] for item in observed], 4),
                "averageAssessment": _mean([item["averageAssessment"] for item in observed], 1),
                "bottleneck": {
                    "challengeId": bottleneck["id"],
                    "name": bottleneck["name"],
                    "attentionScore": bottleneck["attentionScore"],
                } if bottleneck else None,
            }
        )

    timeline_dates = [attempt.started for attempt in attempts]
    timeline_dates.extend(row[2] for row in solve_rows if row[2])
    timeline_dates.extend(assessment.created for assessment in assessments)
    timeline_dates.extend(row[5] for row in evidence_groups if row[5])
    earliest_timeline_date = min(timeline_dates) if timeline_dates else now
    requested_timeline_start = time_start or earliest_timeline_date
    current_week = _week_start(now)
    timeline_start = _week_start(requested_timeline_start)
    timeline_bucket_count = max(
        1,
        int((current_week - timeline_start).days / 7) + 1,
    )
    timeline_truncated = timeline_bucket_count > 52
    if timeline_truncated:
        timeline_bucket_count = 52
        timeline_start = current_week - datetime.timedelta(weeks=51)
    buckets = {
        timeline_start + datetime.timedelta(weeks=index): {
            "start": timeline_start + datetime.timedelta(weeks=index),
            "students": set(),
            "attempts": 0,
            "solves": 0,
            "assessments": 0,
            "evidence": 0,
        }
        for index in range(timeline_bucket_count)
    }
    for attempt in attempts:
        week = _week_start(attempt.started)
        if week in buckets:
            buckets[week]["attempts"] += 1
            buckets[week]["students"].add(attempt.user_id)
    for user_id, _challenge_id, solved_at in solve_rows:
        week = _week_start(solved_at)
        if week in buckets:
            buckets[week]["solves"] += 1
            buckets[week]["students"].add(user_id)
    for assessment in assessments:
        attempt = attempts_by_id.get(assessment.attempt_id)
        week = _week_start(assessment.created)
        if attempt and week in buckets:
            buckets[week]["assessments"] += 1
            buckets[week]["students"].add(attempt.user_id)
    weekly_evidence = (
        []
        if summary_only
        else db.session.query(
            func.date_trunc("week", LearningEvidenceEvents.occurred),
            func.count(LearningEvidenceEvents.id),
            func.count(func.distinct(LearningAttempts.user_id)),
        )
        .join(LearningAttempts, LearningAttempts.id == LearningEvidenceEvents.attempt_id)
        .filter(
            LearningAttempts.dojo_id == dojo.dojo_id,
            LearningAttempts.user_id.in_(student_ids or [-1]),
            LearningAttempts.challenge_id.in_(challenge_ids or [-1]),
            LearningEvidenceEvents.occurred >= timeline_start,
        )
        .group_by(func.date_trunc("week", LearningEvidenceEvents.occurred))
        .all()
    )
    for week, count, active_students in weekly_evidence:
        normalized = _week_start(week)
        if normalized in buckets:
            buckets[normalized]["evidence"] = int(count)
            while len(buckets[normalized]["students"]) < int(active_students):
                buckets[normalized]["students"].add(f"evidence-{len(buckets[normalized]['students'])}")
    timeline = [
        {
            "start": _timestamp(bucket["start"]),
            "label": f"{bucket['start'].month}/{bucket['start'].day}",
            "activeStudents": len(bucket["students"]),
            "attempts": bucket["attempts"],
            "solves": bucket["solves"],
            "assessments": bucket["assessments"],
            "evidence": bucket["evidence"],
        }
        for bucket in buckets.values()
    ]

    def intervention(identifier, title, reason, action, tone, predicate):
        matches = [item for item in response_students if predicate(item)]
        return {
            "id": identifier,
            "title": title,
            "reason": reason,
            "action": action,
            "tone": tone,
            "count": len(matches),
            "studentIds": [item["userId"] for item in matches],
        }

    interventions = [
        intervention(
            "HIGH_RISK",
            "优先进行一对一诊断",
            "多项可核验风险信号叠加，继续等待可能扩大知识或进度缺口。",
            "先查看学生证据链与当前卡点，再安排一次短时诊断性对话和可完成的小目标。",
            "danger",
            lambda item: item["riskLevel"] == "high",
        ),
        intervention(
            "STALLED",
            "唤回已经停滞的学习进程",
            "学生仍有未完成尝试，但近期没有新的有效活动。",
            "定位最后一次失败或中断位置，提供一个不泄露答案的下一步验证提示，并约定回看时间。",
            "warning",
            lambda item: any(signal["code"] == "STALLED" for signal in item["riskSignals"]),
        ),
        intervention(
            "LOW_MASTERY",
            "按薄弱能力组织补强",
            "已有多轮评估证据显示特定能力掌握不足，不只是进度偏慢。",
            "按学生最弱的能力维度分组，布置短练习并用同一维度再次评估，观察是否真正改善。",
            "warning",
            lambda item: any(signal["code"] == "LOW_MASTERY" for signal in item["riskSignals"]),
        ),
        intervention(
            "EVIDENCE_GAP",
            "先补充诊断证据",
            "没有足够证据时，低完成率不能等同于低掌握度。",
            "安排一项低门槛诊断任务，确保学生产生可核验的目标、过程和反思证据后再判断。",
            "neutral",
            lambda item: item["riskLevel"] == "unknown",
        ),
        intervention(
            "OUTCOME_PROCESS_MISMATCH",
            "核对结果与过程是否一致",
            "部分学生可能已经完成任务，但过程评分仍低，或过程表现不错却迟迟未通过目标。",
            "分别补强验证与表达，避免只追求 Flag 或只记录过程而没有完成目标。",
            "info",
            lambda item: (
                item["averageProcessScore"] is not None
                and (
                    (item["verifiedCompletion"] >= 0.75 and item["averageProcessScore"] < 50)
                    or (item["verifiedCompletion"] < 0.5 and item["averageProcessScore"] >= 70)
                )
            ),
        ),
        intervention(
            "NEAR_COMPLETION",
            "推动接近完成的学生收尾",
            "这些学生已取得大部分可核验进展，通常只剩少量明确缺口。",
            "直接指出尚未完成的必修题或评价标准，给出清晰截止点，快速形成正向闭环。",
            "success",
            lambda item: 0.6 <= item["verifiedCompletion"] < 1 and item["riskLevel"] != "high",
        ),
    ]
    interventions = [item for item in interventions if item["count"] > 0]

    observed_mastery = [item["masteryScore"] for item in response_students if item["masteryScore"] is not None]
    evidence_covered = [
        item
        for item in response_students
        if item["evidenceConfidence"]
        >= ANALYTICS_THRESHOLDS["evidenceCoverageMinimum"]
    ]
    summary = {
        "studentCount": len(response_students),
        "activeStudents": sum(1 for item in response_students if item["attemptCount"] or item["solvedChallengeIds"]),
        "evidenceCoveredStudents": len(evidence_covered),
        "evidenceCoverage": _rate(len(evidence_covered), len(response_students)),
        "averageEvidenceConfidence": _mean([item["evidenceConfidence"] for item in response_students], 1),
        "averageMastery": _mean(observed_mastery, 1),
        "masteryStudentCount": len(observed_mastery),
        "averageVerifiedCompletion": _mean([item["verifiedCompletion"] for item in response_students], 4) or 0.0,
        "medianVerifiedCompletion": round(cohort_median, 4),
        "averageAssessment": _mean([item["averageAssessment"] for item in response_students], 1),
        "highRiskCount": sum(1 for item in response_students if item["riskLevel"] == "high"),
        "watchCount": sum(1 for item in response_students if item["riskLevel"] == "medium"),
        "unknownCount": sum(1 for item in response_students if item["riskLevel"] == "unknown"),
        "stalledCount": sum(
            1
            for item in response_students
            if any(signal["code"] == "STALLED" for signal in item["riskSignals"])
        ),
    }
    student_count = len(response_students)
    evidence_event_count = sum(item["evidenceCount"] for item in response_students)
    classified_students = [
        item for item in response_students if item["riskLevel"] != "unknown"
    ]
    total_required_opportunities = student_count * len(required_ids)
    total_required_solves = sum(item["requiredSolved"] for item in response_students)
    mastery_evidence_count = sum(
        skill["evidenceCount"]
        for student in response_students
        for skill in student["skills"]
        if skill["evidenceCount"] > 0
    )
    sample_confidence = min(1.0, student_count / 12) if student_count else 0.0
    coverage_confidence = min(
        1.0,
        (len(evidence_covered) / max(1, student_count)) * 0.7
        + min(1.0, evidence_event_count / max(1, student_count * 10)) * 0.3,
    )
    metric_time_range = {
        "start": _timestamp(time_start),
        "end": _timestamp(now),
        "label": time_label,
    }
    metrics = {
        "studentCount": _metric(
            value=student_count,
            numerator=student_count,
            denominator=None,
            evidence_count=student_count,
            time_range={"start": None, "end": _timestamp(now), "label": "当前课程成员"},
            confidence=1,
            updated_at=now,
            definition="当前课程中除教师外的学生成员数。",
            sample_size=student_count,
            coverage=1 if student_count else 0,
        ),
        "evidenceCoverage": _metric(
            value=_rate(len(evidence_covered), student_count),
            numerator=len(evidence_covered),
            denominator=student_count,
            evidence_count=evidence_event_count,
            time_range=metric_time_range,
            confidence=coverage_confidence,
            updated_at=now,
            definition="达到基础证据充分度的学生数 ÷ 当前课程学生数。",
            sample_size=student_count,
            coverage=_rate(len(evidence_covered), student_count) or 0,
            unavailable_reason="课程尚无学生，无法计算证据覆盖率。"
            if not student_count
            else None,
        ),
        "averageMastery": _metric(
            value=_mean(observed_mastery, 1),
            numerator=round(sum(observed_mastery), 1) if observed_mastery else 0,
            denominator=len(observed_mastery),
            evidence_count=mastery_evidence_count,
            time_range=metric_time_range,
            confidence=(
                _mean(
                    [
                        item["masteryConfidence"]
                        for item in response_students
                        if item["masteryScore"] is not None
                    ],
                    4,
                )
                or 0
            )
            * min(1.0, len(observed_mastery) / 5),
            updated_at=now,
            definition="仅对已有能力评估证据的学生计算六维能力掌握度均值；未观测学生不按零分计入。",
            sample_size=len(observed_mastery),
            coverage=_rate(len(observed_mastery), student_count) or 0,
            unavailable_reason=(
                "至少需要 3 名学生形成能力评估后才展示班级平均掌握度。"
                if len(observed_mastery)
                < ANALYTICS_THRESHOLDS["minimumReliableClassSample"]
                else None
            ),
        ),
        "verifiedCompletion": _metric(
            value=_rate(total_required_solves, total_required_opportunities),
            numerator=total_required_solves,
            denominator=total_required_opportunities,
            evidence_count=total_required_solves,
            time_range=metric_time_range,
            confidence=min(1.0, sample_confidence * 0.35 + 0.65),
            updated_at=now,
            definition="全班已通过判题的必修题次数 ÷ 学生数与必修题数的乘积；浏览和预览不计为完成。",
            sample_size=total_required_opportunities,
            coverage=_rate(total_required_solves, total_required_opportunities) or 0,
            unavailable_reason=(
                "课程尚无学生，无法计算真实完成率。"
                if not student_count
                else "课程尚未配置必修题，无法计算真实完成率。"
                if not required_ids
                else None
            ),
        ),
        "highRiskStudents": _metric(
            value=summary["highRiskCount"],
            numerator=summary["highRiskCount"],
            denominator=len(classified_students),
            evidence_count=evidence_event_count,
            time_range=metric_time_range,
            confidence=coverage_confidence * sample_confidence,
            updated_at=now,
            definition="在已有可解释证据的学生中，由多项透明风险信号叠加后进入优先干预队列的人数。",
            sample_size=len(classified_students),
            coverage=_rate(len(classified_students), student_count) or 0,
            unavailable_reason=(
                "当前没有学生达到基础证据量，不能判断优先干预人数。"
                if not classified_students
                else None
            ),
        ),
        "stalledStudents": _metric(
            value=summary["stalledCount"],
            numerator=summary["stalledCount"],
            denominator=len(classified_students),
            evidence_count=evidence_event_count,
            time_range=metric_time_range,
            confidence=coverage_confidence * sample_confidence,
            updated_at=now,
            definition="仍有未完成尝试，且达到停滞规则所需时间与过程证据的学生人数。",
            sample_size=len(classified_students),
            coverage=_rate(len(classified_students), student_count) or 0,
            unavailable_reason=(
                "当前没有足够过程证据，不能判断学习停滞。"
                if not classified_students
                else None
            ),
        ),
    }
    summary["metrics"] = metrics

    return {
        "dojoId": dojo.dojo_id,
        "asOf": _timestamp(now),
        "scope": {
            "kind": "course-learning-analytics",
            "courseId": dojo.reference_id,
            "filters": {
                "studentId": int(student_id) if student_id is not None else None,
                "moduleIndex": int(module_index) if module_index is not None else None,
                "challengeId": challenge_filter,
                "timeRange": time_key,
            },
        },
        "evidenceCount": evidence_event_count,
        "definitionVersion": ANALYTICS_DEFINITION_VERSION,
        "definition": "按当前学生、章节、题目和时间范围，从可核验判题、学习尝试、过程事件、评估与任务提交中生成的学情快照。",
        "challengeCount": len(challenge_ids),
        "requiredChallengeCount": len(required_ids),
        "summary": summary,
        "metrics": metrics,
        "students": response_students,
        "abilityOverview": ability_overview,
        "challengeDiagnostics": challenge_diagnostics,
        "moduleDiagnostics": module_diagnostics,
        "timeline": timeline,
        "timelineMeta": {
            "label": time_label,
            "start": _timestamp(timeline_start),
            "end": _timestamp(now),
            "bucket": "week",
            "truncated": timeline_truncated,
        },
        "interventions": interventions,
        "interventionTracking": intervention_tracking,
        "riskBands": {
            "high": summary["highRiskCount"],
            "medium": summary["watchCount"],
            "low": sum(1 for item in response_students if item["riskLevel"] == "low"),
            "unknown": summary["unknownCount"],
        },
        "riskModel": {
            "definitionVersion": ANALYTICS_DEFINITION_VERSION,
            "kind": "transparent-deterministic-rules",
            "thresholds": dict(ANALYTICS_THRESHOLDS),
            "automaticGradeImpact": False,
        },
        "sourceOfTruth": [
            "Solves",
            "LearningAttempts",
            "LearningEvidenceEvents",
            "LearningAssessments",
            "ObjectiveMappings",
        ],
        "interventionSourceOfTruth": ["LearningAuditEvents"],
        "analysisSources": [
            "可核验判题结果",
            "学习尝试与状态",
            "不可篡改过程事件",
            "结果与过程评估",
            "六维能力状态",
            "课程目标映射",
            "已发布任务与提交",
            "教师干预与复查记录",
        ],
        "completionPolicy": "只有可核验的题目通过记录计入必修完成；浏览内容和打开预览只作为参与信号，不计为完成。",
        "dataQuality": {
            "generatedAt": _timestamp(now),
            "definitionVersion": ANALYTICS_DEFINITION_VERSION,
            "thresholds": dict(ANALYTICS_THRESHOLDS),
            "scope": {
                "studentId": int(student_id) if student_id is not None else None,
                "moduleIndex": int(module_index) if module_index is not None else None,
                "challengeId": challenge_filter,
                "timeRange": time_key,
                "timeRangeLabel": time_label,
            },
            "studentCount": len(response_students),
            "evidenceEventCount": sum(item["evidenceCount"] for item in response_students),
            "attemptCount": len(attempts),
            "assessmentCount": len(assessments),
            "skillStateCount": (
                sum(
                    1
                    for student in response_students
                    for skill in student["skills"]
                    if skill["evidenceCount"] > 0
                )
                if scoped_ability_evidence
                else len(skill_rows)
            ),
            "assignmentSubmissionCount": len(submissions),
            "interventionCount": len(tracked_interventions),
            "coveredStudents": len(evidence_covered),
            "caveats": [
                "完成只认可以回溯到题目的判题结果；页面浏览、打开课件和预览不会被当作完成。",
                "掌握度只在形成能力评估后显示；没有评估证据时标记为未观测，而不是按零分处理。",
                "风险由透明的确定性规则生成，用于教师排查优先级，不替代教师判断，也不自动影响成绩。",
                "辅导使用量只反映支持需求，不能单独作为能力不足或不独立的结论。",
                "小样本题目只展示数据不足，不用不稳定的成功率制造精确感。",
                "干预前后变化只表示同期观测，不足以证明因果；应结合教师复查、任务难度和新增证据判断。",
            ],
            "definitions": [
                {"metric": "真实完成率", "definition": "已通过判题的必修题数 ÷ 必修题总数。"},
                {"metric": "能力掌握度", "definition": "最近多次评估按 70% 历史、30% 新证据更新的六维能力均值，仅统计已有证据的维度。"},
                {"metric": "证据充分度", "definition": "综合来源覆盖、事件量、证据链可信度和活动新鲜度，用于表达结论可解释程度。"},
                {"metric": "题目成功率", "definition": "已尝试学生中最终通过判题的人数占比，同时展示参与人数作为分母。"},
                {"metric": "关注风险", "definition": "由停滞、反复试错、能力缺口、过程缺口、逾期和低可信度等可回溯信号叠加。"},
                {"metric": "干预同期变化", "definition": "冻结干预开始时的完成、能力、过程、风险和证据基线，与复查时的同口径快照比较；不作因果归因。"},
            ],
        },
    }
