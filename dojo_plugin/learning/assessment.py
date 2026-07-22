import datetime
import math

from sqlalchemy import func

from CTFd.models import Solves, db

from ..models import (
    LearningAssessments,
    LearningAttempts,
    LearningChallengeProfiles,
    LearningEvidenceEvents,
    LearningRecommendations,
    LearningSkillStates,
)
from .evidence import append_evidence, verify_evidence_chain
from .standards import ABILITY_DIMENSIONS, ABILITY_LABELS, CATEGORY_SKILLS, DEFAULT_RUBRIC


def _events(attempt):
    return (
        LearningEvidenceEvents.query.filter_by(attempt_id=attempt.id)
        .order_by(LearningEvidenceEvents.sequence)
        .all()
    )


def _event_counts(events):
    counts = {}
    for event in events:
        counts[event.event_type] = counts.get(event.event_type, 0) + 1
    return counts


def _criterion(criterion_id, title, score, maximum, evidence):
    return {
        "id": criterion_id,
        "title": title,
        "score": round(max(0, min(maximum, score)), 2),
        "maxScore": maximum,
        "evidence": evidence,
    }


def _process_criteria(attempt, events, chain_valid):
    counts = _event_counts(events)
    completed = counts.get("terminal.command.completed", 0)
    failed = counts.get("terminal.command.failed", 0)
    milestones = counts.get("milestone.observed", 0)
    resets = counts.get("lab.reset.requested", 0)
    denied = counts.get("policy.egress.denied", 0)
    tutor_messages = [event for event in events if event.event_type == "tutor.chat.assistant"]
    reflection_length = len(attempt.reflection or "")

    baseline = 8 if completed >= 2 else 4 if completed == 1 else 0
    if completed >= 4 and (failed or milestones):
        hypothesis = 12
    elif completed >= 3:
        hypothesis = 8
    elif completed:
        hypothesis = 4
    else:
        hypothesis = 0
    evidence_score = 8 if reflection_length >= 160 else 5 if reflection_length >= 60 else 3 if attempt.submitted else 0
    debugging = 6 if (failed and completed >= 2) or resets else 3 if failed else 0
    safety = 4 if chain_valid and denied == 0 else 1 if chain_valid else 0
    independence = 2 if not tutor_messages else 1

    return [
        _criterion("baseline-recon", "建立有效基线", baseline, 8, {"commands": completed}),
        _criterion(
            "hypothesis-validation",
            "假设与验证闭环",
            hypothesis,
            12,
            {"commands": completed, "failures": failed, "milestones": milestones},
        ),
        _criterion(
            "evidence-and-remediation",
            "根因、影响与修复说明",
            evidence_score,
            8,
            {"reflectionCharacters": reflection_length},
        ),
        _criterion(
            "debugging-adaptation",
            "调试与策略调整",
            debugging,
            6,
            {"failures": failed, "resets": resets},
        ),
        _criterion(
            "safety",
            "操作范围与安全",
            safety,
            4,
            {"policyDenials": denied, "evidenceChainValid": chain_valid},
        ),
        _criterion(
            "independence",
            "独立完成与辅助使用",
            independence,
            2,
            {"tutorMessages": len(tutor_messages)},
        ),
    ]


def _ability_scores(objective_score, criteria):
    criterion = {item["id"]: item for item in criteria}

    def ratio(identifier):
        item = criterion[identifier]
        return item["score"] / item["maxScore"] if item["maxScore"] else 0

    objective = objective_score / 60
    values = {
        "reconnaissance_environment": ratio("baseline-recon"),
        "technical_reasoning": (
            ratio("baseline-recon") * 0.2
            + ratio("hypothesis-validation") * 0.55
            + ratio("evidence-and-remediation") * 0.25
        ),
        "tool_orchestration": (
            ratio("baseline-recon") * 0.35
            + ratio("hypothesis-validation") * 0.4
            + ratio("debugging-adaptation") * 0.25
        ),
        "debugging_adaptation": (
            ratio("debugging-adaptation") * 0.7
            + ratio("hypothesis-validation") * 0.3
        ),
        "solution_validation": objective * 0.65 + ratio("evidence-and-remediation") * 0.35,
        "safety_independence": ratio("safety") * 0.7 + ratio("independence") * 0.3,
    }
    return {
        dimension: {
            "label": ABILITY_LABELS[dimension],
            "score": round(values[dimension] * 100, 1),
        }
        for dimension in ABILITY_DIMENSIONS
    }


def _feedback(objective_score, criteria):
    strengths = [item["title"] for item in criteria if item["score"] >= item["maxScore"] * 0.8]
    gaps = [item["title"] for item in criteria if item["score"] < item["maxScore"] * 0.5]
    result = []
    result.append("客观目标已通过可信 Oracle 验证。" if objective_score else "客观目标尚未通过可信 Oracle 验证。")
    if strengths:
        result.append("表现较好：" + "、".join(strengths) + "。")
    if gaps:
        result.append("下一轮优先补强：" + "、".join(gaps) + "。")
    return "".join(result)


def _update_skills(attempt, abilities):
    for dimension, value in abilities.items():
        state = LearningSkillStates.query.filter_by(
            user_id=attempt.user_id,
            dojo_id=attempt.dojo_id,
            dimension=dimension,
        ).first()
        if not state:
            state = LearningSkillStates(
                user_id=attempt.user_id,
                dojo_id=attempt.dojo_id,
                dimension=dimension,
                mastery=0,
                confidence=0,
                evidence_count=0,
            )
            db.session.add(state)
        score = float(value["score"])
        state_data = state.data or {}
        if state_data.get("lastAttemptId") == attempt.id:
            prior_mastery = float(state_data.get("priorMastery", 0))
            prior_evidence_count = int(state_data.get("priorEvidenceCount", 0))
        else:
            prior_mastery = state.mastery or 0
            prior_evidence_count = state.evidence_count or 0
        state.mastery = (
            score
            if prior_evidence_count == 0
            else prior_mastery * 0.7 + score * 0.3
        )
        state.evidence_count = prior_evidence_count + 1
        state.confidence = round(1 - math.exp(-state.evidence_count / 4), 4)
        state.data = {
            "lastAttemptId": attempt.id,
            "lastScore": score,
            "label": value["label"],
            "priorMastery": prior_mastery,
            "priorEvidenceCount": prior_evidence_count,
        }


def assess_attempt(attempt, *, reviewer_id=None, source="DETERMINISTIC"):
    db.session.query(LearningAttempts).filter_by(id=attempt.id).with_for_update().one()
    events = _events(attempt)
    chain = verify_evidence_chain(attempt.id)
    solved = (
        attempt.status == "SOLVED"
        or Solves.query.filter_by(user_id=attempt.user_id, challenge_id=attempt.challenge_id).first()
        is not None
    )
    objective_score = 60 if solved else 0
    criteria = _process_criteria(attempt, events, chain["valid"])
    process_score = round(sum(item["score"] for item in criteria), 2)
    total_score = round(objective_score + process_score, 2)
    abilities = _ability_scores(objective_score, criteria)
    revision = (
        db.session.query(func.max(LearningAssessments.revision))
        .filter_by(attempt_id=attempt.id)
        .scalar()
        or 0
    ) + 1
    assessment = LearningAssessments(
        attempt_id=attempt.id,
        revision=revision,
        objective_score=objective_score,
        process_score=process_score,
        total_score=total_score,
        criteria=[
            _criterion(
                "objective-success",
                "完成客观目标",
                objective_score,
                60,
                {"oracleVerified": solved, "minimumTrustLevel": 4},
            ),
            *criteria,
        ],
        abilities=abilities,
        timeline=[
            {
                "sequence": event.sequence,
                "type": event.event_type,
                "occurred": event.occurred.isoformat() + "Z",
            }
            for event in events[-12:]
        ],
        feedback=_feedback(objective_score, criteria),
        source=source,
        created_by=reviewer_id,
    )
    db.session.add(assessment)
    db.session.flush()
    attempt.objective_score = objective_score
    attempt.process_score = process_score
    attempt.total_score = total_score
    attempt.trust_score = 1 if chain["valid"] else 0
    if attempt.status == "ACTIVE":
        attempt.status = "SUBMITTED"
    attempt.submitted = attempt.submitted or datetime.datetime.utcnow()
    append_evidence(
        attempt,
        "assessment.created",
        {
            "assessmentId": assessment.id,
            "revision": revision,
            "objectiveScore": objective_score,
            "processScore": process_score,
            "totalScore": total_score,
        },
        source="ASSESSMENT",
        trust_level=3,
    )
    _update_skills(attempt, abilities)
    return assessment


def skill_states(user_id, dojo_id):
    existing = {
        state.dimension: state
        for state in LearningSkillStates.query.filter_by(user_id=user_id, dojo_id=dojo_id).all()
    }
    return [
        {
            "dimension": dimension,
            "label": ABILITY_LABELS[dimension],
            "mastery": round(existing[dimension].mastery, 1) if dimension in existing else 0,
            "confidence": existing[dimension].confidence if dimension in existing else 0,
            "evidenceCount": existing[dimension].evidence_count if dimension in existing else 0,
        }
        for dimension in ABILITY_DIMENSIONS
    ]


def build_recommendations(user, dojo, limit=3, persist=True):
    states = {item["dimension"]: item["mastery"] for item in skill_states(user.id, dojo.dojo_id)}
    overall = sum(states.values()) / len(states) if states else 0
    target_difficulty = max(1, min(5, round(1 + overall / 25)))
    solved_ids = {
        row.challenge_id
        for row in dojo.solves(user=user, ignore_visibility=True, ignore_admins=False).all()
    }
    scored = []
    for dojo_challenge in dojo.challenges:
        if dojo_challenge.challenge_id in solved_ids or not dojo_challenge.visible():
            continue
        profile = LearningChallengeProfiles.query.get(dojo_challenge.challenge_id)
        category = profile.category if profile else "GENERAL"
        difficulty = profile.difficulty if profile else min(5, dojo_challenge.challenge_index + 1)
        dimensions = CATEGORY_SKILLS.get(category, ABILITY_DIMENSIONS)
        gap = sum(100 - states.get(dimension, 0) for dimension in dimensions) / len(dimensions)
        fit = max(0, 25 - abs(difficulty - target_difficulty) * 7)
        progression = max(0, 10 - dojo_challenge.module_index - dojo_challenge.challenge_index / 10)
        score = gap * 0.65 + fit + progression
        scored.append((score, dojo_challenge, profile, gap, difficulty, category))
    scored.sort(key=lambda item: (-item[0], item[1].module_index, item[1].challenge_index))
    selected = scored[: max(1, min(limit, 10))]
    if persist:
        LearningRecommendations.query.filter_by(
            user_id=user.id,
            dojo_id=dojo.dojo_id,
        ).delete(synchronize_session=False)
    result = []
    for rank, (_, challenge, profile, gap, difficulty, category) in enumerate(selected, 1):
        reason = f"能力缺口 {round(gap)}%，难度 {difficulty}/5 与当前准备度匹配"
        snapshot = {
            "targetDifficulty": target_difficulty,
            "category": category,
            "skillMastery": states,
            "rubricVersion": (profile.rubric or {}).get("version") if profile else DEFAULT_RUBRIC["version"],
        }
        if persist:
            db.session.add(
                LearningRecommendations(
                    user_id=user.id,
                    dojo_id=dojo.dojo_id,
                    challenge_id=challenge.challenge_id,
                    rank=rank,
                    reason=reason,
                    snapshot=snapshot,
                )
            )
        result.append(
            {
                "rank": rank,
                "dojoId": dojo.reference_id,
                "moduleId": challenge.module.id,
                "challengeId": challenge.id,
                "challengeName": challenge.name,
                "difficulty": difficulty,
                "category": category,
                "reason": reason,
                "workspaceUrl": (
                    f"/{dojo.reference_id}/{challenge.module.id}/{challenge.id}"
                ),
            }
        )
    return result


def assessment_view(assessment):
    return {
        "id": assessment.id,
        "attemptId": assessment.attempt_id,
        "revision": assessment.revision,
        "objectiveScore": assessment.objective_score,
        "processScore": assessment.process_score,
        "totalScore": assessment.total_score,
        "criteria": assessment.criteria,
        "abilities": assessment.abilities,
        "timeline": assessment.timeline,
        "feedback": assessment.feedback,
        "status": assessment.status,
        "source": assessment.source,
        "created": assessment.created.isoformat() + "Z",
    }
