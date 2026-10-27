import datetime as dt
import importlib
import json
import sys
import threading
import types
from pathlib import Path
from types import SimpleNamespace

import pytest
from flask import Flask, abort, request
from flask_restx import Api
from flask_sqlalchemy import SQLAlchemy
from werkzeug.serving import make_server


ROOT = Path(__file__).resolve().parents[1]
BASE = dt.datetime(2026, 10, 27, 1, 0)


@pytest.fixture
def integration(tmp_path, monkeypatch):
    db = SQLAlchemy()
    class Users(db.Model):
        __tablename__ = "users"
        id = db.Column(db.Integer, primary_key=True)
        name = db.Column(db.String)
        type = db.Column(db.String, default="user")
    class Configs(db.Model):
        __tablename__ = "configs"
        key = db.Column(db.String, primary_key=True)
        value = db.Column(db.Text)
    class LearningAttempts(db.Model):
        __tablename__ = "learning_attempts"
        id = db.Column(db.String, primary_key=True)
        user_id = db.Column(db.Integer)
        dojo_id = db.Column(db.Integer)
        challenge_id = db.Column(db.Integer)
        started = db.Column(db.DateTime)
        @property
        def dojo_challenge(self):
            return DojoChallenges.query.filter_by(challenge_id=self.challenge_id).first()
    class LearningAssessments(db.Model):
        __tablename__ = "learning_assessments"
        id = db.Column(db.String, primary_key=True)
        attempt_id = db.Column(db.String)
        created = db.Column(db.DateTime)
        total_score = db.Column(db.Float)
    class LearningEvidenceEvents(db.Model):
        __tablename__ = "learning_evidence_events"
        id = db.Column(db.Integer, primary_key=True)
        attempt_id = db.Column(db.String)
        occurred = db.Column(db.DateTime)
        sequence = db.Column(db.Integer)
        event_type = db.Column(db.String)
    class DojoChallenges(db.Model):
        __tablename__ = "dojo_challenges"
        id = db.Column(db.Integer, primary_key=True)
        dojo_id = db.Column(db.Integer)
        challenge_id = db.Column(db.Integer)
        name = db.Column(db.String)
        def visible(self):
            return True
        @property
        def dojo(self):
            return SimpleNamespace(reference_id="test-course")
        @property
        def module(self):
            return SimpleNamespace(id="test-unit")
    class LearningAuditEvents(db.Model):
        __tablename__ = "learning_audit_events"
        id = db.Column(db.Integer, primary_key=True)
        actor_id = db.Column(db.Integer)
        action = db.Column(db.String)
        resource_type = db.Column(db.String)
        resource_id = db.Column(db.String)
        outcome = db.Column(db.String)
        details = db.Column(db.JSON)
    class TeachingJobs(db.Model):
        __tablename__ = "teaching_jobs"
        id = db.Column(db.String, primary_key=True)
        status = db.Column(db.String, default="QUEUED")
        owner_id = db.Column(db.Integer)
        payload = db.Column(db.JSON)
        kind = db.Column(db.String)
    models = locals().copy()
    package = types.ModuleType("_rainier_test_plugin")
    package.__path__ = [str(ROOT / "dojo_plugin")]
    plugin_models = types.ModuleType("_rainier_test_plugin.models")
    plugin_models.__path__ = [str(ROOT / "dojo_plugin/models")]
    plugin_models.__dict__.update(models)
    ctfd = types.ModuleType("CTFd")
    ctfd.__path__ = []
    ctfd_models = types.ModuleType("CTFd.models")
    ctfd_models.__dict__.update(models)
    utils = types.ModuleType("CTFd.utils")
    utils.__path__ = []
    user_mod = types.ModuleType("CTFd.utils.user")
    def current():
        return db.session.get(Users, int(request.headers.get("X-Test-User", "1")))
    user_mod.get_current_user = current
    decorators = types.ModuleType("CTFd.utils.decorators")
    import functools
    def guard(admin=False):
        def decorate(function):
            @functools.wraps(function)
            def wrapped(*args, **kwargs):
                user = current()
                if not user:
                    abort(401)
                if admin and user.type != "admin":
                    abort(403)
                return function(*args, **kwargs)
            return wrapped
        return decorate
    decorators.authed_only = guard()
    decorators.admins_only = guard(True)
    decorators.ratelimit = lambda **options: lambda function: function
    for name, module in [("CTFd", ctfd), ("CTFd.models", ctfd_models), ("CTFd.utils", utils),
                         ("CTFd.utils.user", user_mod), ("CTFd.utils.decorators", decorators),
                         ("_rainier_test_plugin", package), ("_rainier_test_plugin.models", plugin_models)]:
        monkeypatch.setitem(sys.modules, name, module)
    scope = types.ModuleType("_rainier_test_plugin.agent_runtime.scope")
    def access(user, dojo_id):
        if user.id not in {1, 3} or dojo_id != 10:
            raise ValueError("Forbidden")
    scope.dojo_for_user = access
    monkeypatch.setitem(sys.modules, scope.__name__, scope)
    evidence = types.ModuleType("_rainier_test_plugin.learning.evidence")
    evidence.verify_evidence_chain = lambda attempt: {"valid": True}
    monkeypatch.setitem(sys.modules, evidence.__name__, evidence)
    jobs = types.ModuleType("_rainier_test_plugin.agent_runtime.jobs")
    class PermanentJobError(RuntimeError):
        pass
    jobs.PermanentJobError = PermanentJobError
    def enqueue(**values):
        job = TeachingJobs(id="job-" + str(TeachingJobs.query.count()), owner_id=values["owner_id"],
                           payload=values["payload"], kind=values["kind"])
        db.session.add(job)
        db.session.flush()
        return job, True
    jobs.enqueue_job = enqueue
    jobs.publish_pending_outbox = lambda **kwargs: None
    monkeypatch.setitem(sys.modules, jobs.__name__, jobs)
    class FakeRedis:
        def __init__(self):
            self.rows = {}
        def get(self, key):
            return self.rows.get(key)
        def setex(self, key, ttl, value):
            assert ttl == 900
            self.rows[key] = value
        def delete(self, key):
            self.rows.pop(key, None)
    launch_cache = FakeRedis()
    redis_module = types.ModuleType("redis")
    redis_module.from_url = lambda url: launch_cache
    monkeypatch.setitem(sys.modules, "redis", redis_module)
    service = importlib.import_module("_rainier_test_plugin.rainier")
    contracts = importlib.import_module("_rainier_test_plugin.rainier.contracts")
    transport = importlib.import_module("_rainier_test_plugin.rainier.client")
    storage = importlib.import_module("_rainier_test_plugin.models.rainier")
    api_package = types.ModuleType("_rainier_test_plugin.api")
    api_package.__path__ = [str(ROOT / "dojo_plugin/api")]
    monkeypatch.setitem(sys.modules, api_package.__name__, api_package)
    routes = importlib.import_module("_rainier_test_plugin.api.v1.rainier")
    pages = importlib.import_module("_rainier_test_plugin.pages.rainier")
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY="test-only", REDIS_URL="redis://test", SQLALCHEMY_DATABASE_URI="sqlite:///" + str(tmp_path / "db.sqlite"))
    from jinja2 import ChoiceLoader, DictLoader, FileSystemLoader
    app.jinja_loader = ChoiceLoader([DictLoader({"base.html": "{% block content %}{% endblock %}"}),
                                    FileSystemLoader(str(ROOT / "dojo_theme/templates"))])
    from flask import session
    app.context_processor(lambda: {"Session": session})
    app.register_blueprint(pages.rainier_pages)
    db.init_app(app)
    Api(app).add_namespace(routes.rainier_namespace, "/rainier")
    context = app.app_context()
    context.push()
    db.create_all()
    db.session.execute(db.text("PRAGMA journal_mode=WAL"))
    db.session.add_all([Users(id=1, name="student"), Users(id=2, name="other"), Users(id=3, name="admin", type="admin"),
                        DojoChallenges(dojo_id=10, challenge_id=20, name="测试实验")])
    config = service.validate_application({"dojoId": 10, "challengeId": 20, "enabled": True, "sendEnabled": True})
    db.session.add(Configs(key=service.CONFIG_KEY, value=json.dumps({"test-app": config})))
    db.session.commit()
    env = SimpleNamespace(**models, service=service, contracts=contracts, transport=transport,
                          storage=storage, app=app, client=app.test_client(), jobs=jobs, config=config,
                          pages=pages, launch_cache=launch_cache)
    yield env
    db.session.remove()
    db.drop_all()
    context.pop()
    for key in list(sys.modules):
        if key.startswith("_rainier_test_plugin"):
            sys.modules.pop(key, None)


def seeded(env, *, count=12, seconds=400, score=94.5):
    run = env.storage.RainierSessions(id="run", user_id=1, host="https://api.vr-mooc.com", app_id="test-app", exp_id="123",
        external_code="remote-student", dojo_id=10, challenge_id=20, created=BASE,
        expires=dt.datetime.utcnow()+dt.timedelta(hours=1))
    attempt = env.LearningAttempts(id="attempt", user_id=1, dojo_id=10, challenge_id=20, started=BASE+dt.timedelta(seconds=1))
    assessment = env.LearningAssessments(id="assessment", attempt_id=attempt.id,
        created=BASE+dt.timedelta(seconds=seconds), total_score=score)
    env.db.session.add_all([run, attempt, assessment])
    env.db.session.flush()
    env.db.session.add(env.storage.RainierAttemptLinks(attempt_id=attempt.id, session_id=run.id))
    for index in range(count):
        env.db.session.add(env.LearningEvidenceEvents(attempt_id=attempt.id, sequence=index+1,
            event_type="terminal.command.completed", occurred=BASE+dt.timedelta(seconds=5+index*20)))
    env.db.session.commit()
    return run, attempt, assessment


def test_launch_uses_registered_https_host_and_last_separator(integration):
    c = integration.contracts
    values = {"token": "test-app_123", "host": "https://api.vr-mooc.com/", "sequenceCode": "sequence-123"}
    assert c.launch_parameters(values, {"test-app": integration.config})["expId"] == "123"
    for host in ["http://api.vr-mooc.com", "https://localhost/", "https://api.vr-mooc.com@evil.example/", "https://api.vr-mooc.com/path", "https://api.vr-mooc.com:444"]:
        with pytest.raises(c.ContractError):
            c.launch_parameters({**values, "host": host}, {"test-app": integration.config})


def test_remote_sequence_must_match_reservation_and_return_identity(integration):
    c = integration.contracts
    valid = {"error": "", "expList": [{"expId": 123}], "user": {"numberId": "number", "name": "学生"}}
    assert c.verified_user(valid, "123")["code"] == "number:number"
    for body in [{**valid, "error": "验证码错误"}, {**valid, "expList": [{"expId": 124}]}, {**valid, "user": {}}]:
        with pytest.raises(c.ContractError):
            c.verified_user(body, "123")


def test_server_user_id_remains_stable_without_or_after_changing_student_number(integration):
    c = integration.contracts
    body = {"error": "", "expList": [{"expId": 123}], "user": {"id": 89, "numberId": None, "name": "学生"}}
    assert c.verified_user(body, "123")["code"] == "id:89"
    body["user"].update(id="89", numberId="new-student-number")
    assert c.verified_user(body, "123")["code"] == "id:89"
    body["user"].pop("id")
    body["user"]["numberId"] = "id:89"
    assert c.verified_user(body, "123")["code"] == "number:id:89"


@pytest.mark.parametrize("identifier", [True, False, 0, -1, 1.5, {}, [], "00089", "-1", "0", "x", 10**24])
def test_malformed_server_user_id_cannot_fall_back_to_another_identity(integration, identifier):
    body = {"error": "", "expList": [{"expId": 123}], "user": {"id": identifier, "numberId": "valid-number", "name": "学生"}}
    with pytest.raises(integration.contracts.ContractError):
        integration.contracts.verified_user(body, "123")


@pytest.mark.parametrize("bad", [-1, True, 1.1, "3", None, 2147483648])
def test_ai_integer_contract_rejects_non_integer_values(integration, bad):
    c = integration.contracts
    value = {"ai_call_count": bad, "ai_models_used": [{"model": "m", "version": "v", "deployment": "公有云服务"}], "ai_usage_scenarios": ["实验操作指导"]}
    with pytest.raises(c.ContractError):
        c.validate_ai_data(value)


def test_ai_schema_exact_fields_and_no_fake_zero_models(integration):
    c = integration.contracts
    assert c.ai_data([]) is None
    calls = [{"model": "deepseek-model", "version": "deepseek-model", "deployment": "公有云服务", "provider": "DeepSeek",
              "scenario": "实验操作指导", "input_tokens": 100, "output_tokens": 20},
             {"model": "deepseek-model", "version": "deepseek-model", "deployment": "公有云服务", "provider": "DeepSeek",
              "scenario": "实验操作指导", "input_tokens": None, "output_tokens": None}]
    result = c.ai_data(calls)
    assert result["ai_call_count"] == 2 and len(result["ai_models_used"]) == 1
    assert "ai_input_token_count" not in result
    for changed in [{**result, "extra": 1}, {**result, "ai_models_used": []}, {**result, "ai_usage_scenarios": [" "]}]:
        with pytest.raises(c.ContractError):
            c.validate_ai_data(changed)


def test_payload_uses_real_timestamps_keeps_rounding_and_excludes_secrets(integration):
    e = integration
    _, _, assessment = seeded(e)
    _, payload = e.service.preview_assessment(assessment)
    rows = payload["expScoreDetails"]
    assert len(rows) == 13
    assert sum(r["score"] for r in rows if r["trueOrFalse"] == "True") == 95
    assert rows[0]["startTime"] == "2026-10-27 09:00:01"
    assert rows[-1]["endTime"] == "2026-10-27 09:06:40"
    for before, after in zip(rows, rows[1:]):
        assert after["startTime"] > before["endTime"]
    assert "ai_data" not in payload
    assert set(payload) == {"appId", "expId", "reportData", "expScoreDetails"}


@pytest.mark.parametrize("count,seconds", [(2, 400), (12, 120)])
def test_short_or_sparse_real_experiment_is_blocked_not_padded(integration, count, seconds):
    e = integration
    _, _, assessment = seeded(e, count=count, seconds=seconds)
    with pytest.raises(e.contracts.ContractError, match="10 个实际步骤"):
        e.service.preview_assessment(assessment)


def test_cross_user_and_admin_config_permissions(integration):
    e = integration
    seeded(e)
    assert e.client.get("/rainier/assessments/assessment/preview", headers={"X-Test-User": "2"}).status_code == 404
    assert e.client.put("/rainier/applications/test-app", json={}).status_code == 403
    response = e.client.put("/rainier/applications/new-app", json={"dojoId": 10, "challengeId": 20}, headers={"X-Test-User": "3"})
    assert response.status_code == 200
    assert response.json["application"]["sendEnabled"] is False


def test_attempt_binds_only_fresh_matching_launch(integration):
    e = integration
    run, _, _ = seeded(e)
    with e.app.test_request_context("/"):
        from flask import session
        session["rainier_session_id"] = run.id
        old = e.LearningAttempts(id="old", user_id=1, dojo_id=10, challenge_id=20, started=BASE-dt.timedelta(seconds=1))
        other = e.LearningAttempts(id="other", user_id=2, dojo_id=10, challenge_id=20, started=BASE+dt.timedelta(seconds=1))
        new = e.LearningAttempts(id="new", user_id=1, dojo_id=10, challenge_id=20, started=BASE+dt.timedelta(seconds=1))
        e.db.session.add_all([old, other, new]); e.db.session.flush()
        for attempt in [old, other, new]:
            e.service.bind_attempt(attempt)
        e.db.session.commit()
        assert e.db.session.get(e.storage.RainierAttemptLinks, "old") is None
        assert e.db.session.get(e.storage.RainierAttemptLinks, "other") is None
        assert e.db.session.get(e.storage.RainierAttemptLinks, "new").session_id == run.id


def test_ai_dispatch_survives_main_transaction_rollback_and_unknown_usage_omits_totals(integration):
    e = integration
    seeded(e)
    with e.service.usage_scope("attempt", "实验操作指导"):
        identifier = e.service.record_model_dispatch("requested-model")
        e.service.settle_model_dispatch(identifier, {"model": "actual-version", "usage": {"prompt_tokens": 10, "completion_tokens": 3}})
    e.db.session.rollback()
    row = e.db.session.get(e.storage.RainierAICalls, identifier)
    assert row.input_tokens == 10 and row.model == "actual-version" and row.status == "RECEIVED"
    with e.service.usage_scope("attempt", "实验操作指导"):
        failed = e.service.record_model_dispatch("requested-model")
        e.service.settle_model_dispatch(failed)
    assert e.db.session.get(e.storage.RainierAICalls, failed).status == "UNCONFIRMED"


def test_submit_deduplicates_local_requests_and_remote_success(integration):
    e = integration
    seeded(e)
    first = e.client.post("/rainier/assessments/assessment/submit")
    second = e.client.post("/rainier/assessments/assessment/submit")
    assert first.status_code == second.status_code == 202
    assert first.json["submission"]["id"] == second.json["submission"]["id"]
    assert e.TeachingJobs.query.count() == 1
    calls = []
    class Remote:
        def __init__(self, host):
            assert host == "https://api.vr-mooc.com"
        def upload(self, payload):
            calls.append(payload)
            return {"code": "200", "message": "保存成功"}
        def close(self):
            pass
    job = e.TeachingJobs.query.first()
    assert e.service.send_submission(job, client_factory=Remote)["status"] == "SENT"
    assert e.service.send_submission(job, client_factory=Remote)["deduplicated"]
    assert len(calls) == 1


@pytest.mark.parametrize("outcome", ["reject", "timeout"])
def test_body_error_and_uncertain_delivery_do_not_auto_resend(integration, outcome):
    e = integration
    _, _, assessment = seeded(e)
    record = e.service.queue_assessment(assessment); e.db.session.commit()
    calls = []
    class Remote:
        def __init__(self, host):
            pass
        def upload(self, payload):
            calls.append(payload)
            if outcome == "timeout":
                raise e.transport.DeliveryUncertain("timeout")
            return {"code": 19, "message": "数据错误：ai_models_used不能为空"}
        def close(self):
            pass
    job = e.db.session.get(e.TeachingJobs, record.job_id)
    for _ in range(2):
        with pytest.raises(e.jobs.PermanentJobError):
            e.service.send_submission(job, client_factory=Remote)
    assert len(calls) == 1
    assert record.status == ("UNCERTAIN" if outcome == "timeout" else "REJECTED")


def test_actual_http_wire_uses_form_login_and_json_upload(integration):
    e = integration
    from flask import jsonify
    remote = Flask("rainier-mock")
    observed = []
    @remote.post("/openapi/test-app")
    def login():
        observed.append((request.content_type, request.form.to_dict()))
        return jsonify(error="", expList=[{"expId": 123}], user={"numberId": "student", "name": "学生"})
    @remote.post("/openapi/data_upload")
    def upload():
        observed.append((request.content_type, request.get_json()))
        return jsonify(code=200, message="保存成功")
    server = make_server("127.0.0.1", 0, remote)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    client = e.transport.RainierClient("https://api.vr-mooc.com")
    client.host = f"http://127.0.0.1:{server.server_port}"
    try:
        e.contracts.verified_user(client.authenticate("test-app", "secret-sequence"), "123")
        assert client.upload({"appId": "test-app", "expId": "123"})["code"] == 200
        assert observed[0] == ("application/x-www-form-urlencoded", {"sequenceCode": "secret-sequence"})
        assert observed[1] == ("application/json", {"appId": "test-app", "expId": "123"})
    finally:
        client.close(); server.shutdown(); thread.join(timeout=2)


def test_launch_cleans_url_keeps_sequence_out_of_cookie_and_verifies_before_binding(integration, monkeypatch):
    e = integration
    observed = []
    class Remote:
        def __init__(self, host):
            assert host == "https://api.vr-mooc.com"
        def authenticate(self, app, sequence):
            observed.append((app, sequence))
            return {"error": "", "expList": [{"expId": 123}], "user": {"numberId": "external-student", "name": "学生"}}
        def close(self):
            pass
    original = e.pages.create_session
    monkeypatch.setattr(e.pages, "create_session", lambda user, launch: original(user, launch, client_factory=Remote))
    response = e.client.get("/integrations/rainier/launch", query_string={"token": "test-app_123", "sequenceCode": "private-sequence", "host": "https://api.vr-mooc.com"})
    assert response.status_code == 303 and response.location == "/integrations/rainier/launch"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    with e.client.session_transaction() as saved:
        assert "sequenceCode" not in saved
        assert "private-sequence" not in json.dumps(dict(saved))
    assert e.client.get(response.location).status_code == 200
    assert e.storage.RainierSessions.query.count() == 0
    response = e.client.post(response.location)
    assert response.status_code == 303 and response.location.endswith("/test-unit/1")
    assert observed == [("test-app", "private-sequence")]
    assert e.storage.RainierSessions.query.count() == 1 and not e.launch_cache.rows


def test_external_identity_and_reservation_cannot_move_to_another_local_user(integration, monkeypatch):
    e = integration
    class Remote:
        def __init__(self, host):
            pass
        def authenticate(self, app, sequence):
            return {"error": "", "expList": [{"expId": 123}], "user": {"numberId": "external", "name": "学生"}}
        def close(self):
            pass
    launch = {"appId": "test-app", "expId": "123", "host": "https://api.vr-mooc.com", "sequenceCode": "secret"}
    e.service.create_session(e.db.session.get(e.Users, 1), launch, client_factory=Remote)
    e.db.session.commit()
    with pytest.raises(e.contracts.ContractError, match="绑定不一致"):
        e.service.create_session(e.db.session.get(e.Users, 3), launch, client_factory=Remote)


def test_old_grade_cannot_replace_new_grade_and_inflight_old_delivery_blocks(integration):
    e = integration
    run, attempt, assessment = seeded(e)
    record = e.service.queue_assessment(assessment); e.db.session.commit()
    newer = e.LearningAssessments(id="new-grade", attempt_id=attempt.id, created=assessment.created+dt.timedelta(seconds=30), total_score=98)
    e.db.session.add(newer); e.db.session.commit()
    with pytest.raises(e.contracts.ContractError, match="更新的正式评测"):
        e.service.queue_assessment(assessment)
    e.db.session.rollback()
    assert e.service.send_submission(e.db.session.get(e.TeachingJobs, record.job_id))["status"] == "SUPERSEDED"
    e.db.session.commit()
    record.status = "UNCERTAIN"
    current = e.service.queue_assessment(newer); e.db.session.commit()
    with pytest.raises(e.jobs.PermanentJobError, match="未确认的旧提交"):
        e.service.send_submission(e.db.session.get(e.TeachingJobs, current.job_id))


def test_dense_steps_are_merged_within_limit_without_extending_actual_time(integration):
    e = integration
    events = [{"sequence": i+1, "type": "terminal.command.completed", "occurred": BASE+dt.timedelta(seconds=3*i+4)} for i in range(400)]
    payload = e.contracts.payload_for_assessment("app", "exp", "实验", BASE, BASE+dt.timedelta(seconds=1300), 100, events, [])
    rows = payload["expScoreDetails"]
    assert 10 <= len(rows) <= 200
    assert sum(row["repeatCount"] for row in rows[:-1]) == 400
    assert rows[-1]["endTime"] == "2026-10-27 09:21:40"


def test_invalid_launch_redirects_before_rendering_shared_template(integration):
    e = integration
    response = e.client.get("/integrations/rainier/launch", query_string={
        "token": "not-registered_123", "sequenceCode": "private-test-sequence", "host": "https://api.vr-mooc.com"})
    assert response.status_code == 303 and response.location == "/integrations/rainier/launch"
    clean = e.client.get(response.location)
    assert clean.status_code == 400
    assert b"private-test-sequence" not in clean.data
    assert b"not-registered_123" not in clean.data
    assert not e.launch_cache.rows
