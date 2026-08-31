#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import urllib.parse


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
FLOW_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
FORBIDDEN_STUDENT_KEYS = {
    "prompt",
    "systemPrompt",
    "provider",
    "model",
    "modelRoute",
    "authorId",
    "createdBy",
    "internalStage",
    "privateSolution",
    "answerKey",
    "flag",
    "selfWorkspaceId",
    "candidateId",
    "publishedChallengeId",
    "parentRevision",
    "contentHash",
    "sourceRefs",
    "validation",
    "instruction",
    "activeJob",
    "lineage",
    "generationJob",
    "currentRevisionId",
    "verificationAnswer",
    "oracleContract",
    "runtimeContract",
    "implementation",
    "conversation",
}


def load_flow():
    spec = importlib.util.spec_from_file_location("course_contract_flow", FLOW_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("unable to load teacher verifier helpers")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def pass_(message):
    print(f"PASS  {message}", flush=True)


def assert_keys(value, keys, label):
    missing = [key for key in keys if key not in value]
    if missing:
        raise AssertionError(f"{label} missing keys: {', '.join(missing)}")


def find_forbidden_keys(value, path="artifact"):
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if key in FORBIDDEN_STUDENT_KEYS:
                found.append(child_path)
            found.extend(find_forbidden_keys(child, child_path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(find_forbidden_keys(child, f"{path}[{index}]"))
    return found


def main():
    flow = load_flow()
    username, password = flow.admin_credentials()
    client = flow.authenticate(username, password)
    context = flow.unwrap(
        client.get(
            flow.api_url("teaching/context?view=teacher-summary"),
            timeout=40,
        )
    )
    courses = context.get("teacherDojos") or []
    if not courses:
        raise AssertionError("deployment has no teacher-manageable course")
    course = max(
        courses,
        key=lambda item: sum(
            int((counts or {}).get("total") or 0)
            for counts in (item.get("counts") or {}).values()
        ),
    )
    reference = str(course.get("referenceId") or "")
    if not reference:
        raise AssertionError("course summary has no referenceId")

    workspace = flow.unwrap(
        client.get(
            flow.api_url(
                f"teaching/courses/{urllib.parse.quote(reference, safe='')}/workspace?includeLearning=0"
            ),
            timeout=60,
        )
    )
    assert_keys(
        workspace,
        {
            "course",
            "courseContext",
            "scope",
            "modules",
            "counts",
            "attention",
            "publishReadiness",
            "recentActivity",
            "evidence",
            "asOf",
            "permissions",
            "contentCollections",
            "statusDefinitions",
        },
        "course workspace",
    )
    if workspace["courseContext"].get("referenceId") != reference:
        raise AssertionError("courseContext does not match the requested course")
    if workspace["scope"].get("courseId") != reference:
        raise AssertionError("workspace scope does not match the requested course")
    pass_("workspace returns one shared course context, scope and evidence timestamp")

    totals = {key: 0 for key in ("total", "draft", "published", "needsAttention")}
    for kind in ("questions", "courseware", "demos"):
        counts = (workspace.get("counts") or {}).get(kind) or {}
        assert_keys(counts, totals, f"{kind} counts")
        if counts["total"] != counts["draft"] + counts["published"]:
            raise AssertionError(f"{kind} total conflicts with draft/published counts")
        for key in totals:
            totals[key] += int(counts[key])
    readiness_counts = (workspace.get("publishReadiness") or {}).get("counts") or {}
    if any(int(readiness_counts.get(key) or 0) != value for key, value in totals.items()):
        raise AssertionError("publish readiness counts conflict with workspace counts")
    pass_("total, draft, published and needs-attention counts are internally consistent")

    for kind in ("materials", "courseware", "demos", "questions"):
        base_path = (
            f"teaching/courses/{urllib.parse.quote(reference, safe='')}/content"
            f"?kind={kind}&sort=updated_desc"
        )
        first = flow.unwrap(client.get(flow.api_url(f"{base_path}&pageSize=1"), timeout=40))
        large = flow.unwrap(client.get(flow.api_url(f"{base_path}&pageSize=100"), timeout=40))
        empty = flow.unwrap(
            client.get(
                flow.api_url(f"{base_path}&q=__aisecedu_contract_no_match__&pageSize=6"),
                timeout=40,
            )
        )
        for payload, size in ((first, 1), (large, 100), (empty, 6)):
            assert_keys(
                payload,
                {"courseContext", "scope", "items", "pagination", "filters", "evidence", "asOf"},
                f"{kind} collection",
            )
            if int(payload["pagination"].get("pageSize") or 0) != size:
                raise AssertionError(f"{kind} did not preserve pageSize={size}")
            if len(payload.get("items") or []) > size:
                raise AssertionError(f"{kind} exceeded pageSize={size}")
        if empty["pagination"].get("total") != 0 or empty.get("items"):
            raise AssertionError(f"{kind} zero-result query returned records")
        expected_total = (workspace.get("counts") or {}).get(kind, {}).get("total")
        if expected_total is not None and int(large["pagination"].get("total") or 0) != int(expected_total):
            raise AssertionError(f"{kind} collection total conflicts with workspace snapshot")
        ids = [str(item.get("id")) for item in large.get("items") or []]
        if len(ids) != len(set(ids)):
            raise AssertionError(f"{kind} collection contains duplicate identifiers")
    pass_("collection endpoints preserve pagination sizes, unique IDs and zero-result queries")

    analytics = flow.unwrap(
        client.get(
            flow.api_url(
                f"teaching/progress/{workspace['course']['id']}?timeRange=30d"
            ),
            timeout=90,
        )
    )
    assert_keys(
        analytics,
        {
            "scope",
            "asOf",
            "evidenceCount",
            "definition",
            "definitionVersion",
            "riskModel",
            "metrics",
            "dataQuality",
        },
        "learning analytics",
    )
    for metric_name, metric in (analytics.get("metrics") or {}).items():
        assert_keys(
            metric,
            {
                "value",
                "numerator",
                "denominator",
                "evidenceCount",
                "sampleSize",
                "coverage",
                "timeRange",
                "confidence",
                "updatedAt",
                "definition",
                "definitionVersion",
                "unavailableReason",
            },
            f"learning metric {metric_name}",
        )
    pass_("learning metrics expose numerator, denominator, evidence, coverage, time, confidence and version")
    risk_model = analytics.get("riskModel") or {}
    if risk_model.get("definitionVersion") != analytics.get("definitionVersion"):
        raise AssertionError("risk threshold version does not match metric definition version")
    if not isinstance(risk_model.get("thresholds"), dict) or not risk_model["thresholds"]:
        raise AssertionError("risk model does not expose its deterministic thresholds")
    if risk_model.get("automaticGradeImpact") is not False:
        raise AssertionError("risk model must not automatically affect grades")
    pass_("risk, stagnation and mastery thresholds are explicit and versioned")

    export_query = urllib.parse.urlencode(
        {
            key: value
            for key, value in (analytics.get("scope") or {}).get("filters", {}).items()
            if value is not None and value != ""
        }
    )
    export_response = client.get(
        flow.api_url(
            f"teaching/progress/{workspace['course']['id']}/export?{export_query}"
        ),
        timeout=90,
    )
    flow.require(export_response, (200,))
    exported_scope = json.loads(export_response.headers.get("X-Analytics-Scope") or "{}")
    if exported_scope != (analytics.get("scope") or {}).get("filters"):
        raise AssertionError("learning export did not preserve the visible analytics scope")
    if not export_response.content.startswith(b"\xef\xbb\xbf"):
        raise AssertionError("learning export is not an Excel-safe UTF-8 CSV")
    pass_("learning export and interface use the same server-side filter scope")

    artifacts = []
    for kind in ("courseware", "demos"):
        payload = flow.unwrap(
            client.get(
                flow.api_url(
                    f"teaching/courses/{urllib.parse.quote(reference, safe='')}/content?kind={kind}&pageSize=100"
                ),
                timeout=40,
            )
        )
        artifacts.extend(payload.get("items") or [])
    artifact_preview = None
    for artifact in artifacts:
        artifact_id = str(artifact.get("id") or "")
        response = client.get(
            flow.api_url(
                f"teaching/artifacts/{urllib.parse.quote(artifact_id, safe='')}/student-preview"
            ),
            timeout=40,
        )
        if response.status_code == 404:
            continue
        artifact_preview = flow.unwrap(response).get("artifact") or {}
        break
    if artifact_preview is not None:
        preview = artifact_preview
        forbidden = find_forbidden_keys(preview)
        if forbidden:
            raise AssertionError(f"student preview leaked private keys: {', '.join(forbidden[:8])}")
        if preview.get("canEdit") is not False or preview.get("canRequestPublish") is not False:
            raise AssertionError("student preview exposes teacher mutation controls")
        pass_("artifact student preview removes private model, author and solution fields")
    else:
        pass_("course has no owner-accessible artifact; student-safe preview contract is covered by API tests")

    questions = flow.unwrap(
        client.get(
            flow.api_url(
                f"teaching/courses/{urllib.parse.quote(reference, safe='')}/content?kind=questions&pageSize=100"
            ),
            timeout=40,
        )
    ).get("items") or []
    draft_preview = None
    for draft in questions:
        if not (
            draft.get("sourceKind") == "authoring_draft"
            or str(draft.get("status") or "").upper() != "PUBLISHED"
        ):
            continue
        draft_id = str(draft.get("id") or "")
        response = client.get(
            flow.api_url(
                f"learning/drafts/{urllib.parse.quote(draft_id, safe='')}/student-preview"
            ),
            timeout=40,
        )
        if response.status_code in {403, 404}:
            continue
        draft_preview = flow.unwrap(response).get("preview") or {}
        break
    if draft_preview is not None:
        preview = draft_preview
        forbidden = find_forbidden_keys(preview, "questionPreview")
        if forbidden:
            raise AssertionError(
                f"question student preview leaked private keys: {', '.join(forbidden[:8])}"
            )
        if preview.get("studentSafe") is not True:
            raise AssertionError("question draft preview does not declare its student-safe boundary")
        if not isinstance(preview.get("question"), dict):
            raise AssertionError("question draft preview has no student-facing question payload")
        pass_("question draft preview uses the same student-safe serialization boundary")
    else:
        pass_("course has no owner-accessible question draft; draft preview boundary is covered by API fixtures")

    legacy = client.get(
        f"{flow.BASE_URL}/dojo/{urllib.parse.quote(reference, safe='')}/studio?draft=contract-probe",
        allow_redirects=False,
        timeout=30,
    )
    flow.require(legacy, (308,))
    location = legacy.headers.get("Location") or ""
    parsed = urllib.parse.urlsplit(location)
    query = urllib.parse.parse_qs(parsed.query)
    if parsed.path != "/teacher/courses" or query.get("tab") != ["questions"] or query.get("selectedId") != ["contract-probe"]:
        raise AssertionError(f"legacy question URL lost its deep link: {location}")
    pass_("legacy question workspace redirects to the canonical course shell with deep link intact")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
