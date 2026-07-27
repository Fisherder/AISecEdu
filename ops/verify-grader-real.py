#!/usr/bin/env python3
"""Exercise the real evidence-aware Grader and roll back cached state."""

import json
import os
import re

from CTFd.models import Users, db
from CTFd.plugins.dojo_plugin.config import DOJO_AI_GRADER_MODEL
from CTFd.plugins.dojo_plugin.learning.assessment import (
    _events,
    _model_process_assessment,
    _process_criteria,
)
from CTFd.plugins.dojo_plugin.learning.evidence import (
    active_attempt,
    verify_evidence_chain,
)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


user_id = int(os.getenv("AISECEDU_AGENT_TEST_USER_ID", "101"))
user = Users.query.get(user_id)
require(user is not None, "Grader test user does not exist")
attempt = active_attempt(user.id)
require(attempt is not None, "Grader test user has no active attempt")
events = _events(attempt)
chain = verify_evidence_chain(attempt.id)
baseline = _process_criteria(attempt, events, chain["valid"])

try:
    result = _model_process_assessment(
        attempt,
        events,
        chain,
        False,
        baseline,
    )
    require(result is not None, "Grader degraded from the model")
    require(
        result["agentMeta"].get("model") == DOJO_AI_GRADER_MODEL,
        "Grader used the wrong model",
    )
    require(result["liveContext"], "Grader did not inspect the live container")
    require(result["solutionProvider"], "Grader did not use a private solution")
    require(
        result["contextVersion"]["matched"] is True,
        "Grader baseline/private solution version does not match the attempt",
    )
    require(len(result["feedback"]) >= 100, "Grader feedback was too shallow")
    require(
        sum(item["score"] for item in result["criteria"]) <= 40,
        "Grader exceeded the process-score budget",
    )
    cited = sum(
        len((item.get("evidence") or {}).get("evidenceSequences") or [])
        + len((item.get("evidence") or {}).get("containerEvidence") or [])
        for item in result["criteria"]
    )
    require(cited > 0, "Grader cited no process or container evidence")
    visible = json.dumps(
        {
            "criteria": result["criteria"],
            "abilities": result["abilities"],
            "feedback": result["feedback"],
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    require(
        not re.search(
            r"pwn\.college\{|(?i:bearer\s+[A-Za-z0-9._~+/=-]+)",
            visible,
        ),
        "Grader exposed a protected credential pattern",
    )
    print(
        json.dumps(
            {
                "model": DOJO_AI_GRADER_MODEL,
                "provider": "MODEL",
                "liveContext": result["liveContext"],
                "solutionProvider": result["solutionProvider"],
                "contextVersion": result["contextVersion"],
                "criteria": len(result["criteria"]),
                "citedEvidence": cited,
                "feedbackCharacters": len(result["feedback"]),
                "feedbackBlocked": result["feedbackBlocked"],
            },
            sort_keys=True,
        )
    )
finally:
    db.session.rollback()
