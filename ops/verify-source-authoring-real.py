#!/usr/bin/env python3
"""Exercise source-backed Flash -> Pro -> Pro authoring against the real API."""

import importlib.util
import json
import pathlib
import secrets

import yaml


SCRIPT_DIR = pathlib.Path(__file__).resolve().parent
FLOW_PATH = SCRIPT_DIR / "verify-learning-flow.py"
MODULE_SPEC = importlib.util.spec_from_file_location(
    "aisecedu_verify_learning_flow", FLOW_PATH
)
if MODULE_SPEC is None or MODULE_SPEC.loader is None:
    raise RuntimeError("unable to load learning-flow verification helpers")
flow = importlib.util.module_from_spec(MODULE_SPEC)
MODULE_SPEC.loader.exec_module(flow)


def pipeline_diagnostics(draft):
    pipeline = (draft.get("spec") or {}).get("authoringPipeline") or {}
    return {
        stage: {
            "provider": (pipeline.get(stage) or {}).get("provider"),
            "model": (pipeline.get(stage) or {}).get("model"),
        }
        for stage in ("plan", "build", "review", "postReview", "validate")
    }


def assert_source_routes(draft, level, expected_mode):
    spec = draft["spec"]
    pipeline = spec.get("authoringPipeline") or {}
    build = pipeline.get("build") or {}
    if (
        spec.get("mode") != expected_mode
        or spec.get("sourceChallengeId") is None
        or spec.get("verificationAnswer") is not None
        or spec.get("starterFiles") != []
        or spec.get("oracleContract") != {}
        or spec.get("runtimeContract") != {}
        or (pipeline.get("plan") or {}).get("model")
        != "deepseek-v4-flash"
        or (pipeline.get("plan") or {}).get("provider") != "MODEL"
        or build.get("model") != "deepseek-v4-pro"
        or build.get("provider") != "MODEL"
        or ((build.get("stages") or {}).get("sourceSnapshot") or {}).get(
            "provider"
        )
        != "PLATFORM"
        or (pipeline.get("review") or {}).get("model")
        != "deepseek-v4-pro"
        or (pipeline.get("validate") or {}).get("model")
        != "deepseek-v4-pro"
    ):
        raise AssertionError(
            f"{level} source authoring route/contract mismatch: "
            + json.dumps(
                {
                    "mode": spec.get("mode"),
                    "sourceChallengeId": spec.get("sourceChallengeId"),
                    "hasVerificationAnswer": (
                        spec.get("verificationAnswer") is not None
                    ),
                    "starterFiles": len(spec.get("starterFiles") or []),
                    "hasOracleContract": bool(spec.get("oracleContract")),
                    "hasRuntimeContract": bool(spec.get("runtimeContract")),
                    "pipeline": pipeline_diagnostics(draft),
                    "buildStages": sorted(
                        (build.get("stages") or {}).keys()
                    ),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )


def main():
    initial_counts = flow.solution_counts()
    admin_name, admin_password = flow.credentials()
    admin = flow.authenticate(admin_name, admin_password)
    flow.require(admin.get(f"{flow.BASE_URL}/admin", timeout=20))

    suffix = secrets.token_hex(4)
    username = f"learning-e2e-{suffix}"
    password = secrets.token_urlsafe(18)
    dojo_id = f"learning-e2e-{suffix}"
    learner = None
    user_id = None
    workspace = None
    dojo = None
    database_id = None
    native_challenge_ids = []
    draft_ids = []
    published_challenge_ids = []
    published_resource_ids = []
    latest_published = None

    try:
        learner = flow.authenticate(username, password, register=True)
        me = flow.require(
            learner.get(f"{flow.BASE_URL}/api/v1/users/me", timeout=20)
        ).json()
        user_id = me["data"]["id"]
        workspace = f"user_{user_id}"

        course_spec = {
            "id": dojo_id,
            "name": "AISecEdu Source Authoring Verification",
            "type": "public",
            "modules": [
                {
                    "id": "lab",
                    "name": "Native Evidence Unit",
                    "challenges": [
                        {
                            "id": "baseline",
                            "name": "Native Baseline Evidence",
                            "description": (
                                "Execute `/challenge/run` to read this "
                                "container's dynamic flag, then submit that "
                                "flag through the platform's native answer "
                                "form. This source task does not use "
                                "solution.json or a custom checker."
                            ),
                        },
                    ],
                }
            ],
            "files": [
                {
                    "type": "text",
                    "path": "lab/baseline/run",
                    "content": (
                        "#!/opt/pwn.college/bash\n"
                        "cat /flag\n"
                    ),
                }
            ],
        }
        response = flow.require(
            admin.post(
                f"{flow.BASE_URL}/pwncollege_api/v1/dojos/create",
                json={
                    "spec": yaml.safe_dump(
                        course_spec, sort_keys=False
                    )
                },
                timeout=120,
            )
        )
        dojo = response.json()["dojo"]
        database_id = flow.dojo_database_id(dojo_id)
        native_challenge_ids = flow.dojo_challenge_ids(database_id)
        flow.require(
            learner.get(f"{flow.BASE_URL}/dojo/{dojo}/join/", timeout=30)
        )

        for level, expected_mode in (
            ("L1", "USE_EXISTING"),
            ("L2", "ADAPT_EXISTING"),
        ):
            exercise_id = f"{level.lower()}-{suffix}"
            draft = flow.require(
                admin.post(
                    f"{flow.API}/dojos/{dojo}/authoring",
                    json={
                        "brief": (
                            "Reuse the selected native onboarding task. Teach "
                            "the learner to identify its supplied entrypoint, "
                            "run it, and submit the observed dynamic flag "
                            "through the platform's native answer form while "
                            "preserving the exact source runtime semantics."
                        ),
                        "moduleId": "lab",
                        "level": level,
                        "constraints": {
                            "id": exercise_id,
                            "title": f"{level} Native Runtime Snapshot",
                            "category": "GENERAL",
                            "difficulty": 1,
                            "objectives": [
                                (
                                    "Identify and execute the source task's "
                                    "provided /challenge/run entrypoint."
                                ),
                                (
                                    "Use the platform's native dynamic-flag "
                                    "submission flow without inventing a "
                                    "solution.json report."
                                ),
                            ],
                        },
                    },
                    timeout=3600,
                ),
                (201,),
            ).json()["draft"]
            draft_ids.append(draft["id"])
            assert_source_routes(draft, level, expected_mode)

            validation = flow.require(
                admin.post(
                    f"{flow.API}/drafts/{draft['id']}/validate",
                    json={},
                    timeout=3600,
                )
            ).json()["validation"]
            review = validation.get("agentReview") or {}
            if (
                validation.get("status") != "PASS"
                or (validation.get("summary") or {}).get("blocked")
                or review.get("provider")
                not in {"MODEL", "MODEL_ATTESTED"}
                or review.get("model") != "deepseek-v4-pro"
                or review.get("verdict") != "PASS"
            ):
                raise AssertionError(
                    f"{level} real Pro validation failed: "
                    + json.dumps(
                        flow.validation_diagnostics(validation),
                        ensure_ascii=False,
                        sort_keys=True,
                    )
                )

            published = flow.require(
                admin.post(
                    f"{flow.API}/drafts/{draft['id']}/publish",
                    json={},
                    timeout=180,
                )
            ).json()["challenge"]
            package = published.get("package") or {}
            if (
                package.get("mode") != expected_mode
                or package.get("sourceSnapshot") is not True
                or package.get("runtimePolicy")
                != "PRESERVE_SOURCE_NATIVE"
                or package.get("privateSolution") != {}
                or package.get("oracleContract") != {}
                or package.get("runtimeContract") != {}
                or published.get("challengeId")
                == draft["spec"]["sourceChallengeId"]
            ):
                raise AssertionError(
                    f"{level} source snapshot publication contract mismatch"
                )
            published_challenge_ids.append(published["challengeId"])
            latest_published = published
            published_resource_ids.append(
                f"{published['dojoId']}/lab/{exercise_id}"
            )
            flow.passed(
                f"{level} real Flash plan, Pro build/review, and native snapshot publication"
            )

        if latest_published is None:
            raise AssertionError("source authoring produced no published task")
        started = flow.require(
            learner.post(
                f"{flow.BASE_URL}/pwncollege_api/v1/docker",
                json={
                    "dojo": dojo,
                    "module": "lab",
                    "challenge": latest_published["id"],
                },
                timeout=180,
            )
        ).json()
        if not started.get("success"):
            raise AssertionError("temporary Tutor workspace failed to start")
        flow.wait_for_workspace(workspace)
        direct_inventory = flow.inner(
            "exec",
            workspace,
            "/usr/bin/find",
            "/challenge",
            "-mindepth",
            "1",
            "-maxdepth",
            "3",
            "-printf",
            "%y %p -> %l\n",
        ).stdout
        if "/challenge/run" not in direct_inventory:
            raise AssertionError(
                "published source workspace omitted its native entrypoint: "
                + json.dumps(
                    direct_inventory.splitlines()[:30],
                    ensure_ascii=False,
                )
            )
        flow.inner(
            "exec",
            "--user=1000",
            workspace,
            "/run/dojo/bin/dojo",
            "evidence",
            "--exit-code",
            "0",
            "--command",
            "ls -la /challenge",
        )
        tutor = flow.require(
            learner.post(
                f"{flow.API}/tutor",
                json={
                    "question": (
                        "请根据我刚才的真实观察和当前容器状态，指出尚未验证的"
                        "最小假设，并给一个提示性下一步；不要给最终答案或完整命令链。"
                    )
                },
                timeout=600,
            )
        ).json()["reply"]
        context = tutor.get("context") or {}
        if (
            tutor.get("provider") != "MODEL"
            or tutor.get("model") != "deepseek-v4-flash"
            or len(tutor.get("answer") or "") < 100
            or not context.get("live")
            or context.get("referenceFiles", 0) < 1
            or context.get("liveFiles", 0) < 1
            or context.get("versionMatched") is not True
        ):
            raise AssertionError(
                "real Tutor route/context mismatch: "
                + json.dumps(
                    {
                        "provider": tutor.get("provider"),
                        "model": tutor.get("model"),
                        "answerCharacters": len(
                            tutor.get("answer") or ""
                        ),
                        "context": context,
                        "safety": tutor.get("safety"),
                    },
                    ensure_ascii=False,
                    sort_keys=True,
                )
            )
        flow.passed(
            "real Flash Tutor used source baseline, live workspace, evidence, and pinned package version"
        )
    finally:
        if learner is not None:
            learner.delete(
                f"{flow.BASE_URL}/pwncollege_api/v1/docker",
                json={},
                timeout=120,
            )
        if workspace:
            flow.inner("rm", "-f", workspace, check=False)
        if dojo:
            response = admin.post(
                f"{flow.BASE_URL}/dojo/{dojo}/delete/",
                json={"dojo": dojo},
                timeout=180,
            )
            flow.require(response)
            if not response.json().get("success"):
                raise RuntimeError(
                    "source authoring verifier dojo deletion failed"
                )
        if database_id is not None:
            dojo_hex = f"{database_id & 0xFFFFFFFF:08x}"
            flow.outer("rm", "-rf", f"/data/dojos/{dojo_hex}")
            remaining = flow.outer(
                "test",
                "-e",
                f"/data/dojos/.learning/{dojo_hex}",
                check=False,
            )
            if remaining.returncode == 0:
                raise RuntimeError(
                    "source authoring package survived dojo deletion"
                )
        for challenge_id in [
            *native_challenge_ids,
            *published_challenge_ids,
        ]:
            if flow.learning_challenge_rows(challenge_id) != (0, 0):
                raise RuntimeError(
                    "source authoring challenge/profile survived cleanup"
                )
        if user_id:
            flow.cleanup_home(user_id, username)
            response = flow.require(
                admin.delete(
                    f"{flow.BASE_URL}/api/v1/users/{user_id}",
                    json={},
                    timeout=30,
                )
            )
            if not response.json().get("success"):
                raise RuntimeError(
                    "source authoring verifier user deletion failed"
                )
        flow.cleanup_audit_resources(
            (*draft_ids, *published_resource_ids)
        )

    if flow.solution_counts() != initial_counts:
        raise AssertionError(
            "source authoring verifier changed solve/submission counts"
        )
    flow.passed(
        "temporary source course, Tutor workspace, Home, user, drafts, snapshots, profiles, and audit rows cleaned"
    )
    print("All real source-authoring checks passed", flush=True)


if __name__ == "__main__":
    main()
