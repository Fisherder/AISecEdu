import pathlib


def test_artifact_preview_is_content_first_and_keeps_editing_on_demand():
    root = pathlib.Path(__file__).resolve().parents[1]
    template = (root / "dojo_theme/templates/teaching_artifact.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teaching-artifact.js").read_text()
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()

    for selector in (
        'id="artifact-preview-panel"',
        'id="artifact-inspector-toggle"',
        'id="artifact-preview-reload"',
        'id="artifact-preview-fullscreen"',
        'role="tablist"',
        'data-revision-suggestion=',
    ):
        assert selector in template

    assert 'data-inspector-open="false"' in template
    assert "aisecedu-teaching-v22-readability-v1" in template
    assert "aisecedu-teaching-v23" in template
    assert "function setInspectorOpen" in script
    assert "function activateInspectorTab" in script
    assert "previewPanel.requestFullscreen()" in script
    assert "setPreviewState(\"error\"" in script
    assert '[data-inspector-open="true"] .artifact-detail-grid' in styles
    assert ".artifact-preview-panel:fullscreen" in styles
    assert "@media (max-width: 900px)" in styles
    assert "@media (prefers-reduced-motion: reduce)" in styles


def test_artifact_preview_preserves_teacher_return_context_without_history_guessing():
    root = pathlib.Path(__file__).resolve().parents[1]
    page = (root / "dojo_plugin/pages/learning.py").read_text()
    artifacts = (root / "dojo_plugin/agent_runtime/artifacts.py").read_text()
    template = (root / "dojo_theme/templates/teaching_artifact.html").read_text()
    script = (root / "dojo_theme/static/js/dojo/teaching-artifact.js").read_text()
    agent = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()

    assert "dojo_id=artifact.dojo_id" in artifacts
    assert "artifact_course_teacher(artifact, user)" in page
    assert "artifact.self_workspace_id is None and artifact_course_teacher" in artifacts
    assert "safe_teacher_return_path" in page
    assert 'request.path.startswith("/teacher/")' in page
    assert 'data-return-role="{{ artifact_return_role }}"' in template
    assert 'returnRole === "teacher" ? "/teacher/courses"' in script
    assert "history.back" not in script
    assert "function teacherArtifactHref" in agent
    assert 'pathname === "/teacher" || pathname.startsWith("/teacher/")' in agent


def test_student_preview_uses_a_minimal_server_serialization_boundary():
    root = pathlib.Path(__file__).resolve().parents[1]
    artifacts = (root / "dojo_plugin/agent_runtime/artifacts.py").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    assert "if not student_safe:" in artifacts
    assert '"studentSafe": bool(student_safe)' in artifacts
    for private_key in (
        "selfWorkspaceId",
        "candidateId",
        "publishedChallengeId",
        "parentRevision",
        "contentHash",
        "sourceRefs",
        "validation",
        "instruction",
    ):
        assert f'"{private_key}"' in artifacts
    assert 'if student_safe:\n                data["history"]' in teaching
    assert 'if not student_safe:\n                active_jobs' in teaching
    assert 'data["lineage"] = {' in teaching


def test_embedded_reader_has_navigation_overview_notes_and_accessibility():
    root = pathlib.Path(__file__).resolve().parents[1]
    component = (
        root
        / "services/agent-runtime/components/integrated-lesson-preview.tsx"
    ).read_text()
    styles = (
        root
        / "services/agent-runtime/components/integrated-lesson-preview.module.css"
    ).read_text()

    for contract in (
        'data-aisecedu-preview-surface="reader"',
        'aria-label="内容导航"',
        'aria-label="阅读进度"',
        "jumpDigitsRef.current",
        "requestFullscreen()",
        "handlePointerDown",
        "handlePointerUp",
        "prefers-reduced-motion",
    ):
        assert contract in component or contract in styles
