"""Exercise the Tutor picture selection against an isolated ordinary-classroom catalog."""

import ast
import base64
import binascii
import copy
import hashlib
import json
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sqlalchemy import JSON, Column, Integer, String, and_, cast, create_engine, event, exists, or_
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import aliased, declarative_base, scoped_session, sessionmaker

ROOT = Path(__file__).resolve().parents[1]
Base = declarative_base()
CLASSROOM_ID = "session_" + "a" * 32
PAGE_ID = "plant-observation"
PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8R8AAAAASUVORK5CYII="


def _model(name, *, ints="", strings="", documents=""):
    fields = {key: Column(Integer) for key in ints.split()}
    fields.update({key: Column(String) for key in strings.split()})
    fields.update({key: Column(JSON) for key in documents.split()})
    return type(name, (Base,), {"__tablename__": name, "id": Column(String, primary_key=True), **fields})


User = _model("user", strings="type")
Enrollment = _model("enrollment", ints="dojo_id user_id")
Membership = _model("admin_membership", ints="dojo_id user_id")
Attempt = _model("attempt", ints="user_id dojo_id module_index challenge_index challenge_id", strings="status")


class Challenge(Base):
    __tablename__ = "challenge"
    id = Column(Integer, primary_key=True)
    dojo_id = Column(Integer)
    module_index = Column(Integer)
    challenge_index = Column(Integer)
    challenge_id = Column(Integer)
    visibility = Column(Integer)
    module_visibility = Column(Integer)

    def visible(self):
        return self.visibility == 1

    @property
    def module(self):
        return SimpleNamespace(visible=lambda: self.module_visibility == 1)


Classroom = _model("classroom", ints="dojo_id module_index owner_id", strings="title thread_id status updated started ended", documents="state")
Action = _model("action", ints="actor_id", strings="target_id thread_id action_type status target_type", documents="request_json result")
Artifact = _model(
    "artifact", ints="owner_id dojo_id module_index current_revision", strings="status artifact_type self_workspace_id",
)
Revision = _model("revision", ints="revision", strings="artifact_id content_hash", documents="content")


def _functions(path, namespace, names=None):
    nodes = [node for node in ast.parse(path.read_text()).body
             if isinstance(node, (ast.FunctionDef, ast.Assign)) and (names is None or getattr(node, "name", None) in names)]
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), "exec"), namespace)


@pytest.fixture
def illustrations(monkeypatch):
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = scoped_session(sessionmaker(bind=engine))
    for model in (User, Enrollment, Membership, Attempt, Challenge, Classroom, Action, Artifact, Revision):
        monkeypatch.setattr(model, "query", db.query_property(), raising=False)
    flags = SimpleNamespace(image_enabled=True, ordinary=True)
    namespace = dict(
        base64=base64, binascii=binascii, re=re, json=json, hashlib=hashlib, and_=and_, or_=or_,
        cast=cast, exists=exists, aliased=aliased, String=String,
        guide_teaching_text=lambda label, limit: label[:limit],
        Users=User, DojoAdmins=Membership, DojoChallenges=Challenge, DojoUsers=Enrollment,
        LearningAttempts=Attempt, TeachingSessions=Classroom, TeachingAgentActions=Action,
        TeachingArtifacts=Artifact, TeachingArtifactRevisions=Revision,
        teaching_image_enabled=lambda: flags.image_enabled,
        ordinary_teaching_course=lambda course_id: course_id == -9 and flags.ordinary,
    )
    _functions(ROOT / "dojo_plugin/agent_runtime/artifacts.py", namespace, {"content_hash"})
    _functions(ROOT / "dojo_plugin/agent_runtime/classroom_preparation.py", namespace)
    _functions(ROOT / "dojo_plugin/learning/tutor_illustrations.py", namespace)
    digest = namespace["content_hash"]
    image_src = "data:image/png;base64," + PNG
    original = base64.b64encode(base64.b64decode(PNG) + b"fixture original metadata").decode()
    lesson = {"lesson": {"title": "植物图示", "artifacts": [{
        "type": "slide", "outline": {"type": "slide", "title": "植物观察"},
        "content": {"studio": {"page": {
            "id": PAGE_ID, "schema": "courseware-page-v2", "beats": [], "layout": {},
            "visual": {"kind": "image", "assetId": "raster-1"},
        }, "assets": [{"id": "raster-1", "src": "data:image/png;base64," + original}]}},
    }]}}
    scene_id = CLASSROOM_ID + "-" + PAGE_ID
    scenes = [{
        "stageId": CLASSROOM_ID, "type": "slide", "id": scene_id, "title": "植物观察",
        "content": {"type": "slide", "canvas": {"id": scene_id, "elements": [
            {"id": "verified-image", "type": "image", "src": image_src, "width": 120, "height": 120},
        ]}},
    }]
    lesson_hash = digest(lesson)
    action = Action(
        id="approved", actor_id=2, thread_id="thread-teacher", target_id=CLASSROOM_ID,
        action_type="prepare-ordinary-classroom", status="COMPLETED", target_type="teaching_session",
        request_json={
            "dojoId": -9, "moduleIndex": 0, "artifactId": "published", "expectedRevision": 3,
            "contentHash": lesson_hash, "ordinaryScenesHash": digest(scenes),
            "ordinaryImagePages": [{"pageId": PAGE_ID, "label": "植物观察"}],
        },
        result={"sessionId": CLASSROOM_ID, "artifactId": "published", "artifactRevision": 3},
    )
    classroom = Classroom(
        id=CLASSROOM_ID, owner_id=2, dojo_id=-9, module_index=0, thread_id="thread-teacher",
        status="LIVE", updated="2026-01-01", started="2026-01-01", ended="2026-01-02", state={
            "renderer": "agent-runtime-stage", "artifactId": "published", "artifactRevision": 3,
            "artifactContentHash": lesson_hash, "scenes": scenes,
        },
    )
    attempt = Attempt(id="attempt", user_id=1, dojo_id=-9, module_index=0, challenge_index=8, challenge_id=100, status="ACTIVE")
    db.add_all([
        User(id="2", type="user"), Enrollment(id="current-enrollment", user_id=1, dojo_id=-9),
        Membership(id="teacher", user_id=2, dojo_id=-9),
        Challenge(id=1, dojo_id=-9, module_index=0, challenge_index=8, challenge_id=100, visibility=1, module_visibility=1),
        Artifact(id="published", owner_id=2, dojo_id=-9, module_index=0, current_revision=3, status="PUBLISHED", artifact_type="slide-deck"),
        Revision(id="stored-version", artifact_id="published", revision=3, content_hash=lesson_hash, content=lesson),
        attempt, classroom, action,
    ])
    db.commit()
    statements = []
    event.listen(engine, "before_cursor_execute", lambda *args: statements.append(args[2]))
    yield SimpleNamespace(
        catalog=namespace["available_tutor_illustrations"], resolve=namespace["resolve_tutor_illustration"],
        user=SimpleNamespace(id=1), attempt=attempt, db=db, flags=flags, statements=statements,
        classroom=classroom, action=action, digest=digest, classrooms=namespace["_illustrated_sessions"],
        module_classes=namespace["student_module_classrooms"],
        pick={"classroomId": CLASSROOM_ID, "revision": 3, "pageId": PAGE_ID, "consent": True},
    )
    db.remove()
    engine.dispose()


@pytest.mark.parametrize("status", ["LIVE", "ENDED"])
def test_catalog_and_dispatch_use_only_verified_public_illustration(illustrations, status):
    f = illustrations
    f.classroom.status = status
    f.db.commit()
    # Ensure commit expiration of this ORM handle does not count as a catalog read.
    f.db.refresh(f.attempt)
    f.statements.clear()
    assert f.catalog(f.user, f.attempt) == [{"classroomId": CLASSROOM_ID, "revision": 3, "pageId": PAGE_ID, "label": "植物观察"}]
    projected_fields = f.statements[-1].split("FROM", 1)[0]
    assert "classroom.state" not in projected_fields and "revision.content " not in projected_fields
    assert f.resolve(f.user, f.attempt, f.pick) == {"mediaType": "image/png", "data": PNG}


@pytest.mark.parametrize("change", ["disabled", "not-ordinary", "other-user", "inactive-attempt", "hidden-module",
    "hidden-question", "membership-revoked", "teacher-revoked", "ready", "other-module", "other-course",
    "draft", "other-owner", "unverified-receipt", "wrong-action-session", "stale-revision", "wrong-browsed-revision",
    "missing-start", "missing-end", "state-pins-cleared", "malformed-receipt", "private-label", "duplicate-action"])
def test_current_scope_and_verified_preparation_required(illustrations, change):
    f = illustrations
    user = f.user
    if change == "disabled":
        f.flags.image_enabled = False
    elif change == "not-ordinary":
        f.flags.ordinary = False
    elif change == "other-user":
        user = SimpleNamespace(id=8)
    elif change == "inactive-attempt":
        f.attempt.status = "INTERRUPTED"
    elif change == "hidden-module":
        f.db.query(Challenge).one().module_visibility = 0
    elif change == "hidden-question":
        f.db.query(Challenge).one().visibility = 0
    elif change == "membership-revoked":
        f.db.delete(f.db.query(Enrollment).one())
    elif change == "teacher-revoked":
        f.db.delete(f.db.query(Membership).one())
    elif change == "ready":
        f.classroom.status = "READY"
    elif change == "other-module":
        f.classroom.module_index = 1
    elif change == "other-course":
        f.classroom.dojo_id = -21
    elif change == "draft":
        f.db.query(Artifact).one().status = "DRAFT"
    elif change == "other-owner":
        f.db.query(Artifact).one().owner_id = 3
    elif change == "unverified-receipt":
        f.action.request_json = {key: value for key, value in f.action.request_json.items() if key != "ordinaryScenesHash"}
    elif change == "wrong-action-session":
        f.action.result = {**f.action.result, "sessionId": "session_other"}
    elif change == "stale-revision":
        f.db.query(Artifact).one().current_revision = 4
    elif change == "wrong-browsed-revision":
        f.pick["revision"] = 2
    elif change == "missing-start":
        f.classroom.started = None
    elif change == "missing-end":
        f.classroom.status, f.classroom.ended = "ENDED", None
    elif change == "state-pins-cleared":
        f.classroom.state = {"scenes": f.classroom.state["scenes"]}
    elif change == "malformed-receipt":
        f.action.request_json = {**f.action.request_json, "expectedRevision": "no integer"}
    elif change == "private-label":
        f.action.request_json = {**f.action.request_json,
            "ordinaryImagePages": [{"pageId": PAGE_ID, "label": "教师备注：不得出站"}]}
    elif change == "duplicate-action":
        data = {column.key: getattr(f.action, column.key) for column in Action.__table__.columns if column.key != "id"}
        f.db.add(Action(id="duplicate-complete", **data))
    f.db.commit()
    if change != "wrong-browsed-revision":
        assert f.catalog(user, f.attempt) == []
    with pytest.raises(PermissionError):
        f.resolve(user, f.attempt, f.pick)


@pytest.mark.parametrize("change", ["mutable-scene", "mutable-document", "forged-raster", "unexpected-page"])
def test_dispatch_rechecks_real_pinned_canvas(illustrations, change):
    f = illustrations
    assert f.catalog(f.user, f.attempt)
    if change == "mutable-document":
        version = f.db.query(Revision).one()
        content = copy.deepcopy(version.content)
        content["lesson"]["title"] = "未记录的内容修改"
        version.content = content
    elif change == "unexpected-page":
        f.pick["pageId"] = "another-page"
    else:
        state = copy.deepcopy(f.classroom.state)
        image = state["scenes"][0]["content"]["canvas"]["elements"][0]
        if change == "mutable-scene":
            image["width"] += 1
        else:
            image["src"] = "https://never-resolve.invalid/image.png"
            f.action.request_json = {**f.action.request_json, "ordinaryScenesHash": f.digest(state["scenes"])}
        f.classroom.state = state
    f.db.commit()
    with pytest.raises(PermissionError):
        f.resolve(f.user, f.attempt, f.pick)


@pytest.mark.parametrize("override", [
    {"consent": False}, {"consent": 1}, {"url": "https://never-resolve.invalid/image.png"},
    {"data": "browser-upload"}, {"revision": True}, {"pageId": "../other"},
])
def test_client_can_only_supply_a_consented_opaque_selection(illustrations, override):
    f = illustrations
    with pytest.raises(ValueError):
        f.resolve(f.user, f.attempt, {**f.pick, **override})


def test_postgresql_receipt_query_uses_correlated_duplicate_check_and_safe_json_comparison(illustrations):
    f = illustrations
    compiled = str(
        f.classrooms(-9, 0).with_entities(Classroom.id).statement.compile(dialect=postgresql.dialect())
    )
    assert "NOT (EXISTS" in compiled
    assert "action_1.target_id = classroom.id" in compiled
    assert "CAST(CAST(" in compiled and "AS INTEGER" not in compiled
    assert "SELECT classroom.id" in compiled


def test_enrolled_student_can_open_approved_class_without_an_image_or_active_exercise(illustrations):
    f = illustrations
    module = SimpleNamespace(dojo_id=-9, module_index=0, visible=lambda: True)
    f.action.request_json = {key: value for key, value in f.action.request_json.items()
                             if key not in ("ordinaryScenesHash", "ordinaryImagePages")}
    f.attempt.status = "INTERRUPTED"
    f.flags.image_enabled = False
    f.db.commit()
    rows = f.module_classes(f.user, module)
    assert [row.id for row in rows] == [CLASSROOM_ID]
    assert set(rows[0]._mapping.keys()) == {"id", "title", "status"}
    assert f.module_classes(f.user, module, classroom_id="different-session") == []
    assert f.module_classes(SimpleNamespace(id=987), module) == []
    module.visible = lambda: False
    assert f.module_classes(f.user, module) == []
    module.visible = lambda: True
    f.classroom.status = "READY"
    f.db.commit()
    assert f.module_classes(f.user, module) == []


def test_authorized_classroom_read_rechecks_current_module_visibility(illustrations):
    f = illustrations
    module_query = Mock()
    module = module_query.filter_by.return_value.first.return_value
    namespace = {"DojoUsers": Enrollment, "DojoModules": SimpleNamespace(query=module_query)}
    _functions(ROOT / "dojo_plugin/agent_runtime/scope.py", namespace, {"can_view_student_classroom"})
    check = namespace["can_view_student_classroom"]
    module.visible.return_value = True
    assert check(f.user, f.classroom)
    module_query.filter_by.assert_called_once_with(dojo_id=-9, module_index=0)
    module.visible.return_value = False
    assert not check(f.user, f.classroom)
    assert not check(SimpleNamespace(id=987), f.classroom)


def test_unwrapped_mixed_class_accepts_the_rendered_png_not_the_source_jpeg(illustrations):
    f = illustrations
    version = f.db.query(Revision).one()
    unwrapped = copy.deepcopy(version.content["lesson"])
    unwrapped["artifacts"][0]["content"]["studio"]["assets"][0]["src"] = "data:image/jpeg;base64,/9j/2Q=="
    unwrapped["artifacts"].insert(0, {
        "type": "slide", "outline": {"type": "slide", "title": "植物数据"},
        "content": {"studio": {"page": {
            "id": "chart-demo", "schema": "courseware-page-v2", "beats": [], "layout": {},
            "visual": {"kind": "chart"},
        }, "assets": []}},
    })
    version.content = unwrapped
    version.content_hash = f.digest(unwrapped)
    chart_id = f"{CLASSROOM_ID}-chart-demo"
    chart = {"id": chart_id, "stageId": CLASSROOM_ID, "type": "slide", "title": "植物数据",
             "content": {"type": "slide", "canvas": {"id": chart_id, "elements": [{"type": "chart"}]}}}
    mixed = [chart, *f.classroom.state["scenes"]]
    f.action.request_json = {**f.action.request_json, "contentHash": version.content_hash,
                             "ordinaryScenesHash": f.digest(mixed)}
    f.classroom.state = {**f.classroom.state, "artifactContentHash": version.content_hash, "scenes": mixed}
    f.db.commit()
    assert f.catalog(f.user, f.attempt)[0]["pageId"] == PAGE_ID
    assert f.resolve(f.user, f.attempt, f.pick) == {"mediaType": "image/png", "data": PNG}
