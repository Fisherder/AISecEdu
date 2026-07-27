#!/usr/bin/env python3

import json
import os

from CTFd.models import Users, db
from CTFd.plugins.dojo_plugin.learning.context import (
    guide_reference_catalog,
    guide_reference_context,
    learning_profile_context,
)
from CTFd.plugins.dojo_plugin.learning.evidence import active_attempt
from flask import current_app, session


def require(condition, message):
    if not condition:
        raise AssertionError(message)


user_id = int(os.getenv("AISECEDU_AGENT_TEST_USER_ID", "79"))
user = Users.query.get(user_id)
require(user is not None, f"Guide reference test user {user_id} does not exist")
with current_app.test_request_context("/guide"):
    session["id"] = user.id
    attempt = active_attempt(user.id)
    require(attempt is not None, "Guide reference test user has no active attempt")
    reference_id = attempt.dojo_challenge.reference_id
    profile = learning_profile_context(user)
    catalog = guide_reference_catalog(profile)
    option = next((item for item in catalog if item["id"] == reference_id), None)
    require(option is not None, "active exercise is missing from the Guide reference catalog")
    contexts = guide_reference_context(
        user,
        profile,
        [reference_id, reference_id, "not/authorized/exercise"],
    )
    require(len(contexts) == 1, "Guide reference validation did not deduplicate and reject invalid references")
    context = contexts[0]
    require(context["id"] == reference_id, "Guide reference resolved to the wrong exercise")
    require(context["attemptCount"] >= 1, "Guide reference omitted the learner's attempt history")
    require(
        any(item["id"] == attempt.id for item in context["attempts"]),
        "Guide reference omitted the active attempt",
    )
    print(
        json.dumps(
            {
                "success": True,
                "reference": reference_id,
                "catalogSize": len(catalog),
                "attempts": context["attemptCount"],
                "recentEvidenceEvents": sum(
                    len(item.get("recentEvents") or []) for item in context["attempts"]
                ),
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
db.session.rollback()
