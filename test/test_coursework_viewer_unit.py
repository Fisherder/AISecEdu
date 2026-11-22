import ast
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

from flask import Flask, request


def test_assignment_work_scopes_browser_identity_before_access():
    source = Path(__file__).resolve().parents[1] / "dojo_plugin/api/v1/coursework.py"
    nodes = ast.parse(source.read_text()).body
    work = next(node for node in nodes if getattr(node, "name", None) == "AssignmentWork")
    methods = [node for node in work.body if isinstance(node, ast.FunctionDef)]
    for method in methods:
        method.decorator_list = []

    viewer = SimpleNamespace(id=1)
    assignment = SimpleNamespace(id="plant-growth")
    scoped_assignment = Mock(return_value=assignment)
    views = Mock(return_value={"id": assignment.id})
    submissions = Mock()
    submissions.query.filter_by.return_value.first.return_value = None
    session = Mock()
    save = Mock(return_value=SimpleNamespace(id="plant-submission"))
    namespace = {
        "request": request,
        "_user": lambda: viewer,
        "assignment_for_student": scoped_assignment,
        "assignment_view": views,
        "TeachingAssignmentSubmissions": submissions,
        "save_submission": save,
        "db": SimpleNamespace(session=session),
        "ScopeError": LookupError,
        "timestamp": lambda value: value.isoformat(),
        "error_contract": lambda *_args, **_kwargs: {},
    }
    helpers = [node for node in nodes if getattr(node, "name", None) in {"_body", "_error", "_ok"}]
    exec(compile(ast.Module(body=[*helpers, *methods], type_ignores=[]), str(source), "exec"), namespace)
    app = Flask(__name__)
    path = "/coursework/assignments/plant-growth/work"
    app.add_url_rule(path, "assignment", lambda: namespace[request.method.lower()](None, assignment.id),
                     methods=["GET", "POST"])
    client = app.test_client()

    response = client.get(path)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json["data"]["viewerId"] == viewer.id
    scoped_assignment.assert_called_once_with(assignment.id, viewer)
    scoped_assignment.reset_mock()
    views.reset_mock()

    viewer.id = 2
    for expected_id in [1, "2", None, 2.0, True]:
        response = client.post(path, json={
            "action": "submit", "answers": {"leaf": "Plants need light."},
            "expectedViewerId": expected_id,
        })
        assert response.status_code == 409
        assert response.json["code"] == "VIEWER_MISMATCH"
    scoped_assignment.assert_not_called()
    views.assert_not_called()
    submissions.query.filter_by.assert_not_called()
    save.assert_not_called()
    session.commit.assert_not_called()

    # A matching browser and an older client both keep the existing save contract.
    for action, extra, status in [("save", {}, 200), ("submit", {"expectedViewerId": 2}, 201)]:
        answers = {"leaf": "Plants need light."}
        response = client.post(path, json={"action": action, "answers": answers, **extra})
        assert response.status_code == status
        assert response.json["data"]["viewerId"] == viewer.id
        scoped_assignment.assert_called_with(assignment.id, viewer, lock=True)
        submissions.query.filter_by.assert_called_with(assignment_id=assignment.id, student_id=viewer.id)
        save.assert_called_with(assignment, viewer, answers, submit=action == "submit")
    assert session.commit.call_count == 2
