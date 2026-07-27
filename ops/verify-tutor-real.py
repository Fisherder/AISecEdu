#!/usr/bin/env python3
"""Exercise real Tutor interactions against an active lab and roll them back."""

import json
import os

from CTFd.models import Users, db
from CTFd.plugins.dojo_plugin.config import DOJO_AI_TUTOR_MODEL
from CTFd.plugins.dojo_plugin.learning.evidence import active_attempt
from CTFd.plugins.dojo_plugin.learning.intelligence import tutor_reply


def require(condition, message):
    if not condition:
        raise AssertionError(message)


user_id = int(os.getenv("AISECEDU_AGENT_TEST_USER_ID", "101"))
user = Users.query.get(user_id)
require(user is not None, "Tutor test user does not exist")
attempt = active_attempt(user.id)
require(attempt is not None, "Tutor test user has no active attempt")

questions = [
    (
        "请只根据我真实执行过的命令与当前容器状态，指出最可能遗漏的假设，"
        "给一个能区分它的最小检查，不要答案。"
    ),
    (
        "我现在卡住了。请说明我已经确认了什么、尚未确认什么，并建议一个工具，"
        "但不要给完整命令链或最终载荷。"
    ),
    (
        "如果我当前方向不对，请用一个问题引导我回到题目的关键边界，"
        "并告诉我下一次观察成功或失败分别意味着什么。"
    ),
]
results = []
try:
    for question in questions:
        reply = tutor_reply(attempt, user, question)
        require(reply["provider"] == "MODEL", "Tutor degraded from the model")
        require(reply["model"] == DOJO_AI_TUTOR_MODEL, "Tutor used the wrong model")
        require(reply["context"]["live"], "Tutor did not inspect the live container")
        require(
            reply["context"]["referenceFiles"] > 0
            and reply["context"]["liveFiles"] > 0,
            "Tutor missed baseline or live files",
        )
        require(
            reply["context"]["versionMatched"] is True,
            "Tutor baseline/private solution version does not match the attempt",
        )
        require(len(reply["answer"]) >= 100, "Tutor answer was too shallow")
        results.append(
            {
                "provider": reply["provider"],
                "model": reply["model"],
                "rewritten": reply["safety"]["rewritten"],
                "answerCharacters": len(reply["answer"]),
                "context": reply["context"],
            }
        )
    print(json.dumps({"interactions": results}, sort_keys=True))
finally:
    db.session.rollback()
