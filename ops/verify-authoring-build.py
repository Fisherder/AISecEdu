#!/usr/bin/env python3
"""Exercise the split real-Pro specification/artifact authoring build."""

import json
import pathlib
import shutil
import subprocess
import tempfile
import time
from types import SimpleNamespace

from CTFd.plugins.dojo_plugin.config import DOJO_AI_AUTHORING_BUILD_MODEL
from CTFd.plugins.dojo_plugin.learning import authoring
from CTFd.plugins.dojo_plugin.learning.evidence import redact_text
from CTFd.plugins.dojo_plugin.learning.intelligence import (
    _sensitive_solution_literals,
)
from CTFd.plugins.dojo_plugin.learning.authoring import (
    _base_spec,
    _model_build,
    _model_preflight_review,
    _repair_until_clear,
    _write_custom_package,
)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


started = time.monotonic()


def checkpoint(stage):
    print(
        json.dumps(
            {
                "authoringVerificationStage": stage,
                "elapsedSeconds": round(time.monotonic() - started, 1),
            },
            sort_keys=True,
        ),
        flush=True,
    )


def diagnostic_finding(finding, spec):
    message = redact_text(finding.get("message") or "")
    protected = {
        str(spec.get("verificationAnswer") or ""),
        *_sensitive_solution_literals(spec.get("privateSolution") or {}),
    }
    for assertion in (spec.get("oracleContract") or {}).get("assertions") or []:
        if assertion.get("operator") != "exists":
            protected.add(str(assertion.get("value")))
    for literal in sorted(protected, key=len, reverse=True):
        if len(literal) >= 4:
            message = message.replace(literal, "[protected]")
    return {
        "id": finding["id"],
        "status": finding.get("status"),
        "severity": finding["severity"],
        "stage": finding["stage"],
        "message": message[:320],
    }


brief = (
    "创建一题无互联网的入门 Web 鉴权实验：本地服务错误信任可修改的用户标识。"
    "学生建立正常请求基线、用对照请求证明越权读取，并说明服务端所有权校验。"
)
constraints = {
    "id": "split-build-smoke",
    "title": "Authorization Boundary",
    "category": "WEB",
    "difficulty": 2,
    "image": "pwncollege/challenge-legacy:latest",
}
planned = _base_spec(brief, constraints, "L3", [])
planned["authoringPlan"] = {
    "teachingGoal": "Use observable request differences to identify an authorization boundary.",
    "implementationSteps": [
        "Create a minimal local HTTP service and client.",
        "Expose a deterministic ownership flaw without external dependencies.",
    ],
    "validationStrategy": [
        "Verify own-profile baseline, cross-profile behavior, and explanation artifact."
    ],
    "riskControls": ["No network, credentials, dynamic secrets, or privileged runtime."],
}
built, stage = _model_build(brief, constraints, "L3", [], planned)
checkpoint("build-ready")
require(stage["provider"] == "MODEL", "split build did not use the model")
require(stage["model"] == DOJO_AI_AUTHORING_BUILD_MODEL, "wrong build model")
require(
    set((stage.get("stages") or {})) == {"specification", "artifacts"},
    "split build did not report both Pro stages",
)
require(
    sum(
        len(str(item.get("content") or ""))
        for item in built.get("starterFiles") or []
        if isinstance(item, dict)
    )
    <= 18000,
    "artifact stage exceeded its file-content budget",
)
initial_review, review_stage = _model_preflight_review(
    brief, constraints, "L3", [], built
)
checkpoint("initial-review-ready")
require(review_stage["provider"] == "MODEL", "red-team review fell back")
final_spec, final_review, repair_stage, post_review_stage = _repair_until_clear(
    brief,
    constraints,
    "L3",
    [],
    built,
    initial_review,
)
checkpoint("repair-and-review-ready")
print(
    json.dumps(
        {
            "authoringReviewDiagnostic": {
                "initialVerdict": initial_review["verdict"],
                "initialFindings": [
                    diagnostic_finding(finding, final_spec)
                    for finding in initial_review["findings"]
                ],
                "finalVerdict": (final_review or {}).get("verdict"),
                "finalFindings": [
                    diagnostic_finding(finding, final_spec)
                    for finding in (final_review or {}).get("findings", [])
                ],
                "repairCycles": len(repair_stage["cycles"]),
                "resolved": repair_stage["resolved"],
                "cycles": [
                    {
                        "cycle": cycle["cycle"],
                        "mode": cycle.get("mode", "EXACT_PATCH"),
                        "provider": cycle["repair"].get("provider"),
                        "appliedEdits": len(
                            cycle["repair"].get("appliedFileEdits") or []
                        ),
                        "rejectedEdits": [
                            {
                                "path": redact_text(item.get("path") or "")[
                                    :160
                                ],
                                "reason": item.get("reason"),
                            }
                            for item in cycle["repair"].get(
                                "rejectedFileEdits"
                            )
                            or []
                        ],
                        "regressionRejected": cycle["repair"].get(
                            "regressionRejected", False
                        ),
                        "outputVerdict": cycle.get("outputVerdict"),
                    }
                    for cycle in repair_stage["cycles"]
                ],
            }
        },
        sort_keys=True,
    ),
    flush=True,
)
require(
    final_review
    and final_review["verdict"] == "PASS"
    and not any(
        finding.get("status", "OPEN") == "OPEN"
        and finding["severity"] in {"MEDIUM", "HIGH", "CRITICAL"}
        for finding in final_review["findings"]
    ),
    "bounded repair/re-review loop did not produce a releasable build",
)
require(final_spec.get("starterFiles"), "repair loop removed all starter files")
require(
    sum(
        len(str(item.get("content") or ""))
        for item in final_spec.get("starterFiles") or []
        if isinstance(item, dict)
    )
    <= 18000,
    "repaired artifact stage exceeded its file-content budget",
)
require(
    (final_spec.get("oracleContract") or {}).get("type") == "FLAG_GATE_V1"
    and (final_spec.get("oracleContract") or {}).get("assertions"),
    "build did not produce a declarative Flag gate",
)
live_bindings = final_spec["oracleContract"].get("liveBindings") or []
require(
    all(
        any(
            assertion["field"] == field
            and assertion["operator"] != "exists"
            for assertion in final_spec["oracleContract"]["assertions"]
        )
        for field in final_spec["oracleContract"].get("requiredFields") or []
    ),
    "Flag gate contains a field without a concrete target value",
)
require(live_bindings, "Web exercise did not declare live Flag-gate evidence")
require(
    set(final_spec["oracleContract"].get("requiredFields") or [])
    <= {binding["field"] for binding in live_bindings},
    "Flag gate still depends on learner-supplied fields",
)
require(
    any(
        binding.get("capture") in {"body_sha256", "json_field"}
        for binding in live_bindings
    ),
    "Web exercise only bound a guessable HTTP status",
)
require(
    set(final_spec["oracleContract"].get("integrityFiles") or [])
    == {
        item["path"]
        for item in final_spec["starterFiles"]
        if isinstance(item, dict) and item.get("path")
    },
    "live Oracle integrity coverage does not match the current starter files",
)
runtime_services = (final_spec.get("runtimeContract") or {}).get("services") or []
require(runtime_services, "Web exercise did not declare a runtime service")
require(
    all(
        service["entrypoint"]
        in {item["path"] for item in final_spec["starterFiles"]}
        for service in runtime_services
    ),
    "runtime service references a missing starter file",
)
require(
    not authoring._runtime_contract_diagnostics(
        final_spec,
        authoring._normalize_runtime_contract(
            final_spec.get("runtimeContract")
        ),
    ),
    "runtime contract failed deterministic static validation",
)
require(
    not authoring._private_solution_runtime_diagnostics(
        final_spec,
        authoring._normalize_runtime_contract(
            final_spec.get("runtimeContract")
        ),
    ),
    "private solution tried to restart a platform-managed service",
)
require(
    "/challenge/check" in final_spec["description"]
    and "动态 Flag" in final_spec["description"]
    and "solution.json" not in final_spec["description"],
    "public description did not receive Flag-only submission instructions",
)

package_root = pathlib.Path(tempfile.mkdtemp(prefix="aisecedu-authoring-"))
original_dojos_dir = authoring.DOJOS_DIR
try:
    authoring.DOJOS_DIR = package_root
    package = _write_custom_package(
        SimpleNamespace(
            spec=final_spec,
            dojo=SimpleNamespace(hex_dojo_id="agentquality"),
            module_index=0,
        ),
        999999,
        1,
    )
    subprocess.run(
        [
            "python3",
            "-m",
            "py_compile",
            str(package / "check-server.py"),
            str(package / "runtime-launcher.py"),
        ],
        check=True,
    )
    generated_scaffold = sorted(
        path.name
        for path in package.iterdir()
        if path.name in {".init", "check", "check-server.py", "runtime-launcher.py"}
    )
    checker_mode = (package / "check-server.py").stat().st_mode & 0o777
    checker_source = (package / "check-server.py").read_text()
    launcher_source = (package / "runtime-launcher.py").read_text()
    init_source = (package / ".init").read_text()
finally:
    authoring.DOJOS_DIR = original_dojos_dir
    shutil.rmtree(package_root, ignore_errors=True)
require(checker_mode == 0o700, "private checker source is readable by learners")
require(
    "HTTPConnection" in checker_source
    and "validate_integrity" in checker_source
    and "original_service_running" in checker_source,
    "private checker did not compile live response, integrity, and process checks",
)
require(
    "dojo-learning-service-pids.json" in launcher_source
    and "dict(os.environ)" not in launcher_source,
    "runtime launcher did not create a private process record or leaked host env",
)
ownership_guard = (
    "chown root:root /challenge/check-server.py "
    "/challenge/runtime-launcher.py"
)
require(
    ownership_guard in init_source
    and init_source.index(ownership_guard)
    < init_source.index("python3 /challenge/check-server.py")
    and (
        "chmod 0700 /challenge/check-server.py "
        "/challenge/runtime-launcher.py"
    )
    in init_source,
    "private Flag-gate source is not root-owned before it starts",
)
print(
    json.dumps(
        {
            "provider": stage["provider"],
            "model": stage["model"],
            "stages": sorted(stage["stages"]),
            "initialStarterFiles": len(built.get("starterFiles") or []),
            "initialPrivateSolutionSteps": len(
                (built.get("privateSolution") or {}).get("steps") or []
            ),
            "starterFiles": len(final_spec.get("starterFiles") or []),
            "privateSolutionSteps": len(
                (final_spec.get("privateSolution") or {}).get("steps") or []
            ),
            "contentCharacters": sum(
                len(str(item.get("content") or ""))
                for item in final_spec.get("starterFiles") or []
                if isinstance(item, dict)
            ),
            "initialReview": initial_review["verdict"],
            "finalReview": final_review["verdict"],
            "repairCycles": len(repair_stage["cycles"]),
            "postReviewProvider": post_review_stage["provider"],
            "oracleAssertions": len(final_spec["oracleContract"]["assertions"]),
            "oracleLiveBindings": len(live_bindings),
            "runtimeServices": len(runtime_services),
            "generatedScaffold": generated_scaffold,
            "privateCheckerMode": oct(checker_mode),
        },
        sort_keys=True,
    )
)
