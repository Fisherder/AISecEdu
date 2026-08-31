from __future__ import annotations

import importlib.util
import pathlib
import sys

import pytest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops" / "verify-natural-language-teaching-lifecycle.py"


def load_verifier_module():
    spec = importlib.util.spec_from_file_location(
        "test_natural_language_teaching_lifecycle_script", SCRIPT
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


verifier_module = load_verifier_module()


def test_browser_reconnect_opens_the_retained_thread_deep_link():
    assert verifier_module.retained_thread_url(
        "https://example.test/", "thread/value with spaces"
    ) == "https://example.test/teacher?thread=thread%2Fvalue+with+spaces"


def test_transient_legacy_failure_follows_only_an_active_same_item_retry():
    verifier = object.__new__(verifier_module.NaturalLanguageLifecycle)
    verifier.teacher = object()
    current = {
        "id": "author-3",
        "status": "FAILED",
        "error": "Transient authoring model failure: timeout",
        "batch": {"id": "batch-1", "index": 3},
    }

    verifier.api = lambda *_args, **_kwargs: {
        "batch": {
            "items": [
                {
                    "itemIndex": 3,
                    "authoringJobId": "author-3",
                    "taskId": "task-3",
                    "status": "queued",
                }
            ]
        }
    }
    retry = verifier.active_batch_retry_for_authoring_job(current)
    assert retry is not None
    assert retry["taskId"] == "task-3"

    verifier.api = lambda *_args, **_kwargs: {
        "batch": {
            "items": [
                {
                    "itemIndex": 3,
                    "authoringJobId": "author-3",
                    "taskId": "task-3",
                    "status": "failed",
                }
            ]
        }
    }
    assert verifier.active_batch_retry_for_authoring_job(current) is None
    assert (
        verifier.active_batch_retry_for_authoring_job(
            {**current, "error": "permanent validation failure"}
        )
        is None
    )


def test_ctf_drafts_are_canonicalized_by_batch_index_after_parallel_revision():
    unordered = [
        ("draft-4", {"constraints": {"batchIndex": 4}}),
        ("draft-5", {"constraints": {"batchIndex": 5}}),
        ("draft-3", {"constraints": {"batchIndex": 3}}),
        ("draft-2", {"constraints": {"batchIndex": 2}}),
        ("draft-1", {"constraints": {"batchIndex": 1}}),
    ]

    ordered = verifier_module.order_ctf_draft_pairs(unordered)

    assert [draft_id for draft_id, _draft in ordered] == [
        "draft-1",
        "draft-2",
        "draft-3",
        "draft-4",
        "draft-5",
    ]


def test_ctf_draft_order_rejects_duplicate_batch_indexes():
    drafts = [
        (f"draft-{index}", {"constraints": {"batchIndex": index}})
        for index in range(1, 6)
    ]
    drafts[-1] = ("draft-duplicate", {"constraints": {"batchIndex": 4}})

    with pytest.raises(
        verifier_module.flow.VerificationError,
        match="duplicate item index 4",
    ):
        verifier_module.order_ctf_draft_pairs(drafts)


def test_log_forensics_topic_accepts_substantive_analyse_log_word_order():
    aliases = verifier_module.CTF_TOPIC_ALIASES["日志取证"]
    title = "日志取证：定位唯一 code"
    body = verifier_module.deep_text(
        {
            "description": "阅读 records.log 并分析日志中的字段与干扰记录。",
            "objectives": ["筛选唯一记录", "提取所需字段"],
            "tags": ["forensics", "log-analysis", "ctf"],
        }
    )

    assert any(alias in title for alias in aliases)
    assert any(alias in body for alias in aliases)


def test_secure_coding_topic_accepts_security_coding_tag_and_code_defects():
    aliases = verifier_module.CTF_TOPIC_ALIASES["安全编码"]
    title = "安全编码：反序列化漏洞利用"
    body = verifier_module.deep_text(
        {
            "description": "定位不安全反序列化与拼接查询等代码缺陷。",
            "objectives": ["分析源码并定位缺陷", "构造输入验证修复效果"],
            "tags": ["security-coding", "deserialization", "ctf"],
        }
    )

    assert any(alias in title for alias in aliases)
    assert any(alias in body for alias in aliases)
