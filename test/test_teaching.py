import concurrent.futures
import datetime
import json
import os
import pathlib
import re
import secrets
import time
import urllib.parse
from types import SimpleNamespace

import pytest
import requests

from utils import DOJO_URL, db_sql, dojo_run, get_user_id, login


API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/teaching"
LEARNING_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/learning"


def test_teacher_agent_uses_one_persistent_composer_approval_surface():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()
    template = (root / "dojo_theme/templates/teacher_agent.html").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()
    authoring = (root / "dojo_plugin/learning/authoring.py").read_text()
    runtime = (
        root / "services/agent-runtime/lib/server/teacher-agent.ts"
    ).read_text()

    assert template.count('id="teaching-approval-tray"') == 1
    assert template.index('id="teaching-approval-tray"') < template.index(
        'class="teaching-composer-row"'
    )
    assert '<section id="teaching-action-section" hidden>' in template
    assert template.index('id="teaching-action-section"') > template.index(
        'id="teaching-job-list"'
    )
    assert "function pendingApprovalItems()" in script
    assert "function renderApprovalTray()" in script
    assert "function handleProposalApproval(item, decision)" in script
    assert "function handleStoredApproval(item, decision)" in script
    assert 'data-approval-decision="APPROVED"' in script
    assert 'data-approval-decision="REJECTED"' in script
    assert "toolProposalDecisions" in script
    assert "state.resolvingApprovalKeys.add(item.key)" in script
    assert "state.resolvingApprovalKeys.delete(item.key)" in script
    assert "function independentQuestionJobCards(message)" in script
    assert "function renderResultCards(cards)" in script
    assert 'data-generation-requested-count="${challengeCount}"' in script
    assert 'if (hasQuestionBatch) return "question-tasks";' in script
    assert ".independent-question-jobs" in styles
    assert ".question-batch-card" not in styles
    assert ".teaching-generation-contract" not in styles
    assert "teaching-generation-contract" not in script
    assert "function visibleMessageContent(message)" in script
    assert "选择的是整批策略" not in runtime
    public_constraints = authoring.split("PUBLIC_CONSTRAINT_KEYS = {", 1)[1].split(
        "}", 1
    )[0]
    for key in (
        "batchContract",
        "batchCount",
        "batchIndex",
        "batchTopic",
        "independentChallenge",
    ):
        assert f'"{key}"' in public_constraints
    assert "proposal.requiresConfirmation !== true" in script
    assert 'data-action-approve="' not in script
    assert 'data-action-reject="' not in script
    assert " · 需确认" not in script
    assert "function withResultApproval(markup)" in script
    assert "return markup;" in script
    assert "if (elements.actionSection) elements.actionSection.hidden = true" in script
    assert ".teacher-agent-page .teaching-approval-tray" in styles
    assert ".teacher-agent-page .has-pending-approval .teaching-quick-prompts" in styles
    assert "grid-template-columns: 34px minmax(0, 1fr) auto;" in styles
    assert "class TeachingToolProposalDecision(Resource):" in teaching
    assert 'metadata["toolProposalDecisions"] = decisions' in teaching
    assert 'code="PROPOSAL_ALREADY_DECIDED"' in teaching


def test_candidate_materialization_preserves_original_generation_contract():
    root = pathlib.Path(__file__).resolve().parents[1]
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    artifacts = (root / "dojo_plugin/agent_runtime/artifacts.py").read_text()

    assert teaching.count(
        '"requestPrompt": candidate_request_prompt(candidate_set),'
    ) == 2
    assert jobs.count(
        '"requestPrompt": candidate_request_prompt(candidate_set),'
    ) == 1
    assert "MAX_CANDIDATE_REQUEST_PROMPT_CHARS = 16000" in artifacts
    assert 'request_json.get("prompt") or ""' in artifacts
    assert "[:MAX_CANDIDATE_REQUEST_PROMPT_CHARS]" in artifacts


def test_scored_simulation_contract_preserves_explicit_question_mode():
    from CTFd.plugins.dojo_plugin.api.v1.teaching import (
        _practice_challenge_constraints,
    )

    explicit = _practice_challenge_constraints(
        "学生完成无线异常处置并由平台自动评分",
        {"exerciseMode": "SIMULATION"},
    )
    assert explicit["exerciseMode"] == "SIMULATION"

    ambiguous_ctf = _practice_challenge_constraints(
        "创建一个无线安全 CTF 模拟题并获取动态 Flag",
        {},
    )
    assert ambiguous_ctf["exerciseMode"] == "CONTAINER"


def test_new_question_only_uses_course_materials_when_explicitly_requested():
    from CTFd.plugins.dojo_plugin.api.v1.teaching import (
        _challenge_material_grounding_requested,
    )

    assert not _challenge_material_grounding_requested(
        "在当前章节生成一题可自动评分的无线网络异常模拟实训题"
    )
    assert _challenge_material_grounding_requested(
        "请根据刚才上传的课件生成三道独立题目"
    )
    assert _challenge_material_grounding_requested(
        "基于课程讲义设计一题缓冲区溢出实践题"
    )
    assert _challenge_material_grounding_requested(
        "Create one challenge based on the uploaded document"
    )


def test_course_chat_does_not_implicitly_attach_unrelated_materials():
    from CTFd.plugins.dojo_plugin.agent_runtime.materials import (
        course_material_grounding_requested,
    )

    assert not course_material_grounding_requested(
        "在当前章节生成一题可自动评分的无线网络异常模拟实训题"
    )
    assert course_material_grounding_requested("请结合课程讲义设计一题实践题")


def test_tool_proposal_decision_is_persistent_and_idempotent(
    admin_session,
    random_user,
):
    _student_name, student_session = random_user
    created = admin_session.post(
        f"{API}/threads",
        json={"title": "批准托盘持久化验收"},
    )
    assert created.status_code == 201, created.text
    thread_id = created.json()["data"]["thread"]["id"]
    owner_id = get_user_id("admin")
    metadata = {
        "pending": False,
        "presentation": "answer",
        "toolProposals": [
            {
                "tool": "module.create",
                "arguments": {"name": "批准验收章节"},
                "reason": "在课程中创建新章节",
                "requiresConfirmation": True,
            }
        ],
    }
    escaped_metadata = json.dumps(metadata, ensure_ascii=False).replace("'", "''")
    message_id = int(
        db_sql(
            "INSERT INTO teaching_agent_messages "
            "(thread_id, user_id, role, content, metadata, created) "
            f"VALUES ('{thread_id}', {owner_id}, 'assistant', "
            "'准备执行课程变更。', "
            f"'{escaped_metadata}'::jsonb, NOW()) RETURNING id;"
        )
    )
    endpoint = (
        f"{API}/threads/{thread_id}/messages/{message_id}/"
        "tool-proposals/0/decision"
    )
    try:
        denied = student_session.post(
            endpoint,
            json={"decision": "REJECTED", "confirmed": True},
        )
        assert denied.status_code == 404, denied.text
        unconfirmed = admin_session.post(
            endpoint,
            json={"decision": "REJECTED"},
        )
        assert unconfirmed.status_code == 400, unconfirmed.text

        rejected = admin_session.post(
            endpoint,
            json={"decision": "REJECTED", "confirmed": True},
        )
        assert rejected.status_code == 200, rejected.text
        rejected_data = rejected.json()["data"]
        assert rejected_data["deduplicated"] is False
        assert rejected_data["decision"]["decision"] == "REJECTED"
        stored_message = next(
            item
            for item in rejected_data["thread"]["messages"]
            if int(item["id"]) == message_id
        )
        assert stored_message["metadata"]["toolProposalDecisions"]["0"][
            "decision"
        ] == "REJECTED"

        repeated = admin_session.post(
            endpoint,
            json={"decision": "REJECTED", "confirmed": True},
        )
        assert repeated.status_code == 200, repeated.text
        assert repeated.json()["data"]["deduplicated"] is True

        conflicting = admin_session.post(
            endpoint,
            json={"decision": "APPROVED", "confirmed": True},
        )
        assert conflicting.status_code == 409, conflicting.text
        assert conflicting.json()["errorCode"] == "PROPOSAL_ALREADY_DECIDED"
    finally:
        cleanup = admin_session.delete(
            f"{API}/threads/{thread_id}", json={"confirmed": True}
        )
        assert cleanup.status_code == 200, cleanup.text


@pytest.mark.timeout(120)
def test_teacher_agent_approval_tray_browser_flow(
    browser_fixture,
    admin_session,
):
    selenium_by = pytest.importorskip("selenium.webdriver.common.by")
    selenium_wait = pytest.importorskip("selenium.webdriver.support.ui")
    created = admin_session.post(
        f"{API}/threads",
        json={"title": "输入框审批条浏览器验收"},
    )
    assert created.status_code == 201, created.text
    thread_id = created.json()["data"]["thread"]["id"]
    owner_id = get_user_id("admin")
    metadata = {
        "pending": False,
        "presentation": "answer",
        "toolProposals": [
            {
                "tool": "module.create",
                "arguments": {"name": "浏览器验收章节"},
                "reason": "在当前课程中创建浏览器验收章节",
                "requiresConfirmation": True,
            }
        ],
    }
    escaped_metadata = json.dumps(metadata, ensure_ascii=False).replace("'", "''")
    message_id = int(
        db_sql(
            "INSERT INTO teaching_agent_messages "
            "(thread_id, user_id, role, content, metadata, created) "
            f"VALUES ('{thread_id}', {owner_id}, 'assistant', "
            "'这项课程变更需要你的批准。', "
            f"'{escaped_metadata}'::jsonb, NOW()) RETURNING id;"
        )
    )
    browser = browser_fixture
    try:
        browser.get(DOJO_URL)
        for cookie in admin_session.cookies:
            browser.add_cookie(
                {
                    "name": cookie.name,
                    "value": cookie.value,
                    "path": cookie.path or "/",
                    "secure": bool(cookie.secure),
                }
            )
        browser.get(f"{DOJO_URL.rstrip('/')}/teacher")
        wait = selenium_wait.WebDriverWait(browser, 45)
        tray = wait.until(
            lambda driver: (
                (items := driver.find_elements(selenium_by.By.ID, "teaching-approval-tray"))
                and items[0].is_displayed()
                and items[0]
            )
        )
        input_box = browser.find_element(selenium_by.By.ID, "teaching-input")
        assert tray.rect["y"] + tray.rect["height"] <= input_box.rect["y"] + 1
        assert "需要批准" in tray.text
        assert "创建章节" in tray.text
        assert "下一步操作" not in browser.find_element(
            selenium_by.By.ID, "teaching-messages"
        ).text
        reject = tray.find_element(
            selenium_by.By.CSS_SELECTOR,
            '[data-approval-decision="REJECTED"]',
        )
        reject.click()
        wait.until(lambda _driver: not tray.is_displayed())
        browser.refresh()
        wait.until(
            lambda driver: driver.find_element(
                selenium_by.By.ID, "teaching-input"
            ).is_displayed()
        )
        assert not browser.find_element(
            selenium_by.By.ID, "teaching-approval-tray"
        ).is_displayed()
        stored = admin_session.get(f"{API}/threads/{thread_id}")
        assert stored.status_code == 200, stored.text
        stored_message = next(
            item
            for item in stored.json()["data"]["thread"]["messages"]
            if int(item["id"]) == message_id
        )
        assert stored_message["metadata"]["toolProposalDecisions"]["0"][
            "decision"
        ] == "REJECTED"
    finally:
        cleanup = admin_session.delete(
            f"{API}/threads/{thread_id}", json={"confirmed": True}
        )
        assert cleanup.status_code == 200, cleanup.text


def test_teacher_agent_uses_compact_expandable_task_surfaces():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()
    template = (root / "dojo_theme/templates/teacher_agent.html").read_text()

    activity = re.search(
        r"function renderActivityMessage\(message\) \{(?P<body>.*?)\n  \}\n\n  function renderAssistantMessage",
        script,
        re.S,
    )
    task_list = re.search(
        r"function renderJobs\(\) \{(?P<body>.*?)\n  \}\n\n  async function loadArtifacts",
        script,
        re.S,
    )
    assert activity and task_list
    assert "teaching-activity-line" in activity.group("body")
    assert "jobDisclosureDetailsMarkup" in activity.group("body")
    assert "data-job-toggle" in activity.group("body")
    assert 'aria-expanded="${expanded}"' in activity.group("body")
    assert "expandedJobIds: new Set()" in script
    assert "bindJobDisclosureButtons(elements.messages, false)" in script
    assert "bindJobDisclosureButtons(elements.jobList, true)" in script
    assert "jobTimelineMarkup(job, false)" in script
    assert "messageExecutionMarkup" not in script
    assert "taskGroupMarkup" in task_list.group("body")
    assert 'taskGroupMarkup("active", "进行中", active)' in task_list.group("body")
    assert 'taskGroupMarkup("completed", "已完成", completed)' in task_list.group(
        "body"
    )
    assert "teaching-task-progress" in script
    assert "data-job-jump" in script
    assert "jumpToJobConversation" in script
    assert "jobEventListMarkup" not in script
    assert "loadJobActivity" not in script
    assert "执行记录" not in script
    assert "teaching-answer-surface" in script
    assert "renderGenerationOptions" in script
    assert "selectGenerationOption" in script
    assert "data-generation-option-message" in script
    assert "完整生成提示词" not in script
    assert "teaching-generation-option-prompt" not in script
    assert ".teaching-generation-option-prompt" not in styles
    assert "选择一套方案" in script
    assert "showGenerationOption" in script
    assert "data-generation-option-view-id" in script
    assert "data-generation-option-panel" in script
    assert "teaching-plan-picker" in script
    assert ".teaching-generation-option" in styles
    assert ".teaching-plan-picker" in styles
    assert ".teaching-generation-option[hidden]" in styles
    assert ".teaching-generation-options > div" not in styles
    assert "is-stop" in script
    assert 'id="teaching-job-list"' in template
    assert 'id="teaching-current-run"' not in template
    assert 'id="teaching-stop"' not in template
    assert 'id="teaching-current-thread-actions"' not in template
    assert "currentThreadActions" not in script
    assert "执行记录" not in template
    assert template.count('data-quick-action="') == 4
    assert 'id="teaching-quick-scope-dialog"' in template
    assert 'value="course"' in template
    assert 'value="module"' in template
    assert "不限定课程（自由描述）" in script
    assert 'prompt = "帮我"' in script
    assert "为整门课程“${dojo.name}”" in script
    assert "为课程“${dojo.name}”的章节“" in script
    assert "data-compose" not in template
    user_alignment = re.findall(
        r"\.teacher-agent-page \.teaching-message\.is-user \{(?P<body>.*?)\}",
        styles,
        re.S,
    )
    assert user_alignment
    assert "flex-direction: row;" in user_alignment[-1]
    assert "justify-content: flex-end;" in user_alignment[-1]
    for legacy_class in (
        ".teaching-run-card",
        ".teaching-answer-card",
        ".teaching-current-run",
        ".job-detail-card",
        ".job-event-details",
        ".job-detail-view",
        ".job-detail-section",
    ):
        assert legacy_class not in styles


def test_activity_spinner_stays_top_aligned_and_animated_when_expanded():
    root = pathlib.Path(__file__).resolve().parents[1]
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()

    activity_layouts = re.findall(
        r"\.teacher-agent-page \.teaching-message\.is-activity \{(?P<body>.*?)\}",
        styles,
        re.S,
    )
    assert activity_layouts
    assert "align-items: flex-start;" in activity_layouts[-1]

    activity_avatar = re.search(
        r"\.teacher-agent-page \.teaching-message\.is-activity \.teaching-message-avatar \{(?P<body>.*?)\}",
        styles,
        re.S,
    )
    assert activity_avatar
    assert "margin-top: 7px;" in activity_avatar.group("body")
    assert "align-self: flex-start;" in activity_avatar.group("body")
    assert (
        ".teaching-message.is-activity.is-expanded .teaching-message-avatar"
        not in styles
    )

    activity_spinner = re.search(
        r"\.teaching-message\.is-activity\s+\.teaching-message-avatar\s+\.fa-spin \{(?P<body>.*?)\}",
        styles,
        re.S,
    )
    assert activity_spinner
    assert "animation: teaching-activity-spin 0.8s linear infinite !important;" in (
        activity_spinner.group("body")
    )
    assert "@keyframes teaching-activity-spin" in styles


def test_teacher_agent_progress_is_compact_live_and_stable():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()
    disclosure = re.search(
        r"function jobDisclosureDetailsMarkup\(job, prefix\) \{(?P<body>.*?)\n  \}\n\n  function syncJobDisclosure",
        script,
        re.S,
    )
    task_item = re.search(
        r"function taskListItemMarkup\(job\) \{(?P<body>.*?)\n  \}\n\n  function taskGroupMarkup",
        script,
        re.S,
    )

    assert disclosure and task_item

    assert "function authoringStagePresentation(stage)" in script
    for stage_copy in (
        "检索并比较题库",
        "选择出题策略",
        "规划教学与实现方案",
        "构建题包与运行环境",
        "独立红队审查",
        "修复预审问题",
        "保存可追溯草稿",
        "独立验证与复验",
    ):
        assert stage_copy in script
    assert "第 ${validation[1]} 轮独立验证" in script
    assert "第 ${validationRepair[1]} 轮自主修复" in script
    assert 'aria-live="polite"' in script
    assert "Array.isArray(job.events) ? job.events : []" in script
    assert "latestStage !== stage" in script
    assert "jobProgressOverviewMarkup" not in script
    assert "jobRecentProgressMarkup" not in script
    assert "最新进展" not in script
    assert "jobTimelineMarkup(job, false)" in disclosure.group("body")
    assert "jobProgressBarMarkup" not in disclosure.group("body")
    assert "function jobAttemptLabel(job)" in script
    assert "function jobDurationMarkup(job, compact)" in script
    assert 'data-job-duration-prefix="${prefix}"' in script
    assert "window.setInterval" in script
    assert "formatJobDuration" in script
    assert "function jobProgressBarMarkup(job, className, key)" in script
    assert "data-job-progress-target" in script
    assert "animateJobProgressBars(elements.messages)" in script
    assert "animateJobProgressBars(elements.jobList)" in script
    assert script.count('jobProgressBarMarkup(job, "teaching-task-progress"') == 1
    assert task_item.group("body").index("jobProgressBarMarkup") < task_item.group(
        "body"
    ).index("jobDisclosureDetailsMarkup")
    assert "lastJobListSignature" in script
    assert "state.lastTranscriptSignature === nextSignature" in script
    assert "state.lastJobListSignature === nextSignature" in script
    assert "job-event-details" not in script
    assert "执行记录" not in script

    for selector in (
        ".teaching-task-progress",
        ".teaching-activity-facts",
        ".teaching-task-facts",
    ):
        assert selector in styles
    assert ".job-progress-overview" not in styles
    assert ".job-recent-progress" not in styles
    assert "@keyframes teaching-progress-scan" in styles
    assert "@keyframes teaching-event-pulse" not in styles
    assert ".teaching-task-progress.is-live::after" in styles
    assert ".teaching-task-progress > i {\n    transition: none !important;" in styles


def test_canceled_job_presentation_wins_over_stale_active_card_state():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    presentation = re.search(
        r"function messagePresentation\(message\) \{(?P<body>.*?)\n  \}\n\n  function resultCardsMarkup",
        script,
        re.S,
    )
    assert presentation
    body = presentation.group("body")
    assert body.index('if (jobStatus === "CANCELED") return "canceled";') < body.index(
        "activeJobStatuses.has(jobStatus)"
    )
    assert 'canceled ? "fa-minus"' in script


def test_independent_question_batch_never_uses_first_job_as_batch_status():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    message_job = re.search(
        r"function messageJob\(message\) \{(?P<body>.*?)\n  \}\n\n  function messagePresentation",
        script,
        re.S,
    )
    presentation = re.search(
        r"function messagePresentation\(message\) \{(?P<body>.*?)\n  \}\n\n  function resultCardsMarkup",
        script,
        re.S,
    )
    result_cards = re.search(
        r"function renderResultCards\(cards\) \{(?P<body>.*?)\n  \}",
        script,
        re.S,
    )

    assert message_job and presentation and result_cards
    assert "cardJobs.find" in message_job.group("body")
    assert "activeJobStatuses.has" in message_job.group("body")
    assert 'if (hasQuestionBatch) return "question-tasks";' in presentation.group(
        "body"
    )
    assert "return cards.map((card) => renderCard(card)).join(\"\");" in (
        result_cards.group("body")
    )
    assert "function renderQuestionBatch" not in script
    assert "独立题目任务" in script
    assert "job && !questionTasks" in script
    assert "title: cardState.title || existing.title || null" in script
    assert "batchTopic: cardState.batchTopic || existing.batchTopic || null" in script
    assert 'result.draftId || ""' in script
    assert 'target.href || ""' in script
    assert 'cardResult.draftId || ""' in script
    assert 'cardTarget.href || ""' in script
    assert 'else f"CTF 实践题 {batch_index}/{challenge_count}"' in teaching


def test_live_active_card_state_wins_over_stale_message_metadata():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    collect = re.search(
        r"function collectJobs\(\) \{(?P<body>.*?)\n  \}\n\n  async function createThread",
        script,
        re.S,
    )
    assert collect
    body = collect.group("body")
    assert "activeJobStatuses.has(existingStatus)" in body
    assert "activeJobStatuses.has(status)" in body
    assert body.count("status = existingStatus;") >= 2


def test_active_job_cannot_be_presented_as_completed_without_a_result():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()

    assert 'activeJobStatuses.has(status) ? 99 : 100' in script
    assert 'label: "正在保存结果"' in script
    assert "核心处理已结束，正在保存结果；入口生成后页面会自动刷新" in script
    assert '/^(complete|completed|finalizing)$/.test(stage)' in script
    assert 'stage = "finalizing"' in jobs
    assert 'progress = min(99, max(0, int(progress or 0)))' in jobs
    assert "任务不会被标记为完成" in jobs


def test_generation_option_picker_does_not_reanimate_during_job_polling():
    root = pathlib.Path(__file__).resolve().parents[1]
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()
    option = re.search(
        r"\.teaching-generation-option \{(?P<body>.*?)\}",
        styles,
        re.S,
    )
    assert option
    assert "animation:" not in option.group("body")
    assert "@keyframes teaching-plan-enter" not in styles


def test_teacher_agent_sidebar_only_lists_active_threads():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()
    template = (root / "dojo_theme/templates/teacher_agent.html").read_text()

    assert "data-thread-view" not in template
    assert "teaching-thread-views" not in template
    assert "teaching-thread-views" not in styles
    assert 'new URLSearchParams({ view: "active" })' in script
    assert "state.threadView" not in script
    assert 'data-thread-action="archive"' in template
    assert "async function restoreArchivedThread(item)" in script
    assert '{ archived: false }' in script


def test_terminal_tasks_can_be_removed_without_deleting_conversation_results():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()

    assert 'class="teaching-task-manage"' in script
    assert 'data-delete-task="${api.escapeHtml(job.id)}"' in script
    assert "async function dismissTrackedJob(jobId)" in script
    assert "state.trackedJobs.delete(id)" in script
    assert "对话内容和任务结果仍会保留" in script
    assert "if (cardState.taskListHidden === true) return;" in script
    assert "if (metadata.taskListHidden === true) return;" in script
    assert ".filter((job) => job.taskListHidden !== true)" in script
    assert "def dismiss_job_from_task_list(job, user_id):" in jobs
    assert '"taskListHidden": True' in jobs
    assert '"taskListHidden": False' in jobs
    assert '@teaching_namespace.route("/jobs/<string:job_id>/task-list")' in teaching
    assert "dismiss_job_from_task_list(job, user.id)" in teaching


def test_failed_task_retry_replaces_the_failed_attempt_in_place():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    retry = re.search(
        r"async function retryTrackedJob\(jobId\) \{(?P<body>.*?)\n  \}\n\n  function messageReferencesJob",
        script,
        re.S,
    )
    assert retry
    assert "AISecEduUI.confirm" not in retry.group("body")
    assert "retryingJobIds" in retry.group("body")
    assert 'status: "QUEUED"' in retry.group("body")
    assert 'stage: "queued"' in retry.group("body")
    assert 'progress: 0' in retry.group("body")
    assert 'failureMessage: null' in retry.group("body")
    assert "state.expandedJobIds.add(id)" in retry.group("body")
    assert "data.replacedInPlace !== true || retriedId !== id" in retry.group(
        "body"
    )
    assert "if (previousJob) storeTaskCenterJob(previousJob)" in retry.group(
        "body"
    )
    assert "state.forceScrollToLatest = true" not in retry.group("body")
    assert "正在替换失败状态并重新执行" in retry.group("body")
    assert "任务已在原位置重新执行" not in retry.group("body")
    assert "fa-circle-notch fa-spin" in script
    assert "原任务与错误记录会保留" not in script
    assert 'return retryTrackedJob(args.jobId);' in script
    assert "def _retry_payload(job, user_id):" in jobs
    retry_backend = re.search(
        r"def retry_job\(job, user_id, idempotency_token\):(?P<body>.*?)\n\n\ndef _retry_payload",
        jobs,
        re.S,
    )
    assert retry_backend
    assert "job.status = \"QUEUED\"" in retry_backend.group("body")
    assert "TeachingJobEvents.query.filter_by" in retry_backend.group("body")
    assert "ModelInvocations.query.filter_by" in retry_backend.group("body")
    assert "outbox.published = None" in retry_backend.group("body")
    assert "TeachingAgentMessages(" not in retry_backend.group("body")
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()
    assert '"replacedInPlace": retried.id == job.id' in teaching
    assert '"replacedJobId": job.id' in teaching
    assert "db.session.delete(source)" in jobs
    assert "LearningAuthoringJobs(" in jobs
    assert "LearningSolutionRuns(" in jobs
    assert "def _legacy_authoring_retry_source(job, user_id):" in jobs
    assert "def _replace_legacy_retry_surfaces(job, superseded_job_ids):" in jobs
    assert '"supersededByJobId": job.id' in jobs


def test_teacher_agent_has_no_keyword_intent_router():
    from CTFd.plugins.dojo_plugin.api.v1 import teaching
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    assert not hasattr(teaching, "_teacher_message_intent")
    assert not hasattr(teaching, "_inferred_artifact_type")
    assert not hasattr(teaching, "_candidate_generation_plan")
    assert not hasattr(teaching, "GENERATION_HINT")
    assert not hasattr(jobs, "_natural_language_confirmation")
    assert not hasattr(jobs, "PROGRESS_ANALYSIS_HINT")
    answer = "已生成一份课堂活动建议：先演示，再让学生分组验证。"
    assert jobs._agent_answer({"answer": answer}) == answer


def test_native_authoring_progress_events_are_deduplicated_by_visible_change():
    from CTFd.plugins.dojo_plugin.agent_runtime.jobs import (
        _should_append_native_progress_event,
    )

    latest = SimpleNamespace(
        stage="native-build",
        status="RUNNING",
        message="正在构建运行环境",
    )

    assert not _should_append_native_progress_event(
        latest,
        "native-build",
        "RUNNING",
        "正在构建运行环境",
    )
    assert _should_append_native_progress_event(
        latest,
        "native-validate",
        "RUNNING",
        "正在构建运行环境",
    )
    assert _should_append_native_progress_event(
        latest,
        "native-build",
        "RUNNING",
        "已生成容器，正在验证动态 Flag",
    )
    assert _should_append_native_progress_event(
        latest,
        "native-build",
        "COMPLETED",
        "正在构建运行环境",
    )


def test_teaching_worker_isolates_native_authoring_from_interactive_queue(
    monkeypatch,
):
    """A long native build must never hold unrelated material work hostage."""

    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    class JobQuery:
        def __init__(self, job):
            self.job = job

        def filter_by(self, **values):
            assert values == {"id": self.job.id}
            return self

        def first(self):
            return self.job

    class RedisClient:
        def __init__(self):
            self.messages = []

        def xadd(self, stream, values, maxlen):
            self.messages.append((stream, values, maxlen))

    native = SimpleNamespace(
        id="job-native",
        kind="learning.authoring",
        status="QUEUED",
    )
    monkeypatch.setattr(
        jobs,
        "TeachingJobs",
        SimpleNamespace(query=JobQuery(native)),
    )
    client = RedisClient()
    payload = {"job_id": native.id, "trace_id": "trace-native"}

    assert jobs._stream_for_job_kind("material.analyze") == jobs.STREAM
    assert jobs._stream_for_job_kind("learning.authoring") == jobs.AUTHORING_STREAM
    assert jobs._stream_for_job_kind("learning.solution") == jobs.AUTHORING_STREAM
    assert jobs._reroute_queued_job_message(client, jobs.STREAM, payload)
    assert client.messages == [
        (
            jobs.AUTHORING_STREAM,
            {"data": json.dumps(payload)},
            100000,
        )
    ]

    # A second consumer may claim a long-running Redis entry after its idle
    # timeout.  It must not duplicate that already-leased native job.
    native.status = "RUNNING"
    assert not jobs._reroute_queued_job_message(client, jobs.STREAM, payload)
    assert len(client.messages) == 1

    root = pathlib.Path(__file__).resolve().parents[1]
    compose = (root / "docker-compose.yml").read_text()
    worker_main = (root / "dojo_plugin/worker/teaching_main.py").read_text()
    assert "teaching-interactive-worker:" in compose
    assert "teaching-authoring-worker:" in compose
    assert "teaching-authoring-worker-2:" in compose
    assert "TEACHING_WORKER_STREAM: teaching:authoring" in compose
    assert "consume_jobs(stream=worker_stream" in worker_main


def test_native_authoring_batch_preserves_successful_siblings():
    from CTFd.plugins.dojo_plugin.agent_runtime.jobs import (
        _native_authoring_batch_outcome,
    )

    assert _native_authoring_batch_outcome(["RUNNING", "SUCCEEDED"]) == (
        "PENDING",
        "RUNNING",
    )
    assert _native_authoring_batch_outcome(
        ["SUCCEEDED", "FAILED", "SUCCEEDED", "CANCELED", "SUCCEEDED"]
    ) == ("SUCCEEDED", "PARTIAL")
    assert _native_authoring_batch_outcome(["SUCCEEDED", "CANCELED"]) == (
        "SUCCEEDED",
        "PARTIAL",
    )
    assert _native_authoring_batch_outcome(["FAILED", "CANCELED"]) == (
        "FAILED",
        "FAILED",
    )


def test_retry_job_reuses_a_terminal_retry_for_the_same_idempotency_token(
    monkeypatch,
):
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    task = SimpleNamespace(
        id="job_retry_contract",
        owner_id=17,
        status="FAILED",
        payload={"manualRetryToken": "stable-retry-token"},
    )

    class TaskQuery:
        def filter_by(self, **_values):
            return self

        def with_for_update(self):
            return self

        def first(self):
            return task

    monkeypatch.setattr(jobs.TeachingJobs, "query", TaskQuery())
    returned, created = jobs.retry_job(task, 17, "stable-retry-token")
    assert returned is task
    assert created is False


def test_native_authoring_batch_exposes_five_independent_management_links(
    monkeypatch,
):
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    class SingleResultQuery:
        def __init__(self, value):
            self.value = value

        def filter_by(self, **_values):
            return self

        def first(self):
            return self.value

    class JobIdColumn:
        @staticmethod
        def in_(values):
            return values

    class JobRowsQuery:
        def __init__(self, rows):
            self.rows = rows

        def filter(self, _expression):
            return self

        def all(self):
            return self.rows

    action = SimpleNamespace(
        result={"formalJobIds": [f"job-{index}" for index in range(1, 6)]},
        status="PENDING",
        error=None,
        completed=None,
    )
    children = [
        SimpleNamespace(
            id=f"job-{index}",
            action_id="action-1",
            kind="learning.authoring",
            status="SUCCEEDED",
            result={"draftId": f"draft-{index}"},
            payload={
                "batchId": "batch-1",
                "batchIndex": index,
                "batchCount": 5,
                "batchTopic": f"主题 {index}",
            },
            dojo_id=7,
            module_index=3,
            error=None,
            completed=index,
        )
        for index in range(1, 6)
    ]
    monkeypatch.setattr(
        jobs,
        "TeachingAgentActions",
        SimpleNamespace(query=SingleResultQuery(action)),
    )
    monkeypatch.setattr(
        jobs,
        "TeachingJobs",
        SimpleNamespace(id=JobIdColumn(), query=JobRowsQuery(children)),
    )
    monkeypatch.setattr(
        jobs,
        "Dojos",
        SimpleNamespace(
            query=SingleResultQuery(SimpleNamespace(reference_id="course-one"))
        ),
    )
    monkeypatch.setattr(
        jobs,
        "DojoModules",
        SimpleNamespace(query=SingleResultQuery(SimpleNamespace(id="intro"))),
    )

    jobs._sync_native_authoring_batch_action(children[0])

    assert action.status == "SUCCEEDED"
    assert action.result["draftIds"] == [f"draft-{index}" for index in range(1, 6)]
    outcomes = action.result["batchResults"]
    assert [item["batchIndex"] for item in outcomes] == [1, 2, 3, 4, 5]
    assert [item["batchTopic"] for item in outcomes] == [
        f"主题 {index}" for index in range(1, 6)
    ]
    assert len({item["manageUrl"] for item in outcomes}) == 5
    assert outcomes[0]["manageUrl"] == (
        "/teacher/courses?dojo=course-one&tab=questions&module=intro&selectedId=draft-1"
    )
    root = pathlib.Path(__file__).resolve().parents[1]
    client = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    runtime = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    assert "const batchPosition = batchCount > 1" in client
    assert "可独立修订、发布和删除" in client
    assert 'result["batch"] = {' in runtime
    assert '"index": batch_index' in runtime
    assert '"count": min(5, batch_count)' in runtime


def test_failed_native_authoring_target_keeps_its_individual_draft(monkeypatch):
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    class SingleResultQuery:
        def __init__(self, value):
            self.value = value

        def filter_by(self, **_values):
            return self

        def first(self):
            return self.value

    monkeypatch.setattr(
        jobs,
        "LearningAuthoringJobs",
        SimpleNamespace(
            query=SingleResultQuery(SimpleNamespace(draft_id="failed-draft"))
        ),
    )
    monkeypatch.setattr(
        jobs,
        "Dojos",
        SimpleNamespace(
            query=SingleResultQuery(SimpleNamespace(reference_id="course-one"))
        ),
    )
    monkeypatch.setattr(
        jobs,
        "DojoModules",
        SimpleNamespace(query=SingleResultQuery(SimpleNamespace(id="intro"))),
    )

    target = jobs._job_result_target(
        SimpleNamespace(
            kind="learning.authoring",
            payload={"legacyJobId": "legacy-1"},
            dojo_id=7,
            module_index=3,
        ),
        {},
    )

    assert target == {
        "kind": "link",
        "href": (
            "/teacher/courses?dojo=course-one&tab=questions&"
            "module=intro&selectedId=failed-draft"
        ),
    }


def test_native_authoring_retry_and_cancel_states_are_not_reported_as_failures(
    monkeypatch,
):
    from CTFd.plugins.dojo_plugin.agent_runtime.jobs import (
        _cancel_native_authoring_compatibility_job,
        _native_authoring_retryable_error,
        _native_outer_job_is_active,
        _native_solution_retryable_error,
        _job_cancellation_requested,
        _reset_native_authoring_compatibility_job,
        _reset_native_solution_compatibility_run,
        RetryableJobError,
    )
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    assert _job_cancellation_requested(
        SimpleNamespace(status="CANCEL_REQUESTED", canceled=None)
    )
    assert _job_cancellation_requested(
        SimpleNamespace(status="RUNNING", canceled=object())
    )
    assert not _job_cancellation_requested(
        SimpleNamespace(status="RUNNING", canceled=None)
    )
    assert _native_outer_job_is_active(
        SimpleNamespace(status="RUNNING", canceled=None)
    )
    assert not _native_outer_job_is_active(None)
    assert not _native_outer_job_is_active(
        SimpleNamespace(status="CANCEL_REQUESTED", canceled=None)
    )
    assert not _native_outer_job_is_active(
        SimpleNamespace(status="RUNNING", canceled=object())
    )
    transient_legacy = SimpleNamespace(
        error="Transient authoring model failure: provider timeout",
        steps=[],
    )
    assert _native_authoring_retryable_error(transient_legacy).startswith(
        "Transient authoring model failure:"
    )
    assert isinstance(
        RetryableJobError("provider timeout"), RuntimeError
    )
    transient_solution = SimpleNamespace(
        status="FAILED",
        error="Transient solution model failure: response contract",
        verification={"retryable": True},
        completed=object(),
        phase="failed",
        progress=70,
    )
    assert _native_solution_retryable_error(transient_solution).startswith(
        "Transient solution model failure:"
    )
    assert _reset_native_solution_compatibility_run(transient_solution)
    assert transient_solution.status == "QUEUED"
    assert transient_solution.error is None
    assert transient_solution.completed is None

    legacy = SimpleNamespace(
        status="FAILED",
        stage="validate-1",
        progress=82,
        error="HTTP 500",
        completed=object(),
        draft_id="draft-1",
        kind="CREATE",
        steps=[
            {"id": "build", "status": "COMPLETED", "message": "done"},
            {"id": "validate-1", "status": "FAILED", "message": "HTTP 500"},
        ],
    )
    assert _reset_native_authoring_compatibility_job(legacy)
    assert legacy.status == "QUEUED"
    assert legacy.kind == "VALIDATE"
    assert legacy.error is None
    assert legacy.completed is None
    assert legacy.steps[0]["status"] == "COMPLETED"
    assert legacy.steps[1]["status"] == "PENDING"

    canceled_legacy = SimpleNamespace(
        status="FAILED",
        stage="validate-2",
        error="HTTP 500",
        completed=object(),
        draft_id=None,
        steps=[
            {"id": "build", "status": "COMPLETED", "message": "done"},
            {"id": "validate-2", "status": "FAILED", "message": "HTTP 500"},
        ],
    )

    class LegacyQuery:
        def filter_by(self, **values):
            assert values == {"id": "legacy-1"}
            return self

        def first(self):
            return canceled_legacy

    monkeypatch.setattr(
        jobs,
        "LearningAuthoringJobs",
        SimpleNamespace(query=LegacyQuery()),
    )
    _cancel_native_authoring_compatibility_job(
        SimpleNamespace(
            kind="learning.authoring",
            payload={"legacyJobId": "legacy-1"},
        )
    )

    assert canceled_legacy.status == "CANCELED"
    assert canceled_legacy.stage == "canceled"
    assert canceled_legacy.error is None
    assert canceled_legacy.steps[1]["status"] == "CANCELED"
    assert canceled_legacy.steps[1]["message"] == "任务已取消。"


def test_process_job_prioritizes_persisted_cancellation_over_runtime_error():
    root = pathlib.Path(__file__).resolve().parents[1]
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    learning = (root / "dojo_plugin/api/v1/learning.py").read_text()
    solution = (root / "dojo_plugin/learning/solution_agent.py").read_text()
    process_job = jobs.split("def process_job(job_id, *, worker_id=None):", 1)[1]
    exception_branch = process_job.split("    except Exception as exc:", 1)[1]

    assert exception_branch.index("if _job_cancellation_requested(job):") < (
        exception_branch.index("permanent = isinstance(exc")
    )
    assert '_finalize_canceled_job(job, "任务已取消；忽略取消期间产生的执行异常")' in (
        exception_branch
    )
    assert 'legacy.status = "CANCELED"' in jobs
    assert 'job.status = "CANCELED" if canceled else "FAILED"' in learning
    assert "max_attempts=2" in learning
    assert "class RetryableJobError" in jobs
    assert "_native_solution_retryable_error" in jobs
    assert "max_attempts=3" in solution
    assert '"retryable": retryable' in solution


def test_agent_runtime_startup_outage_retries_without_consuming_job_attempts():
    root = pathlib.Path(__file__).resolve().parents[1]
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    invoke = jobs.split("def _invoke_agent_runtime(job, route, payload=None):", 1)[1]

    assert "AGENT_RUNTIME_CONNECT_RETRY_DELAYS_SECONDS = (1, 2, 4, 8)" in jobs
    assert "def _agent_runtime_startup_connection_error(exc):" in jobs
    assert "requests.exceptions.ConnectionError" in invoke
    assert "_agent_runtime_startup_connection_error(exc)" in invoke
    assert "AGENT_RUNTIME_RETRYABLE_STATUS_CODES" in invoke
    assert invoke.count("time.sleep(retry_delay)") == 2


def test_teacher_agent_upload_is_conversation_scoped_until_teacher_decides():
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    styles = (root / "dojo_theme/static/css/teaching-agent.css").read_text()
    teaching = (root / "dojo_plugin/api/v1/teaching.py").read_text()
    jobs = (root / "dojo_plugin/agent_runtime/jobs.py").read_text()
    runtime = (
        root / "services/agent-runtime/lib/server/teacher-agent.ts"
    ).read_text()

    upload = re.search(
        r"async function uploadMaterial\(file\) \{(?P<body>.*?)\n  \}\n\n  function resizeComposer",
        script,
        re.S,
    )
    assert upload
    upload_body = upload.group("body")
    assert 'form.set("conversationUpload", "1")' in upload_body
    assert 'form.set("askIntent", askIntent ? "1" : "0")' in upload_body
    assert 'form.set("dojoId"' not in upload_body
    assert "elements.status" not in upload_body
    assert "syncAttachmentSources(state.thread)" in upload_body
    assert "async function sendUploadedInstruction(flow)" in script
    assert 'flow.phase === "send-error"' in script
    assert "return sendUploadedInstruction(flow)" in script
    assert "function validateUploadFile(file)" in script
    assert 'id="teaching-upload-status"' in (
        root / "dojo_theme/templates/teacher_agent.html"
    ).read_text()
    assert "renderUploadedAttachments(message)" in script
    assert ".teaching-uploaded-attachments" in styles
    assert "def _record_conversation_upload" in teaching
    assert 'status="AWAITING_INTENT" if ask_intent else "ACTIVE"' in teaching
    assert '"material.add_to_module": (' in jobs
    assert '{"materialId", "referenceId", "moduleIndex", "name"}' in jobs
    assert "Dojos.from_id(reference_id).first()" in jobs
    assert "platformFacts.pendingAttachments" in runtime
    assert "不得自行把上传等同于课件生成" in runtime
    assert "一次提出 material.add_to_module 完成落位和作用域切换" in runtime


def test_global_agent_question_constraints_preserve_only_explicit_modes():
    from CTFd.plugins.dojo_plugin.api.v1 import teaching

    explicit = {"exerciseMode": "SIMULATION", "category": "CRYPTO"}
    converted = teaching._practice_challenge_constraints(
        "创建一项密码算法仿真 CTF 实践题",
        explicit,
    )
    assert converted == {"exerciseMode": "SIMULATION", "category": "CRYPTO"}
    assert explicit["exerciseMode"] == "SIMULATION"

    inferred = teaching._practice_challenge_constraints(
        "Create a simulated incident-response CTF challenge",
        {},
    )
    assert inferred["exerciseMode"] == "CONTAINER"

    safety_policy = teaching._practice_challenge_constraints(
        (
            "生成 5 道独立容器 CTF；题目只能使用授权演练或教学模拟环境，"
            "不得指向公网真实系统。"
        ),
        {},
    )
    assert safety_policy["exerciseMode"] == "CONTAINER"

    container = teaching._practice_challenge_constraints(
        "生成一个经典栈溢出 CTF",
        {"exerciseMode": "CONTAINER"},
    )
    assert container["exerciseMode"] == "CONTAINER"


def test_generation_option_bundle_requires_three_complete_distinct_prompts(
    admin_session,
    random_user,
    simple_award_dojo,
):
    from types import SimpleNamespace

    from CTFd.plugins.dojo_plugin.agent_runtime.jobs import (
        validated_generation_options,
    )

    job = SimpleNamespace(
        id="job_generation_options",
        dojo_id=11,
        module_index=2,
        payload={
            "sourceRefs": [
                {
                    "type": "material",
                    "id": "material_a",
                    "revisionId": "revision_a_3",
                    "sha256": "a" * 64,
                }
            ]
        },
    )
    options = [
        {
            "title": title,
            "description": description,
            "highlights": ["完整教学路径", "明确质量检查"],
            "rewrittenPrompt": prompt,
        }
        for title, description, prompt in (
            (
                "概念递进",
                "从先修知识逐层解释核心原理，并通过图示与课堂检查建立完整、清晰且可执行的教学路径。",
                "请正式生成概念递进式页面课件，完整落实教师原始要求，覆盖学习目标、核心概念、图示、示例、课堂检查和总结，每一页都必须包含可直接授课的完整正文与教师提示，禁止目录、空白页或占位内容。",
            ),
            (
                "案例驱动",
                "用一个真实授权案例贯穿现象、证据、原理、修复和迁移练习，让学生理解知识如何实际应用。",
                "请正式生成案例驱动式页面课件，以授权安全案例串联现象、证据、原理、错误做法、修复步骤、迁移练习和课堂反馈，保留全部教师约束，输出完整可授课页面正文，不能只给摘要或结构标题。",
            ),
            (
                "任务挑战",
                "把知识组织为连续课堂任务，学生通过预测、讨论、操作判断和即时反馈主动完成学习过程。",
                "请正式生成任务挑战式页面课件，将教师要求转化为连续任务，逐页给出学生动作、教师提示、预计时间、即时反馈、知识讲解和完成标准，内容必须完整、可执行、可核验，不得出现模板占位符。",
            ),
        )
    ]
    raw = {
        "targetTool": "candidate.generate",
        "artifactType": "slide-deck",
        "reason": "教师要求新生成课件",
        "options": options,
    }
    validated = validated_generation_options(job, {"generationOptions": raw})
    assert validated is not None
    assert [item["id"] for item in validated["options"]] == [
        "option-1",
        "option-2",
        "option-3",
    ]
    assert validated["sourceRefs"] == [
        {
            "type": "material",
            "id": "material_a",
            "revisionId": "revision_a_3",
            "sha256": "a" * 64,
        }
    ]
    assert validated["boundScope"] == {"dojoId": 11, "moduleIndex": 2}
    for artifact_type in ("debate", "roleplay"):
        interactive = validated_generation_options(
            job,
            {
                "generationOptions": {
                    **raw,
                    "artifactType": artifact_type,
                    "reason": f"教师明确要求生成 {artifact_type}",
                }
            },
        )
        assert interactive is not None
        assert interactive["artifactType"] == artifact_type
    assert (
        validated_generation_options(
            job, {"generationOptions": {**raw, "options": options[:2]}}
        )
        is None
    )
    duplicate = [dict(item) for item in options]
    duplicate[2]["rewrittenPrompt"] = duplicate[0]["rewrittenPrompt"]
    assert (
        validated_generation_options(
            job, {"generationOptions": {**raw, "options": duplicate}}
        )
        is None
    )

    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    unscoped_job = SimpleNamespace(
        id="job_unscoped_generation_options",
        owner_id=get_user_id("admin"),
        dojo_id=None,
        module_index=None,
        payload={"sourceRefs": []},
    )
    trusted = validated_generation_options(
        unscoped_job,
        {
            "generationOptions": {
                **raw,
                "boundScope": {
                    "referenceId": dojo["referenceId"],
                    "moduleIndex": module_index,
                },
            }
        },
    )
    assert trusted is not None
    assert trusted["boundScope"] == {
        "dojoId": dojo["id"],
        "referenceId": dojo["referenceId"],
        "moduleIndex": module_index,
    }
    assert (
        validated_generation_options(
            unscoped_job,
            {"generationOptions": raw},
        )
        is None
    )
    assert (
        validated_generation_options(
            unscoped_job,
            {
                "generationOptions": {
                    **raw,
                    "boundScope": {
                        "referenceId": dojo["referenceId"],
                        "moduleIndex": 987654,
                    },
                }
            },
        )
        is None
    )
    student_name, _student_session = random_user
    unauthorized_job = SimpleNamespace(
        id="job_unauthorized_generation_options",
        owner_id=get_user_id(student_name),
        dojo_id=None,
        module_index=None,
        payload={"sourceRefs": []},
    )
    assert (
        validated_generation_options(
            unauthorized_job,
            {
                "generationOptions": {
                    **raw,
                    "boundScope": {
                        "referenceId": dojo["referenceId"],
                        "moduleIndex": module_index,
                    },
                }
            },
        )
        is None
    )


def test_material_dossier_preserves_every_complete_analysis_or_stops():
    from CTFd.plugins.dojo_plugin.agent_runtime.materials import (
        MaterialContextError,
        compact_material_grounding,
    )

    context = {
        "coverage": {
            "expectedMaterialCount": 2,
            "includedMaterialCount": 2,
            "complete": True,
            "materialIds": ["material_a", "material_b"],
        },
        "sourceMaterials": [
            {
                "id": "material_a",
                "title": "资料 A",
                "analysis": {
                    "summary": "完整摘要 A",
                    "sectionSummaries": [
                        {"segment": 1, "summary": "A 的开头"},
                        {"segment": 2, "summary": "A 的结尾"},
                    ],
                    "coverage": {"complete": True},
                },
                "coverage": {"complete": True},
                "excerpts": [{"ordinal": 0, "content": "A" * 10_000}],
            },
            {
                "id": "material_b",
                "title": "资料 B",
                "analysis": {
                    "summary": "完整摘要 B",
                    "sectionSummaries": [
                        {"segment": 1, "summary": "B 的开头"},
                        {"segment": 2, "summary": "B 的结尾"},
                    ],
                    "coverage": {"complete": True},
                },
                "coverage": {"complete": True},
                "excerpts": [{"ordinal": 0, "content": "B" * 10_000}],
            },
        ],
    }
    dossier = compact_material_grounding(context, max_characters=3_000)
    assert [item["id"] for item in dossier["materials"]] == [
        "material_a",
        "material_b",
    ]
    assert (
        dossier["materials"][0]["analysis"]["sectionSummaries"][-1]["summary"]
        == "A 的结尾"
    )
    assert (
        dossier["materials"][1]["analysis"]["sectionSummaries"][-1]["summary"]
        == "B 的结尾"
    )
    assert all(not item["excerpts"] for item in dossier["materials"])

    with pytest.raises(MaterialContextError):
        compact_material_grounding(context, max_characters=200)


DOJOS_API = f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/dojos"


def data(response):
    body = response.json()
    assert body["success"] is True, body
    return body.get("data") or {}


def dojo_context(session, reference_id, role):
    context = data(session.get(f"{API}/context"))
    collection = "teacherDojos" if role == "teacher" else "studentDojos"
    return next(
        item for item in context[collection] if item["referenceId"] == reference_id
    )


def enroll(session, reference_id):
    response = session.post(f"{DOJOS_API}/{reference_id}/enrollment", json={})
    assert response.status_code in {200, 201}, response.text


def copy_session(source):
    session = requests.Session()
    session.cookies.update(source.cookies)
    session.headers.update(source.headers)
    return session


def execute_course_tool(
    session, thread_id, tool, arguments=None, *, confirmed=True, key=None
):
    return session.post(
        f"{API}/agent-tools/execute",
        headers={"Idempotency-Key": key or f"test-{tool}-{secrets.token_hex(8)}"},
        json={
            "threadId": thread_id,
            "tool": tool,
            "arguments": arguments or {},
            "confirmed": confirmed,
        },
    )


def test_generation_batch_retry_is_idempotent_and_preserves_successful_drafts(
    admin_session,
    simple_award_dojo,
):
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    owner_id = get_user_id("admin")
    token = secrets.token_hex(8)
    thread_id = f"thread_batch_{token}"
    action_id = f"action_batch_{token}"
    batch_id = f"practice_batch_{token}"
    task_ids = [f"job_batch_{token}_{index}" for index in range(1, 6)]
    authoring_ids = [f"author_batch_{token}_{index}" for index in range(1, 6)]
    draft_ids = [f"draft_batch_{token}_{index}" for index in range(1, 5)]

    def pg_json(value):
        return json.dumps(value, ensure_ascii=False).replace("'", "''")

    draft_rows = []
    for index, draft_id in enumerate(draft_ids, start=1):
        spec = pg_json(
            {
                "name": f"批次成功题目 {index}",
                "description": "成功兄弟项必须在失败重试时保持原草稿标识。",
                "exerciseMode": "CONTAINER",
            }
        )
        draft_rows.append(
            "("
            f"'{draft_id}', {dojo['id']}, {module_index}, {owner_id}, "
            "'READY', 'L2', '批次重试验收', '{}'::jsonb, '[]'::jsonb, "
            f"'{spec}'::jsonb, '[]'::jsonb, "
            "'{\"status\": \"PASS\"}'::jsonb, 1, NOW(), NOW()"
            ")"
        )
    authoring_rows = []
    job_rows = []
    item_rows = []
    for index, (task_id, authoring_id) in enumerate(
        zip(task_ids, authoring_ids), start=1
    ):
        draft_id = draft_ids[index - 1] if index <= 4 else None
        status = "SUCCEEDED" if draft_id else "FAILED"
        stage = "complete" if draft_id else "failed"
        progress = 100 if draft_id else 72
        result = (
            {"draftId": draft_id, "title": f"批次成功题目 {index}", "validation": {"status": "PASS"}}
            if draft_id
            else {}
        )
        payload = {
            "legacyJobId": authoring_id,
            "batchId": batch_id,
            "batchIndex": index,
            "batchCount": 5,
            "title": f"批次题目 {index}",
        }
        draft_sql = f"'{draft_id}'" if draft_id else "NULL"
        completed_sql = "NOW()" if draft_id else "NULL"
        error_sql = "NULL" if draft_id else "'环境构建失败'"
        item_status = "NEEDS_REVIEW" if draft_id else "FAILED"
        validation_sql = (
            "'{\"status\": \"PASS\"}'::jsonb" if draft_id else "'{}'::jsonb"
        )
        authoring_rows.append(
            "("
            f"'{authoring_id}', {dojo['id']}, {module_index}, {owner_id}, "
            f"{draft_sql}, 'CREATE', '{status}', "
            f"'{stage}', {progress}, '批次幂等验收 {token} {index}', "
            "'{\"brief\": \"批次幂等验收\"}'::jsonb, "
            "'[{\"id\": \"build\", \"label\": \"构建\", \"status\": \"PENDING\"}]'::jsonb, "
            f"{completed_sql}, NOW(), NOW()"
            ")"
        )
        job_rows.append(
            "("
            f"'{task_id}', {owner_id}, {dojo['id']}, {module_index}, '{thread_id}', "
            f"'{action_id}', 'learning.authoring', '{status}', '{stage}', {progress}, 40, "
            f"'batch-job-{token}-{index}', '{secrets.token_hex(16)}', "
            f"'{pg_json(payload)}'::jsonb, '{pg_json(result)}'::jsonb, 1, 3, "
            f"{completed_sql}, {error_sql}, NOW(), NOW()"
            ")"
        )
        item_rows.append(
            "("
            f"'bitem_{token}_{index}', '{batch_id}', {index}, "
            f"'{item_status}', '{task_id}', '{authoring_id}', {draft_sql}, "
            f"'{{\"itemIndex\": {index}, \"title\": \"批次题目 {index}\"}}'::jsonb, "
            f"{validation_sql}, {error_sql}, NOW(), NOW(), NOW()"
            ")"
        )
    formal_ids = pg_json(task_ids)
    try:
        db_sql(
            "INSERT INTO teaching_agent_threads "
            "(id, user_id, dojo_id, module_index, title, status, pinned, phase, context, created, updated) "
            f"VALUES ('{thread_id}', {owner_id}, {dojo['id']}, {module_index}, "
            f"'批次幂等验收 {token}', 'ACTIVE', FALSE, 'COURSE_SETUP', '{{}}'::jsonb, NOW(), NOW()); "
            "INSERT INTO teaching_agent_actions "
            "(id, thread_id, actor_id, action_type, risk_level, target_type, target_id, status, "
            "idempotency_key, request, result, created, completed) "
            f"VALUES ('{action_id}', '{thread_id}', {owner_id}, 'challenge.generate', 'R2', "
            f"'module', '{module_index}', 'SUCCEEDED', 'batch-action-{token}', "
            f"'{{}}'::jsonb, '{{\"formalJobIds\": {formal_ids}}}'::jsonb, NOW(), NOW()); "
            "INSERT INTO learning_drafts "
            "(id, dojo_id, module_index, author_id, status, level, brief, constraints, conversation, "
            "spec, candidates, validation, revision, created, updated) VALUES "
            + ",".join(draft_rows)
            + "; INSERT INTO learning_authoring_jobs "
            "(id, dojo_id, module_index, author_id, draft_id, kind, status, stage, progress, title, "
            "request, steps, completed, created, updated) VALUES "
            + ",".join(authoring_rows)
            + "; INSERT INTO teaching_jobs "
            "(id, owner_id, dojo_id, module_index, thread_id, action_id, kind, status, stage, progress, "
            "priority, idempotency_key, trace_id, payload, result, attempt_count, max_attempts, "
            "completed, error, created, updated) VALUES "
            + ",".join(job_rows)
            + "; INSERT INTO teaching_generation_batches "
            "(id, owner_id, dojo_id, module_index, thread_id, action_id, operation, status, "
            "requested_count, independence, exercise_mode, publish_mode, difficulty_strategy, plan, "
            "counts, idempotency_key, confirmed, created, updated, completed) "
            f"VALUES ('{batch_id}', {owner_id}, {dojo['id']}, {module_index}, '{thread_id}', "
            f"'{action_id}', 'challenge.batch.generate', 'PARTIAL_SUCCESS', 5, "
            "'independent_challenges', 'CTF', 'draft', '{}'::jsonb, '{}'::jsonb, "
            f"'{{\"requested\": 5, \"created\": 4, \"validated\": 4, \"failed\": 1}}'::jsonb, "
            f"'batch-contract-{token}', NOW(), NOW(), NOW(), NOW()); "
            "INSERT INTO teaching_generation_batch_items "
            "(id, batch_id, item_index, status, task_id, authoring_job_id, draft_id, spec, validation, "
            "error, created, updated, completed) VALUES "
            + ",".join(item_rows)
            + ";"
        )
        before = data(admin_session.get(f"{API}/generation-batches/{batch_id}"))["batch"]
        assert before["status"] == "partial_success"
        assert before["requestedCount"] == 5
        assert before["createdCount"] == 4
        assert before["validatedCount"] == 4
        assert before["failedCount"] == 1
        original_drafts = [item["draftId"] for item in before["items"][:4]]

        retry_key = f"retry-{token}"
        first = admin_session.post(
            f"{API}/generation-batches/{batch_id}/retry-failed",
            json={"idempotencyKey": retry_key},
        )
        assert first.status_code == 202, first.text
        first_data = data(first)
        assert first_data["successfulItemsPreserved"] == 4
        assert len(first_data["retried"]) == 1
        assert first_data["retried"][0]["itemIndex"] == 5
        assert first_data["retried"][0]["requeued"] is True
        assert [item["draftId"] for item in first_data["batch"]["items"][:4]] == original_drafts
        assert first_data["batch"]["requestedCount"] == 5
        assert first_data["batch"]["failedCount"] == 0

        repeated = admin_session.post(
            f"{API}/generation-batches/{batch_id}/retry-failed",
            json={"idempotencyKey": retry_key},
        )
        assert repeated.status_code == 202, repeated.text
        repeated_data = data(repeated)
        assert repeated_data["retried"] == [
            {"itemIndex": 5, "taskId": task_ids[4], "requeued": False}
        ]
        assert [item["draftId"] for item in repeated_data["batch"]["items"][:4]] == original_drafts
        assert len({item["taskId"] for item in repeated_data["batch"]["items"]}) == 5
    finally:
        db_sql(
            f"DELETE FROM teaching_generation_batches WHERE id = '{batch_id}'; "
            f"DELETE FROM teaching_jobs WHERE action_id = '{action_id}'; "
            f"DELETE FROM learning_authoring_jobs WHERE title LIKE '批次幂等验收 {token}%'; "
            f"DELETE FROM learning_drafts WHERE id LIKE 'draft_batch_{token}_%'; "
            f"DELETE FROM teaching_agent_actions WHERE id = '{action_id}'; "
            f"DELETE FROM teaching_agent_threads WHERE id = '{thread_id}';"
        )


def test_course_content_collections_handle_real_0_1_6_100_fixtures(
    admin_session,
    simple_award_dojo,
):
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    owner_id = get_user_id("admin")
    marker = f"scale-{secrets.token_hex(6)}"
    artifact_ids = []
    draft_ids = []
    artifact_rows = []
    draft_rows = []

    def pg_json(value):
        return json.dumps(value, ensure_ascii=False).replace("'", "''")

    def fixture_title(index):
        labels = [marker]
        if index <= 6:
            labels.append(f"{marker}-six")
        if index == 1:
            labels.append(f"{marker}-one")
            labels.append("超长标题" * 20)
        return " ".join(labels)[:240]

    for kind, artifact_type in (("courseware", "slide-deck"), ("demos", "simulation")):
        for index in range(1, 101):
            artifact_id = f"artifact_{marker.replace('-', '')}_{kind[:2]}_{index:03d}"
            artifact_ids.append(artifact_id)
            title = fixture_title(index).replace("'", "''")
            artifact_rows.append(
                "("
                f"'{artifact_id}', {owner_id}, {dojo['id']}, {module_index}, {index}, "
                f"'{artifact_type}', '{title}', 'DRAFT', 1, NOW(), NOW()"
                ")"
            )
    for index in range(1, 101):
        draft_id = f"draft_{marker.replace('-', '')}_{index:03d}"
        draft_ids.append(draft_id)
        title = fixture_title(index)
        description = (
            "这是用于验证超长描述不会挤掉状态、分页与主要操作的真实内容。" * 40
            if index == 1
            else f"{marker} 第 {index} 道题的说明"
        )
        spec = pg_json(
            {
                "name": title,
                "description": description,
                "required": True,
                "exerciseMode": "CONTAINER",
            }
        )
        draft_rows.append(
            "("
            f"'{draft_id}', {dojo['id']}, {module_index}, {owner_id}, 'DRAFT', 'L2', "
            f"'{marker} 题目 {index}', '{{}}'::jsonb, '[]'::jsonb, '{spec}'::jsonb, "
            "'[]'::jsonb, '{}'::jsonb, 1, NOW(), NOW()"
            ")"
        )

    def collection(kind, query, *, page_size=100, page=1):
        response = admin_session.get(
            f"{API}/courses/{urllib.parse.quote(dojo['referenceId'], safe='')}/content",
            params={
                "kind": kind,
                "q": query,
                "pageSize": page_size,
                "page": page,
                "sort": "title_asc",
            },
        )
        assert response.status_code == 200, response.text
        return data(response)

    try:
        db_sql(
            "INSERT INTO teaching_artifacts "
            "(id, owner_id, dojo_id, module_index, sort_order, artifact_type, title, status, "
            "current_revision, created, updated) VALUES "
            + ",".join(artifact_rows)
            + "; INSERT INTO learning_drafts "
            "(id, dojo_id, module_index, author_id, status, level, brief, constraints, conversation, "
            "spec, candidates, validation, revision, created, updated) VALUES "
            + ",".join(draft_rows)
            + ";"
        )
        for kind in ("courseware", "demos", "questions"):
            for suffix, expected in (("-none", 0), ("-one", 1), ("-six", 6), ("", 100)):
                payload = collection(kind, f"{marker}{suffix}")
                assert payload["pagination"]["total"] == expected
                assert len(payload["items"]) == expected
                assert payload["evidence"]["evidenceCount"] == expected
                assert payload["scope"]["courseId"] == dojo["referenceId"]
                assert payload["asOf"]
            first_page = collection(kind, marker, page_size=6)
            last_page = collection(kind, marker, page_size=6, page=17)
            assert len(first_page["items"]) == 6
            assert first_page["pagination"]["hasNext"] is True
            assert len(last_page["items"]) == 4
            assert last_page["pagination"]["hasNext"] is False
            long_item = next(
                item for item in collection(kind, f"{marker}-one")["items"]
                if marker in item["title"]
            )
            assert len(long_item["title"]) >= 100
            if kind == "questions":
                assert len(long_item["summary"]) >= 900
    finally:
        db_sql(
            "DELETE FROM teaching_artifacts WHERE id IN ("
            + ",".join(f"'{item}'" for item in artifact_ids)
            + "); DELETE FROM learning_drafts WHERE id IN ("
            + ",".join(f"'{item}'" for item in draft_ids)
            + ");"
        )


def test_unpublished_courseware_supports_single_and_atomic_batch_deletion(
    admin_session,
    simple_award_dojo,
):
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    owner_id = get_user_id("admin")
    marker = f"delete-{secrets.token_hex(5)}"
    single_id = f"artifact_{marker}_single"
    batch_ids = [f"artifact_{marker}_batch_{index}" for index in (1, 2)]
    published_id = f"artifact_{marker}_published"
    artifact_ids = [single_id, *batch_ids, published_id]
    rows = []
    for sort_order, artifact_id in enumerate(artifact_ids, 1):
        status = "PUBLISHED" if artifact_id == published_id else "DRAFT"
        rows.append(
            "("
            f"'{artifact_id}', {owner_id}, {dojo['id']}, {module_index}, {sort_order}, "
            f"'slide-deck', '{marker} {sort_order}', '{status}', 1, NOW(), NOW()"
            ")"
        )

    endpoint = (
        f"{API}/courses/"
        f"{urllib.parse.quote(dojo['referenceId'], safe='')}/content"
    )

    def listed(status=""):
        response = admin_session.get(
            endpoint,
            params={
                "kind": "courseware",
                "q": marker,
                "status": status,
                "pageSize": 100,
            },
        )
        assert response.status_code == 200, response.text
        return data(response)

    try:
        db_sql(
            "INSERT INTO teaching_artifacts "
            "(id, owner_id, dojo_id, module_index, sort_order, artifact_type, title, status, "
            "current_revision, created, updated) VALUES "
            + ",".join(rows)
            + ";"
        )
        unpublished = listed("UNPUBLISHED")
        assert unpublished["pagination"]["total"] == 3
        assert all(item["canEdit"] is True for item in unpublished["items"])
        assert published_id not in {item["id"] for item in unpublished["items"]}

        single = admin_session.delete(f"{API}/artifacts/{single_id}", json={})
        assert single.status_code == 200, single.text
        assert data(single)["artifactId"] == single_id
        assert {item["id"] for item in listed("UNPUBLISHED")["items"]} == set(batch_ids)

        rejected = admin_session.post(
            f"{API}/artifacts/bulk-delete",
            json={"dojoId": dojo["id"], "artifactIds": [batch_ids[0], published_id]},
        )
        assert rejected.status_code == 409, rejected.text
        rejected_body = rejected.json()
        assert rejected_body["success"] is False
        assert "已发布课件" in rejected_body["errors"][0]
        assert {item["id"] for item in listed("UNPUBLISHED")["items"]} == set(batch_ids)

        deleted = admin_session.post(
            f"{API}/artifacts/bulk-delete",
            json={"dojoId": dojo["id"], "artifactIds": batch_ids},
        )
        assert deleted.status_code == 200, deleted.text
        deleted_data = data(deleted)
        assert deleted_data["deletedCount"] == 2
        assert set(deleted_data["artifactIds"]) == set(batch_ids)
        assert listed("UNPUBLISHED")["pagination"]["total"] == 0
        remaining = listed()
        assert remaining["pagination"]["total"] == 1
        assert remaining["items"][0]["id"] == published_id
    finally:
        db_sql(
            "DELETE FROM learning_audit_events WHERE "
            f"resource_id = '{single_id}' OR details::text LIKE '%{marker}%'; "
            "DELETE FROM teaching_artifacts WHERE id IN ("
            + ",".join(f"'{item}'" for item in artifact_ids)
            + ");"
        )


def test_conversation_upload_asks_then_places_original_file_in_module(
    admin_session,
    random_user,
    simple_award_dojo,
):
    _student_name, student_session = random_user
    enroll(student_session, simple_award_dojo)
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module = dojo["modules"][0]
    created = admin_session.post(
        f"{API}/threads",
        json={"title": "对话附件章节资料验收"},
    )
    assert created.status_code == 201, created.text
    thread_id = data(created)["thread"]["id"]
    filename = f"conversation-upload-{secrets.token_hex(5)}.txt"
    content = (
        "缓冲区溢出课程补充资料\n"
        "目标：理解栈帧、返回地址控制与防护机制。\n"
        f"测试批次：{filename}\n"
    ).encode()

    try:
        uploaded = admin_session.post(
            f"{API}/materials",
            data={
                "threadId": thread_id,
                "conversationUpload": "1",
                # CTFd validates multipart CSRF through the form field rather
                # than the JSON request header used by this test session.
                "nonce": admin_session.headers["CSRF-Token"],
            },
            files={"file": (filename, content, "text/plain")},
        )
        assert uploaded.status_code == 202, uploaded.text
        uploaded_data = data(uploaded)
        material_id = uploaded_data["materialId"]
        analysis_job_id = uploaded_data["job"]["id"]
        thread = uploaded_data["thread"]
        assert thread["dojoId"] is None
        assert thread["moduleIndex"] is None
        pending = thread["context"]["pendingAttachments"]
        assert pending[-1]["id"] == material_id
        assert pending[-1]["status"] == "AWAITING_INTENT"
        assert pending[-1]["analysisJobId"] == analysis_job_id
        assert uploaded_data["questionAsked"] is True

        upload_message = thread["messages"][-2]
        question = thread["messages"][-1]
        assert upload_message["role"] == "user"
        assert upload_message["metadata"]["uploadOnly"] is True
        assert upload_message["metadata"]["attachments"][0]["id"] == material_id
        assert question["role"] == "assistant"
        assert "添加到某门课程的某个章节资料" in question["content"]
        assert "创建课件" in question["content"]
        assert "CTF 实践题" in question["content"]
        assert "模拟演示" in question["content"]
        assert all(
            item.startswith("帮我")
            for item in question["metadata"]["suggestions"]
        )

        owner_download = admin_session.get(
            f"{API}/materials/{material_id}/download"
        )
        assert owner_download.status_code == 200, owner_download.text
        assert owner_download.content == content
        owner_preview = admin_session.get(
            f"{API}/materials/{material_id}/preview"
        )
        assert owner_preview.status_code == 200, owner_preview.text
        assert owner_preview.content == content
        assert owner_preview.headers["Content-Disposition"].startswith("inline")
        assert owner_preview.headers["Cache-Control"] == "private, no-store"
        assert owner_preview.headers["X-Content-Type-Options"] == "nosniff"
        assert (
            student_session.get(f"{API}/materials/{material_id}/download").status_code
            == 404
        )
        assert (
            student_session.get(f"{API}/materials/{material_id}/preview").status_code
            == 404
        )

        followed_up = admin_session.post(
            f"{API}/threads/{thread_id}/messages",
            json={
                "content": (
                    f"把这份文件添加到课程“{dojo['name']}”的章节"
                    f"“{module['name']}”资料中。"
                ),
                "artifactType": "auto",
            },
        )
        assert followed_up.status_code == 202, followed_up.text
        follow_data = data(followed_up)
        follow_job_id = follow_data["job"]["id"]
        user_reply = next(
            item
            for item in reversed(follow_data["thread"]["messages"])
            if item["role"] == "user"
        )
        assert user_reply["metadata"]["attachments"][0]["id"] == material_id
        payload = json.loads(
            db_sql(
                "SELECT payload::text FROM teaching_jobs "
                f"WHERE id = '{follow_job_id}';"
            ).strip()
        )
        assert payload["sourceRefs"] == [{"type": "material", "id": material_id}]
        if follow_data["job"]["status"] in {"QUEUED", "RUNNING", "CANCEL_REQUESTED"}:
            canceled = admin_session.delete(f"{API}/jobs/{follow_job_id}", json={})
            assert canceled.status_code == 200, canceled.text

        key = f"place-upload-{secrets.token_hex(8)}"
        placement_payload = {
            "threadId": thread_id,
            "tool": "material.add_to_module",
            "arguments": {
                "materialId": material_id,
                "referenceId": dojo["referenceId"],
                "moduleIndex": module["index"],
                "name": "缓冲区溢出补充资料",
            },
            "confirmed": False,
        }
        placed = admin_session.post(
            f"{API}/agent-tools/execute",
            headers={"Idempotency-Key": key},
            json=placement_payload,
        )
        repeated = admin_session.post(
            f"{API}/agent-tools/execute",
            headers={"Idempotency-Key": key},
            json=placement_payload,
        )
        assert placed.status_code == 200, placed.text
        assert repeated.status_code == 200, repeated.text
        placement = data(placed)
        assert placement["action"]["riskLevel"] == "R2"
        assert placement["result"]["material"]["dojoId"] == dojo["id"]
        assert placement["result"]["module"]["index"] == module["index"]
        assert placement["result"]["resource"]["name"] == "缓冲区溢出补充资料"
        assert placement["thread"]["dojoId"] == dojo["id"]
        assert placement["thread"]["moduleIndex"] == module["index"]
        assert data(repeated)["deduplicated"] is True
        placed_pending = placement["thread"]["context"]["pendingAttachments"]
        placed_attachment = next(
            item for item in placed_pending if item["id"] == material_id
        )
        assert placed_attachment["status"] == "PLACED"
        assert placed_attachment["placement"]["moduleIndex"] == module["index"]
        resource_count = int(
            db_sql(
                "SELECT COUNT(*) FROM dojo_resources "
                f"WHERE dojo_id = {dojo['id']} "
                f"AND module_index = {module['index']} "
                f"AND data->>'materialId' = '{material_id}';"
            ).strip()
        )
        assert resource_count == 1
        student_download = student_session.get(
            f"{API}/materials/{material_id}/download"
        )
        assert student_download.status_code == 200, student_download.text
        assert student_download.content == content
        student_preview = student_session.get(
            f"{API}/materials/{material_id}/preview"
        )
        assert student_preview.status_code == 200, student_preview.text
        assert student_preview.content == content
        db_sql(
            "INSERT INTO dojo_resource_visibilities "
            "(dojo_id, module_index, resource_index, stop) VALUES ("
            f"{dojo['id']}, {module['index']}, "
            f"{placement['result']['resource']['index']}, NOW() - INTERVAL '1 hour');"
        )
        hidden_download = student_session.get(
            f"{API}/materials/{material_id}/download"
        )
        assert hidden_download.status_code == 404, hidden_download.text
        hidden_preview = student_session.get(
            f"{API}/materials/{material_id}/preview"
        )
        assert hidden_preview.status_code == 404, hidden_preview.text
        owner_hidden_download = admin_session.get(
            f"{API}/materials/{material_id}/download"
        )
        assert owner_hidden_download.status_code == 200, owner_hidden_download.text
        owner_hidden_preview = admin_session.get(
            f"{API}/materials/{material_id}/preview"
        )
        assert owner_hidden_preview.status_code == 200, owner_hidden_preview.text
        db_sql(
            "DELETE FROM dojo_resource_visibilities WHERE "
            f"dojo_id = {dojo['id']} AND module_index = {module['index']} AND "
            f"resource_index = {placement['result']['resource']['index']};"
        )
    finally:
        cleanup = admin_session.delete(
            f"{API}/threads/{thread_id}", json={"confirmed": True}
        )
        assert cleanup.status_code == 200, cleanup.text


def test_manual_course_chapter_and_practice_creation(admin_session):
    answer = f"manual-answer-{secrets.token_hex(6)}"
    new_course_page = admin_session.get(f"{DOJO_URL.rstrip('/')}/teacher/courses/new")
    assert new_course_page.status_code == 200, new_course_page.text
    assert 'id="manual-create-form"' in new_course_page.text
    assert 'id="manual-agent-shortcut"' in new_course_page.text
    assert "课程标识" not in new_course_page.text
    assert "章节标识" not in new_course_page.text
    assert 'id="manual-id"' not in new_course_page.text
    assert 'id="manual-initial-id"' not in new_course_page.text

    created = admin_session.post(
        f"{API}/courses",
        json={
            "name": "手动创建流程验收课程",
            "description": "验证教师无需智能体也能建立课程、章节与实践题。",
            "access": "private",
            "initialModuleName": "课程导论",
            "initialModuleDescription": "介绍课程结构和学习方式。",
        },
    )
    assert created.status_code == 201, created.text
    created_data = data(created)
    course = created_data["course"]
    assert re.fullmatch(r"course-[a-f0-9]{8}", course["slug"])
    assert created_data["module"]["id"] == "chapter-1"
    reference = course["referenceId"]

    try:
        chapter_page = admin_session.get(
            f"{DOJO_URL.rstrip('/')}/teacher/courses/{reference}/chapters/new"
        )
        assert chapter_page.status_code == 200, chapter_page.text
        assert 'data-create-kind="chapter"' in chapter_page.text
        assert 'id="manual-agent-shortcut"' in chapter_page.text
        assert "章节标识" not in chapter_page.text
        assert 'id="manual-id"' not in chapter_page.text

        chapter = admin_session.post(
            f"{LEARNING_API}/dojos/{reference}/units",
            json={
                "name": "栈溢出基础",
                "description": "理解栈帧、返回地址与边界检查。",
            },
        )
        assert chapter.status_code == 201, chapter.text
        module_id = chapter.json()["unit"]["id"]
        assert module_id == "chapter-2"

        practice_page = admin_session.get(
            f"{DOJO_URL.rstrip('/')}/teacher/courses/{reference}/practices/new",
            params={"module": module_id},
        )
        assert practice_page.status_code == 200, practice_page.text
        assert 'data-create-kind="practice"' in practice_page.text
        assert f'<option value="{module_id}"' in practice_page.text
        assert 'id="manual-agent-shortcut"' in practice_page.text
        assert "题目标识" not in practice_page.text
        assert 'id="manual-id"' not in practice_page.text

        practice = admin_session.post(
            f"{LEARNING_API}/dojos/{reference}/manual-drafts",
            json={
                "moduleId": module_id,
                "title": "经典栈溢出入门",
                "description": (
                    "阅读给定程序并定位不安全的输入操作，计算覆盖返回地址所需的偏移，"
                    "在隔离终端中完成分析，并按题目说明提交唯一答案。"
                ),
                "category": "PWN",
                "difficulty": 2,
                "required": True,
                "objectives": ["理解栈帧结构", "能够定位返回地址偏移"],
                "tags": ["栈溢出", "入门"],
                "expectedAnswer": answer,
                "teacherSolution": "检查栈帧并计算偏移，再提交确定性答案。",
                "runtimeMode": "terminal",
                "image": "pwncollege/challenge-legacy:latest",
                "runValidation": False,
            },
        )
        assert practice.status_code == 201, practice.text
        practice_body = practice.json()
        assert practice_body["success"] is True
        assert practice_body["job"] is None
        draft = practice_body["draft"]
        assert draft["moduleId"] == module_id
        generated_challenge_id = draft["spec"]["id"]
        assert re.fullmatch(r"[a-z0-9-]{1,32}", generated_challenge_id)
        assert draft["spec"]["authoringProvider"] == "MANUAL"
        assert draft["spec"]["authoringStrategy"]["mode"] == "MANUAL"
        assert answer not in draft["spec"]["description"]
        assert "solution.json" not in draft["spec"]["description"]
        assert "JSON" not in draft["spec"]["description"]
        assert "/challenge/check <答案>" in draft["spec"]["description"]
        assert draft["spec"]["oracleContract"] == {}
        assert draft["spec"]["verificationAnswer"] == answer
        assert (
            draft["spec"]["privateSolution"]["protectedFacts"]["expectedAnswer"]
            == answer
        )

        duplicate = admin_session.post(
            f"{LEARNING_API}/dojos/{reference}/manual-drafts",
            json={
                "moduleId": module_id,
                "id": generated_challenge_id,
                "title": "重复题目",
                "description": (
                    "这是一个用于验证内部标识冲突会被系统明确拒绝的完整题目说明文本，"
                    "其中包含足够清晰的任务背景、操作要求、提交方式和成功条件。"
                ),
                "category": "PWN",
                "difficulty": 2,
                "objectives": ["验证重复标识"],
                "expectedAnswer": "different-answer",
                "runtimeMode": "terminal",
                "runValidation": False,
            },
        )
        assert duplicate.status_code == 400, duplicate.text
        assert "已存在" in duplicate.json()["error"]
    finally:
        deleted = admin_session.delete(f"{API}/courses/{reference}", json={})
        assert deleted.status_code == 200, deleted.text


def wait_for_teaching_job(session, job_id, *, timeout=45):
    deadline = time.monotonic() + timeout
    job = None
    while time.monotonic() < deadline:
        response = session.get(f"{API}/jobs/{job_id}")
        assert response.status_code == 200, response.text
        job = data(response)["job"]
        if job["status"] in {"SUCCEEDED", "FAILED", "CANCELED"}:
            return job
        time.sleep(0.25)
    pytest.fail(f"Teaching job {job_id} did not finish in {timeout}s: {job}")


def agent_runtime_exchange_url(launch_url):
    parsed = urllib.parse.urlsplit(launch_url)
    return urllib.parse.urlunsplit(
        urllib.parse.urlsplit(DOJO_URL)._replace(
            path=parsed.path,
            query=parsed.query,
            fragment="",
        )
    )


def test_global_agent_conversation_management(admin_session):
    first = admin_session.post(f"{API}/threads", json={})
    assert first.status_code == 201, first.text
    first_id = data(first)["thread"]["id"]

    titled = admin_session.post(
        f"{API}/threads/{first_id}/messages",
        json={"content": "梳理密码学课程本周的备课事项"},
    )
    assert titled.status_code == 202, titled.text
    titled_data = data(titled)
    assert titled_data["thread"]["title"] == "梳理密码学课程本周的备课事项"

    second = admin_session.post(
        f"{API}/threads", json={"title": "不会被搜索命中的会话"}
    )
    assert second.status_code == 201, second.text
    second_id = data(second)["thread"]["id"]

    pinned = admin_session.patch(f"{API}/threads/{first_id}", json={"pinned": True})
    assert pinned.status_code == 200, pinned.text
    assert data(pinned)["thread"]["pinned"] is True

    active = data(admin_session.get(f"{API}/threads?view=active"))["threads"]
    assert next(item for item in active if item["id"] == first_id)["pinned"] is True
    assert active[0]["id"] == first_id
    assert next(item for item in active if item["id"] == first_id)["messageCount"] >= 2

    searched = data(
        admin_session.get(
            f"{API}/threads",
            params={"view": "active", "q": "密码学课程"},
        )
    )["threads"]
    assert [item["id"] for item in searched] == [first_id]

    archived = admin_session.patch(f"{API}/threads/{first_id}", json={"archived": True})
    assert archived.status_code == 200, archived.text
    archived_thread = data(archived)["thread"]
    assert archived_thread["status"] == "ARCHIVED"
    assert archived_thread["pinned"] is False
    assert archived_thread["archivedAt"]
    assert first_id not in {
        item["id"]
        for item in data(admin_session.get(f"{API}/threads?view=active"))["threads"]
    }
    assert first_id in {
        item["id"]
        for item in data(admin_session.get(f"{API}/threads?view=archived"))["threads"]
    }

    readonly = admin_session.post(
        f"{API}/threads/{first_id}/messages", json={"content": "继续"}
    )
    assert readonly.status_code == 409, readonly.text
    assert readonly.json()["errorCode"] == "THREAD_ARCHIVED"

    restored = admin_session.patch(
        f"{API}/threads/{first_id}",
        json={"archived": False, "title": "密码学备课清单"},
    )
    assert restored.status_code == 200, restored.text
    restored_thread = data(restored)["thread"]
    assert restored_thread["status"] == "ACTIVE"
    assert restored_thread["title"] == "密码学备课清单"

    denied = admin_session.delete(
        f"{API}/threads/{second_id}", json={"confirmed": False}
    )
    assert denied.status_code == 409, denied.text
    assert denied.json()["errorCode"] == "CONFIRMATION_REQUIRED"
    deleted = admin_session.delete(
        f"{API}/threads/{second_id}", json={"confirmed": True}
    )
    assert deleted.status_code == 200, deleted.text
    assert data(deleted)["deletedThreadId"] == second_id
    assert admin_session.get(f"{API}/threads/{second_id}").status_code == 404

    # Deleting the first conversation also proves its in-flight task is safely
    # detached/canceled before the message and card cascade runs.
    cleanup = admin_session.delete(
        f"{API}/threads/{first_id}", json={"confirmed": True}
    )
    assert cleanup.status_code == 200, cleanup.text


def test_generation_options_require_selection_and_use_the_trusted_prompt(
    admin_session,
    random_user,
    simple_award_dojo,
):
    _student_name, student_session = random_user
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    created = admin_session.post(
        f"{API}/threads",
        json={
            "dojoId": dojo["id"],
            "moduleIndex": module_index,
            "title": "三套生成方案闭环验收",
        },
    )
    assert created.status_code == 201, created.text
    thread_id = data(created)["thread"]["id"]
    job_id = f"job_{secrets.token_hex(16)}"

    option_rows = [
        (
            "概念递进",
            "从先修知识逐步进入核心原理，并用图示、示例和理解检查形成稳定完整的课堂教学路径。",
            "请正式生成概念递进式 SQL 注入防御页面课件，完整覆盖学习目标、输入边界、参数化查询、错误案例、修复示例、课堂检查和总结，每页必须有可直接授课的正文、教师提示与可核验的完成标准，禁止只返回目录或任何占位内容。",
        ),
        (
            "案例驱动",
            "以一个授权的 Web 安全案例贯穿现象、证据、漏洞成因、修复过程和迁移复盘，强调真实应用。",
            "请正式生成案例驱动式 SQL 注入防御页面课件，以一个授权 Web 案例贯穿请求证据、脆弱代码、攻击影响、参数化修复、回归验证和迁移练习，保留教师全部要求，输出每一页的完整可见正文、讲授提示和课堂反馈，不得使用占位符。",
        ),
        (
            "任务挑战",
            "把知识编排成连续课堂任务，让学生通过预测、讨论、代码判断与即时反馈主动完成学习。",
            "请正式生成任务挑战式 SQL 注入防御页面课件，把学习内容组织为连续的预测、讨论、代码判断、修复和验证任务，逐页给出学生动作、教师提示、时间建议、反馈标准及完整知识说明，所有内容必须可直接授课、可核验且没有空白页。",
        ),
    ]
    options = [
        {
            "id": f"ignored-{index}",
            "title": title,
            "description": description,
            "highlights": ["完整教学路径", "明确课堂活动与质量检查"],
            "rewrittenPrompt": prompt,
        }
        for index, (title, description, prompt) in enumerate(option_rows, 1)
    ]
    bundle = {
        "targetTool": "candidate.generate",
        "artifactType": "slide-deck",
        "reason": "教师要求生成新的页面式课件",
        "baseArguments": {},
        "options": options,
    }

    def pg_json(value):
        return json.dumps(value, ensure_ascii=False).replace("'", "''")

    owner_id = get_user_id("admin")
    payload = {
        "prompt": "生成 SQL 注入防御课件",
        "constraints": {"durationMinutes": 30},
        "sourceRefs": [],
    }
    db_sql(
        "INSERT INTO teaching_jobs "
        "(id, owner_id, dojo_id, module_index, thread_id, kind, status, stage, "
        "progress, priority, idempotency_key, trace_id, payload, result, "
        "attempt_count, max_attempts, created, updated, completed) "
        f"VALUES ('{job_id}', {owner_id}, {dojo['id']}, {module_index}, "
        f"'{thread_id}', 'agent.chat', 'SUCCEEDED', 'complete', 100, 80, "
        f"'generation-options-{job_id}', '{secrets.token_hex(16)}', "
        f"'{pg_json(payload)}'::jsonb, '{{}}'::jsonb, 1, 3, NOW(), NOW(), NOW());"
    )
    metadata = {
        "pending": False,
        "presentation": "answer",
        "jobId": job_id,
        "jobKind": "agent.chat",
        "jobStatus": "SUCCEEDED",
        "generationOptions": bundle,
        "toolProposals": [],
    }
    message_id = int(
        db_sql(
            "INSERT INTO teaching_agent_messages "
            "(thread_id, user_id, role, content, metadata, created) "
            f"VALUES ('{thread_id}', {owner_id}, 'assistant', "
            "'已准备三套生成方案，请选择后正式生成。', "
            f"'{pg_json(metadata)}'::jsonb, NOW()) RETURNING id;"
        )
    )

    formal_job_id = None
    try:
        direct = admin_session.post(
            f"{API}/threads/{thread_id}/messages",
            json={
                "content": "绕过选择直接生成",
                "agentContinuation": True,
                "action": "generate",
                "artifactType": "slide-deck",
                "candidateCount": 4,
            },
        )
        assert direct.status_code == 400, direct.text
        assert "三套候选方案" in direct.json()["errors"][0]

        selection_url = (
            f"{API}/threads/{thread_id}/messages/{message_id}/"
            "generation-options/option-2/select"
        )
        assert student_session.post(selection_url, json={}).status_code == 404
        selected = admin_session.post(selection_url, json={})
        assert selected.status_code == 200, selected.text
        selected_data = data(selected)
        assert selected_data["deduplicated"] is False
        assert selected_data["proposal"]["tool"] == "candidate.generate"
        assert selected_data["proposal"]["arguments"] == {
            "prompt": option_rows[1][2],
            "artifactType": "slide-deck",
            "candidateCount": 1,
            "sourceRefs": [],
        }
        assert selected_data["selection"]["optionId"] == "option-2"

        repeated = admin_session.post(selection_url, json={})
        assert repeated.status_code == 200, repeated.text
        assert data(repeated)["deduplicated"] is True
        changed = admin_session.post(
            selection_url.replace("option-2", "option-1"), json={}
        )
        assert changed.status_code == 409, changed.text
        assert changed.json()["errorCode"] == "GENERATION_OPTION_ALREADY_SELECTED"

        formal = admin_session.post(
            f"{API}/threads/{thread_id}/messages",
            json={
                "content": "恶意替换的提示词",
                "agentContinuation": True,
                "action": "generate",
                "artifactType": "simulation",
                "candidateCount": 4,
                "generationSelection": {
                    "sourceMessageId": message_id,
                    "optionId": "option-2",
                },
            },
        )
        assert formal.status_code == 202, formal.text
        formal_data = data(formal)
        formal_job_id = formal_data["job"]["id"]
        assert formal_data["job"]["kind"] == "candidate.generate"
        candidate_set = data(
            admin_session.get(f"{API}/candidate-sets/{formal_data['candidateSetId']}")
        )["candidateSet"]
        assert candidate_set["kind"] == "slide-deck"
        assert candidate_set["request"]["prompt"] == option_rows[1][2]
        assert candidate_set["request"]["candidateCount"] == 1
        assert candidate_set["request"]["generationMode"] == "single"
        assert (
            candidate_set["request"]["generationReason"]
            == "teacher_selected_prompt_option"
        )
        assert candidate_set["request"]["generationSelection"] == {
            "sourceMessageId": message_id,
            "sourceJobId": job_id,
            "optionId": "option-2",
            "optionTitle": "案例驱动",
        }

        refreshed = data(admin_session.get(f"{API}/threads/{thread_id}"))["thread"]
        source_message = next(
            item for item in refreshed["messages"] if item["id"] == message_id
        )
        assert source_message["metadata"]["generationSelection"]["status"] == "STARTED"
        selection_messages = [
            item
            for item in refreshed["messages"]
            if item["metadata"].get("client") == "generation-option-selection"
        ]
        assert len(selection_messages) == 1
        assert option_rows[1][2] in selection_messages[0]["content"]
    finally:
        if formal_job_id:
            admin_session.delete(f"{API}/jobs/{formal_job_id}", json={})
        cleanup = admin_session.delete(
            f"{API}/threads/{thread_id}", json={"confirmed": True}
        )
        assert cleanup.status_code == 200, cleanup.text


def test_ctf_generation_option_selection_starts_five_independent_flag_jobs(
    admin_session,
    simple_award_dojo,
):
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    thread = data(
        admin_session.post(
            f"{API}/threads",
            json={
                "dojoId": dojo["id"],
                "moduleIndex": module_index,
                "title": "CTF 三方案闭环验收",
            },
        )
    )["thread"]
    thread_id = thread["id"]
    job_id = f"job_{secrets.token_hex(16)}"
    owner_id = get_user_id("admin")
    batch_topics = ["输入验证", "会话权限", "日志取证", "配置错误", "安全编码"]
    selected_brief = (
        "请正式一次生成五道事件调查型 CTF，分别围绕输入验证、会话权限、日志取证、配置错误和安全编码。"
        "每道题运行在授权隔离环境，学生需要分析对应主题的服务与证据，"
        "完成可重复利用并从真实题目服务取得动态 Flag，再向平台提交 Flag 验证；"
        "必须提供唯一可核验路径、失败反馈、难度坡度和私有解题验证，绝不能要求提交 JSON、结论或布尔值。"
    )
    prompts = [
        (
            "渐进利用链",
            "按照信息收集、缺陷定位、利用验证和 Flag 获取四阶段推进，提供明确且不过度泄露的学习坡度。",
            "请正式生成渐进式弱随机数攻击 CTF，完整设计授权隔离环境、服务入口、漏洞成因、分阶段线索、可重复利用路径和动态 Flag 验证，学生必须从运行环境取得并提交 Flag，禁止使用 JSON 或文字结论代替完成凭证。",
        ),
        (
            "事件调查",
            "把弱随机数缺陷包装为完整安全事件，通过日志与程序行为证据推动唯一解题路径并完成验证。",
            selected_brief,
        ),
        (
            "攻防修复",
            "先复现随机数缺陷造成的攻击影响，再实施加固并验证差异，同时保留最终动态 Flag 判题。",
            "请正式生成攻防修复型弱随机数攻击 CTF，包含漏洞态复现、攻击利用、随机源加固、回归验证及动态 Flag 获取，所有操作在授权隔离环境完成，学生最终只通过平台提交 Flag，不能提交 JSON、明文或布尔值。",
        ),
    ]
    options = [
        {
            "title": title,
            "description": description,
            "highlights": ["授权隔离环境", "动态 Flag 唯一判题"],
            "rewrittenPrompt": prompt,
        }
        for title, description, prompt in prompts
    ]
    bundle = {
        "targetTool": "challenge.generate",
        "artifactType": "ctf-challenge",
        "reason": "教师要求生成一道原生 CTF 实践题",
        "baseArguments": {
            "moduleIndex": module_index,
            "challengeCount": 5,
            "difficulty": "中等",
            "constraints": {
                "category": "WEB",
                "exerciseMode": "CONTAINER",
                "batchTopics": batch_topics,
            },
        },
        "options": options,
    }

    def pg_json(value):
        return json.dumps(value, ensure_ascii=False).replace("'", "''")

    db_sql(
        "INSERT INTO teaching_jobs "
        "(id, owner_id, dojo_id, module_index, thread_id, kind, status, stage, "
        "progress, priority, idempotency_key, trace_id, payload, result, "
        "attempt_count, max_attempts, created, updated, completed) "
        f"VALUES ('{job_id}', {owner_id}, {dojo['id']}, {module_index}, "
        f"'{thread_id}', 'agent.chat', 'SUCCEEDED', 'complete', 100, 80, "
        f"'ctf-options-{job_id}', '{secrets.token_hex(16)}', "
        '\'{"prompt": "生成弱随机数攻击 CTF", "sourceRefs": []}\'::jsonb, '
        "'{}'::jsonb, 1, 3, NOW(), NOW(), NOW());"
    )
    metadata = {
        "pending": False,
        "presentation": "answer",
        "jobId": job_id,
        "jobKind": "agent.chat",
        "jobStatus": "SUCCEEDED",
        "generationOptions": bundle,
        "toolProposals": [],
    }
    message_id = int(
        db_sql(
            "INSERT INTO teaching_agent_messages "
            "(thread_id, user_id, role, content, metadata, created) "
            f"VALUES ('{thread_id}', {owner_id}, 'assistant', "
            "'请选择一套 CTF 方案后正式生成。', "
            f"'{pg_json(metadata)}'::jsonb, NOW()) RETURNING id;"
        )
    )
    queued_job_ids = []
    try:
        bypass = admin_session.post(
            f"{API}/agent-tools/execute",
            headers={"Idempotency-Key": f"ctf-bypass-{secrets.token_hex(8)}"},
            json={
                "threadId": thread_id,
                "tool": "challenge.generate",
                "arguments": {"moduleIndex": module_index, "brief": "绕过选择"},
                "confirmed": False,
            },
        )
        assert bypass.status_code == 409, bypass.text
        assert "三套 CTF 方案" in bypass.json()["errors"][0]

        selection_url = (
            f"{API}/threads/{thread_id}/messages/{message_id}/"
            "generation-options/option-2/select"
        )
        selected = admin_session.post(selection_url, json={})
        assert selected.status_code == 200, selected.text
        proposal = data(selected)["proposal"]
        assert proposal["tool"] == "challenge.generate"
        assert proposal["arguments"] == {
            "brief": selected_brief,
            "moduleIndex": module_index,
            "challengeCount": 5,
            "difficulty": "中等",
            "constraints": {
                "category": "WEB",
                "exerciseMode": "CONTAINER",
                "batchTopics": batch_topics,
            },
        }

        started = admin_session.post(
            f"{API}/agent-tools/execute",
            headers={"Idempotency-Key": f"ctf-selected-{message_id}-option-2"},
            json={
                "threadId": thread_id,
                "tool": "challenge.generate",
                "arguments": {
                    "moduleIndex": 999999,
                    "brief": "浏览器伪造的错误题目要求",
                },
                "confirmed": False,
                "generationSelection": {
                    "sourceMessageId": message_id,
                    "optionId": "option-2",
                },
            },
        )
        assert started.status_code == 200, started.text
        started_data = data(started)
        assert started_data["action"]["request"]["arguments"] == proposal["arguments"]
        assert started_data["result"]["challengeCount"] == 5
        assert started_data["result"]["batchTopics"] == batch_topics
        assert len(started_data["result"]["jobs"]) == 5
        assert len(started_data["result"]["authoringJobs"]) == 5
        assert [
            item["title"].split("（", 1)[0]
            for item in started_data["result"]["authoringJobs"]
        ] == batch_topics
        queued_job_ids = [item["id"] for item in started_data["result"]["jobs"]]
        assert len(set(queued_job_ids)) == 5
        assert all(
            item["state"]["batchCount"] == 5
            for item in started_data["thread"]["messages"][-1]["cards"]
        )
        assert [
            item["state"]["batch"]["index"]
            for item in started_data["thread"]["messages"][-1]["cards"]
        ] == [1, 2, 3, 4, 5]
        assert all(
            item["state"]["batch"]["count"] == 5
            for item in started_data["thread"]["messages"][-1]["cards"]
        )
        assert [
            item["state"]["batchIndex"]
            for item in started_data["thread"]["messages"][-1]["cards"]
        ] == [1, 2, 3, 4, 5]
        assert [
            item["state"]["batchTopic"]
            for item in started_data["thread"]["messages"][-1]["cards"]
        ] == batch_topics
        assistant_metadata = started_data["thread"]["messages"][-1]["metadata"]
        assert assistant_metadata["generationContract"] == {
            "kind": "independent-ctf-batch",
            "requestedCount": 5,
            "createdJobCount": 5,
            "batchId": started_data["result"]["batchId"],
        }
        authoring_job_ids = [
            item["id"] for item in started_data["result"]["authoringJobs"]
        ]
        authoring_requests = json.loads(
            db_sql(
                "SELECT json_agg(request ORDER BY (request->'batch'->>'index')::int) "
                "FROM learning_authoring_jobs WHERE id IN ("
                + ",".join(f"'{item}'" for item in authoring_job_ids)
                + ");"
            )
        )
        assert len(authoring_requests) == 5
        for index, request in enumerate(authoring_requests, start=1):
            assert request["brief"].startswith(
                f"独立 CTF {index}/5：{batch_topics[index - 1]}"
            )
            assert "本次调用唯一需要构建的题目" in request["brief"]
            assert "不能实现为本题内部的关卡数、小问数或共用最终 Flag" in request["brief"]
            assert request["constraints"]["batchContract"] == {
                "requestedCount": 5,
                "itemIndex": index,
                "oneDraftPerItem": True,
                "oneEnvironmentPerItem": True,
                "oneDynamicFlagPerItem": True,
            }
            assert request["constraints"]["difficulty"] == "中等"
        refreshed = data(admin_session.get(f"{API}/threads/{thread_id}"))["thread"]
        source_message = next(
            item for item in refreshed["messages"] if item["id"] == message_id
        )
        assert source_message["metadata"]["generationSelection"]["status"] == "STARTED"
        selection = source_message["metadata"]["generationSelection"]
        assert selection["formalJobId"] == queued_job_ids[0]
        assert selection["formalJobIds"] == queued_job_ids
        assert len(selection["authoringJobIds"]) == 5
    finally:
        for queued_job_id in queued_job_ids:
            admin_session.delete(f"{API}/jobs/{queued_job_id}", json={})
        cleanup = admin_session.delete(
            f"{API}/threads/{thread_id}", json={"confirmed": True}
        )
        assert cleanup.status_code == 200, cleanup.text


def test_course_agent_starts_one_atomic_batch_revision_for_five_ctf_drafts(
    admin_session,
    simple_award_dojo,
):
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    thread_id = data(
        admin_session.post(
            f"{API}/threads",
            json={
                "dojoId": dojo["id"],
                "moduleIndex": module_index,
                "title": "五题统一修订原子入队验收",
            },
        )
    )["thread"]["id"]
    owner_id = get_user_id("admin")
    draft_ids = [f"draft_{secrets.token_hex(16)}" for _ in range(5)]
    queued_job_ids = []
    values = []
    for index, draft_id in enumerate(draft_ids, start=1):
        spec = json.dumps(
            {
                "name": f"批量修订验收题 {index}",
                "delivery": {"mode": "CONTAINER"},
            },
            ensure_ascii=False,
        ).replace("'", "''")
        values.append(
            "(" + ", ".join(
                [
                    f"'{draft_id}'",
                    str(dojo["id"]),
                    str(module_index),
                    str(owner_id),
                    "'VALIDATED'",
                    "'L2'",
                    f"'批量修订验收题 {index}'",
                    "'{}'::jsonb",
                    "'[]'::jsonb",
                    f"'{spec}'::jsonb",
                    "'[]'::jsonb",
                    "'{\"status\": \"PASS\"}'::jsonb",
                    "1",
                    "NOW()",
                    "NOW()",
                ]
            ) + ")"
        )
    db_sql(
        "INSERT INTO learning_drafts "
        "(id, dojo_id, module_index, author_id, status, level, brief, "
        "constraints, conversation, spec, candidates, validation, revision, "
        "created, updated) VALUES "
        + ", ".join(values)
        + ";"
    )
    try:
        response = execute_course_tool(
            admin_session,
            thread_id,
            "challenge.revise",
            {
                "draftIds": draft_ids,
                "instruction": (
                    "统一完成四项修改：一是为每题保留独立动态 Flag；"
                    "二是增加渐进提示；三是限制资源；四是补充失败反馈。"
                ),
            },
            confirmed=False,
        )
        assert response.status_code == 200, response.text
        result = data(response)["result"]
        assert result["draftIds"] == draft_ids
        assert result["challengeCount"] == 5
        assert len(result["authoringJobs"]) == 5
        assert len(result["jobs"]) == 5
        assert {item["kind"] for item in result["authoringJobs"]} == {"REVISE"}
        assert [item["batch"]["index"] for item in result["jobs"]] == [1, 2, 3, 4, 5]
        assert all(item["batch"]["count"] == 5 for item in result["jobs"])
        queued_job_ids = [item["id"] for item in result["jobs"]]
        assert len(set(queued_job_ids)) == 5
        states = db_sql(
            "SELECT id || ':' || status FROM learning_drafts WHERE id IN ("
            + ",".join(f"'{item}'" for item in draft_ids)
            + ") ORDER BY id;"
        ).splitlines()
        assert len(states) == 5
        assert all(item.endswith(":BUILDING") for item in states)
    finally:
        for queued_job_id in queued_job_ids:
            admin_session.delete(f"{API}/jobs/{queued_job_id}", json={})
        cleanup = admin_session.delete(
            f"{API}/threads/{thread_id}", json={"confirmed": True}
        )
        assert cleanup.status_code == 200, cleanup.text


def test_teacher_agent_links_to_the_canonical_question_workspace(admin_session):
    page = admin_session.get(f"{DOJO_URL.rstrip('/')}/teacher")
    assert page.status_code == 200
    assert 'id="teaching-authoring-workspace"' not in page.text
    assert 'id="teaching-authoring-frame"' not in page.text
    assert "aisecedu-agent-workbench-v36" in page.text
    assert "aisecedu-global-agent-v72" in page.text
    root = pathlib.Path(__file__).resolve().parents[1]
    script = (root / "dojo_theme/static/js/dojo/teaching-agent.js").read_text()
    assert "function authoringManagementHref(job)" in script
    assert "data-job-authoring-link" in script
    assert 'action: "题目管理"' in script
    assert 'new URL("/teacher/courses", window.location.origin)' in script
    assert 'canonical.searchParams.set("tab", "questions")' in script
    assert 'canonical.searchParams.set("selectedId", String(selectedId))' in script
    assert "url.pathname = `/dojo/" not in script
    assert "openAuthoringWorkspace" not in script


def test_global_agent_executes_native_course_operations(
    admin_session,
    random_user,
    simple_award_dojo,
):
    student_name, _student_session = random_user
    teacher_page = admin_session.get(f"{DOJO_URL.rstrip('/')}/teacher")
    assert teacher_page.status_code == 200
    assert 'id="teaching-drawer"' in teacher_page.text
    assert 'id="teaching-job-list"' in teacher_page.text
    assert 'id="teaching-authoring-workspace"' not in teacher_page.text
    assert 'id="teaching-authoring-frame"' not in teacher_page.text
    assert 'id="teaching-current-run"' not in teacher_page.text
    assert 'id="teaching-stop"' not in teacher_page.text
    assert "data-transcript-mode=" not in teacher_page.text
    assert 'id="teaching-live-status"' not in teacher_page.text
    assert "data-drawer-tab=" not in teacher_page.text
    assert "任务、产物与证据" not in teacher_page.text
    assert 'class="teaching-quick-prompts"' in teacher_page.text
    assert 'class="teaching-context-panel"' not in teacher_page.text
    assert 'id="teaching-dojo" hidden' in teacher_page.text
    assert 'id="teaching-module" hidden' in teacher_page.text
    assert 'id="teaching-context-summary"' not in teacher_page.text
    assert "已从对话识别" not in teacher_page.text
    assert "自动绑定识别到的课程与章节" not in teacher_page.text
    assert "在同一对话中处理任意课程与教学任务" not in teacher_page.text
    assert 'id="teaching-thread-search"' in teacher_page.text
    assert "data-thread-view=" not in teacher_page.text
    assert 'aria-label="对话状态"' not in teacher_page.text
    assert 'data-thread-action="delete"' in teacher_page.text
    assert 'id="teaching-current-thread-actions"' not in teacher_page.text
    assert 'id="teaching-candidate-mode"' in teacher_page.text
    assert "data-phase=" not in teacher_page.text
    assert "生成三套" not in teacher_page.text
    assert "/teacher/courses" in teacher_page.text
    assert "/teacher?phase=" not in teacher_page.text
    assert "aisecedu-agent-workbench-v36" in teacher_page.text
    assert "aisecedu-global-agent-v72" in teacher_page.text
    assert teacher_page.text.index(
        'id="teaching-approval-tray"'
    ) < teacher_page.text.index('class="teaching-composer-row"')
    assert '<section id="teaching-action-section" hidden>' in teacher_page.text
    source_dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    summary_context = data(
        admin_session.get(f"{API}/context", params={"view": "teacher-summary"})
    )
    summary_dojo = next(
        item
        for item in summary_context["teacherDojos"]
        if item["referenceId"] == simple_award_dojo
    )
    assert summary_context["studentDojos"] == []
    assert summary_context["learningAttempts"] == []
    assert summary_context["liveSessions"] == []
    assert summary_dojo["modules"] == []
    assert summary_dojo["moduleCount"] == source_dojo["moduleCount"]
    assert summary_dojo["challengeCount"] == source_dojo["challengeCount"]

    inferred_thread_response = admin_session.post(
        f"{API}/threads",
        json={
            "dojoId": source_dojo["id"],
            "moduleIndex": source_dojo["modules"][0]["index"],
            "title": "模型原始指令验收",
        },
    )
    assert inferred_thread_response.status_code == 201, inferred_thread_response.text
    inferred_thread_id = data(inferred_thread_response)["thread"]["id"]
    inferred_message = admin_session.post(
        f"{API}/threads/{inferred_thread_id}/messages",
        json={
            "content": (
                f"请查看 {source_dojo['referenceId']} 课程"
                f" {source_dojo['modules'][0]['name']} 章节的真实学情状态"
            ),
            "artifactType": "auto",
        },
    )
    assert inferred_message.status_code == 202, inferred_message.text
    inferred_data = data(inferred_message)
    assert inferred_data["thread"]["dojoId"] == source_dojo["id"]
    assert inferred_data["thread"]["moduleIndex"] == source_dojo["modules"][0]["index"]
    assert not any(
        card["type"] == "job" and card["state"].get("kind") == "agent.chat"
        for message in inferred_data["thread"]["messages"]
        for card in message["cards"]
    )
    assert inferred_data["candidateSetId"] is None
    assert inferred_data["job"]["kind"] == "agent.chat"
    inferred_pending = next(
        message
        for message in reversed(inferred_data["thread"]["messages"])
        if message["metadata"].get("jobId") == inferred_data["job"]["id"]
    )
    assert "intent" not in inferred_pending["metadata"]
    assert inferred_pending["metadata"]["pending"] is True
    assert inferred_pending["metadata"]["presentation"] == "activity"
    assert inferred_pending["metadata"]["jobKind"] == "agent.chat"
    assert inferred_pending["metadata"]["jobStatus"] in {"QUEUED", "RUNNING"}
    assert "理解完整要求" in inferred_pending["content"]
    inferred_cancel = admin_session.delete(
        f"{API}/jobs/{inferred_data['job']['id']}", json={}
    )
    assert inferred_cancel.status_code == 200, inferred_cancel.text

    created_thread = admin_session.post(
        f"{API}/threads",
        json={"dojoId": source_dojo["id"], "title": "课程操作验收"},
    )
    assert created_thread.status_code == 201, created_thread.text
    thread_id = data(created_thread)["thread"]["id"]

    failed_key = f"invalid-module-{secrets.token_hex(8)}"
    failed_payload = {
        "threadId": thread_id,
        "tool": "module.update",
        "arguments": {
            "moduleIndex": 999999,
            "name": "不存在的章节",
        },
        "confirmed": False,
    }
    first_failure = admin_session.post(
        f"{API}/agent-tools/execute",
        headers={"Idempotency-Key": failed_key},
        json=failed_payload,
    )
    repeated_failure = admin_session.post(
        f"{API}/agent-tools/execute",
        headers={"Idempotency-Key": failed_key},
        json=failed_payload,
    )
    assert first_failure.status_code == 409
    assert repeated_failure.status_code == 409
    assert first_failure.json()["success"] is False
    assert repeated_failure.json()["success"] is False
    assert "没有找到指定章节" in repeated_failure.json()["errors"][0]

    material_analysis = admin_session.post(
        f"{API}/threads/{thread_id}/messages",
        json={
            "content": (
                "请分析课程中课件《缓冲区溢出基础》的功能点、知识图谱和章节建议"
            ),
            "artifactType": "auto",
        },
    )
    assert material_analysis.status_code == 202, material_analysis.text
    material_analysis_data = data(material_analysis)
    assert material_analysis_data["candidateSetId"] is None
    assert material_analysis_data["job"]["kind"] == "agent.chat"
    analysis_pending_reply = next(
        message
        for message in reversed(material_analysis_data["thread"]["messages"])
        if message["metadata"].get("jobId") == material_analysis_data["job"]["id"]
    )
    assert "intent" not in analysis_pending_reply["metadata"]
    assert analysis_pending_reply["metadata"]["presentation"] == "activity"
    assert analysis_pending_reply["metadata"]["jobKind"] == "agent.chat"
    assert "理解完整要求" in analysis_pending_reply["content"]
    assert "已开始生成" not in analysis_pending_reply["content"]
    canceled_analysis = admin_session.delete(
        f"{API}/jobs/{material_analysis_data['job']['id']}", json={}
    )
    assert canceled_analysis.status_code == 200, canceled_analysis.text

    raw_generation_prompt = (
        "为当前章节生成一份 SQL 注入防御课件，包含学习目标、"
        "核心概念对比、20 分钟讲授步骤和三道出口题"
    )
    courseware_generation = admin_session.post(
        f"{API}/threads/{thread_id}/messages",
        json={
            "content": raw_generation_prompt,
            "artifactType": "auto",
            "candidateMode": "auto",
        },
    )
    assert courseware_generation.status_code == 202, courseware_generation.text
    courseware_data = data(courseware_generation)
    assert courseware_data["candidateSetId"] is None
    assert courseware_data["job"]["kind"] == "agent.chat"
    generation_reply = next(
        message
        for message in reversed(courseware_data["thread"]["messages"])
        if message["metadata"].get("jobId") == courseware_data["job"]["id"]
    )
    assert "intent" not in generation_reply["metadata"]
    assert generation_reply["metadata"]["presentation"] == "activity"
    assert generation_reply["metadata"]["jobKind"] == "agent.chat"
    assert generation_reply["cards"] == []
    canceled_planning = admin_session.delete(
        f"{API}/jobs/{courseware_data['job']['id']}", json={}
    )
    assert canceled_planning.status_code == 200, canceled_planning.text

    premature_generation = admin_session.post(
        f"{API}/threads/{thread_id}/messages",
        json={
            "content": raw_generation_prompt,
            "agentContinuation": True,
            "action": "generate",
            "artifactType": "slide-deck",
            "candidateCount": 1,
        },
    )
    assert premature_generation.status_code == 400, premature_generation.text
    assert "三套候选方案" in premature_generation.json()["errors"][0]

    for prompt, stale_artifact_type in (
        (
            "给密码学创建几道由模拟引擎实现的仿真题目，包含可操作参数、状态变化、即时反馈和复盘",
            "question-set",
        ),
        ("为当前章节生成一道 CTF 实践题，主题是弱随机数攻击", "auto"),
        (
            "为当前章节生成一个仅在隔离环境运行的 SQL 注入攻防演示实验，包含攻击者、防守者、拓扑和验证步骤",
            "auto",
        ),
    ):
        response = admin_session.post(
            f"{API}/threads/{thread_id}/messages",
            json={"content": prompt, "artifactType": stale_artifact_type},
        )
        assert response.status_code == 202, response.text
        response_data = data(response)
        assert response_data["candidateSetId"] is None
        assert response_data["job"]["kind"] == "agent.chat"
        canceled = admin_session.delete(
            f"{API}/jobs/{response_data['job']['id']}", json={}
        )
        assert canceled.status_code == 200, canceled.text

    denied = execute_course_tool(
        admin_session,
        thread_id,
        "course.create",
        {"name": "未确认课程", "slug": f"unconfirmed-{secrets.token_hex(3)}"},
        confirmed=False,
    )
    assert denied.status_code == 409
    assert denied.json()["errorCode"] == "CONFIRMATION_REQUIRED"

    slug = f"agent-course-{secrets.token_hex(4)}"
    created = execute_course_tool(
        admin_session,
        thread_id,
        "course.create",
        {
            "name": "全局智能体课程操作验收",
            "slug": slug,
            "description": "由课程工具创建，并写入统一课程模型。",
            "access": "private",
        },
    )
    assert created.status_code == 200, created.text
    created_data = data(created)
    course = created_data["result"]["course"]
    assert course["slug"] == slug
    assert course["modules"] == []
    assert created_data["action"]["riskLevel"] == "R3"
    assert created_data["action"]["status"] == "APPROVED"
    assert created_data["thread"]["dojoId"] == course["id"]
    created_card = next(
        card
        for message in created_data["thread"]["messages"]
        for card in message["cards"]
        if card["type"] == "course_operation"
    )
    assert created_card["state"]["href"] == (
        f"/teacher/courses?dojo={course['referenceId']}&tab=overview"
    )
    assert created_card["state"]["destinationLabel"] == "管理新课程"
    assert created_card["actions"] == ["open"]

    unit = execute_course_tool(
        admin_session,
        thread_id,
        "module.create",
        {
            "id": "web-basics",
            "name": "Web 安全基础",
            "description": "HTTP、认证与输入验证。",
        },
    )
    assert unit.status_code == 200, unit.text
    unit_data = data(unit)["result"]["module"]
    assert unit_data["id"] == "web-basics"

    updated_unit = execute_course_tool(
        admin_session,
        thread_id,
        "module.update",
        {
            "moduleIndex": unit_data["index"],
            "name": "Web 安全与防御基础",
            "showScoreboard": False,
        },
    )
    assert updated_unit.status_code == 200, updated_unit.text
    assert data(updated_unit)["result"]["module"]["name"] == "Web 安全与防御基础"

    added_member = execute_course_tool(
        admin_session,
        thread_id,
        "course.member.add",
        {"username": student_name, "role": "student"},
    )
    assert added_member.status_code == 200, added_member.text
    members = execute_course_tool(
        admin_session,
        thread_id,
        "course.members",
        confirmed=False,
    )
    assert members.status_code == 200, members.text
    assert {item["username"] for item in data(members)["result"]["members"]} >= {
        "admin",
        student_name,
    }

    updated_course = execute_course_tool(
        admin_session,
        thread_id,
        "course.update",
        {
            "name": "全局智能体课程操作验收（已更新）",
            "showScoreboard": False,
        },
    )
    assert updated_course.status_code == 200, updated_course.text
    assert data(updated_course)["result"]["course"]["showScoreboard"] is False

    removed_unit = execute_course_tool(
        admin_session,
        thread_id,
        "module.delete",
        {"moduleIndex": unit_data["index"]},
    )
    assert removed_unit.status_code == 200, removed_unit.text
    assert data(removed_unit)["result"]["deletedChallengeCount"] == 0

    deleted = execute_course_tool(
        admin_session,
        thread_id,
        "course.delete",
        {},
    )
    assert deleted.status_code == 200, deleted.text
    assert data(deleted)["thread"]["dojoId"] is None
    assert slug not in {
        item["slug"]
        for item in data(
            execute_course_tool(
                admin_session,
                thread_id,
                "course.list",
                confirmed=False,
            )
        )["result"]["courses"]
    }

    bound_thread = data(
        admin_session.post(
            f"{API}/threads",
            json={"title": "建课并继续生成验收"},
        )
    )["thread"]
    bound_slug = f"agent-bound-{secrets.token_hex(4)}"
    bound_created = execute_course_tool(
        admin_session,
        bound_thread["id"],
        "course.create",
        {
            "name": "密码学仿真验收",
            "slug": bound_slug,
            "access": "private",
            "initialModuleName": "仿真实验",
            "initialModuleId": "simulation-labs",
        },
    )
    assert bound_created.status_code == 200, bound_created.text
    bound_data = data(bound_created)
    assert bound_data["result"]["module"] == {
        "index": 0,
        "id": "simulation-labs",
        "name": "仿真实验",
        "description": "由全局教学智能体为本次内容生成自动建立。",
        "url": (f"/{bound_data['result']['course']['referenceId']}/simulation-labs"),
    }
    assert bound_data["thread"]["moduleIndex"] == 0
    removed_bound = execute_course_tool(
        admin_session,
        bound_thread["id"],
        "course.delete",
    )
    assert removed_bound.status_code == 200, removed_bound.text


def test_teacher_thread_isolation_and_native_progress(
    admin_session,
    guest_dojo_admin,
    random_user,
    simple_award_dojo,
):
    guest_name, guest_session = guest_dojo_admin
    student_name, student_session = random_user
    enroll(guest_session, simple_award_dojo)
    enroll(student_session, simple_award_dojo)
    promoted = admin_session.post(
        f"{DOJOS_API}/{simple_award_dojo}/admins/promote",
        json={"user_id": get_user_id(guest_name)},
    )
    assert promoted.status_code == 200, promoted.text

    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    guest_dojo = dojo_context(guest_session, simple_award_dojo, "teacher")
    assert guest_dojo["id"] == dojo["id"]

    created = admin_session.post(
        f"{API}/threads",
        json={
            "dojoId": dojo["id"],
            "moduleIndex": dojo["modules"][0]["index"],
            "phase": "PRE_CLASS",
            "title": "隔离验收线程 A",
        },
    )
    assert created.status_code == 201, created.text
    thread = data(created)["thread"]

    assert guest_session.get(f"{API}/threads/{thread['id']}").status_code == 404
    assert student_session.get(f"{API}/threads/{thread['id']}").status_code == 404
    assert student_session.post(f"{API}/threads", json={}).status_code == 403

    guest_created = guest_session.post(
        f"{API}/threads",
        json={"dojoId": dojo["id"], "title": "隔离验收线程 B"},
    )
    assert guest_created.status_code == 201, guest_created.text
    guest_thread = data(guest_created)["thread"]
    assert admin_session.get(f"{API}/threads/{guest_thread['id']}").status_code == 404
    assert (
        admin_session.post(
            f"{API}/sessions",
            json={
                "dojoId": dojo["id"],
                "moduleIndex": dojo["modules"][0]["index"],
                "threadId": guest_thread["id"],
                "title": "Cross-owner classroom",
            },
        ).status_code
        == 404
    )

    own_threads = data(admin_session.get(f"{API}/threads"))["threads"]
    assert thread["id"] in {item["id"] for item in own_threads}
    assert guest_thread["id"] not in {item["id"] for item in own_threads}

    artifact_id = f"artifact_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO teaching_artifacts "
        "(id, owner_id, dojo_id, module_index, artifact_type, title, status, "
        "current_revision, created, updated) "
        f"VALUES ('{artifact_id}', {get_user_id('admin')}, {dojo['id']}, "
        f"{dojo['modules'][0]['index']}, 'lesson-plan', 'Private artifact', "
        "'DRAFT', 1, NOW(), NOW());"
    )
    revision_id = f"revision_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO teaching_artifact_revisions "
        "(id, artifact_id, revision, instruction, content, content_hash, "
        "source_refs, validation, created_by, created) "
        f"VALUES ('{revision_id}', '{artifact_id}', 1, 'Initial private revision', "
        '\'{"title": "Private artifact", "objectives": ["isolation"]}\'::jsonb, '
        f"'{secrets.token_hex(32)}', '[]'::jsonb, '{{\"status\": \"PENDING\"}}'::jsonb, "
        f"{get_user_id('admin')}, NOW());"
    )
    artifact_url = f"{DOJO_URL.rstrip('/')}/teacher/artifacts/{artifact_id}"
    artifact_page = admin_session.get(artifact_url)
    assert artifact_page.status_code == 200
    assert 'allow="fullscreen"' in artifact_page.text
    assert "aisecedu-teaching-v14" in artifact_page.text
    assert guest_session.get(artifact_url).status_code == 404
    assert guest_session.get(f"{API}/artifacts/{artifact_id}").status_code == 404
    assert (
        guest_session.get(f"{API}/artifacts/{artifact_id}/revisions/1").status_code
        == 404
    )

    action_id = f"action_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO teaching_agent_actions "
        "(id, thread_id, actor_id, action_type, risk_level, target_type, target_id, "
        "status, idempotency_key, request, result, created) "
        f"VALUES ('{action_id}', '{thread['id']}', {get_user_id('admin')}, "
        "'publish-teaching-artifact', 'R3', 'artifact', "
        f"'{artifact_id}', 'AWAITING_APPROVAL', 'test-{action_id}', "
        f'\'{{"dojoId": {dojo["id"]}, "expectedRevision": 1}}\'::jsonb, '
        "'{}'::jsonb, NOW());"
    )
    assert admin_session.get(f"{API}/actions/{action_id}/decision").status_code == 200
    assert guest_session.get(f"{API}/actions/{action_id}/decision").status_code == 404
    assert (
        guest_session.post(
            f"{API}/actions/{action_id}/decision",
            json={"decision": "APPROVED", "confirmed": True},
        ).status_code
        == 404
    )
    visible_guest_actions = data(guest_session.get(f"{API}/actions"))["actions"]
    assert action_id not in {item["id"] for item in visible_guest_actions}

    material_id = f"material_{secrets.token_hex(16)}"
    material_sha = secrets.token_hex(32)
    db_sql(
        "INSERT INTO teaching_materials "
        "(id, owner_id, dojo_id, title, filename, mime_type, size, sha256, "
        "storage_key, status, metadata, created, updated) "
        f"VALUES ('{material_id}', {get_user_id('admin')}, {dojo['id']}, "
        "'Private material', 'private.txt', 'text/plain', 7, "
        f"'{material_sha}', 'materials/{material_id}/private.txt', 'UPLOADED', "
        "'{}'::jsonb, NOW(), NOW());"
    )
    cross_material = guest_session.post(
        f"{API}/threads/{guest_thread['id']}/messages",
        json={
            "content": "请根据课件生成三个候选方案",
            "artifactType": "lesson-plan",
            "sourceRefs": [{"type": "material", "id": material_id}],
        },
    )
    assert cross_material.status_code == 404
    assert guest_session.get(f"{API}/materials/{material_id}").status_code == 404
    assert (
        guest_session.post(
            f"{API}/materials/{material_id}/analyze",
            json={"threadId": guest_thread["id"]},
        ).status_code
        == 404
    )
    unavailable_reanalysis = admin_session.post(
        f"{API}/materials/{material_id}/analyze",
        json={"threadId": thread["id"]},
    )
    assert unavailable_reanalysis.status_code == 409
    assert unavailable_reanalysis.json()["errorCode"] == "MATERIAL_UNAVAILABLE"

    candidate_set_id = f"cset_{secrets.token_hex(16)}"
    candidate_id = f"candidate_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO teaching_candidate_sets "
        "(id, owner_id, dojo_id, module_index, thread_id, kind, status, request, "
        "source_refs, created, updated) "
        f"VALUES ('{candidate_set_id}', {get_user_id('admin')}, {dojo['id']}, "
        f"{dojo['modules'][0]['index']}, '{thread['id']}', 'lesson-plan', 'READY', "
        "'{}'::jsonb, '[]'::jsonb, NOW(), NOW());"
    )
    db_sql(
        "INSERT INTO teaching_artifact_candidates "
        "(id, candidate_set_id, ordinal, title, summary, strategy, content, "
        "differences, status, created, updated) "
        f"VALUES ('{candidate_id}', '{candidate_set_id}', 1, 'Private candidate', "
        "'Owner-only candidate', 'concept-first', "
        '\'{"objectives": ["isolation"], "outline": ["test"], '
        '"experience": {"slides": []}}\'::jsonb, '
        "'[\"private\"]'::jsonb, 'DRAFT', NOW(), NOW());"
    )
    assert (
        admin_session.get(f"{API}/candidate-sets/{candidate_set_id}").status_code == 200
    )
    assert (
        guest_session.get(f"{API}/candidate-sets/{candidate_set_id}").status_code == 404
    )
    assert (
        guest_session.post(
            f"{API}/candidates/{candidate_id}/select",
            json={},
        ).status_code
        == 404
    )

    simple_job_id = f"job_{secrets.token_hex(16)}"
    complex_job_id = f"job_{secrets.token_hex(16)}"
    for job_id, artifact_type, priority in (
        (simple_job_id, "lesson-plan", 80),
        (complex_job_id, "vulnerable-lab", 20),
    ):
        db_sql(
            "INSERT INTO teaching_jobs "
            "(id, owner_id, dojo_id, module_index, thread_id, kind, status, stage, "
            "progress, priority, idempotency_key, trace_id, payload, result, "
            "attempt_count, max_attempts, created, updated, completed, canceled) "
            f"VALUES ('{job_id}', {get_user_id('admin')}, {dojo['id']}, "
            f"{dojo['modules'][0]['index']}, '{thread['id']}', 'candidate.generate', "
            f"'CANCELED', 'canceled', 0, {priority}, 'route-{job_id}', "
            f'\'{secrets.token_hex(16)}\', \'{{"artifactType": "{artifact_type}", '
            '"prompt": "routing acceptance"}\'::jsonb, \'{}\'::jsonb, 0, 3, '
            "NOW(), NOW(), NOW(), NOW());"
        )
    simple_route = data(admin_session.get(f"{API}/jobs/{simple_job_id}"))["job"]
    complex_route = data(admin_session.get(f"{API}/jobs/{complex_job_id}"))["job"]
    assert simple_route["modelRoute"]["route"] == "teaching-default"
    assert complex_route["modelRoute"] == {
        "route": "deepseek-v4-flash",
        "requiredModel": "deepseek-v4-flash",
        "actualModel": "deepseek-v4-flash",
        "provider": "deepseek",
        "degraded": False,
        "invocationStatus": None,
    }
    assert guest_session.get(f"{API}/jobs/{complex_job_id}").status_code == 404

    oversized = admin_session.post(
        f"{API}/threads/{thread['id']}/messages",
        json={"content": "x" * 16001, "action": "ask"},
    )
    assert oversized.status_code == 413
    assert (
        admin_session.post(
            f"{API}/runtime/launch",
            json={"role": "teacher", "target": "/prep"},
        ).status_code
        == 400
    )

    progress = admin_session.get(f"{API}/progress/{dojo['id']}")
    assert progress.status_code == 200, progress.text
    progress_data = data(progress)
    signed_route_probe = admin_session.get(f"{API}/progress/-1")
    assert signed_route_probe.status_code == 404
    assert signed_route_probe.json()["errorCode"] == "NOT_FOUND"
    assert "可核验" in progress_data["completionPolicy"]
    assert "不计为完成" in progress_data["completionPolicy"]
    assert "判题" in progress_data["metrics"]["verifiedCompletion"]["definition"]
    assert "浏览" in progress_data["metrics"]["verifiedCompletion"]["definition"]
    assert "不计为完成" in progress_data["metrics"]["verifiedCompletion"]["definition"]
    assert set(progress_data["sourceOfTruth"]) == {
        "Solves",
        "LearningAttempts",
        "LearningEvidenceEvents",
        "LearningAssessments",
        "ObjectiveMappings",
    }
    student = next(
        item for item in progress_data["students"] if item["name"] == student_name
    )
    assert student["requiredTotal"] == progress_data["requiredChallengeCount"]
    assert student["verifiedCompletion"] == 0
    assert student_session.get(f"{API}/progress/{dojo['id']}").status_code == 404


def test_student_workspace_ticket_and_agent_runtime_gateway_isolation(
    admin_session,
    random_user,
    simple_award_dojo,
):
    student_a_name, student_a = random_user
    student_b_name = f"student-{secrets.token_hex(6)}"
    student_b = login(student_b_name, student_b_name, register=True)
    enroll(student_a, simple_award_dojo)
    enroll(student_b, simple_award_dojo)
    dojo = dojo_context(student_a, simple_award_dojo, "student")

    created = student_a.post(
        f"{API}/self-learning/workspaces",
        json={
            "dojoId": dojo["id"],
            "moduleIndex": dojo["modules"][0]["index"],
            "goal": "学习 CSP 防御并完成个人练习",
        },
    )
    assert created.status_code == 201, created.text
    workspace = data(created)["workspace"]
    assert workspace["state"]["privacy"] == "PERSONAL_DRAFT"

    assert (
        student_b.post(
            f"{API}/self-learning/workspaces/{workspace['id']}/generate",
            json={"prompt": "越权生成", "artifactType": "quiz"},
        ).status_code
        == 404
    )
    assert (
        student_b.post(
            f"{API}/self-learning/workspaces/{workspace['id']}/submit",
            json={"artifactId": "artifact_missing"},
        ).status_code
        == 404
    )
    assert (
        student_b.post(
            f"{API}/runtime/launch",
            json={
                "role": "student",
                "dojoId": dojo["id"],
                "workspaceId": workspace["id"],
                "target": "/security-learn",
            },
        ).status_code
        == 403
    )

    personal_artifact_id = f"artifact_{secrets.token_hex(16)}"
    personal_revision_id = f"revision_{secrets.token_hex(16)}"
    student_a_id = get_user_id(student_a_name)
    db_sql(
        "INSERT INTO teaching_artifacts "
        "(id, owner_id, dojo_id, self_workspace_id, module_index, artifact_type, "
        "title, status, current_revision, created, updated) "
        f"VALUES ('{personal_artifact_id}', {student_a_id}, {dojo['id']}, "
        f"'{workspace['id']}', {dojo['modules'][0]['index']}, 'slide-deck', "
        "'Student proposal', 'PERSONAL_DRAFT', 1, NOW(), NOW());"
    )
    db_sql(
        "INSERT INTO teaching_artifact_revisions "
        "(id, artifact_id, revision, instruction, content, content_hash, source_refs, "
        "validation, created_by, created) "
        f"VALUES ('{personal_revision_id}', '{personal_artifact_id}', 1, "
        "'Initial personal proposal', "
        '\'{"title": "CSP proposal", "artifacts": [], '
        '"createdAt": 1, "updatedAt": 1}\'::jsonb, '
        f"'{secrets.token_hex(32)}', '[]'::jsonb, '{{}}'::jsonb, {student_a_id}, NOW());"
    )
    owner_response = student_a.get(f"{API}/artifacts/{personal_artifact_id}")
    assert owner_response.status_code == 200, owner_response.text
    owner_artifact = data(owner_response)["artifact"]
    assert owner_artifact["studentSafe"] is False
    assert owner_artifact["selfWorkspaceId"] == workspace["id"]
    assert owner_artifact["revision"]["content"]["title"] == "CSP proposal"
    assert owner_artifact["capabilities"]["edit"] is True
    assert student_b.get(f"{API}/artifacts/{personal_artifact_id}").status_code == 404

    submitted = student_a.post(
        f"{API}/self-learning/workspaces/{workspace['id']}/submit",
        json={"artifactId": personal_artifact_id},
    )
    assert submitted.status_code == 202, submitted.text
    review_action_id = data(submitted)["action"]["id"]
    assert (
        admin_session.get(
            f"{DOJO_URL.rstrip('/')}/teacher/artifacts/{personal_artifact_id}"
        ).status_code
        == 200
    )
    assert (
        admin_session.get(f"{API}/artifacts/{personal_artifact_id}").status_code == 200
    )
    assert student_b.get(f"{API}/artifacts/{personal_artifact_id}").status_code == 404

    teacher_launch = admin_session.post(
        f"{API}/runtime/launch",
        json={
            "role": "teacher",
            "dojoId": dojo["id"],
            "moduleIndex": dojo["modules"][0]["index"],
            "target": f"/prep/{personal_artifact_id}",
        },
    )
    assert teacher_launch.status_code == 201, teacher_launch.text
    reviewer_browser = requests.Session()
    teacher_exchange = reviewer_browser.get(
        agent_runtime_exchange_url(data(teacher_launch)["launchUrl"]),
        allow_redirects=False,
    )
    assert teacher_exchange.status_code == 303, teacher_exchange.text
    reviewer_headers = {
        "Cookie": f"aisecedu_agent_runtime={teacher_exchange.cookies.get('aisecedu_agent_runtime')}"
    }
    review_lesson_url = (
        f"{DOJO_URL.rstrip('/')}/agent-runtime/api/lessons/{personal_artifact_id}"
    )
    assert requests.get(review_lesson_url, headers=reviewer_headers).status_code == 200
    assert (
        requests.patch(
            review_lesson_url,
            headers=reviewer_headers,
            json={
                "lesson": {
                    "title": "Unauthorized mutation",
                    "artifacts": [],
                    "__aiseceduRevision": 1,
                }
            },
        ).status_code
        == 403
    )


    assert (
        requests.delete(review_lesson_url, headers=reviewer_headers).status_code == 403
    )

    assert (
        admin_session.get(f"{API}/actions/{review_action_id}/decision").status_code
        == 200
    )
    reviewed = admin_session.post(
        f"{API}/actions/{review_action_id}/decision",
        json={"decision": "APPROVED", "confirmed": True},
    )
    assert reviewed.status_code == 200, reviewed.text
    reviewed_action = data(reviewed)["action"]
    assert reviewed_action["result"]["reviewedArtifactId"]

    invalid_target = student_a.post(
        f"{API}/runtime/launch",
        json={"role": "student", "target": "//example.invalid"},
    )
    assert invalid_target.status_code == 400
    assert (
        student_a.post(
            f"{API}/runtime/launch",
            json={
                "role": "student",
                "dojoId": dojo["id"],
                "target": "/security-learn",
            },
        ).status_code
        == 400
    )

    launched = student_a.post(
        f"{API}/runtime/launch",
        json={
            "role": "student",
            "dojoId": dojo["id"],
            "moduleIndex": dojo["modules"][0]["index"],
            "workspaceId": workspace["id"],
            "target": "/security-learn",
        },
    )
    assert launched.status_code == 201, launched.text
    launch = data(launched)
    exchange_url = agent_runtime_exchange_url(launch["launchUrl"])
    browser = requests.Session()
    exchanged = browser.get(exchange_url, allow_redirects=False)
    assert exchanged.status_code == 303, exchanged.text
    assert (
        urllib.parse.urlsplit(exchanged.headers["Location"]).path
        == "/agent-runtime/security-learn"
    )
    session_token = exchanged.cookies.get("aisecedu_agent_runtime")
    assert session_token
    set_cookie = exchanged.headers["Set-Cookie"]
    assert "HttpOnly" in set_cookie
    assert "samesite=strict" in set_cookie.lower()
    assert browser.get(exchange_url, allow_redirects=False).status_code == 401

    scoped_headers = {"Cookie": f"aisecedu_agent_runtime={session_token}"}
    lessons = requests.get(
        f"{DOJO_URL.rstrip('/')}/agent-runtime/api/lessons",
        headers=scoped_headers,
    )
    assert lessons.status_code == 200, lessons.text
    assert (
        requests.post(
            f"{DOJO_URL.rstrip('/')}/agent-runtime/api/lessons",
            headers=scoped_headers,
            json={"title": "绕过候选流程"},
        ).status_code
        == 403
    )
    assert (
        requests.post(
            f"{DOJO_URL.rstrip('/')}/agent-runtime/api/generate/image",
            headers=scoped_headers,
            json={"prompt": "bypass"},
        ).status_code
        == 403
    )
    assert (
        requests.get(
            f"{DOJO_URL.rstrip('/')}/agent-runtime/api/integration/metrics"
        ).status_code
        == 404
    )

    second_launch = student_a.post(
        f"{API}/runtime/launch",
        json={
            "role": "student",
            "dojoId": dojo["id"],
            "workspaceId": workspace["id"],
            "target": "/security-learn",
        },
    )
    second_url = agent_runtime_exchange_url(data(second_launch)["launchUrl"])
    parsed = urllib.parse.urlsplit(second_url)
    query = urllib.parse.parse_qs(parsed.query)
    ticket = query["ticket"][0]
    tamper_index = len(ticket) // 2
    replacement = "A" if ticket[tamper_index] != "A" else "B"
    tampered_ticket = (
        f"{ticket[:tamper_index]}{replacement}{ticket[tamper_index + 1 :]}"
    )
    tampered_url = urllib.parse.urlunsplit(
        parsed._replace(query=urllib.parse.urlencode({"ticket": tampered_ticket}))
    )
    assert requests.get(tampered_url, allow_redirects=False).status_code == 401

    expiring_launch = student_a.post(
        f"{API}/runtime/launch",
        json={
            "role": "student",
            "dojoId": dojo["id"],
            "workspaceId": workspace["id"],
            "target": "/security-learn",
        },
    )
    assert expiring_launch.status_code == 201, expiring_launch.text
    expired_url = agent_runtime_exchange_url(data(expiring_launch)["launchUrl"])
    db_sql(
        "UPDATE global_agent_launch_tickets SET expires = NOW() - INTERVAL '1 second' "
        "WHERE id = (SELECT id FROM global_agent_launch_tickets "
        f"WHERE user_id = {student_a_id} AND used IS NULL "
        "ORDER BY created DESC LIMIT 1);"
    )
    assert requests.get(expired_url, allow_redirects=False).status_code == 401

    # Stage chat is billed after streaming. Once persisted usage reaches the
    # personal quota, middleware must reject the next request before a model is
    # invoked; inserting the usage fact avoids any real paid-model call here.
    quota_invocation_id = f"model_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO model_invocations "
        "(id, owner_id, route, provider, actual_model, parameters, usage, status, "
        "degraded, created) "
        f"VALUES ('{quota_invocation_id}', {student_a_id}, 'global-agent-runtime:quota-test', "
        "'acceptance', 'no-model-call', "
        f'\'{{"workspaceId": "{workspace["id"]}"}}\'::jsonb, '
        '\'{"inputTokens": 500000, "outputTokens": 0}\'::jsonb, '
        "'SUCCEEDED', FALSE, NOW());"
    )
    quota_response = requests.post(
        f"{DOJO_URL.rstrip('/')}/agent-runtime/api/chat",
        headers=scoped_headers,
        json={"messages": [], "storeState": {}, "config": {"agentIds": []}},
    )
    assert quota_response.status_code == 429, quota_response.text
    assert quota_response.json()["errorCode"] == "QUOTA_EXCEEDED"

    assert student_a_name != student_b_name


def test_student_generation_uses_only_published_course_grounding(
    admin_session,
    random_user,
    simple_award_dojo,
):
    _student_name, student_session = random_user
    enroll(student_session, simple_award_dojo)
    dojo = dojo_context(student_session, simple_award_dojo, "student")
    module_index = dojo["modules"][0]["index"]
    owner_id = get_user_id("admin")
    published_id = f"artifact_{secrets.token_hex(16)}"
    draft_id = f"artifact_{secrets.token_hex(16)}"
    rows = []
    revisions = []
    for artifact_id, status, title in (
        (published_id, "PUBLISHED", "学生可见的缓冲区课件"),
        (draft_id, "DRAFT", "教师私有草稿"),
    ):
        revision_id = f"revision_{secrets.token_hex(16)}"
        content = json.dumps(
            {
                "type": "slide-deck",
                "objectives": ["理解缓冲区边界"],
                "outline": [
                    {
                        "title": title,
                        "description": "使用边界检查避免越界写入。",
                    }
                ],
                "activities": [],
                "assessment": {"type": "checkpoint"},
                "experience": {"slides": []},
            },
            ensure_ascii=False,
        ).replace("'", "''")
        rows.append(
            "("
            f"'{artifact_id}', {owner_id}, {dojo['id']}, {module_index}, "
            f"'slide-deck', '{title}', '{status}', 1, NOW(), NOW()"
            ")"
        )
        revisions.append(
            "("
            f"'{revision_id}', '{artifact_id}', 1, '课程内容', "
            f"'{content}'::jsonb, '{secrets.token_hex(32)}', '[]'::jsonb, "
            f"'{{}}'::jsonb, {owner_id}, NOW()"
            ")"
        )
    db_sql(
        "INSERT INTO teaching_artifacts "
        "(id, owner_id, dojo_id, module_index, artifact_type, title, status, "
        "current_revision, created, updated) VALUES "
        + ",".join(rows)
        + "; INSERT INTO teaching_artifact_revisions "
        "(id, artifact_id, revision, instruction, content, content_hash, source_refs, "
        "validation, created_by, created) VALUES "
        + ",".join(revisions)
        + ";"
    )

    created = student_session.post(
        f"{API}/self-learning/workspaces",
        json={
            "dojoId": dojo["id"],
            "moduleIndex": module_index,
            "goal": "根据课程内容制作一份个人复习课件",
            "mode": "slides",
        },
    )
    assert created.status_code == 201, created.text
    workspace_id = data(created)["workspace"]["id"]
    generated = student_session.post(
        f"{API}/self-learning/workspaces/{workspace_id}/generate",
        json={
            "prompt": "根据课程内容制作一份个人复习课件",
            "artifactType": "slide-deck",
        },
    )
    assert generated.status_code == 202, generated.text
    response_data = data(generated)
    job_id = response_data["job"]["id"]
    source_ids = {
        item["id"] for item in response_data["candidateSet"]["sourceRefs"]
    }
    assert any(published_id in source_id for source_id in source_ids)
    assert not any(draft_id in source_id for source_id in source_ids)

    payload = json.loads(
        db_sql(
            "SELECT payload::text FROM teaching_jobs "
            f"WHERE id = '{job_id}';"
        ).strip()
    )
    assert payload["courseContext"]["id"] == dojo["id"]
    assert payload["courseContext"]["moduleIndex"] == module_index
    assert payload["materialContext"]["complete"] is True
    assert payload["materialContext"]["expectedMaterialCount"] >= 1
    grounded_ids = {item["id"] for item in payload["sourceMaterials"]}
    assert any(published_id in source_id for source_id in grounded_ids)
    assert not any(draft_id in source_id for source_id in grounded_ids)
    assert payload["materialDossier"]["coverage"] == payload["materialContext"]


def test_classroom_event_concurrency_idempotency_redaction_and_visibility(
    admin_session,
    random_user,
    simple_award_dojo,
):
    student_a_name, student_a = random_user
    student_b_name = f"classmate-{secrets.token_hex(6)}"
    student_b = login(student_b_name, student_b_name, register=True)
    enroll(student_a, simple_award_dojo)
    enroll(student_b, simple_award_dojo)
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    session_id = f"session_{secrets.token_hex(16)}"
    owner_id = get_user_id("admin")
    db_sql(
        "INSERT INTO teaching_sessions "
        "(id, owner_id, dojo_id, module_index, title, status, state, created, updated) "
        f"VALUES ('{session_id}', {owner_id}, {dojo['id']}, "
        f"{dojo['modules'][0]['index']}, 'Concurrency acceptance', 'LIVE', "
        "'{}'::jsonb, NOW(), NOW());"
    )

    count = 80

    def submit(index):
        session = copy_session(student_a)
        response = session.post(
            f"{API}/sessions/{session_id}/events",
            json={
                "type": "student.response",
                "idempotencyKey": f"load-{index}",
                "payload": (
                    {
                        "answer": f"response-{index} pwn.college{{not-a-real-flag}}",
                        "accessToken": "must-not-persist",
                    }
                    if index == 0
                    else {"answer": f"response-{index}"}
                ),
            },
        )
        return response.status_code, response.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=24) as executor:
        results = list(executor.map(submit, range(count)))

    assert {status for status, _ in results} == {201}, results
    sequences = {body["data"]["sequence"] for _, body in results}
    assert sequences == set(range(1, count + 1))

    replay = student_a.post(
        f"{API}/sessions/{session_id}/events",
        json={
            "type": "student.response",
            "idempotencyKey": "load-0",
            "payload": {"answer": "different replay body"},
        },
    )
    assert replay.status_code == 200
    assert data(replay)["sequence"] in sequences

    teacher_note = admin_session.post(
        f"{API}/sessions/{session_id}/events",
        json={
            "type": "teacher.note",
            "idempotencyKey": "private-teacher-note",
            "payload": {"note": "Only teachers should see this"},
        },
    )
    assert teacher_note.status_code == 201, teacher_note.text
    classmate = student_b.post(
        f"{API}/sessions/{session_id}/events",
        json={
            "type": "student.response",
            # The same client key belongs to a different actor and must not
            # deduplicate student B's event against student A's event.
            "idempotencyKey": "load-0",
            "payload": {"answer": "classmate answer"},
        },
    )
    assert classmate.status_code == 201, classmate.text

    oversized = student_a.post(
        f"{API}/sessions/{session_id}/events",
        json={
            "type": "student.response",
            "idempotencyKey": "oversized",
            "payload": {f"field-{index}": "x" * 9000 for index in range(20)},
        },
    )
    assert oversized.status_code == 413

    student_view = data(student_a.get(f"{API}/sessions/{session_id}"))["session"]
    student_types = [event["type"] for event in student_view["events"]]
    assert "teacher.note" not in student_types
    assert all(
        event["actorId"] != get_user_id(student_b_name)
        for event in student_view["events"]
    )
    redacted = next(
        event
        for event in student_view["events"]
        if event["sequence"] == data(replay)["sequence"]
    )
    assert redacted["payload"]["accessToken"] == "[REDACTED]"
    assert "[REDACTED_FLAG]" in redacted["payload"]["answer"]

    teacher_view = data(admin_session.get(f"{API}/sessions/{session_id}"))["session"]
    assert len(teacher_view["events"]) == count + 2
    assert [event["sequence"] for event in teacher_view["events"]] == list(
        range(1, count + 3)
    )


def test_duplicate_course_system_is_absent():
    rows = json.loads(
        db_sql(
            "SELECT COALESCE(json_agg(table_name ORDER BY table_name), '[]'::json) "
            "FROM information_schema.tables WHERE table_schema = 'public' "
            "AND table_name IN ('course_activity_responses', 'course_resources', "
            "'course_activities', 'course_profiles');"
        )
    )
    assert rows == []
    assert requests.get(f"{DOJO_URL.rstrip('/')}/classroom").status_code == 404
    assert (
        requests.get(
            f"{DOJO_URL.rstrip('/')}/pwncollege_api/v1/course-system"
        ).status_code
        == 404
    )


def test_expired_job_retry_limit_becomes_terminal(
    admin_session,
    simple_award_dojo,
):
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    job_id = f"job_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO teaching_jobs "
        "(id, owner_id, dojo_id, module_index, kind, status, stage, progress, "
        "priority, idempotency_key, trace_id, payload, result, lease_owner, "
        "lease_expires, heartbeat, attempt_count, max_attempts, created, updated) "
        f"VALUES ('{job_id}', {get_user_id('admin')}, {dojo['id']}, "
        f"{dojo['modules'][0]['index']}, 'agent.chat', 'RUNNING', 'generating', "
        f"20, 100, 'expired-{job_id}', '{secrets.token_hex(16)}', "
        "'{}'::jsonb, '{}'::jsonb, 'dead-worker', NOW() - INTERVAL '5 minutes', "
        "NOW() - INTERVAL '5 minutes', 3, 3, NOW() - INTERVAL '10 minutes', "
        "NOW() - INTERVAL '5 minutes');"
    )

    state = None
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        state = json.loads(
            db_sql(
                "SELECT json_build_object("
                "'status', status, 'stage', stage, 'error', error, "
                "'completed', completed IS NOT NULL, "
                "'failedEvents', (SELECT COUNT(*) FROM teaching_job_events "
                f"WHERE job_id = '{job_id}' AND status = 'FAILED')) "
                f"FROM teaching_jobs WHERE id = '{job_id}';"
            )
        )
        if state["status"] == "FAILED":
            break
        time.sleep(1)

    assert state == {
        "status": "FAILED",
        "stage": "failed",
        "error": "Worker lease expired and the automatic retry limit was reached",
        "completed": True,
        "failedEvents": 1,
    }


def test_running_job_recovery_waits_for_liveness_or_a_stale_owner_heartbeat():
    from CTFd.plugins.dojo_plugin.agent_runtime import jobs

    now = datetime.datetime.utcnow()
    first_worker_id = jobs._new_worker_id()
    second_worker_id = jobs._new_worker_id()
    live_worker_job = SimpleNamespace(
        lease_expires=now - datetime.timedelta(minutes=5),
        heartbeat=now - datetime.timedelta(minutes=5),
    )
    stopped_worker_job = SimpleNamespace(
        lease_expires=now + datetime.timedelta(minutes=55),
        heartbeat=now - datetime.timedelta(
            seconds=jobs.WORKER_LIVENESS_TTL_SECONDS + 1
        ),
    )
    legacy_expired_job = SimpleNamespace(
        lease_expires=now - datetime.timedelta(minutes=5),
        heartbeat=None,
    )

    assert (
        jobs._running_job_recovery_reason(
            live_worker_job,
            now=now,
            owner_alive=True,
        )
        is None
    )
    assert (
        jobs._running_job_recovery_reason(
            stopped_worker_job,
            now=now,
            owner_alive=False,
        )
        == "worker-offline"
    )
    assert (
        jobs._running_job_recovery_reason(
            legacy_expired_job,
            now=now,
            owner_alive=None,
        )
        == "lease-expired"
    )
    assert first_worker_id != second_worker_id
    assert first_worker_id.startswith(f"{jobs.socket.gethostname()}-")


def test_stopped_worker_job_is_durable_traceable_and_cancelable(
    admin_session,
    simple_award_dojo,
):
    """Disruptive release gate; opt in only on an isolated deployment."""

    if os.getenv("AISECEDU_RUN_WORKER_RECOVERY") != "1":
        pytest.skip("set AISECEDU_RUN_WORKER_RECOVERY=1 on an isolated deployment")

    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]
    stopped = dojo_run("docker", "stop", "teaching-worker", check=False)
    assert stopped.returncode == 0, stopped.stderr

    job_id = None
    try:
        created = admin_session.post(
            f"{API}/threads",
            json={
                "dojoId": dojo["id"],
                "moduleIndex": module_index,
                "phase": "PRE_CLASS",
                "title": "Worker recovery acceptance",
            },
        )
        assert created.status_code == 201, created.text
        thread_id = data(created)["thread"]["id"]

        queued = admin_session.post(
            f"{API}/threads/{thread_id}/messages",
            json={
                "content": "生成三个仅用于持久任务验收的候选教案",
                "action": "generate",
                "artifactType": "lesson-plan",
                "candidateCount": 3,
            },
        )
        assert queued.status_code == 202, queued.text
        response_trace = queued.headers.get("X-Trace-ID")
        job = data(queued)["job"]
        job_id = job["id"]
        assert response_trace
        assert job["traceId"] == response_trace

        durable = json.loads(
            db_sql(
                "SELECT json_build_object("
                "'status', status, 'traceId', trace_id, "
                "'outbox', EXISTS(SELECT 1 FROM teaching_job_outbox "
                f"WHERE job_id = '{job_id}'), "
                "'modelInvocations', (SELECT COUNT(*) FROM model_invocations "
                f"WHERE job_id = '{job_id}')) FROM teaching_jobs "
                f"WHERE id = '{job_id}';"
            )
        )
        assert durable == {
            "status": "QUEUED",
            "traceId": response_trace,
            "outbox": True,
            "modelInvocations": 0,
        }

        # CTFd validates CSRF on state-changing DELETE requests only after it
        # has parsed a request body, so send an explicit empty JSON object.
        canceled = admin_session.delete(f"{API}/jobs/{job_id}", json={})
        assert canceled.status_code == 200, canceled.text
        assert data(canceled)["job"]["status"] == "CANCELED"
    finally:
        started = dojo_run("docker", "start", "teaching-worker", check=False)
        assert started.returncode == 0, started.stderr

    deadline = time.monotonic() + 30
    state = None
    while time.monotonic() < deadline:
        state = json.loads(
            db_sql(
                "SELECT json_build_object("
                "'status', status, "
                "'modelInvocations', (SELECT COUNT(*) FROM model_invocations "
                f"WHERE job_id = '{job_id}'), "
                "'canceledEvents', (SELECT COUNT(*) FROM teaching_job_events "
                f"WHERE job_id = '{job_id}' AND status = 'CANCELED')) "
                f"FROM teaching_jobs WHERE id = '{job_id}';"
            )
        )
        if state["status"] == "CANCELED" and state["canceledEvents"] >= 1:
            break
        time.sleep(1)

    assert state == {
        "status": "CANCELED",
        "modelInvocations": 0,
        "canceledEvents": 1,
    }


def test_trial_load_30_teachers_200_students(
    admin_session,
    simple_award_dojo,
):
    """Release-gate load test; opt in with AISECEDU_RUN_TEACHING_LOAD=1."""

    if os.getenv("AISECEDU_RUN_TEACHING_LOAD") != "1":
        pytest.skip("set AISECEDU_RUN_TEACHING_LOAD=1 for the 30/200 release gate")

    run_id = secrets.token_hex(4)
    dojo = dojo_context(admin_session, simple_award_dojo, "teacher")
    module_index = dojo["modules"][0]["index"]

    def register_teacher(index):
        name = f"loadt-{run_id}-{index:02d}"
        session = login(name, name, register=True)
        enroll(session, simple_award_dojo)
        return name, session

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        additional_teachers = list(executor.map(register_teacher, range(1, 30)))

    teacher_names = [name for name, _ in additional_teachers]
    quoted_names = ",".join(f"'{name}'" for name in teacher_names)
    teacher_ids = json.loads(
        db_sql(
            "SELECT COALESCE(json_object_agg(name, id), '{}'::json) "
            f"FROM users WHERE name IN ({quoted_names});"
        )
    )
    assert set(teacher_ids) == set(teacher_names)
    for name in teacher_names:
        response = admin_session.post(
            f"{DOJOS_API}/{simple_award_dojo}/admins/promote",
            json={"user_id": teacher_ids[name]},
        )
        assert response.status_code == 200, response.text

    teachers = [("admin", admin_session), *additional_teachers]

    def create_teacher_thread(item):
        name, session = item
        response = session.post(
            f"{API}/threads",
            json={
                "dojoId": dojo["id"],
                "moduleIndex": module_index,
                "phase": "PRE_CLASS",
                "title": f"load-gate-{run_id}-{name}",
            },
        )
        assert response.status_code == 201, response.text
        return name, session, data(response)["thread"]["id"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        teacher_threads = list(executor.map(create_teacher_thread, teachers))

    all_thread_ids = {thread_id for _, _, thread_id in teacher_threads}
    assert len(all_thread_ids) == 30

    def verify_teacher_thread_isolation(item):
        _, session, own_thread_id = item
        rows = data(session.get(f"{API}/threads"))["threads"]
        visible_gate_ids = {row["id"] for row in rows} & all_thread_ids
        return own_thread_id, visible_gate_ids

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        teacher_visibility = list(
            executor.map(verify_teacher_thread_isolation, teacher_threads)
        )
    assert all(visible == {own} for own, visible in teacher_visibility)

    owner_ids = {"admin": get_user_id("admin"), **teacher_ids}
    teacher_fixtures = []
    candidate_set_values = []
    candidate_values = []
    job_values = []
    for teacher_index, (name, _, thread_id) in enumerate(teacher_threads):
        owner_id = owner_ids[name]
        candidate_set_id = f"cset_load_{run_id}_{teacher_index:02d}"
        job_id = f"job_load_{run_id}_{teacher_index:02d}"
        teacher_fixtures.append((candidate_set_id, job_id))
        candidate_set_values.append(
            f"('{candidate_set_id}', {owner_id}, {dojo['id']}, {module_index}, "
            f"'{thread_id}', 'attack-defense-scene', 'READY', "
            f"'{{\"loadGate\": \"{run_id}\"}}'::jsonb, '[]'::jsonb, NOW(), NOW())"
        )
        for ordinal in range(1, 4):
            candidate_id = f"candidate_load_{run_id}_{teacher_index:02d}_{ordinal}"
            content = json.dumps(
                {
                    "type": "attack-defense-scene",
                    "objectives": [f"load objective {ordinal}"],
                    "outline": [f"candidate path {ordinal}"],
                    "experience": {"scenes": [{"ordinal": ordinal}]},
                },
                separators=(",", ":"),
            )
            candidate_values.append(
                f"('{candidate_id}', '{candidate_set_id}', {ordinal}, "
                f"'Load candidate {ordinal}', 'isolated candidate', "
                f"'strategy-{ordinal}', '{content}'::jsonb, "
                f"'[\"variant-{ordinal}\"]'::jsonb, 'DRAFT', NOW(), NOW())"
            )
        job_values.append(
            f"('{job_id}', {owner_id}, {dojo['id']}, {module_index}, "
            f"'{thread_id}', 'candidate.generate', 'CANCELED', 'canceled', 0, 20, "
            f"'load-route-{job_id}', '{secrets.token_hex(16)}', "
            '\'{"artifactType": "attack-defense-scene", '
            f'"prompt": "load gate {run_id}"}}\'::jsonb, '
            "'{}'::jsonb, 0, 3, NOW(), NOW(), NOW(), NOW())"
        )
    db_sql(
        "INSERT INTO teaching_candidate_sets "
        "(id, owner_id, dojo_id, module_index, thread_id, kind, status, request, "
        "source_refs, created, updated) VALUES "
        + ",".join(candidate_set_values)
        + "; INSERT INTO teaching_artifact_candidates "
        "(id, candidate_set_id, ordinal, title, summary, strategy, content, "
        "differences, status, created, updated) VALUES "
        + ",".join(candidate_values)
        + "; INSERT INTO teaching_jobs "
        "(id, owner_id, dojo_id, module_index, thread_id, kind, status, stage, "
        "progress, priority, idempotency_key, trace_id, payload, result, "
        "attempt_count, max_attempts, created, updated, completed, canceled) VALUES "
        + ",".join(job_values)
        + ";"
    )

    def verify_teacher_candidate_isolation(index):
        _, session, _ = teacher_threads[index]
        own_set, own_job = teacher_fixtures[index]
        other_set, other_job = teacher_fixtures[(index + 1) % len(teacher_fixtures)]
        candidate_response = session.get(f"{API}/candidate-sets/{own_set}")
        job_response = session.get(f"{API}/jobs/{own_job}")
        return (
            candidate_response.status_code,
            len(data(candidate_response)["candidateSet"]["candidates"]),
            session.get(f"{API}/candidate-sets/{other_set}").status_code,
            data(job_response)["job"]["modelRoute"]["route"],
            session.get(f"{API}/jobs/{other_job}").status_code,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as executor:
        candidate_visibility = list(
            executor.map(
                verify_teacher_candidate_isolation,
                range(len(teacher_threads)),
            )
        )
    assert set(candidate_visibility) == {(200, 3, 404, "deepseek-v4-flash", 404)}

    def register_student(index):
        name = f"loads-{run_id}-{index:03d}"
        session = login(name, name, register=True)
        enroll(session, simple_award_dojo)
        return name, session

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        students = list(executor.map(register_student, range(200)))

    def create_workspace(item):
        name, session = item
        response = session.post(
            f"{API}/self-learning/workspaces",
            json={
                "dojoId": dojo["id"],
                "moduleIndex": module_index,
                "goal": f"mixed-load-personal-goal-{run_id}-{name}",
            },
        )
        assert response.status_code == 201, response.text
        return name, session, data(response)["workspace"]["id"]

    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
        workspaces = list(executor.map(create_workspace, students))
    workspace_ids = {workspace_id for _, _, workspace_id in workspaces}
    assert len(workspace_ids) == 200

    def verify_student_workspace_isolation(index):
        _, session, own_workspace_id = workspaces[index]
        _, _, next_workspace_id = workspaces[(index + 1) % len(workspaces)]
        own_rows = data(session.get(f"{API}/self-learning/workspaces"))["workspaces"]
        own_visible_ids = {row["id"] for row in own_rows} & workspace_ids
        cross = session.post(
            f"{API}/self-learning/workspaces/{next_workspace_id}/generate",
            json={"prompt": "cross-tenant probe", "artifactType": "quiz"},
        )
        return own_workspace_id, own_visible_ids, cross.status_code

    with concurrent.futures.ThreadPoolExecutor(max_workers=32) as executor:
        workspace_visibility = list(
            executor.map(verify_student_workspace_isolation, range(len(workspaces)))
        )
    assert all(visible == {own} for own, visible, _ in workspace_visibility)
    assert {status for _, _, status in workspace_visibility} == {404}

    classroom_id = f"session_{secrets.token_hex(16)}"
    db_sql(
        "INSERT INTO teaching_sessions "
        "(id, owner_id, dojo_id, module_index, title, status, state, created, updated) "
        f"VALUES ('{classroom_id}', {get_user_id('admin')}, {dojo['id']}, "
        f"{module_index}, '30/200 release gate', 'LIVE', '{{}}'::jsonb, NOW(), NOW());"
    )

    def submit_classroom_event(index):
        _, session, _ = workspaces[index]
        response = session.post(
            f"{API}/sessions/{classroom_id}/events",
            json={
                "type": "student.response",
                "idempotencyKey": f"mixed-{run_id}-{index}",
                "payload": {"answer": f"student-{index}"},
            },
        )
        return response.status_code, response.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=64) as executor:
        classroom_results = list(
            executor.map(submit_classroom_event, range(len(workspaces)))
        )
    assert {status for status, _ in classroom_results} == {201}
    sequences = {body["data"]["sequence"] for _, body in classroom_results}
    assert sequences == set(range(1, 201))

    teacher_view = data(admin_session.get(f"{API}/sessions/{classroom_id}"))["session"]
    assert len(teacher_view["events"]) == 200
    assert [event["sequence"] for event in teacher_view["events"]] == list(
        range(1, 201)
    )
