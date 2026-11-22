import ast
import datetime
import importlib.util
import pathlib
from types import SimpleNamespace


def test_teacher_learning_dashboard_exposes_deep_diagnostics_and_drilldown():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    analytics = (root / "dojo_plugin/learning/analytics.py").read_text()

    insights = (root / "dojo_theme/static/js/dojo/learning-insights.js").read_text()
    assert 'id="learning-insights"' in template
    assert "js/dojo/learning-insights.js" in template
    assert 'window.DojoAnalytics?.create(document.getElementById("learning-insights")' in script
    for contract in ("async function openStudent", "function renderEvidence", "function followupForm",
                     "function reviewForm", 'action === "export"', 'action === "more-evidence"'):
        assert contract in insights
    assert "不能据此判断学生能力" in analytics
    assert "页面浏览" in analytics
    assert "不等同于干预造成了该变化" in analytics
    assert '"abilityOverview"' in analytics
    assert '"challengeDiagnostics"' in analytics
    assert '"interventions"' in analytics
    assert '"interventionTracking"' in analytics
    for contract_key in (
        '"sampleSize"',
        '"coverage"',
        '"timeRange"',
        '"confidence"',
        '"evidenceCount"',
    ):
        assert contract_key in analytics
    assert '"definitionVersion": ANALYTICS_DEFINITION_VERSION' in analytics
    assert '"minimumReliableClassSample": 3' in analytics
    assert '"minimumReliableQuestionSample": 3' in analytics
    assert '"riskModel"' in analytics
    assert '"automaticGradeImpact": False' in analytics
    assert 'data-ix="export"' in insights
    assert 'taskKey' in insights and 'moduleIndex' in insights and 'studentId' in insights
    assert '任务发生变化时，不把两个不同范围直接相减' in insights
    assert '"/teaching/insights/' in insights or '`/teaching/insights/' in insights


def test_teacher_learning_interventions_are_auditable_and_teacher_scoped():
    root = pathlib.Path(__file__).resolve().parents[1]
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    assert '"/progress/<string:dojo_id>/interventions"' in teaching
    assert "teacher.intervention.started" in teaching
    assert "teacher.intervention.reviewed" in teaching
    assert 'resource_type="learning_intervention"' in teaching
    assert "dojo_for_user(user, dojo_id, teacher=True)" in teaching
    assert '"/progress/<string:dojo_id>/export"' in teaching
    assert "_learning_analytics_filters(dojo)" in teaching
    assert 'response.headers["X-Analytics-Scope"]' in teaching


def test_teacher_dashboard_bounds_cold_learning_analysis():
    root = pathlib.Path(__file__).resolve().parents[1]
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()
    analytics = (root / "dojo_plugin/learning/analytics.py").read_text()
    verifier = (root / "ops/verify-system-performance.py").read_text()

    assert "def _dashboard_learning_candidates(dojos, limit=8):" in teaching
    assert '"totalCandidateCourses": candidate_count' in teaching
    assert '"analyzedCourseCount": len(candidates)' in teaching
    assert 'teaching-dashboard-learning:v3:' in teaching
    assert "joinedload(DojoChallenges.challenge)" in analytics
    assert "joinedload(DojoUsers.user)" in analytics
    assert "background-cold" in verifier
    assert '"serverQueryCountMax"' in verifier


def test_teacher_task_center_uses_compact_paginated_collection():
    root = pathlib.Path(__file__).resolve().parents[1]
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()
    template = (root / "dojo_theme/templates/teacher_agent.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()

    assert "def _job_collection_view(" in teaching
    assert '"nextOffset": offset + limit if has_next else None' in teaching
    assert '"hasNext": has_next' in teaching
    assert "selectinload(TeachingGenerationBatches.items)" in teaching
    assert "taskCenterLimit: 50" in script
    assert "data-task-load-more" in script
    assert "vendor.bundle.js" not in template
    assert 'class="ae-dialog teaching-native-modal"' in template


def test_teacher_core_dashboard_projects_large_payload_columns():
    root = pathlib.Path(__file__).resolve().parents[1]
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    # Core dashboard polling must not deserialize full authoring conversations,
    # candidate packages, completed job results, or assistant prose. Those
    # payloads grow with course history while the cards only need metadata.
    orm_imports = {
        name.name
        for node in ast.parse(teaching).body
        if isinstance(node, ast.ImportFrom) and node.module == "sqlalchemy.orm"
        for name in node.names
    }
    assert {"load_only", "selectinload"} <= orm_imports
    for model in (
        "LearningDrafts",
        "TeachingArtifacts",
        "TeachingGenerationBatches",
        "TeachingJobs",
        "TeachingAgentMessages",
    ):
        assert f"load_only(\n                        {model}." in teaching or (
            f"load_only(\n            {model}." in teaching
        )
    dashboard = teaching.split("class TeachingDashboard(Resource):", 1)[1].split(
        '@teaching_namespace.route("/context")', 1
    )[0]
    assert "presented = job_view(job)" not in dashboard
    assert '"updated": _timestamp(job.updated)' in dashboard


def test_coursework_analytics_excludes_legacy_grades_without_a_submission():
    root = pathlib.Path(__file__).resolve().parents[1]
    path = root / "dojo_plugin/learning/analytics_contract.py"
    spec = importlib.util.spec_from_file_location("coursework_analytics_contract", path)
    assert spec and spec.loader
    contract = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(contract)
    now = datetime.datetime(2026, 11, 23)
    yesterday = now - datetime.timedelta(days=1)
    rows = [
        SimpleNamespace(assignment_id=assignment_id, status=status, submitted_at=submitted_at,
                        updated=yesterday, total_score=score, max_score=10)
        for assignment_id, status, submitted_at, score in (
            ("legacy", "GRADED", None, 10),
            ("graded", "GRADED", yesterday, 7),
            ("waiting", "SUBMITTED", yesterday, 0),
            ("revision", "IN_PROGRESS", yesterday, 5),
            ("draft", "IN_PROGRESS", None, 0),
        )
    ]
    assignments = [
        SimpleNamespace(id=row.assignment_id, title=row.assignment_id, due_at=yesterday) for row in rows
    ]

    snapshot = contract.assignment_snapshot(assignments, rows, now)

    assert (snapshot["submitted"], snapshot["overdue"], snapshot["averageScore"]) == (2, 3, 70.0)
    assert [(row["status"], row["scorePercent"]) for row in snapshot["items"]] == [
        ("IN_PROGRESS", None), ("GRADED", 70.0), ("SUBMITTED", None),
        ("IN_PROGRESS", None), ("IN_PROGRESS", None),
    ]
    assert [row.assignment_id for row in contract.assignment_activity_in_window(rows, yesterday, now)] == [
        "graded", "waiting", "revision", "draft",
    ]
