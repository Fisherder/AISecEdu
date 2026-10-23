import datetime
import hashlib
import re
from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import joinedload, load_only
from CTFd.models import Solves, Users, db

from ..agent_runtime.scope import ScopeError
from ..models import DojoChallenges, DojoModules, DojoUsers, LearningAssessments, LearningAttempts, LearningAuditEvents, LearningEvidenceEvents, TeachingArtifacts
from ..models.inquiry import InquiryAttempts, InquiryEvents, InquiryReleases
from .insights_contract import build_report, in_period, moment, stamp

RANGES = {"7d": (7, "近 7 天"), "30d": (30, "近 30 天"), "90d": (90, "近 90 天"), "12w": (84, "近 12 周"), "lifetime": (None, "全部时间")}
EVENT_NAMES = {"lab.started": "开始实践", "lab.stopped": "停止环境", "lab.interrupted": "环境中断", "lab.reset.requested": "重置环境", "workspace.file.saved": "保存代码", "terminal.command.completed": "运行命令", "terminal.command.failed": "命令返回错误", "assessment.created": "保存评估结果", "coding.submission.verified": "正式编码核验", "coding.basic.completed": "基础阶段通过", "flag.compared": "提交答案", "oracle.observed": "检查器返回结果", "attempt.submitted": "提交本次实践", "simulation.started": "开始交互演示", "simulation.objective.evaluated": "核验操作目标", "simulation.action.completed": "完成演示操作"}
FOLLOWUP_CREATED = "teacher.insight.followup.created"
FOLLOWUP_REVIEWED = "teacher.insight.followup.reviewed"


def clean(value, limit=600):
    text = str(value or "")[:limit]
    return re.sub(r"(?:pwn[.]college|flag|ctf)\{[^}]*\}", "[已隐藏答案]", text, flags=re.I)


def parse_scope(values, now=None):
    now = now or datetime.datetime.utcnow()
    key = str(values.get("timeRange") or "30d")
    if key not in RANGES:
        raise ValueError("请选择有效的时间范围。")
    result = {"timeRange": key, "label": RANGES[key][1], "studentId": None, "moduleIndex": None, "taskKey": str(values.get("taskKey") or "").strip() or None}
    for field in ("studentId", "moduleIndex"):
        raw = values.get(field)
        if raw not in (None, ""):
            try:
                result[field] = int(raw)
            except (TypeError, ValueError):
                raise ValueError("学生或章节筛选格式不正确。")
            if result[field] < 0:
                raise ValueError("学生或章节筛选格式不正确。")
    result["start"] = stamp(now - datetime.timedelta(days=RANGES[key][0])) if RANGES[key][0] else None
    result["end"] = stamp(now)
    return result


def roster_for(dojo):
    rows = DojoUsers.query.options(joinedload(DojoUsers.user)).filter(DojoUsers.dojo_id == dojo.dojo_id, DojoUsers.type.in_(("student", "member"))).all()
    return [{"userId": row.user_id, "name": row.user.name if row.user else f"学生 {row.user_id}"} for row in rows if row.user is not None and row.user.type != "admin"]


def tasks_for(dojo, now):
    modules = DojoModules.query.filter_by(dojo_id=dojo.dojo_id).order_by(DojoModules.module_index).all()
    module_map = {m.module_index: m for m in modules}
    tasks = []
    questions = DojoChallenges.query.options(joinedload(DojoChallenges.challenge), joinedload(DojoChallenges.visibility)).filter_by(dojo_id=dojo.dojo_id).all()
    for row in questions:
        data = row.data or {}
        if data.get("publication_state") in {"DRAFT", "ARCHIVED", "DELETED"} or not row.challenge_id:
            continue
        if row.challenge is not None and row.challenge.state != "visible":
            continue
        if row.visibility and row.visibility.start and moment(row.visibility.start) > now:
            continue
        module = module_map.get(row.module_index)
        tasks.append({"key": f"q:{row.challenge_id}", "id": row.challenge_id, "name": row.name or row.id, "moduleIndex": row.module_index, "moduleName": module.name if module else "未分章", "kind": "实践题", "required": bool(row.required), "order": [row.module_index, row.challenge_index], "href": f"/{dojo.reference_id}/{module.id}/{row.id}" if module else None})
    artifacts = TeachingArtifacts.query.options(load_only(TeachingArtifacts.id, TeachingArtifacts.title, TeachingArtifacts.module_index, TeachingArtifacts.sort_order)).filter_by(dojo_id=dojo.dojo_id, artifact_type="learning-flow", status="PUBLISHED").all()
    releases = InquiryReleases.query.filter(InquiryReleases.artifact_id.in_([a.id for a in artifacts] or [""])).all()
    latest = {}
    for release in releases:
        if release.published <= now and (release.artifact_id not in latest or release.revision > latest[release.artifact_id].revision):
            latest[release.artifact_id] = release
    for artifact in artifacts:
        release = latest.get(artifact.id)
        if release is None:
            continue
        module = module_map.get(artifact.module_index)
        tasks.append({"key": "i:" + artifact.id, "id": artifact.id, "name": artifact.title, "moduleIndex": artifact.module_index, "moduleName": module.name if module else "未分章", "kind": "流程探究", "required": True, "revision": release.revision, "order": [artifact.module_index if artifact.module_index is not None else 999999, artifact.sort_order], "href": "/learning/inquiry/" + artifact.id})
    tasks.sort(key=lambda t: (t["order"], t["key"]))
    return tasks, [{"index": m.module_index, "name": m.name} for m in modules]


def _question_facts(dojo, student_ids, tasks, end):
    question_ids = [t["id"] for t in tasks if t["key"].startswith("q:")]
    if not question_ids or not student_ids:
        return []
    facts = []
    for user_id, challenge_id, at in db.session.query(Solves.user_id, Solves.challenge_id, func.min(Solves.date)).filter(Solves.user_id.in_(student_ids), Solves.challenge_id.in_(question_ids), Solves.date <= end).group_by(Solves.user_id, Solves.challenge_id).all():
        facts.append({"id": f"q:{user_id}:{challenge_id}", "kind": "completion", "userId": user_id, "taskKey": f"q:{challenge_id}", "at": at})
    attempts = LearningAttempts.query.options(load_only(LearningAttempts.id, LearningAttempts.user_id, LearningAttempts.challenge_id, LearningAttempts.started, LearningAttempts.submitted, LearningAttempts.completed)).filter(LearningAttempts.dojo_id == dojo.dojo_id, LearningAttempts.user_id.in_(student_ids), LearningAttempts.challenge_id.in_(question_ids), LearningAttempts.mode != "PREVIEW", LearningAttempts.started <= end).all()
    attempt_map = {a.id: a for a in attempts}
    for attempt in attempts:
        facts.append({"id": attempt.id, "kind": "attempt", "userId": attempt.user_id, "taskKey": f"q:{attempt.challenge_id}", "at": attempt.started})
    receipts = db.session.query(LearningAuditEvents.id, LearningAuditEvents.actor_id, LearningAuditEvents.details["challengeId"].astext, LearningAuditEvents.created, LearningAuditEvents.details["receipt"]["payload"]["passed"].astext).filter(LearningAuditEvents.action == "coding.submission.verified", LearningAuditEvents.actor_id.in_(student_ids), LearningAuditEvents.details["dojoId"].astext == str(dojo.dojo_id), LearningAuditEvents.details["challengeId"].astext.in_([str(i) for i in question_ids]), LearningAuditEvents.details["receipt"]["payload"]["mode"].astext == "formal", func.coalesce(LearningAuditEvents.details["trialOnly"].astext, "false") != "true", LearningAuditEvents.created <= end).all()
    for identity, user_id, challenge_id, at, passed in receipts:
        facts.append({"id": "receipt:" + str(identity), "kind": "check", "userId": user_id, "taskKey": "q:" + challenge_id, "at": at, "passed": passed == "true" if passed in {"true", "false"} else None})
    if not attempt_map:
        return facts
    events = db.session.query(LearningEvidenceEvents.id, LearningEvidenceEvents.attempt_id, LearningEvidenceEvents.event_type, LearningEvidenceEvents.source, LearningEvidenceEvents.trust_level, LearningEvidenceEvents.occurred, LearningEvidenceEvents.payload["passed"].astext).filter(LearningEvidenceEvents.attempt_id.in_(list(attempt_map)), LearningEvidenceEvents.occurred <= end).all()
    for identity, attempt_id, event_type, source, trust, at, passed in events:
        attempt = attempt_map[attempt_id]
        facts.append({"id": identity, "kind": "event", "userId": attempt.user_id, "taskKey": f"q:{attempt.challenge_id}", "at": at, "passed": passed == "true" if passed in {"true", "false"} else None})
    assessments = LearningAssessments.query.options(load_only(LearningAssessments.id, LearningAssessments.attempt_id, LearningAssessments.revision, LearningAssessments.total_score, LearningAssessments.created)).filter(LearningAssessments.attempt_id.in_(list(attempt_map)), LearningAssessments.created <= end, LearningAssessments.status == "FINAL").all()
    for assessment in sorted(assessments, key=lambda a: (a.created, a.revision)):
        attempt = attempt_map[assessment.attempt_id]
        facts.append({"id": assessment.id, "kind": "assessment", "userId": attempt.user_id, "taskKey": f"q:{attempt.challenge_id}", "at": assessment.created, "score": assessment.total_score})
    return facts


def _inquiry_facts(student_ids, tasks, end):
    revisions = {t["id"]: t["revision"] for t in tasks if t["key"].startswith("i:")}
    if not revisions or not student_ids:
        return []
    rows = InquiryAttempts.query.options(load_only(InquiryAttempts.id, InquiryAttempts.user_id, InquiryAttempts.artifact_id, InquiryAttempts.revision, InquiryAttempts.created, InquiryAttempts.updated, InquiryAttempts.completed)).filter(InquiryAttempts.user_id.in_(student_ids), InquiryAttempts.artifact_id.in_(list(revisions)), InquiryAttempts.mode == "LEARN", InquiryAttempts.created <= end).all()
    attempts = {a.id: a for a in rows if a.revision == revisions[a.artifact_id]}
    facts = []
    for attempt in attempts.values():
        facts.append({"id": attempt.id, "kind": "attempt", "userId": attempt.user_id, "taskKey": "i:" + attempt.artifact_id, "at": attempt.created})
        if attempt.completed:
            facts.append({"id": attempt.id, "kind": "completion", "userId": attempt.user_id, "taskKey": "i:" + attempt.artifact_id, "at": attempt.completed})
    events = db.session.query(InquiryEvents.id, InquiryEvents.attempt_id, InquiryEvents.created).filter(InquiryEvents.attempt_id.in_(list(attempts) or [""]), InquiryEvents.created <= end).all() if attempts else []
    for identity, attempt_id, created in events:
        attempt = attempts[attempt_id]
        facts.append({"id": "i:" + str(identity), "kind": "event", "userId": attempt.user_id, "taskKey": "i:" + attempt.artifact_id, "at": created})
    return facts


def followups_for(dojo, roster, end):
    names = {s["userId"]: s["name"] for s in roster}
    rows = LearningAuditEvents.query.filter(LearningAuditEvents.resource_type == "learning_intervention", LearningAuditEvents.action.in_((FOLLOWUP_CREATED, FOLLOWUP_REVIEWED, "teacher.intervention.started", "teacher.intervention.reviewed")), LearningAuditEvents.details["dojoId"].astext == str(dojo.dojo_id), LearningAuditEvents.created <= end).order_by(LearningAuditEvents.id).all()
    records = {}
    for row in rows:
        data = row.details or {}
        student_id = data.get("studentId")
        if student_id not in names:
            continue
        if row.action in {FOLLOWUP_CREATED, "teacher.intervention.started"}:
            due = moment(data.get("followUpAt"))
            records[row.resource_id] = {"id": row.resource_id, "studentId": student_id, "studentName": names[student_id], "title": clean(data.get("title") or "学习跟进", 160), "plan": clean(data.get("plan"), 4000), "createdAt": stamp(row.created), "dueAt": stamp(due), "status": "due" if due and due <= end else "open", "baseline": data.get("snapshot"), "legacy": row.action == "teacher.intervention.started"}
        elif row.resource_id in records:
            records[row.resource_id].update(status="reviewed", outcome=clean(data.get("outcome") or data.get("teacherOutcome"), 40), note=clean(data.get("note"), 2000), reviewedAt=stamp(row.created), current=data.get("snapshot"))
    return sorted(records.values(), key=lambda r: (r["status"] == "reviewed", r["dueAt"] or "9999", r["id"]))


def course_insights(dojo, values=None):
    end = datetime.datetime.utcnow()
    scope = parse_scope(values or {}, end)
    roster = roster_for(dojo)
    tasks, modules = tasks_for(dojo, end)
    options = {"students": roster, "modules": modules, "tasks": [{k: t[k] for k in ("key", "name", "moduleIndex")} for t in tasks]}
    if scope["studentId"] is not None:
        if scope["studentId"] not in {s["userId"] for s in roster}:
            raise ScopeError("学生不在当前课程中。")
        roster = [s for s in roster if s["userId"] == scope["studentId"]]
    if scope["moduleIndex"] is not None:
        if scope["moduleIndex"] not in {m["index"] for m in modules}:
            raise ScopeError("章节不在当前课程中。")
        tasks = [t for t in tasks if t["moduleIndex"] == scope["moduleIndex"]]
    if scope["taskKey"]:
        tasks = [t for t in tasks if t["key"] == scope["taskKey"]]
        if not tasks:
            raise ScopeError("任务未发布或不在所选章节中。")
    student_ids = [s["userId"] for s in roster]
    facts = _question_facts(dojo, student_ids, tasks, end) + _inquiry_facts(student_ids, tasks, end)
    follows = followups_for(dojo, roster, end)
    report = build_report(roster, tasks, facts, start=scope["start"], end=end, course={"id": dojo.dojo_id, "referenceId": dojo.reference_id, "name": dojo.name}, scope=scope, followups=follows)
    report["filterOptions"] = options
    return report


def student_task_evidence(dojo, student_id, task_key, *, before=None, limit=30):
    roster = roster_for(dojo)
    student = next((s for s in roster if s["userId"] == student_id), None)
    if student is None:
        raise ScopeError("学生不在当前课程中。")
    now = datetime.datetime.utcnow()
    tasks, _ = tasks_for(dojo, now)
    task = next((t for t in tasks if t["key"] == task_key), None)
    if task is None:
        raise ScopeError("当前课程没有这个已发布任务。")
    limit = max(1, min(50, int(limit)))
    cursor = int(before) if before else None
    if cursor is not None and cursor < 1:
        raise ValueError("证据分页位置无效。")
    records = []
    assessments = []
    checks = []
    if task_key.startswith("q:"):
        attempt_query = LearningAttempts.query.filter_by(dojo_id=dojo.dojo_id, user_id=student_id, challenge_id=task["id"]).filter(LearningAttempts.mode != "PREVIEW", LearningAttempts.started <= now)
        attempts = attempt_query.order_by(LearningAttempts.started.desc()).all()
        ids = [a.id for a in attempts]
        query = LearningEvidenceEvents.query.filter(LearningEvidenceEvents.attempt_id.in_(ids or [""]), LearningEvidenceEvents.occurred <= now)
        if cursor:
            query = query.filter(LearningEvidenceEvents.id < cursor)
        rows = query.order_by(LearningEvidenceEvents.id.desc()).limit(limit + 1).all()
        more = len(rows) > limit
        for row in rows[:limit]:
            payload = row.payload or {}
            passed = payload.get("passed") if isinstance(payload.get("passed"), bool) else None
            records.append({"id": row.id, "kind": "practice", "title": EVENT_NAMES.get(row.event_type, "学习过程记录"), "type": row.event_type, "at": stamp(row.occurred), "source": row.source, "trusted": row.trust_level >= 3, "passed": passed, "hash": row.event_hash, "sequence": row.sequence})
        grades = LearningAssessments.query.filter(LearningAssessments.attempt_id.in_(ids or [""]), LearningAssessments.status == "FINAL", LearningAssessments.created <= now).order_by(LearningAssessments.created.desc()).limit(20).all()
        for grade in grades:
            assessments.append({"id": grade.id, "score": grade.total_score, "source": grade.source, "at": stamp(grade.created), "feedback": clean(grade.feedback, 1200), "criteria": [{"name": clean(c.get("title"), 200), "score": c.get("score"), "maxScore": c.get("maxScore")} for c in (grade.criteria or []) if isinstance(c, dict) and (c.get("maxScore") or 0) > 0]})
        receipts = LearningAuditEvents.query.filter(LearningAuditEvents.action == "coding.submission.verified", LearningAuditEvents.actor_id == student_id, LearningAuditEvents.details["dojoId"].astext == str(dojo.dojo_id), LearningAuditEvents.details["challengeId"].astext == str(task["id"]), LearningAuditEvents.created <= now).order_by(LearningAuditEvents.id.desc()).limit(10).all()
        for receipt in receipts:
            details = receipt.details or {}
            payload = (details.get("receipt") or {}).get("payload") or {}
            if details.get("trialOnly") or payload.get("mode") not in (None, "formal"):
                continue
            checks.append(receipt_view(receipt, payload))
    else:
        attempt = InquiryAttempts.query.filter_by(user_id=student_id, artifact_id=task["id"], revision=task["revision"], mode="LEARN").first()
        query = InquiryEvents.query.filter(InquiryEvents.attempt_id == (attempt.id if attempt else ""), InquiryEvents.created <= now)
        if cursor:
            query = query.filter(InquiryEvents.id < cursor)
        rows = query.order_by(InquiryEvents.id.desc()).limit(limit + 1).all()
        more = len(rows) > limit
        for row in rows[:limit]:
            event = (row.payload or {}).get("event") or {}
            records.append({"id": row.id, "kind": "inquiry", "title": {"navigate": "切换学习环节", "observe": "观察计算步骤", "contrast": "完成对照实验", "challenge.check": "核验迁移挑战"}.get(event.get("type"), "探究操作"), "type": clean(event.get("type"), 100), "at": stamp(row.created), "source": "SERVER", "trusted": bool((row.payload or {}).get("serverVerified")), "passed": (event.get("details") or {}).get("passed"), "hash": row.event_hash, "sequence": row.sequence})
    return {"student": student, "task": task, "asOf": stamp(now), "records": records, "nextCursor": records[-1]["id"] if more and records else None, "assessments": assessments, "checks": checks, "notice": "此处展示已保存的服务端记录，不会启动环境或重新运行学生代码。"}


def receipt_view(receipt, payload, *, offset=0, limit=20, result_filter=None):
    tests = [t for t in (payload.get("results") or []) if isinstance(t, dict)]
    passed = sum(t.get("passed") is True for t in tests)
    result_filter = result_filter or ("failed" if passed < len(tests) else "all")
    if result_filter not in {"all", "failed"}:
        raise ValueError("检查项筛选无效。")
    offset, limit = max(0, int(offset)), max(1, min(50, int(limit)))
    filtered = [t for t in tests if t.get("passed") is not True] if result_filter == "failed" else tests
    page = filtered[offset:offset + limit]
    return {"id": receipt.id, "at": stamp(receipt.created), "sha256": payload.get("submissionSha256") or payload.get("sourceSha256"), "passed": payload.get("passed"), "total": len(tests), "passedCount": passed, "failedCount": len(tests) - passed, "formal": payload.get("mode") == "formal", "filter": result_filter, "filteredTotal": len(filtered), "offset": offset, "nextOffset": offset + len(page) if offset + len(page) < len(filtered) else None, "tests": [{"name": clean(t.get("name") or t.get("id"), 200), "passed": t.get("passed") is True, "feedback": clean(t.get("feedback"), 600)} for t in page]}


def coding_check_page(dojo, student_id, task_key, receipt_id, *, offset=0, result_filter="failed"):
    if student_id not in {s["userId"] for s in roster_for(dojo)}:
        raise ScopeError("学生不在当前课程中。")
    tasks, _ = tasks_for(dojo, datetime.datetime.utcnow())
    task = next((t for t in tasks if t["key"] == task_key and t["key"].startswith("q:")), None)
    if task is None:
        raise ScopeError("当前课程没有这个已发布实践任务。")
    receipt = LearningAuditEvents.query.filter_by(id=receipt_id, action="coding.submission.verified", actor_id=student_id).first()
    details = receipt.details if receipt else {}
    if not receipt or details.get("dojoId") != dojo.dojo_id or details.get("challengeId") != task["id"] or details.get("trialOnly"):
        raise ScopeError("核验记录不在当前学生与任务范围内。")
    payload = (details.get("receipt") or {}).get("payload") or {}
    if payload.get("mode") not in (None, "formal"):
        raise ScopeError("此记录不是正式核验。")
    return receipt_view(receipt, payload, offset=offset, limit=30, result_filter=result_filter)


def followup_snapshot(dojo, student_id):
    report = course_insights(dojo, {"studentId": student_id, "timeRange": "lifetime"})
    student = report["students"][0]
    return {"capturedAt": report["asOf"], "completed": student["completed"], "required": student["required"], "recordCount": student["recordCount"], "lastActivity": student["lastActivity"], "taskKeys": [t["key"] + ":" + str(t.get("revision", 0)) for t in report["tasks"] if t["required"]]}


def create_followup(dojo, user, values):
    student_id = int(values.get("studentId"))
    plan = str(values.get("plan") or "").strip()
    days = int(values.get("days") or 7)
    request_key = str(values.get("requestKey") or "")
    if not plan or len(plan) > 4000 or not 1 <= days <= 60 or not re.fullmatch(r"[A-Za-z0-9-]{16,80}", request_key):
        raise ValueError("请填写 1–4000 字的跟进计划，复查时间为 1–60 天。")
    membership = DojoUsers.query.filter_by(dojo_id=dojo.dojo_id, user_id=student_id).with_for_update().first()
    if membership is None or membership.type == "admin":
        raise ScopeError("学生不在当前课程中。")
    identity = "insight:" + hashlib.sha256(f"{dojo.dojo_id}:{user.id}:{request_key}".encode()).hexdigest()[:48]
    existing = LearningAuditEvents.query.filter_by(resource_id=identity, action=FOLLOWUP_CREATED).first()
    if existing:
        return {"id": identity, "alreadySaved": True}
    snapshot = followup_snapshot(dojo, student_id)
    due = datetime.datetime.utcnow() + datetime.timedelta(days=days)
    event = LearningAuditEvents(actor_id=user.id, action=FOLLOWUP_CREATED, resource_type="learning_intervention", resource_id=identity, outcome="OPEN", details={"dojoId": dojo.dojo_id, "studentId": student_id, "title": str(values.get("title") or "学习跟进").strip()[:160], "plan": plan, "followUpAt": stamp(due), "snapshot": snapshot})
    db.session.add(event); db.session.commit()
    return {"id": identity, "alreadySaved": False}


def review_followup(dojo, user, identity, values):
    event = LearningAuditEvents.query.filter(LearningAuditEvents.resource_id == identity, LearningAuditEvents.action.in_((FOLLOWUP_CREATED, "teacher.intervention.started"))).with_for_update().first()
    if event is None or (event.details or {}).get("dojoId") != dojo.dojo_id:
        raise ScopeError("没有找到当前课程的跟进记录。")
    existing = LearningAuditEvents.query.filter_by(resource_id=identity, action=FOLLOWUP_REVIEWED).first()
    if existing:
        return {"id": identity, "alreadySaved": True}
    outcome = str(values.get("outcome") or "")
    note = str(values.get("note") or "").strip()
    if outcome not in {"improved", "continue", "uncertain"} or len(note) > 2000:
        raise ValueError("请选择复查结论，补充说明最多 2000 字。")
    student_id = event.details["studentId"]
    snapshot = followup_snapshot(dojo, student_id)
    db.session.add(LearningAuditEvents(actor_id=user.id, action=FOLLOWUP_REVIEWED, resource_type="learning_intervention", resource_id=identity, outcome="REVIEWED", details={"dojoId": dojo.dojo_id, "studentId": student_id, "outcome": outcome, "note": note, "snapshot": snapshot}))
    db.session.commit()
    return {"id": identity, "alreadySaved": False}
