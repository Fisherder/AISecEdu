#!/usr/bin/env python3
"""Provision teacher-only runtime packages for the seven private drafts.

Run inside the CTFd container after the draft-runtime implementation is
deployed.  This deliberately creates hidden Dojo challenges with a future
visibility window; it never changes a draft to PUBLISHED.
"""

from __future__ import annotations

import json


EXPECTED = {
    "lab03-control-flow-analysis": (0, "practice"),
    "lab04-protocol-fuzz-analysis": (0, "practice"),
    "lab05-exception-dispatch-analysis": (0, "practice"),
    "lab06-format-string-analysis": (0, "practice"),
    "lab07-web-input-analysis": (0, "practice"),
    "hw02-bounds-check": (1, "coding"),
    "hw03-safe-sprintf": (1, "coding"),
}


def main():
    from CTFd import create_app

    app = create_app()
    with app.app_context():
        from CTFd.models import Users, db
        from CTFd.plugins.dojo_plugin.learning.draft_runtime import (
            provision_draft_runtime,
            runtime_view,
        )
        from CTFd.plugins.dojo_plugin.models import DojoChallenges, Dojos, LearningDrafts

        dojo = Dojos.query.filter_by(dojo_id=3839952).one()
        actor = Users.query.get(1)
        if actor is None:
            raise RuntimeError("Configured teacher account is unavailable")
        rows = {
            str((row.spec or {}).get("id")): row
            for row in LearningDrafts.query.filter_by(dojo_id=dojo.dojo_id).all()
            if str((row.spec or {}).get("id")) in EXPECTED
        }
        if set(rows) != set(EXPECTED):
            raise RuntimeError(f"draft set mismatch: {sorted(rows)}")

        result = []
        for identifier in sorted(rows):
            draft = rows[identifier]
            module_index, question_type = EXPECTED[identifier]
            if draft.status != "DRAFT" or draft.published_challenge_id is not None:
                raise RuntimeError(f"{identifier} is no longer a private draft")
            if draft.module_index != module_index:
                raise RuntimeError(f"{identifier} has incorrect module placement")
            if (draft.constraints or {}).get("questionType") != question_type:
                raise RuntimeError(f"{identifier} has incorrect question type")
            challenge = provision_draft_runtime(draft, actor, force=True)
            view = runtime_view(draft)
            if not view["available"] or view["studentVisible"] or challenge.visible():
                raise RuntimeError(f"{identifier} runtime visibility invariant failed")
            result.append(
                {
                    "id": identifier,
                    "dojoChallengeId": challenge.id,
                    "challengeId": challenge.challenge_id,
                    "assignment": view["workspace"]["assignment"],
                    "questionType": question_type,
                }
            )
        db.session.commit()

        hidden_ids = {
            row.id
            for row in DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id).all()
            if (row.data or {}).get("draft_runtime")
        }
        if len(hidden_ids) != len(EXPECTED):
            raise RuntimeError(f"hidden runtime count mismatch: {sorted(hidden_ids)}")
        print(json.dumps({"provisioned": result, "studentVisible": False}, ensure_ascii=False, sort_keys=True))


if __name__ == "__main__":
    main()
