#!/usr/bin/env python3
"""Runtime-only verification for the context shared by Tutor and Grader."""

import json
import os

from CTFd.models import Users
from CTFd.plugins.dojo_plugin.learning.context import (
    attempt_agent_context,
    learning_profile_context,
)
from CTFd.plugins.dojo_plugin.learning.evidence import active_attempt


def main():
    user_id = int(os.getenv("AISECEDU_AGENT_TEST_USER_ID", "101"))
    user = Users.query.get(user_id)
    if not user:
        raise AssertionError(f"user {user_id} does not exist")
    attempt = active_attempt(user.id)
    if not attempt:
        raise AssertionError(f"user {user_id} has no active attempt")
    context = attempt_agent_context(
        attempt, include_private=True, include_container=True
    )
    profile = learning_profile_context(user)
    encoded = json.dumps(context, ensure_ascii=False, sort_keys=True)
    forbidden = (
        os.environ.get("DEEPSEEK_API_KEY"),
        os.environ.get("DOJO_AI_API_KEY"),
    )
    if any(value and value in encoded for value in forbidden):
        raise AssertionError("agent context contains a model API key")
    live = context.get("liveContainer") or {}
    if not live.get("available") or not live.get("matchesAttempt"):
        raise AssertionError("agent context is not attached to the expected container")
    if not (context.get("referenceFiles") or {}).get("files"):
        raise AssertionError("agent context has no baseline challenge files")
    if (context.get("referenceFiles") or {}).get("versionMatched") is not True:
        reference = context.get("referenceFiles") or {}
        raise AssertionError(
            "baseline and private reference are not pinned to the attempt "
            f"version: attempt={reference.get('attemptVersion')!r}, "
            f"package={reference.get('packageVersion')!r}"
        )
    if not ((live.get("files") or {}).get("files")):
        raise AssertionError("agent context has no live challenge files")
    result = {
        "userId": user.id,
        "attemptId": attempt.id,
        "referenceFiles": len(context["referenceFiles"]["files"]),
        "attemptVersion": context["referenceFiles"].get("attemptVersion"),
        "packageVersion": context["referenceFiles"].get("packageVersion"),
        "versionMatched": context["referenceFiles"].get("versionMatched"),
        "liveFiles": len(live["files"]["files"]),
        "events": len(context["studentTrajectory"]["events"]),
        "tutorMessages": len(context["studentTrajectory"]["tutorHistory"]),
        "containerStatus": live["container"]["status"],
        "privateReference": bool(context.get("privateReference")),
        "courses": len(profile.get("courses") or []),
        "skills": len(profile.get("skills") or []),
        "contextCharacters": len(encoded),
    }
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))


main()
