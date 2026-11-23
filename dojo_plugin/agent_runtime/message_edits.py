"""Replace an owned teacher conversation suffix while preserving execution records."""

import datetime

from CTFd.models import db

from ..models import (
    ConversationCards, TeachingAgentEventOutbox, TeachingAgentMessages, TeachingAgentThreads,
    TeachingCandidateSets, TeachingJobs,
)
from .conversation import ConversationConflict, TERMINAL_STATUSES
from .model_inputs import request_payload

SUPERSEDED = "SUPERSEDED"


def rewind_message(thread, message_id, expected_latest, content):
    from .jobs import _finalize_canceled_job

    messages = TeachingAgentMessages.query.filter_by(
        thread_id=thread.id, user_id=thread.user_id,
    ).order_by(TeachingAgentMessages.id).all()
    target = next((row for row in messages if row.id == message_id and row.role == "user"), None)
    if target is None or not messages or messages[-1].id != expected_latest:
        raise ConversationConflict("对话已经变化，请重新打开要编辑的消息。")
    if not isinstance(content, str) or not content.strip() or target.content.strip() == content.strip():
        raise ConversationConflict("请修改消息内容后重发。")

    prefix = [row for row in messages if row.id < message_id]
    suffix = [row for row in messages if row.id >= message_id]
    removed_ids = {row.id for row in suffix}
    cards = ConversationCards.query.filter(ConversationCards.message_id.in_(removed_ids)).all()
    candidate_ids = {card.object_id for card in cards if card.object_type in {"candidate-set", "candidate_set"}}
    job_ids = {card.object_id for card in cards if card.object_type == "job"}
    for row in suffix:
        metadata = row.metadata_json or {}
        job_ids.update(value for field in ("jobId", "agentRootJobId")
                       if isinstance(value := metadata.get(field), str))

    owned_jobs = TeachingJobs.query.filter_by(thread_id=thread.id, owner_id=thread.user_id)
    jobs = owned_jobs.all()
    controls = {job.id: job.payload or {} for job in jobs}
    discarded = [
        job for job in jobs
        if job.id in job_ids or controls[job.id].get("userMessageId") in removed_ids
        or controls[job.id].get("sourceMessageId") in removed_ids
    ]
    direct_ids = {job.id for job in discarded}
    action_ids = {job.action_id for job in discarded if job.action_id is not None}
    discarded = [
        job for job in jobs if job.id in direct_ids
        or controls[job.id].get("harnessRootJobId") in direct_ids
        or job.action_id in action_ids
        or controls[job.id].get("candidateSetId") in candidate_ids
    ]
    known = {job.id for job in discarded}
    discarded = owned_jobs.filter(TeachingJobs.id.in_(known)).order_by(
        TeachingJobs.id
    ).with_for_update(skip_locked=True).populate_existing().all() if known else []
    if {job.id for job in discarded} != known:
        raise ConversationConflict("有任务正在更新，请稍后重发。")
    if any(job.status not in TERMINAL_STATUSES | {"QUEUED"} for job in discarded):
        raise ConversationConflict("受影响的任务仍在执行。请先停止任务，再重发这条消息。")

    original = next((job for job in discarded if controls[job.id].get("userMessageId") == target.id), None)
    if original is None:
        reply = next((row for row in suffix if row.role == "assistant"), None)
        associated_id = (reply.metadata_json or {}).get("jobId") if reply else None
        original = next((job for job in discarded if job.id == associated_id), None)
    source = request_payload(original) if original else {}
    body = {"content": content.strip(), "artifactType": "auto", "candidateCount": 3, "candidateMode": "auto"}
    if source.get("sourceRefs"):
        body["sourceRefs"] = source["sourceRefs"]
    if "ordinaryMaterialQuestion" in source:
        body.update(materialQuestion=True, executionMode="ask")

    discarded_ids = {job.id for job in discarded}
    for row in prefix:
        metadata = row.metadata_json or {}
        answer_job = metadata.get("questionReplyJobId")
        if answer_job not in discarded_ids:
            continue
        if original and answer_job == original.id:
            questions = metadata.get("questions") or []
            parts = [body["content"]] if len(questions) == 1 else body["content"].splitlines()
            if len(parts) != len(questions) or not questions:
                raise ConversationConflict("请按原问题顺序填写，每行填写一个答案。")
            body["questionReply"] = {"sourceMessageId": row.id, "answers": {
                str(question["id"]): answer for question, answer in zip(questions, parts, strict=True)
            }}
        row.metadata_json = {key: value for key, value in metadata.items()
                             if key not in {"questionReplyJobId", "questionAnswers"}}

    archive = TeachingAgentThreads(
        user_id=thread.user_id, dojo_id=thread.dojo_id, module_index=thread.module_index,
        title=thread.title, phase=thread.phase, status=SUPERSEDED,
        context={"sourceThreadId": thread.id, "replacedMessageId": message_id},
    )
    db.session.add(archive)
    db.session.flush()
    for job in discarded:
        if job.status == "QUEUED":
            job.canceled = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
            _finalize_canceled_job(job, "因教师编辑并重发消息，旧任务已取消。")
        job.thread_id = archive.id
        job.payload = {**(job.payload or {}), "taskListHidden": True, "supersededByMessageEdit": True}
    if candidate_ids:
        TeachingCandidateSets.query.filter(
            TeachingCandidateSets.thread_id == thread.id, TeachingCandidateSets.owner_id == thread.user_id,
            TeachingCandidateSets.id.in_(candidate_ids),
        ).update({"thread_id": archive.id}, synchronize_session=False)

    for row in suffix:
        row.thread_id = archive.id
    entries = (thread.context or {}).get("pendingAttachments")
    if isinstance(entries, list):
        thread.context = {**(thread.context or {}), "pendingAttachments": [
            item for item in entries if not isinstance(item, dict) or
            (item.get("messageId") not in removed_ids and item.get("resultJobId") not in discarded_ids)
        ]}
    db.session.flush()
    db.session.add(TeachingAgentEventOutbox(
        thread_id=thread.id, event_type="conversation.rewound",
        payload={"fromMessageId": message_id},
    ))
    db.session.flush()
    return body
