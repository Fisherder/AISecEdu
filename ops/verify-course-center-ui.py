#!/usr/bin/env python3

from __future__ import annotations

import argparse
import importlib.util
import pathlib
import sys
import urllib.parse


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
FLOW_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
UI_PATH = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def pass_(message):
    print(f"PASS  {message}", flush=True)


def wait_for_course(driver):
    return driver.wait_for(
        """
        const detail = document.getElementById('cs-course-detail-view');
        const readiness = document.querySelector('#cs-overview-readiness strong');
        return document.readyState === 'complete'
          && detail && !detail.hidden
          && readiness && !readiness.textContent.includes('正在')
          ? readiness.textContent.trim() : null;
        """,
        timeout=90,
        label="course workspace facts",
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        default=str(REPO_DIR / "output" / "course-center-ui"),
    )
    args = parser.parse_args()
    output_dir = pathlib.Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    flow = load_module("course_center_flow", FLOW_PATH)
    ui = load_module("course_center_ui_driver", UI_PATH)
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
    ranked_courses = sorted(
        courses,
        key=lambda item: sum(
            int((counts or {}).get("total") or 0)
            for counts in (item.get("counts") or {}).values()
        ),
        reverse=True,
    )
    course = ranked_courses[0]
    question_items = []
    draft_fixture = None
    for candidate in ranked_courses:
        candidate_reference = str(candidate.get("referenceId") or "")
        if not candidate_reference:
            continue
        payload = flow.unwrap(
            client.get(
                flow.api_url(
                    f"teaching/courses/{urllib.parse.quote(candidate_reference, safe='')}/content?kind=questions&pageSize=100&sort=updated_desc"
                ),
                timeout=40,
            )
        )
        candidate_items = payload.get("items") or []
        candidate_draft = next(
            (item for item in candidate_items if item.get("kind") == "draft"),
            None,
        )
        if candidate is course:
            question_items = candidate_items
        if candidate_draft:
            course = candidate
            question_items = candidate_items
            draft_fixture = candidate_draft
            break
    reference = str(course.get("referenceId") or "")
    encoded = urllib.parse.quote(reference, safe="")
    target = f"{flow.BASE_URL}/teacher/courses?dojo={encoded}"
    driver = None
    try:
        driver = ui.ChromeDriver()
        driver.navigate(f"{flow.BASE_URL}/login")
        driver.wait_for(
            "return document.readyState === 'complete';",
            timeout=30,
            label="login page",
        )
        eager_math = driver.execute(
            """
            return performance.getEntriesByType('resource')
              .map(entry => entry.name)
              .filter(name => name.includes('cdn.jsdelivr.net/npm/katex'));
            """
        )
        if eager_math:
            raise AssertionError(f"login page eagerly loaded KaTeX: {eager_math}")
        pass_("pages without formulas do not load third-party KaTeX resources")
        driver.navigate(flow.BASE_URL)
        for cookie in client.cookies:
            driver.add_cookie(cookie.name, cookie.value)
        driver.set_window_size(1440, 1000)
        driver.navigate(target)
        wait_for_course(driver)
        initial_requests = driver.execute(
            """
            const resources = performance.getEntriesByType('resource').map(entry => new URL(entry.name, location.origin));
            return {
              workspace: resources.filter(url => /\/teaching\/courses\/[^/]+\/workspace$/.test(url.pathname)).length,
              content: resources.filter(url => /\/teaching\/courses\/[^/]+\/content$/.test(url.pathname)).length,
            };
            """
        )
        if int(initial_requests.get("workspace") or 0) != 1 or int(initial_requests.get("content") or 0) != 0:
            raise AssertionError(f"course overview loaded hidden-tab data: {initial_requests}")
        pass_("course overview loads one workspace summary and no hidden-tab collections")

        desktop = driver.execute(
            """
            const attention = document.querySelector('.hub-attention-surface');
            const readiness = document.querySelector('.hub-readiness-surface');
            const progress = document.querySelector('.hub-overview-progress');
            const activity = document.getElementById('cs-recent-activity');
            const code = document.getElementById('cs-course-code-trigger');
            const title = document.getElementById('cs-course-title');
            const before = (left, right) => !!(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING);
            return {
              order: attention && readiness && progress && activity
                ? before(attention, readiness) && before(readiness, progress) && before(progress, activity)
                : false,
              codeBesideTitle: code?.parentElement === title?.parentElement,
              headerAiButton: !!document.querySelector('.course-hub-header a[href^="/teacher?"], .course-hub-header [data-open-agent]'),
              tabNames: Array.from(document.querySelectorAll('.course-hub-tabs [role="tab"]')).map(node => node.textContent.trim()),
              attentionRows: document.querySelectorAll('.hub-attention-row').length,
              readiness: document.querySelector('#cs-overview-readiness strong')?.textContent.trim(),
              bodyOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
            """
        )
        if (
            not desktop.get("order")
            or not desktop.get("codeBesideTitle")
            or desktop.get("headerAiButton")
            or desktop.get("tabNames") != ["概览", "课件", "题目", "演示", "学情"]
            or float(desktop.get("bodyOverflow") or 0) > 1
        ):
            raise AssertionError(f"desktop course shell is inconsistent: {desktop}")
        pass_("desktop course shell prioritizes attention, readiness, progress and recent activity")
        pass_("course code is a compact action beside the course name and the redundant AI header action is absent")
        driver.screenshot(output_dir / "course-center-1440.png")

        driver.execute("document.getElementById('cs-course-code-trigger').click(); return true;")
        code_state = driver.wait_for(
            """
            const dialog = document.querySelector('#cs-course-code-dialog [role="dialog"]');
            const code = document.getElementById('cs-course-code')?.textContent.trim();
            const copy = document.getElementById('cs-copy-course-code');
            if (!dialog || dialog.closest('[hidden]') || !code || code.includes('正在') || code.includes('不可用') || copy?.disabled) return null;
            const rect = dialog.getBoundingClientRect();
            return {
              code,
              width: rect.width,
              height: rect.height,
              fontSize: parseFloat(getComputedStyle(document.getElementById('cs-course-code')).fontSize),
              focusInside: dialog.contains(document.activeElement),
              backgroundInert: Array.from(document.getElementById('cs-course-detail-view').children)
                .filter(node => node !== dialog.closest('#cs-course-code-dialog'))
                .every(node => node.inert),
            };
            """,
            timeout=45,
            label="large course code dialog",
        )
        if (
            len(str(code_state.get("code") or "")) < 6
            or float(code_state.get("width") or 0) < 500
            or float(code_state.get("height") or 0) < 300
            or float(code_state.get("fontSize") or 0) < 30
            or not code_state.get("focusInside")
            or not code_state.get("backgroundInert")
        ):
            raise AssertionError(f"course code dialog is not presentation-ready: {code_state}")
        pass_("course code opens in a large focus-safe dialog with the full code and copy action")
        driver.execute(
            """
            Object.defineProperty(navigator, 'clipboard', {
              configurable: true,
              value: {writeText: async value => { window.__copiedCourseCode = value; }},
            });
            document.getElementById('cs-copy-course-code').click();
            return true;
            """
        )
        copied = driver.wait_for(
            """
            const button = document.getElementById('cs-copy-course-code');
            const status = document.getElementById('cs-course-code-status');
            return window.__copiedCourseCode && button.classList.contains('is-success')
              ? {
                  value: window.__copiedCourseCode,
                  label: document.getElementById('cs-copy-course-code-label')?.textContent.trim(),
                  status: status?.textContent.trim(),
                  statusSuccess: status?.classList.contains('is-success'),
                } : null;
            """,
            timeout=10,
            label="course code copy feedback",
        )
        if (
            copied.get("value") != code_state.get("code")
            or copied.get("label") != "已复制"
            or "课程码已复制" not in str(copied.get("status") or "")
            or not copied.get("statusSuccess")
        ):
            raise AssertionError(f"course code copy feedback is incomplete: {copied}")
        pass_("copying the course code writes the full value and gives green success feedback")
        driver.screenshot(output_dir / "course-code-dialog-1440.png")
        driver.execute("document.querySelector('#cs-course-code-dialog [data-course-code-close]').click(); return true;")
        focus_returned = driver.wait_for(
            "return document.activeElement?.id === 'cs-course-code-trigger';",
            timeout=10,
            label="course code focus return",
        )
        if not focus_returned:
            raise AssertionError("course code dialog did not restore focus")

        if draft_fixture:
            draft_id = str(draft_fixture.get("draftId") or draft_fixture.get("id") or "")
            preview_target = (
                f"{target}&tab=questions&selectedId={urllib.parse.quote(draft_id, safe='')}"
            )
            driver.navigate(preview_target)
            wait_for_course(driver)
            detail = driver.wait_for(
                """
                const drawer = document.getElementById('cs-question-detail-drawer');
                const panel = drawer?.querySelector('[role="dialog"]');
                const preview = drawer?.querySelector('[data-question-action="preview"]');
                if (!drawer || drawer.hidden || !panel || !preview) return null;
                return {
                  role: panel.getAttribute('role'),
                  modal: panel.getAttribute('aria-modal'),
                  focusInside: panel.contains(document.activeElement),
                  backgroundInert: document.getElementById('cs-course-detail-view')?.children
                    ? Array.from(document.getElementById('cs-course-detail-view').children).filter(node => node !== drawer).every(node => node.inert)
                    : false,
                };
                """,
                timeout=45,
                label="question draft detail drawer",
            )
            if (
                detail.get("role") != "dialog"
                or detail.get("modal") != "true"
                or not detail.get("focusInside")
                or not detail.get("backgroundInert")
            ):
                raise AssertionError(f"question detail drawer is not focus-safe: {detail}")
            driver.execute(
                "document.querySelector('[data-question-action=\"preview\"]').click(); return true;"
            )
            preview = driver.wait_for(
                """
                const drawer = document.getElementById('cs-question-detail-drawer');
                const panel = drawer?.querySelector('[role="dialog"]');
                const body = document.getElementById('cs-question-drawer-body');
                const back = body?.querySelector('[data-question-action="back"]');
                if (!body?.querySelector('.cs-question-student-preview') || !back) return null;
                return {
                  banner: body.querySelector('.cs-question-preview-banner strong')?.textContent.trim(),
                  sections: Array.from(body.querySelectorAll('.cs-question-student-preview > section h3')).map(node => node.textContent.trim()),
                  teacherActions: body.querySelectorAll('[data-question-action="publish"], [data-question-action="delete"], [data-question-action="revise"], [data-question-action="validate"]').length,
                  teacherChecks: body.querySelectorAll('.cs-question-checks').length,
                  focusInside: panel.contains(document.activeElement),
                  focusAction: document.activeElement?.dataset?.questionAction || '',
                };
                """,
                timeout=45,
                label="student-safe question preview",
            )
            if (
                preview.get("banner") != "学生视角预览"
                or preview.get("sections") != ["任务说明", "学习目标"]
                or int(preview.get("teacherActions") or 0) != 0
                or int(preview.get("teacherChecks") or 0) != 0
                or not preview.get("focusInside")
                or preview.get("focusAction") != "back"
            ):
                raise AssertionError(f"question preview mixed teacher-private UI into student view: {preview}")
            driver.execute(
                "document.querySelector('[data-question-action=\"back\"]').click(); return true;"
            )
            returned = driver.wait_for(
                """
                const preview = document.querySelector('[data-question-action="preview"]');
                return preview && document.activeElement === preview;
                """,
                timeout=45,
                label="return from question student preview",
            )
            if not returned:
                raise AssertionError("student preview did not return focus to the teacher detail action")
            driver.execute(
                "document.querySelector('#cs-question-detail-drawer [data-question-drawer-close]').click(); return true;"
            )
            pass_("question detail and student-safe preview share one focus-safe drawer without teacher-private controls")
        else:
            pass_("deployment has no question draft; browser preview behavior remains covered by the disposable API fixture")

        for tab in ("courseware", "questions", "demos", "students"):
            tab_state = driver.execute(
                f"""
                document.querySelector('[data-cs-tab="{tab}"]').click();
                const panel = document.querySelector('[data-cs-panel="{tab}"]');
                return {{
                  visible: !!panel && !panel.hidden,
                  primaryCount: panel ? Array.from(panel.querySelectorAll('.hub-button.is-primary')).filter(node => !node.closest('[hidden]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden').length : -1,
                  urlTab: new URL(location.href).searchParams.get('tab'),
                }};
                """
            )
            if not tab_state.get("visible") or tab_state.get("urlTab") != tab or int(tab_state.get("primaryCount") or 0) > 1:
                raise AssertionError(f"tab {tab} violates shell or primary-action contract: {tab_state}")
        pass_("all five workspaces share one shell, URL state and at most one primary create action")

        legacy = f"{flow.BASE_URL}/dojo/{encoded}/studio?draft=ui-contract"
        driver.navigate(legacy)
        canonical = driver.wait_for(
            """
            const url = new URL(location.href);
            return url.pathname === '/teacher/courses' && url.searchParams.get('tab') === 'questions'
              ? {dojo: url.searchParams.get('dojo'), selectedId: url.searchParams.get('selectedId')}
              : null;
            """,
            timeout=30,
            label="canonical question deep link",
        )
        if canonical.get("dojo") != reference or canonical.get("selectedId") != "ui-contract":
            raise AssertionError(f"legacy deep link lost state: {canonical}")
        pass_("legacy question route reaches the canonical shell without losing object state")

        for width, height in ((390, 844), (320, 780)):
            driver.set_window_size(width, height)
            driver.navigate(f"{target}&tab=questions")
            wait_for_course(driver)
            if question_items:
                driver.wait_for(
                    """
                    document.querySelectorAll('[data-workspace-chapter="questions"]').forEach(toggle => {
                      if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
                    });
                    return document.querySelector('.cs-question-unified-row .cs-managed-main p');
                    """,
                    timeout=45,
                    label=f"{width}px question list",
                )
            mobile = driver.execute(
                """
                const tabs = document.querySelector('.course-hub-tabs');
                const trigger = document.getElementById('cs-course-code-trigger');
                document.querySelectorAll('[data-workspace-chapter="questions"]').forEach(toggle => {
                  if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
                });
                const summary = document.querySelector('.cs-question-unified-row .cs-managed-main p');
                const summaryStyle = summary ? getComputedStyle(summary) : null;
                return {
                  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                  tabsScrollable: tabs.scrollWidth >= tabs.clientWidth,
                  tabHeight: Math.min(...Array.from(tabs.querySelectorAll('button')).map(node => node.getBoundingClientRect().height)),
                  codeVisible: trigger.getBoundingClientRect().right <= innerWidth && trigger.getBoundingClientRect().left >= 0,
                  questionSummaryClamp: summaryStyle ? summaryStyle.webkitLineClamp : null,
                  questionSummaryHeight: summary ? summary.getBoundingClientRect().height : null,
                  questionSummaryLineHeight: summaryStyle ? parseFloat(summaryStyle.lineHeight) : null,
                };
                """
            )
            if float(mobile.get("overflow") or 0) > 1 or float(mobile.get("tabHeight") or 0) < 44 or not mobile.get("codeVisible"):
                raise AssertionError(f"{width}px mobile layout is clipped: {mobile}")
            if question_items and (
                str(mobile.get("questionSummaryClamp") or "") != "2"
                or float(mobile.get("questionSummaryHeight") or 0)
                > float(mobile.get("questionSummaryLineHeight") or 0) * 2 + 2
            ):
                raise AssertionError(
                    f"{width}px question summary is not clamped to two readable lines: {mobile}"
                )
            driver.screenshot(output_dir / f"course-center-{width}.png")
            pass_(f"{width}px layout keeps the course context, course code and scrollable workspaces usable")

        driver.set_window_size(390, 844)
        driver.navigate(f"{target}&tab=questions")
        wait_for_course(driver)
        driver.execute("document.querySelector('[data-filter-trigger=\"questions\"]').click(); return true;")
        filter_drawer = driver.wait_for(
            """
            const drawer = document.querySelector('[data-filter-drawer="questions"].is-mobile-open');
            const backdrop = document.getElementById('cs-filter-backdrop');
            if (!drawer || !backdrop || backdrop.hidden) return null;
            const rect = drawer.getBoundingClientRect();
            if (!drawer.contains(document.activeElement)) return null;
            return {
              role: drawer.getAttribute('role'),
              modal: drawer.getAttribute('aria-modal'),
              focusInside: drawer.contains(document.activeElement),
              backgroundInert: document.querySelector('.course-hub-header')?.hasAttribute('inert'),
              bottom: rect.bottom,
              width: rect.width,
              viewportWidth: innerWidth,
              viewportHeight: innerHeight,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
            """,
            timeout=15,
            label="mobile question filter drawer",
        )
        if (
            filter_drawer.get("role") != "dialog"
            or filter_drawer.get("modal") != "true"
            or not filter_drawer.get("focusInside")
            or not filter_drawer.get("backgroundInert")
            or abs(float(filter_drawer.get("bottom") or 0) - float(filter_drawer.get("viewportHeight") or 0)) > 1
            or float(filter_drawer.get("width") or 0) < float(filter_drawer.get("viewportWidth") or 0) - 1
            or float(filter_drawer.get("overflow") or 0) > 1
        ):
            raise AssertionError(f"mobile filter drawer is incomplete: {filter_drawer}")
        driver.screenshot(output_dir / "question-filter-drawer-390.png")
        driver.execute("document.querySelector('[data-filter-drawer=\"questions\"] [data-filter-close]').click(); return true;")
        filter_focus_returned = driver.wait_for(
            "return document.activeElement?.dataset?.filterTrigger === 'questions';",
            timeout=10,
            label="mobile filter focus return",
        )
        if not filter_focus_returned:
            raise AssertionError("mobile filter drawer did not restore focus to its trigger")
        pass_("mobile filters open as bottom drawers, trap focus and restore the trigger")

        driver.execute("document.querySelector('[data-cs-tab=\"demos\"]').click(); document.getElementById('cs-demo-create').click(); return true;")
        modal = driver.wait_for(
            """
            const dialog = document.querySelector('#cs-create-dialog [role="dialog"]');
            if (!dialog || dialog.closest('[hidden]')) return null;
            const rect = dialog.getBoundingClientRect();
            return {
              focusInside: dialog.contains(document.activeElement),
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              types: Array.from(document.querySelectorAll('#cs-create-options strong')).map(node => node.textContent.trim()),
              facts: document.querySelectorAll('#cs-create-options li').length,
            };
            """,
            timeout=15,
            label="mobile demo type dialog",
        )
        if (
            not modal.get("focusInside")
            or float(modal.get("top") or -1) < 0
            or float(modal.get("bottom") or 99999) > 844
            or modal.get("types") != ["交互模拟演示", "授权攻防演示"]
            or int(modal.get("facts") or 0) < 10
        ):
            raise AssertionError(f"mobile demo selector is incomplete: {modal}")
        pass_("demo type selector explains both modes and remains focus-safe on mobile")

        driver.request(
            "POST",
            f"/session/{driver.session_id}/goog/cdp/execute",
            {
                "cmd": "Emulation.setEmulatedMedia",
                "params": {
                    "features": [
                        {"name": "prefers-reduced-motion", "value": "reduce"}
                    ]
                },
            },
        )
        reduced = driver.execute("return matchMedia('(prefers-reduced-motion: reduce)').matches;")
        if not reduced:
            raise AssertionError("browser did not enter reduced-motion mode")
        driver.execute("document.querySelector('#cs-create-dialog [data-create-close]').click(); return true;")
        driver.set_window_size(1440, 1000)
        driver.navigate(target)
        wait_for_course(driver)
        zoomed = driver.execute(
            """
            document.documentElement.style.zoom = '2';
            const trigger = document.getElementById('cs-course-code-trigger').getBoundingClientRect();
            return {visible: trigger.left >= 0 && trigger.right <= innerWidth, width: trigger.width};
            """
        )
        driver.screenshot(output_dir / "course-center-200-percent.png")
        if not zoomed.get("visible"):
            raise AssertionError(f"course code action is clipped at 200% zoom: {zoomed}")
        pass_("reduced-motion and 200% zoom modes preserve the primary course controls")

        severe = [
            item
            for item in driver.browser_logs()
            if str(item.get("level") or "").upper() == "SEVERE"
            and not (
                "/events" in str(item.get("message") or "")
                and "403" in str(item.get("message") or "")
            )
        ]
        if severe:
            raise AssertionError(f"browser console contains severe errors: {severe[-5:]}")
        pass_(f"browser evidence saved under {output_dir}")
        return 0
    finally:
        if driver is not None:
            driver.close()


if __name__ == "__main__":
    raise SystemExit(main())
