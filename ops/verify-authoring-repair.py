#!/usr/bin/env python3
"""Exercise the real Pro repair protocol with a bounded file-level defect."""

import json

from CTFd.plugins.dojo_plugin.config import DOJO_AI_AUTHORING_BUILD_MODEL
from CTFd.plugins.dojo_plugin.learning.authoring import _repair_until_clear


def require(condition, message):
    if not condition:
        raise AssertionError(message)


built = {
    "id": "repair-protocol-smoke",
    "name": "Repair protocol smoke",
    "description": "Inspect and repair a local authorization check.",
    "category": "WEB",
    "difficulty": 2,
    "objectives": ["Distinguish authenticated identity from requested identity."],
    "tags": ["authorization"],
    "image": "pwncollege/challenge-legacy:latest",
    "privileged": False,
    "allowPrivileged": False,
    "interfaces": [{"name": "web", "port": 8080}],
    "starterFiles": [
        {
            "path": "app.py",
            "content": (
                "def read_profile(authenticated_id, requested_id, profiles):\n"
                "    if requested_id:\n"
                "        return profiles[requested_id]\n"
                "    raise PermissionError('missing id')\n"
            ),
        }
    ],
    "verificationAnswer": "platform-owned",
    "rubric": {},
    "hintPolicy": {},
    "mode": "CREATE_NEW",
    "sourceChallengeId": None,
    "sourceReferenceId": None,
    "oracleContract": {
        "type": "FLAG_GATE_V1",
        "requiredFields": ["authorization_result"],
        "assertions": [
            {
                "field": "authorization_result",
                "operator": "equals",
                "value": "denied",
            }
        ],
    },
    "runtimeContract": {"services": []},
    "authoringPlan": {},
    "implementation": {
        "summary": "A deliberately flawed local profile reader.",
        "selfChecks": ["Unauthorized profile reads must be rejected."],
    },
    "privateSolution": {
        "overview": "Show that requested identity is trusted instead of authenticated identity.",
        "steps": [
            {
                "goal": "Establish the broken authorization behavior.",
                "action": "Compare own-profile and another-profile requests.",
                "expectedEvidence": "Both return data before the repair.",
                "files": ["app.py"],
            }
        ],
        "successIndicators": ["Cross-user access is denied after repair."],
        "commonFailureModes": [],
        "protectedFacts": {},
    },
}
review = {
    "verdict": "BLOCK",
    "summary": "The service does not enforce ownership.",
    "findings": [
        {
            "id": "authz-owner-check",
            "status": "OPEN",
            "severity": "HIGH",
            "stage": "RUNTIME",
            "message": (
                "app.py accepts any non-empty requested_id. Require requested_id to equal "
                "authenticated_id before indexing profiles."
            ),
            "recommendation": "Use one exact fragment replacement and update the private success check.",
        }
    ],
}

repaired, final_review, stage, post_review_stage = _repair_until_clear(
    (
        "Repair the authorization boundary without changing the exercise identity. "
        "The exercise must teach ownership enforcement by contrasting own and cross-user access."
    ),
    {
        "id": built["id"],
        "category": "WEB",
        "difficulty": 2,
        "image": built["image"],
    },
    "L3",
    [],
    built,
    review,
    max_cycles=2,
)
require(stage["provider"] == "MODEL", "repair did not use the configured model")
require(
    stage["model"] == DOJO_AI_AUTHORING_BUILD_MODEL,
    "repair used the wrong model",
)
require(stage["cycles"], "repair loop did not execute")
first_repair = stage["cycles"][0]["repair"]
require(
    first_repair["appliedFileEdits"],
    "repair returned no applicable exact file edit",
)
require(
    all(
        cycle["repair"]["stages"]["privateSolution"]["provider"] == "MODEL"
        for cycle in stage["cycles"]
        if cycle.get("mode") != "COHERENCE_REBUILD"
    ),
    "private-solution repair fell back from the configured model",
)
require(
    repaired["starterFiles"][0]["content"] != built["starterFiles"][0]["content"],
    "repair did not change the defective file",
)
require(
    repaired["id"] == built["id"]
    and repaired["verificationAnswer"] == built["verificationAnswer"],
    "repair changed a protected field",
)
require(stage["resolved"], "post-repair reviewer did not resolve the finding")
require(
    final_review["verdict"] == "PASS"
    and post_review_stage["provider"] == "MODEL",
    "post-repair review did not pass with the configured model",
)
print(
    json.dumps(
        {
            "provider": stage["provider"],
            "model": stage["model"],
            "repairCycles": len(stage["cycles"]),
            "appliedFileEdits": len(first_repair["appliedFileEdits"]),
            "rejectedFileEdits": len(first_repair["rejectedFileEdits"]),
            "finalVerdict": final_review["verdict"],
            "resolved": stage["resolved"],
            "protectedFieldsPreserved": True,
        },
        sort_keys=True,
    )
)
