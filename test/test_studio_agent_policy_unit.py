"""Exercise the Studio policy through its existing service and ownership gates."""

import ast
import datetime
import os
from pathlib import Path
from types import SimpleNamespace

import pytest
from flask import Flask, request


ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def studio(monkeypatch):
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "19")
    monkeypatch.setenv("DOJO_AI_ENABLED", "auto")
    monkeypatch.setenv("HARNESS_CONFIGURED", "true")
    monkeypatch.setenv("HARNESS_INTERNAL_URL", "http://fixture-harness:3081")
    monkeypatch.setenv("HARNESS_SERVICE_SECRET", "fixture-harness-secret")
    config = SimpleNamespace(HARNESS_DEEPSEEK_MODEL="fixture-model")
    artifact = SimpleNamespace(
        id="lesson", owner_id=3, dojo_id=19, module_index=0,
        self_workspace_id=None, current_revision=2, status="DRAFT",
    )
    rows = [
        SimpleNamespace(revision=index, instruction=f"版次 {index}", created=datetime.datetime(2026, 1, index),
                        content={"lesson": {"title": f"叶片观察 {index}", "artifacts": []}}, source_refs=[])
        for index in (1, 2)
    ]
    scope_error = type("ScopeError", (ValueError,), {})
    auth_error = type("AgentRuntimeAuthError", (ValueError,), {})
    accounts = {
        "teacher": (3, "teacher", 19, 0),
        "another-teacher": (6, "teacher", 19, 0),
        "wrong-course": (3, "teacher", 20, 0),
        "wrong-module": (3, "teacher", 19, 1),
        "student": (3, "student", 19, 0),
        "global-teacher": (3, "teacher", None, None),
        "course-teacher": (3, "teacher", 19, None),
    }

    class Query:
        def filter_by(self, **criteria):
            self.criteria = criteria
            return self

        def first(self):
            if self.criteria["artifact_id"] != artifact.id:
                return None
            return next((row for row in rows if row.revision == self.criteria["revision"]), None)

        def order_by(self, _column):
            return self

        def limit(self, _count):
            return self

        def all(self):
            return list(reversed(rows))

    def require_service_auth():
        if request.headers.get("X-AISecEdu-Service-Token") != "fixture-internal":
            raise auth_error("Unauthorized")

    def verify_session(token):
        if token not in accounts:
            raise auth_error("Unauthorized")
        user_id, role, course, module = accounts[token]
        capability = "artifact:write" if role == "teacher" else "artifact:personal"
        return SimpleNamespace(id=user_id), SimpleNamespace(
            role=role, dojo_id=course, module_index=module, workspace_id=None, capabilities={capability},
        ), "fixture-session"

    def artifact_for_user(artifact_id, user):
        if artifact_id != artifact.id or user.id != artifact.owner_id:
            raise scope_error("Not found")
        return artifact

    def read_current(_artifact):
        return next((row for row in rows if row.revision == artifact.current_revision), None)

    def payload(_artifact, **_):
        return {**read_current(artifact).content["lesson"], "id": artifact.id, "__aiseceduRevision": artifact.current_revision}

    ns = {
        "config": config, "os": os, "re": __import__("re"), "request": request, "Resource": object,
        "ordinary_project_queue": SimpleNamespace(
            configured=lambda: os.getenv("AISECEDU_ORDINARY_PROJECTS") == "true",
            enabled=lambda course: course == 19,
        ),
        "ScopeError": scope_error, "AgentRuntimeAuthError": auth_error,
        "require_service_auth": require_service_auth, "verify_session_token": verify_session,
        "assert_capability": lambda scope, capability: capability in scope.capabilities,
        "bearer_session_token": lambda: request.headers.get("Authorization", "").removeprefix("Bearer "),
        "artifact_for_user": artifact_for_user, "current_artifact_revision": read_current, "_lesson_payload": payload,
        "TeachingArtifactRevisions": SimpleNamespace(query=Query(), revision=SimpleNamespace(desc=lambda: None)),
        "_ok": lambda value: ({"success": True, "data": value}, 200),
        "_error": lambda message, status, *, code: ({"success": False, "errorCode": code}, status),
    }
    path = ROOT / "dojo_plugin/agent_runtime/upstream_turn.py"
    tree = ast.parse(path.read_text())
    selected = [node for node in tree.body if getattr(node, "name", None) in {"ordinary_teaching_course", "upstream_enabled"}]
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), "exec"), ns)
    path = ROOT / "dojo_plugin/api/v1/teaching.py"
    tree = ast.parse(path.read_text())
    names = {"_service_lesson_session", "_lesson_artifact", "_studio_agent_policy", "AgentRuntimeCoursewareStudio"}
    selected = [node for node in tree.body if getattr(node, "name", None) in names]
    for node in selected:
        if isinstance(node, ast.ClassDef):
            node.decorator_list = []
            for method in node.body:
                method.decorator_list = []
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), "exec"), ns)

    app = Flask(__name__)
    app.add_url_rule("/studio/<artifact_id>", view_func=ns["AgentRuntimeCoursewareStudio"]().get)
    client = app.test_client()

    def get(query="", *, token="teacher", credential="fixture-internal", artifact_id="lesson"):
        return client.get("/studio/" + artifact_id + query,
                          headers={"Authorization": "Bearer " + token, "X-AISecEdu-Service-Token": credential})

    return SimpleNamespace(get=get, artifact=artifact, config=config, accounts=accounts, rows=rows)


def data(response):
    assert response.status_code == 200
    return response.get_json()["data"]


def test_only_requested_policy_returns_current_real_pin_and_lean_authorize(studio):
    expected = {
        "mode": "ordinary-harness", "ownerId": 3, "artifactId": "lesson",
        "revision": 2, "model": "fixture-model", "enabled": True,
    }
    assert data(studio.get("?authorize=1&agentPolicy=1&revision=2")) == {
        "ownerId": 3, "status": "DRAFT", "agentPolicy": expected,
    }
    read = data(studio.get("?agentPolicy=1", token="course-teacher"))
    assert read["agentPolicy"] == expected
    assert read["lesson"]["__aiseceduRevision"] == expected["revision"]
    assert "fixture-harness-secret" not in str(read)
    assert "fixture-harness:3081" not in str(read)


@pytest.mark.parametrize("query", ["?agentPolicy=1&revision=1", "?authorize=1&agentPolicy=1&revision=0",
                                  "?agentPolicy=1&revision=not-integer", "?agentPolicy=1&revision=2&revision=2"])
def test_policy_never_authorizes_historical_or_malformed_revision(studio, query):
    assert studio.get(query).status_code == 409


def test_legacy_reads_and_historical_payload_shape_remain_unchanged(studio):
    assert data(studio.get("?authorize=1")) == {"ownerId": 3, "status": "DRAFT"}
    history = data(studio.get("?revision=1"))
    assert history["lesson"]["__aiseceduRevision"] == 1
    assert history["lesson"]["title"] == "叶片观察 1"
    assert "agentPolicy" not in history
    assert "agentPolicy" not in data(studio.get())


@pytest.mark.parametrize("token", ["missing", "another-teacher", "wrong-course", "wrong-module", "student", "global-teacher"])
def test_policy_denies_other_owners_students_and_scope_mismatch(studio, token):
    assert studio.get("?authorize=1&agentPolicy=1", token=token).status_code == 404


def test_policy_denies_wrong_service_credential_archive_and_missing_current_row(studio):
    assert studio.get("?agentPolicy=1", credential="invalid").status_code == 404
    assert studio.get("?agentPolicy=1", artifact_id="other").status_code == 404
    studio.artifact.status = "ARCHIVED"
    assert studio.get("?agentPolicy=1").status_code == 404
    studio.artifact.status = "DRAFT"
    studio.rows.pop()
    assert studio.get("?authorize=1&agentPolicy=1").status_code == 404
    assert studio.get("?authorize=1").status_code == 200


@pytest.mark.parametrize("field", ["flag", "auto", "url", "token", "model"])
def test_ordinary_studio_never_falls_back_when_service_is_disabled_or_unconfigured(studio, monkeypatch, field):
    if field == "flag":
        monkeypatch.setenv("DOJO_AI_ENABLED", "false")
    elif field == "auto":
        monkeypatch.delenv("HARNESS_CONFIGURED")
    elif field == "url":
        monkeypatch.delenv("HARNESS_INTERNAL_URL")
    elif field == "token":
        monkeypatch.setenv("HARNESS_SERVICE_SECRET", " ")
    else:
        studio.config.HARNESS_DEEPSEEK_MODEL = ""
    assert data(studio.get("?agentPolicy=1&authorize=1"))["agentPolicy"] == {
        "mode": "ordinary-harness", "ownerId": 3, "artifactId": "lesson",
        "revision": 2, "model": None, "enabled": False,
    }


def test_nonordinary_owner_gets_legacy_policy_with_no_configured_model(studio, monkeypatch):
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "20")
    result = data(studio.get("?agentPolicy=1&authorize=1&model=browser-value"))
    assert result["agentPolicy"] == {
        "mode": "legacy", "ownerId": 3, "artifactId": "lesson",
        "revision": 2, "model": None, "enabled": True,
    }


def test_opt_in_policy_does_not_authorize_personal_workspace(studio):
    studio.artifact.self_workspace_id = "fixture-workspace"
    assert studio.get("?agentPolicy=1&authorize=1").status_code == 404


def test_newer_revision_is_reflected_in_next_authorization(studio):
    studio.artifact.current_revision = 3
    studio.rows.append(SimpleNamespace(
        revision=3, instruction="第三版", created=datetime.datetime(2026, 1, 3),
        content={"lesson": {"title": "叶片观察 3", "artifacts": []}}, source_refs=[],
    ))
    assert studio.get("?authorize=1&agentPolicy=1&revision=2").status_code == 409
    assert data(studio.get("?authorize=1&agentPolicy=1&revision=3"))["agentPolicy"]["revision"] == 3
    # Revocation invalidates the session before any policy can be returned.
    del studio.accounts["teacher"]
    assert studio.get("?authorize=1&agentPolicy=1&revision=3").status_code == 404
