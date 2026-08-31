#!/usr/bin/env python3

import datetime
import uuid
from unittest.mock import patch

from CTFd.models import Users, db
from CTFd.plugins.dojo_plugin.agent_runtime import jobs
from CTFd.plugins.dojo_plugin.learning import authoring, challenge_corpus
from CTFd.plugins.dojo_plugin.models.global_agent import (
    ConversationCards,
    TeachingAgentMessages,
    TeachingAgentThreads,
    TeachingJobEvents,
    TeachingJobOutbox,
    TeachingJobs,
)


def verify_corpus():
    challenge_corpus.reset_cache()
    summary = challenge_corpus.corpus_summary()
    assert summary["available"]
    assert summary["totalChallenges"] >= 15000
    for category in ("PWN", "WEB", "CRYPTO", "REV", "FORENSICS"):
        assert summary["countsByCategory"].get(category, 0) >= 100
    for query, category, expected_tag in (
        ("经典栈溢出 buffer overflow 动态 Flag", "PWN", "buffer-overflow"),
        ("SQL injection web challenge", "WEB", "sql-injection"),
        ("RSA oracle cryptography", "CRYPTO", "rsa"),
    ):
        results = challenge_corpus.search_corpus(query, category, limit=12)
        assert results
        assert all(item["origin"] == "EXTERNAL_CORPUS" for item in results)
        assert all(item["inspirationOnly"] for item in results)
        assert all(not item["reusable"] for item in results)
        assert any(expected_tag in item["tags"] for item in results)
        assert all(item["sourceEvidence"]["license"] for item in results)
        assert any(item["materialEvidence"] for item in results)
        assert len({item["sourceEvidence"]["source"] for item in results}) >= 2
    return summary


def verify_external_evidence_isolation():
    candidate = {
        "challengeId": "corpus:fixture:stack-overflow",
        "referenceId": "corpus:fixture:stack-overflow",
        "name": "Classic stack buffer overflow",
        "category": "PWN",
        "difficulty": 2,
        "exerciseMode": "CONTAINER",
        "score": 99,
        "origin": "EXTERNAL_CORPUS",
        "reusable": False,
        "sourceEvidence": {"license": "MIT"},
    }
    with patch.object(
        authoring,
        "model_json",
        return_value={
            "strategy": "L2",
            "selectedChallengeId": candidate["challengeId"],
            "reason": "高度相关",
        },
    ):
        level, ordered, decision = authoring._select_authoring_strategy(
            "生成一道栈溢出题",
            {},
            [candidate],
        )
    assert level == "L3"
    assert ordered == [candidate]
    assert decision["selectedChallengeId"] is None
    assert decision["externalEvidenceCount"] == 1


def verify_three_layer_repair():
    review = {
        "verdict": "BLOCK",
        "findings": [
            {
                "id": "runtime",
                "status": "OPEN",
                "severity": "HIGH",
                "stage": "RUNTIME",
            }
        ],
    }

    def advance(spec, marker, mode):
        return {**spec, marker: True}, {"provider": "MODEL", "mode": mode}

    with (
        patch.object(
            authoring,
            "_model_repair",
            side_effect=lambda *args: advance(args[4], "patched", "EXACT_PATCH"),
        ),
        patch.object(
            authoring,
            "_model_contract_closure_repair",
            side_effect=lambda *args: advance(
                args[4],
                "contractClosed",
                "CONTRACT_CLOSURE",
            ),
        ),
        patch.object(
            authoring,
            "_model_coherence_rebuild",
            side_effect=lambda *args: advance(
                args[4],
                "rebuilt",
                "COHERENCE_REBUILD",
            ),
        ),
        patch.object(
            authoring,
            "_model_preflight_review",
            return_value=(review, {"provider": "MODEL"}),
        ),
        patch.object(
            authoring,
            "_needs_artifact_closure_repair",
            return_value=False,
        ),
        patch.object(
            authoring,
            "_needs_contract_closure_repair",
            return_value=False,
        ),
    ):
        spec, _, stage, _ = authoring._repair_until_clear(
            "生成可用的 CTF 实践题",
            {},
            "L3",
            [],
            {
                "mode": "GENERATE_CUSTOM",
                "exerciseMode": "CONTAINER",
                "starterFiles": [],
            },
            review,
            max_cycles=3,
        )
    assert [cycle["mode"] for cycle in stage["cycles"]] == [
        "EXACT_PATCH",
        "CONTRACT_CLOSURE",
        "COHERENCE_REBUILD",
    ]
    assert spec["patched"]
    assert spec["contractClosed"]
    assert spec["rebuilt"]


def verify_retry_replaces_failed_record():
    owner = Users.query.order_by(Users.id).first()
    assert owner is not None
    suffix = uuid.uuid4().hex[:16]
    thread = TeachingAgentThreads(
        id=f"thread_retry_{suffix}",
        user_id=owner.id,
        title="原位重试隔离验证",
        phase="READY",
        context={},
    )
    job = TeachingJobs(
        id=f"job_retry_{suffix}",
        owner_id=owner.id,
        thread_id=thread.id,
        kind="agent.chat",
        status="FAILED",
        stage="failed",
        progress=64,
        priority=100,
        idempotency_key=f"retry-fixture-{suffix}",
        trace_id=f"failed-{suffix}",
        payload={"prompt": "isolated retry verification"},
        result={},
        attempt_count=1,
        max_attempts=1,
        error="old validation failure",
        completed=datetime.datetime.utcnow(),
    )
    message = TeachingAgentMessages(
        thread_id=thread.id,
        user_id=owner.id,
        role="assistant",
        content="旧失败记录",
        metadata_json={
            "jobId": job.id,
            "jobKind": job.kind,
            "jobStatus": "FAILED",
            "presentation": "error",
            "failed": True,
            "pending": False,
        },
    )
    db.session.add_all([thread, job, message])
    db.session.flush()
    card = ConversationCards(
        id=f"card_retry_{suffix}",
        message_id=message.id,
        card_type="job",
        object_type="job",
        object_id=job.id,
        state={
            "status": "FAILED",
            "stage": "failed",
            "progress": 64,
            "failureMessage": "old validation failure",
        },
        actions=["open", "retry"],
    )
    event = TeachingJobEvents(
        job_id=job.id,
        sequence=1,
        stage="failed",
        status="FAILED",
        message="OLD_FAILURE_EVENT_SHOULD_DISAPPEAR",
        details={"failure": True},
    )
    outbox = TeachingJobOutbox(
        job_id=job.id,
        payload={"job_id": job.id, "trace_id": job.trace_id},
        published=datetime.datetime.utcnow(),
        publish_attempts=1,
        last_error="old publish failure",
    )
    db.session.add_all([card, event, outbox])
    db.session.commit()
    job_id = job.id
    message_id = message.id
    card_id = card.id
    outbox_id = outbox.id
    token = f"retry-token-{suffix}"

    def mark_published(*, job_id=None, limit=100):
        del limit
        row = TeachingJobOutbox.query.filter_by(job_id=job_id).first()
        assert row is not None
        row.published = datetime.datetime.utcnow()
        row.publish_attempts += 1
        db.session.commit()
        return 1

    try:
        with patch.object(jobs, "publish_pending_outbox", mark_published):
            retried, created = jobs.retry_job(job, owner.id, token)
            repeated, repeated_created = jobs.retry_job(
                retried,
                owner.id,
                token,
            )
        assert created is True
        assert repeated_created is False
        assert retried.id == job_id == repeated.id
        assert TeachingJobs.query.filter_by(id=job_id).count() == 1
        refreshed = TeachingJobs.query.filter_by(id=job_id).one()
        assert refreshed.status == "QUEUED"
        assert refreshed.stage == "queued"
        assert refreshed.progress == 0
        assert refreshed.error is None
        assert refreshed.completed is None
        assert refreshed.attempt_count == 0
        assert refreshed.payload["manualRetryToken"] == token
        assert refreshed.payload["manualRetryAttempt"] == 1
        events = TeachingJobEvents.query.filter_by(job_id=job_id).all()
        assert len(events) == 1
        assert events[0].status == "QUEUED"
        assert events[0].message == "任务已按失败反馈重新排队"
        assert "OLD_FAILURE_EVENT_SHOULD_DISAPPEAR" not in {
            item.message for item in events
        }
        refreshed_message = TeachingAgentMessages.query.filter_by(id=message_id).one()
        assert refreshed_message.content == "正在根据上一轮失败反馈重新执行…"
        assert refreshed_message.metadata_json["presentation"] == "activity"
        assert refreshed_message.metadata_json["failed"] is False
        assert refreshed_message.metadata_json["pending"] is True
        refreshed_card = ConversationCards.query.filter_by(id=card_id).one()
        assert refreshed_card.object_id == job_id
        assert refreshed_card.state["status"] == "QUEUED"
        assert "failureMessage" not in refreshed_card.state
        assert refreshed_card.actions == ["open", "cancel"]
        refreshed_outbox = TeachingJobOutbox.query.filter_by(id=outbox_id).one()
        assert refreshed_outbox.job_id == job_id
        assert refreshed_outbox.last_error is None
        assert refreshed_outbox.published is not None
    finally:
        db.session.rollback()
        current_job = TeachingJobs.query.filter_by(id=job_id).first()
        if current_job is not None:
            db.session.delete(current_job)
        current_thread = TeachingAgentThreads.query.filter_by(id=thread.id).first()
        if current_thread is not None:
            db.session.delete(current_thread)
        db.session.commit()


def main():
    summary = verify_corpus()
    verify_external_evidence_isolation()
    verify_three_layer_repair()
    verify_retry_replaces_failed_record()
    print(
        "PASS  CTF corpus, repair resilience, and in-place retry: "
        f"{summary['totalChallenges']} challenges, "
        f"{len(summary['countsByCategory'])} categories"
    )


if __name__ == "__main__":
    main()
