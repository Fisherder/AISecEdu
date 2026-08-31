import pathlib


def test_teacher_learning_dashboard_exposes_deep_diagnostics_and_drilldown():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teacher_courses.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teacher-courses.js").read_text()
    analytics = (root / "dojo_plugin/learning/analytics.py").read_text()

    for identifier in (
        "cs-insight-coverage",
        "cs-insight-mastery",
        "cs-bottleneck-list",
        "cs-intervention-list",
        "cs-intervention-effect-summary",
        "cs-student-insight-drawer",
        "cs-data-quality",
    ):
        assert f'id="{identifier}"' in template
    assert "function renderStudentDrawer(student)" in script
    assert "function renderLearningTimeline()" in script
    assert "function renderAbilityOverview()" in script
    assert "function logStudentIntervention(studentId, trigger)" in script
    assert "function reviewStudentIntervention(interventionId, studentId, trigger)" in script
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
    assert 'ANALYTICS_DEFINITION_VERSION = "2026-08-27.v1"' in analytics
    assert '"minimumReliableClassSample": 3' in analytics
    assert '"minimumReliableQuestionSample": 3' in analytics
    assert '"riskModel"' in analytics
    assert '"automaticGradeImpact": False' in analytics
    assert "至少 3 人后展示班级均值" in script
    assert "至少 ${Number(item.minimumReliableSample || 3)} 人后展示成功率" in script
    assert template.index("cs-learning-action-card") < template.index("cs-learning-kpis")
    assert "new URLSearchParams({timeRange:" in script
    assert 'params.set("studentId"' in script
    assert 'params.set("moduleIndex"' in script
    assert 'params.set("challengeId"' in script
    assert "function learningScopeParams(values)" in script
    assert 'id="cs-export-learning"' in template


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
    assert "from sqlalchemy.orm import load_only, selectinload" in teaching
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
