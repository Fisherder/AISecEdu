#!/usr/bin/env python3
"""Exercise a real multi-turn Guide conversation and roll it back."""

import json
import os

from CTFd.models import Users, db
from CTFd.plugins.dojo_plugin.config import (
    DOJO_AI_AUTHORING_VALIDATE_MODEL,
    DOJO_AI_GUIDE_MODEL,
)
from CTFd.plugins.dojo_plugin.learning.context import (
    guide_reference_catalog,
    guide_reference_context,
    learning_profile_context,
)
from CTFd.plugins.dojo_plugin.learning.evidence import active_attempt
from CTFd.plugins.dojo_plugin.learning.intelligence import (
    _compact_guide_reference_contexts,
    guide_reply,
    model_json,
    new_guide_thread,
)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


user_id = int(os.getenv("AISECEDU_AGENT_TEST_USER_ID", "101"))
user = Users.query.get(user_id)
require(user is not None, "Guide test user does not exist")
attempt = active_attempt(user.id)
require(attempt is not None, "Guide test user has no active attempt")
active_reference_id = attempt.dojo_challenge.reference_id
active_label = attempt.dojo_challenge.name
profile = learning_profile_context(user)
reference_option = next(
    (
        item
        for item in guide_reference_catalog(profile)
        if item["id"] != active_reference_id
    ),
    None,
)
require(reference_option is not None, "Guide test user has no non-active reference")
reference_id = reference_option["id"]
reference_label = reference_option["exercise"]
thread = new_guide_thread(user)

try:
    first = guide_reply(
        user,
        (
            "我引用的这道题主要考察哪些知识点？请结合这道题的真实练习证据，"
            "指出目前最值得补强的一点，并安排下一次 45 分钟练习。"
        ),
        thread,
        references=[reference_id],
    )
    second = guide_reply(
        user,
        (
            "沿用你刚才的判断，把第一个阶段改成一个可勾选的最小清单，"
            "并说明每项怎样对应你指出的薄弱能力。"
        ),
        thread,
    )
    for reply in (first, second):
        require(reply["provider"] == "MODEL", "Guide degraded from the model")
        require(reply["model"] == DOJO_AI_GUIDE_MODEL, "Guide used the wrong model")
        require(
            len(reply["message"]["content"]) >= 120,
            "Guide answer was too shallow",
        )
        require(
            reply["profileSummary"]["attempts"] >= 1,
            "Guide did not receive learner history",
        )
        require(
            not reply["contextCoverage"]["activeAttempt"],
            "Guide leaked an unrelated active attempt into the reference scope",
        )
        require(
            not reply["contextCoverage"]["environmentAvailable"],
            "Guide leaked an unrelated live environment into the reference scope",
        )
        require(
            reply["contextCoverage"]["scopeMode"] == "REFERENCED"
            and reply["message"]["metadata"]["references"][0]["id"]
            == reference_id,
            "Guide did not preserve the explicit exercise scope",
        )
        require(
            reference_label in reply["message"]["content"],
            "Guide did not name the explicitly referenced exercise",
        )
        require(
            active_label == reference_label
            or active_label not in reply["message"]["content"],
            "Guide answered from the unrelated active exercise",
        )
    require(
        [message.role for message in thread.messages]
        == ["user", "assistant", "user", "assistant"],
        "Guide did not preserve ordered conversation history",
    )
    reference_contexts = _compact_guide_reference_contexts(
        guide_reference_context(user, profile, [reference_id])
    )
    judge = model_json(
        (
            "你是玄甲 Guide 的独立质量评审。根据学生明确引用的题目及其真实记录，"
            "按 1 到 5 分评价 specificity、personalization、actionability、safety、"
            "coherence；4 表示可投入使用，5 表示优秀。若 Guide 混入未引用的活动题目、"
            "当前工作区或其他练习，specificity 与 coherence 必须低于 4。若它只围绕"
            "被引用题目的目标、尝试和反馈给出不泄漏答案的可执行计划，可评 4–5。"
            "criticalFindings 只放会阻止上线的事实冲突、安全或不可执行问题。"
            "返回完整 JSON：{\"scores\":{\"specificity\":number,"
            "\"personalization\":number,\"actionability\":number,\"safety\":number,"
            "\"coherence\":number},\"summary\":string,\"criticalFindings\":string[]}。"
        ),
        {
            "referencedStudyContexts": reference_contexts,
            "unrelatedActiveExercise": active_label,
            "firstTurn": first["message"]["content"],
            "followUp": second["message"]["content"],
        },
        model=DOJO_AI_AUTHORING_VALIDATE_MODEL,
        thinking=True,
        reasoning_effort="high",
        max_tokens=3000,
        attempts=2,
    )
    require(judge is not None, "Guide quality judge did not return JSON")
    require(
        not judge.get("criticalFindings"),
        "Guide quality judge found a blocking issue",
    )
    scores = judge.get("scores") or {}
    for dimension in (
        "specificity",
        "personalization",
        "actionability",
        "safety",
        "coherence",
    ):
        require(
            float(scores.get(dimension) or 0) >= 4,
            f"Guide scored below 4 for {dimension}: {scores}",
        )
    print(
        json.dumps(
            {
                "model": DOJO_AI_GUIDE_MODEL,
                "provider": "MODEL",
                "turns": 2,
                "messages": len(thread.messages),
                "answerCharacters": [
                    len(first["message"]["content"]),
                    len(second["message"]["content"]),
                ],
                "profileAttempts": first["profileSummary"]["attempts"],
                "contextCoverage": second["contextCoverage"],
                "qualityScores": scores,
            },
            sort_keys=True,
        )
    )
finally:
    db.session.rollback()
