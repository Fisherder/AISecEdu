"""Run the image eligibility boundary over real Flask request and token code."""

import ast
import importlib.util
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import Mock

import pytest
from flask import Flask, request


PLUGIN = Path(__file__).resolve().parents[1] / "dojo_plugin"
ROUTE = "/pwncollege_api/v1/teaching/runtime"
SERVICE_SECRET = "fixture-teaching-image-service-secret"


class Rows:
    def __init__(self, records):
        self.records = records

    def filter_by(self, **criteria):
        return Rows([
            row for row in self.records
            if all(getattr(row, key) == value for key, value in criteria.items())
        ])

    def with_for_update(self):
        return self

    def first(self):
        return next(iter(self.records), None)


@pytest.fixture
def image_boundary(monkeypatch):
    app = Flask(__name__)
    app.testing = True
    user = SimpleNamespace(id=11, name="Synthetic Learner", type="user")
    allowed_dojo, other_dojo = 3, 4
    membership = SimpleNamespace(dojo_id=allowed_dojo, user_id=user.id)
    memberships = [membership]
    tickets = []

    def add_ticket(ticket):
        ticket.id = len(tickets) + 1
        tickets.append(ticket)

    session = Mock()
    session.add.side_effect = add_ticket
    db = SimpleNamespace(session=session)
    def model(records):
        return SimpleNamespace(query=Rows(records))

    # CTFd and its database are image-only dependencies. Keep the production
    # scope resolver, launch exchange, signing and verification; substitute rows.
    def module(name, **attributes):
        stub = ModuleType(name)
        vars(stub).update(attributes)
        monkeypatch.setitem(sys.modules, name, stub)
        return stub

    package = "teaching_image_auth_fixture"
    module(package, __path__=[str(PLUGIN)])
    module(package + ".agent_runtime", __path__=[str(PLUGIN / "agent_runtime")])
    module(package + ".models",
           AgentRuntimeLaunchTickets=type("LaunchTicket", (SimpleNamespace,), {
               "query": Rows(tickets), "used": None, "revoked": None,
           }),
           Dojos=model([
               SimpleNamespace(dojo_id=allowed_dojo, is_public_or_official=False),
               SimpleNamespace(dojo_id=other_dojo, is_public_or_official=True),
           ]),
           DojoModules=model([]), DojoUsers=model(memberships), DojoAdmins=model([]),
           SelfLearningWorkspaces=model([]))
    module("CTFd.models", Users=model([user]), db=db)
    module(package + ".config",
           AGENT_RUNTIME_SERVICE_SECRET=SERVICE_SECRET,
           AGENT_RUNTIME_TICKET_SECRET="fixture-teaching-image-session-secret",
           AGENT_RUNTIME_LAUNCH_TTL_SECONDS=300,
           AGENT_RUNTIME_SESSION_TTL_SECONDS=60)
    def load_runtime(name):
        qualified = package + ".agent_runtime." + name
        spec = importlib.util.spec_from_file_location(qualified, PLUGIN / "agent_runtime" / (name + ".py"))
        production = importlib.util.module_from_spec(spec)
        monkeypatch.setitem(sys.modules, qualified, production)
        spec.loader.exec_module(production)
        return production

    scoped_access = load_runtime("scope")
    auth = load_runtime("auth")
    turn = load_runtime("upstream_turn")
    clock = SimpleNamespace(now=1_800_000_000)
    monkeypatch.setattr(auth, "time", SimpleNamespace(time=lambda: clock.now))
    monkeypatch.setenv("DOJO_AI_ENABLED", "true")
    monkeypatch.setenv("HARNESS_ORDINARY_TEACHING_COURSE_IDS", str(allowed_dojo))

    teaching = PLUGIN / "api" / "v1" / "teaching.py"
    tree = ast.parse(teaching.read_text(encoding="utf-8"))
    functions = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in {"_body", "_ok", "_error"}
    ]
    routes = {"AgentRuntimeExchange": "/exchange", "AgentRuntimeIntrospect": "/introspect"}
    namespace = {
        **vars(auth), "request": request,
        "ordinary_teaching_image_allowed": turn.ordinary_teaching_image_allowed,
    }
    for route in (node for node in tree.body if isinstance(node, ast.ClassDef) and node.name in routes):
        method = next(node for node in route.body if isinstance(node, ast.FunctionDef) and node.name == "post")
        method.decorator_list = []
        tree.body = [*functions, method]
        exec(compile(tree, str(teaching), "exec"), namespace)
        post = namespace["post"]
        app.add_url_rule(ROUTE + routes[route.name], route.name, lambda post=post: post(None), methods=["POST"])

    client = app.test_client()

    def mint_session(dojo=allowed_dojo):
        scope = scoped_access.build_scope(user, role="student", dojo_id=dojo)
        ticket, _ = auth.mint_launch_ticket(user, scope)
        response = client.post(ROUTE + "/exchange", headers={auth.SERVICE_HEADER: SERVICE_SECRET},
                               json={"ticket": ticket})
        assert response.status_code == 200
        return response.json["data"]["sessionToken"]

    def introspect(token, service=SERVICE_SECRET):
        headers = {"Authorization": "Bearer " + token}
        if service is not None:
            headers[auth.SERVICE_HEADER] = service
        return client.post(ROUTE + "/introspect", headers=headers)

    return SimpleNamespace(mint_session=mint_session, introspect=introspect,
                           other_dojo=other_dojo, memberships=memberships, clock=clock)


def assert_inactive(response):
    assert response.status_code == 401
    assert response.json["errorCode"] == "INVALID_SESSION"
    assert "data" not in response.json


def test_real_image_boundary_allows_only_the_authorized_course_scope(image_boundary):
    active = image_boundary.introspect(image_boundary.mint_session())
    assert active.status_code == 200
    assert active.json["data"]["active"] is True
    assert active.json["data"]["scope"]["dojo_id"] == 3
    assert active.json["data"]["ordinaryTeachingImageAllowed"] is True

    for course in (image_boundary.other_dojo, None):
        other = image_boundary.introspect(image_boundary.mint_session(course))
        assert other.status_code == 200
        assert other.json["data"]["active"] is True
        assert other.json["data"]["ordinaryTeachingImageAllowed"] is False


@pytest.mark.parametrize("service", [None, "incorrect-teaching-image-service-secret"])
def test_real_image_boundary_rejects_invalid_service_credentials(image_boundary, service):
    token = image_boundary.mint_session()
    assert_inactive(image_boundary.introspect(token, service))


def test_real_image_boundary_rejects_expired_signed_token(image_boundary):
    token = image_boundary.mint_session()
    image_boundary.clock.now += 60
    response = image_boundary.introspect(token)
    assert_inactive(response)
    assert response.json["errors"] == ["Global agent runtime session expired"]


def test_real_image_boundary_rechecks_course_membership_and_token_signature(image_boundary):
    token = image_boundary.mint_session()
    payload, signature = token.rsplit(".", 1)
    wrong_first_digit = "1" if signature.startswith("0") else "0"
    invalid_token = f"{payload}.{wrong_first_digit}{signature[1:]}"
    assert_inactive(image_boundary.introspect(invalid_token))
    image_boundary.memberships.clear()
    assert_inactive(image_boundary.introspect(token))
