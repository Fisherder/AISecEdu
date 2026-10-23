import hashlib
import json

from ..models import TeachingJobs
from .model_inputs import request_payload


HARNESS_VERSION = "teaching-harness-v1"
ACTIVE_STATUSES = frozenset({"QUEUED", "RUNNING", "CANCEL_REQUESTED"})
TERMINAL_STATUSES = frozenset({"SUCCEEDED", "FAILED", "CANCELED"})
MAX_PENDING_TURNS = 8


class ConversationConflict(ValueError):
    pass


def unreferenced_attachment_refs(entries):
    """Carry a fresh upload into its first turn, not every later turn."""

    return [
        {"type": "material", "id": str(entry["id"])}
        for entry in entries
        if isinstance(entry, dict)
        and entry.get("status") in {"AWAITING_INTENT", "ACTIVE", "REFERENCED"}
        and entry.get("id")
        and not entry.get("messageId")
    ]


def validated_question_answers(questions, reply):
    answers = reply.get("answers") if isinstance(reply, dict) else None
    if not isinstance(questions, list) or not 1 <= len(questions) <= 3 or not isinstance(answers, dict):
        raise ConversationConflict("问题已失效，请刷新对话后再回答。")
    ids = [str(question.get("id") or "") for question in questions]
    if len(set(ids)) != len(ids) or set(answers) != set(ids):
        raise ConversationConflict("请回答当前显示的全部问题。")
    normalized = {}
    for key in ids:
        value = answers[key]
        if not isinstance(value, str) or not value.strip() or len(value) > 2000:
            raise ConversationConflict("每个回答请填写 1 到 2000 字。")
        normalized[key] = value.strip()
    return normalized


def submission_fingerprint(body):
    fields = {key: body.get(key) for key in (
        "content", "dojoId", "moduleIndex", "sourceRefs", "artifactType", "learningPattern",
        "candidateMode", "candidateCount", "delivery", "expectedJobId", "questionReply",
    )}
    fields.update({key: body[key] for key in ("executionMode", "planSourceMessageId") if key in body})
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def question_reply_context(source_payload, questions, answers):
    previous = (source_payload.get("context") or {}).get("questionReply") or {}
    # A second clarification still belongs to the initial teacher request.
    # Preserve earlier answers while letting an explicit new answer revise it.
    combined = {row["question"]: row["answer"] for row in previous.get("answers", [])
                if isinstance(row, dict) and isinstance(row.get("question"), str) and isinstance(row.get("answer"), str)}
    combined.update({q["text"]: answers[q["id"]] for q in questions})
    return {"originalRequest": previous.get("originalRequest") or source_payload.get("prompt"),
            "answers": [{"question": question, "answer": answer} for question, answer in list(combined.items())[-24:]]}


def question_reply_prompt(context):
    prompt = "\n\n".join([context["originalRequest"], "教师补充信息：",
                          *[f'{row["question"]}：{row["answer"]}' for row in context["answers"]]])
    if len(prompt) > 48000:
        raise ConversationConflict("本轮累计要求过长，请在新对话中整理后继续。")
    return prompt


def prepare_turn_submission(session, thread, body, idempotency_key):
    fingerprint = submission_fingerprint(body)
    existing = session.query(TeachingJobs).filter_by(
        owner_id=thread.user_id, idempotency_key=idempotency_key,
    ).first()
    if existing is not None:
        if existing.thread_id != thread.id or request_payload(existing).get("submissionFingerprint") != fingerprint:
            raise ConversationConflict("这条请求的编号已被使用，内容不同；请刷新后重新发送。")
        return existing, []
    active = session.query(TeachingJobs).filter(
        TeachingJobs.owner_id == thread.user_id,
        TeachingJobs.thread_id == thread.id,
        TeachingJobs.status.in_(ACTIVE_STATUSES),
        TeachingJobs.kind.notin_(("material.analyze", "material.enrich")),
    ).order_by(TeachingJobs.created, TeachingJobs.id).all()
    expected = str(body.get("expectedJobId") or "")
    # A composer snapshot may become stale while the teacher types. For an
    # ordinary queued turn, follow the current active chain instead of making
    # the teacher resend unchanged text. A targeted clarification still needs
    # the identity it was answering.
    if expected and active and (body.get("questionReply") or body.get("delivery") == "next-step") and not any(row.id == expected or request_payload(row).get("harnessRootJobId") == expected for row in active):
        raise ConversationConflict("当前任务已经变化。你的文字还在，请查看最新状态后再发送。")
    # A new ordinary turn joins the owned execution chain even if another
    # foreground job starts between the browser snapshot and this request.
    # The caller's delivery hint is useful for display, not an admission lock.
    if sum(row.kind == "agent.chat" and bool(request_payload(row).get("waitForJobIds")) for row in active) >= MAX_PENDING_TURNS:
        raise ConversationConflict("已有 8 条要求在排队，请等待处理或撤回其中一条。")
    waits = [row for row in active if body.get("delivery") != "next-step"
             or not (request_payload(row).get("waitForJobIds")
                     and not request_payload(row).get("harnessInternal")
                     and request_payload(row).get("inputDelivery") != "next-step")]
    return None, [row.id for row in waits]


def turn_wait_state(session, job):
    control = request_payload(job) if job.kind == 'agent.chat' else (job.payload or {})
    if job.kind == 'agent.advance':
        from .tool_plan import driver_plan, progress
        plan = driver_plan(job)
        if plan:
            control = progress(plan) or control
    waiting = control.get('waitForApproval')
    if waiting:
        from .approval_journal import recorded_decision

        if recorded_decision(job.thread_id, waiting['id']) is None:
            return 'waiting'
    ids = control.get("waitForJobIds") or []
    if not ids:
        return "ready"
    rows = session.query(TeachingJobs).filter(
        TeachingJobs.id.in_(ids), TeachingJobs.owner_id == job.owner_id,
        TeachingJobs.thread_id == job.thread_id,
    ).all()
    # A deleted predecessor no longer executes. A failed predecessor does not
    # invalidate a follow-up: unlike material dependencies, this is ordering.
    if any(row.status not in TERMINAL_STATUSES for row in rows):
        return "waiting"
    # A turn may create tool/continuation jobs after the next input was queued.
    # Follow owned lineage, not just the initial snapshot of predecessor IDs.
    if not (job.payload or {}).get("harnessInternal"):
        roots = {str(request_payload(row).get("harnessRootJobId") or row.id) for row in rows}
        active = session.query(TeachingJobs).filter(
            TeachingJobs.owner_id == job.owner_id, TeachingJobs.thread_id == job.thread_id,
            TeachingJobs.status.in_(ACTIVE_STATUSES), TeachingJobs.id != job.id,
        ).all()
        if any(str(request_payload(row).get("harnessRootJobId") or row.id) in roots for row in active):
            return "waiting"
    return "ready"


def execution_chain(session, job):
    current, seen = job, {job.id}
    for _ in range(20):
        next_id = (current.payload or {}).get("harnessNextJobId")
        if not next_id or next_id in seen:
            break
        next_job = session.query(TeachingJobs).filter_by(
            id=next_id, owner_id=job.owner_id, thread_id=job.thread_id,
        ).first()
        if next_job is None:
            break
        seen.add(next_id)
        current = next_job
    return current


def pending_turns(session, thread):
    rows = session.query(TeachingJobs).filter(
        TeachingJobs.owner_id == thread.user_id, TeachingJobs.thread_id == thread.id,
        TeachingJobs.kind == "agent.chat", TeachingJobs.status.in_(ACTIVE_STATUSES),
    ).order_by(TeachingJobs.created, TeachingJobs.id).all()
    pending = []
    for row in rows:
        payload = request_payload(row)
        if payload.get("waitForJobIds"):
            pending.append({
                "jobId": row.id, "status": row.status,
                "content": str(payload.get("prompt") or ""),
                "canWithdraw": row.status == "QUEUED",
                "delivery": payload.get("inputDelivery") or "after-current",
                "revision": int(payload.get("inputRevision") or 0),
                "acknowledgedAtBoundary": bool((row.payload or {}).get("steeringBoundaryJobId")),
            })
    return pending


def steering_input_for_boundary(session, job):
    root_id = str((job.payload or {}).get("harnessRootJobId") or job.id)
    rows = session.query(TeachingJobs).filter_by(
        owner_id=job.owner_id, thread_id=job.thread_id, kind="agent.chat", status="QUEUED",
    ).order_by(TeachingJobs.created, TeachingJobs.id).all()
    return next((row for row in rows if request_payload(row).get("inputDelivery") == "next-step"
                 and str(request_payload(row).get("steeringRootJobId") or "") == root_id), None)


def validated_pending_input(payload, status, content, revision, max_chars):
    if status != "QUEUED" or not (payload or {}).get("waitForJobIds"):
        raise ConversationConflict("这条要求已开始执行，不能再编辑；你的修改仍保留，可以作为补充发送。")
    if type(revision) is not int or revision != int((payload or {}).get("inputRevision") or 0):
        raise ConversationConflict("这条要求已在其他窗口修改，请刷新后再编辑。")
    if not isinstance(content, str) or not content.strip() or len(content.strip()) > max_chars:
        raise ConversationConflict(f"请填写 1 到 {max_chars} 字的要求。")
    return content.strip(), revision + 1
