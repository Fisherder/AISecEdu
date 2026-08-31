#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import json
import os
import pathlib
import secrets
import sys
import time
import urllib.parse


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
AGENT_VERIFIER_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
UI_VERIFIER_PATH = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def form_values(driver, values):
    payload = json.dumps(values, ensure_ascii=False)
    return driver.execute(
        f"""
        const values = {payload};
        for (const [selector, value] of Object.entries(values)) {{
          const node = document.querySelector(selector);
          if (!node) return `missing ${{selector}}`;
          node.value = value;
          node.dispatchEvent(new Event('input', {{bubbles: true}}));
          node.dispatchEvent(new Event('change', {{bubbles: true}}));
        }}
        return true;
        """
    )


def install_json_request_probe(driver):
    return driver.execute(
        """
        window.__manualJsonRequests = [];
        const owner = window.CTFd && typeof window.CTFd.fetch === 'function' ? window.CTFd : window;
        const nativeFetch = owner.fetch.bind(owner);
        owner.fetch = async function(input, init = {}) {
          let body = null;
          try { body = typeof init.body === 'string' ? JSON.parse(init.body) : null; }
          catch (error) { body = null; }
          window.__manualJsonRequests.push({
            url: String(input),
            method: String(init.method || 'GET').toUpperCase(),
            body,
          });
          return nativeFetch(input, init);
        };
        return true;
        """
    )


def main():
    flow = load_module("teacher_agent_flow_manual", AGENT_VERIFIER_PATH)
    ui = load_module("teacher_agent_ui_manual", UI_VERIFIER_PATH)
    username, password = flow.admin_credentials()
    client = flow.authenticate(username, password)
    driver = None
    course_reference = None
    suffix = secrets.token_hex(4)
    quick = os.getenv("AISECEDU_MANUAL_CREATE_QUICK") == "1"
    try:
        driver = ui.ChromeDriver()
        driver.navigate(flow.BASE_URL)
        for cookie in client.cookies:
            driver.add_cookie(cookie.name, cookie.value)

        driver.navigate(f"{flow.BASE_URL}/teacher/courses")
        course_link = driver.wait_for(
            """
            const link = document.querySelector('.course-list-header a');
            return document.readyState === 'complete' && link ? new URL(link.href).pathname : null;
            """,
            timeout=45,
            label="manual course entry",
        )
        if course_link != "/teacher/courses/new":
            raise RuntimeError(f"course entry points to {course_link}")
        print("PASS  course list points to the manual creation page", flush=True)

        driver.navigate(f"{flow.BASE_URL}/teacher/courses/new")
        driver.wait_for(
            "return document.readyState === 'complete' && document.getElementById('teacher-manual-create')?.dataset.manualReady === 'true';",
            timeout=45,
            label="manual course form",
        )
        course_ui = driver.execute(
            """
            const title = document.querySelector('.manual-create-header h1');
            const input = document.getElementById('manual-name');
            const summary = document.querySelector('.manual-summary-card');
            const actions = document.getElementById('manual-form-actions');
            return {
              title: title?.textContent.trim(),
              titleFont: parseFloat(getComputedStyle(title).fontSize),
              inputFont: parseFloat(getComputedStyle(input).fontSize),
              summaryPosition: getComputedStyle(summary).position,
              actionPosition: getComputedStyle(actions).position,
              floatingAgent: !!document.getElementById('manual-agent-shortcut'),
              fieldAiLinks: document.querySelectorAll('[data-ai-field]').length,
              exposedIdentifierField: !!document.querySelector('#manual-id, #manual-initial-id'),
              exposedIdentifierCopy: Array.from(document.querySelectorAll('label, small, p'))
                .some(node => node.textContent.includes('课程标识') || node.textContent.includes('章节标识') || node.textContent.includes('题目标识')),
            };
            """
        )
        if (
            course_ui.get("title") != "新建课程"
            or float(course_ui.get("titleFont") or 0) < 32
            or float(course_ui.get("inputFont") or 0) < 16
            or course_ui.get("summaryPosition") != "sticky"
            or course_ui.get("actionPosition") == "sticky"
            or course_ui.get("floatingAgent")
            or int(course_ui.get("fieldAiLinks") or 0) != 0
            or course_ui.get("exposedIdentifierField")
            or course_ui.get("exposedIdentifierCopy")
        ):
            raise RuntimeError(f"manual course UI is incomplete: {course_ui}")
        print("PASS  manual course form has large type and no redundant floating AI entry", flush=True)
        install_json_request_probe(driver)
        filled = form_values(
            driver,
            {
                "#manual-name": f"手动页面验收课程 {suffix}",
                "#manual-description": "通过真实浏览器验证课程、章节和实践题手动创建流程。",
            },
        )
        if filled is not True:
            raise RuntimeError(str(filled))
        driver.execute(
            "document.getElementById('manual-initial-enabled').click(); return true;"
        )
        driver.execute("document.getElementById('manual-primary-submit').click(); return true;")
        initial_error = driver.wait_for(
            "return document.getElementById('manual-initial-name').validationMessage || null;",
            timeout=10,
            label="initial chapter validation",
        )
        if "第一章名称" not in initial_error:
            raise RuntimeError(f"unexpected initial chapter validation: {initial_error}")
        filled = form_values(
            driver,
            {
                "#manual-initial-name": "课程导论",
                "#manual-initial-description": "介绍课程目标、学习路径和实践环境。",
            },
        )
        if filled is not True:
            raise RuntimeError(str(filled))
        driver.execute("document.getElementById('manual-primary-submit').click(); return true;")
        course_href = driver.wait_for(
            """
            const title = document.getElementById('manual-result-title');
            const link = document.querySelector('#manual-result-actions a[href*="/teacher/courses?dojo="]');
            return title?.textContent.includes('已创建') && link ? link.href : null;
            """,
            timeout=45,
            label="course creation result",
        )
        course_reference = urllib.parse.parse_qs(
            urllib.parse.urlsplit(course_href).query
        )["dojo"][0]
        course_payload = driver.execute(
            "return window.__manualJsonRequests.find(item => item.method === 'POST' && item.url.endsWith('/teaching/courses'))?.body || null;"
        )
        if (
            not course_payload
            or "slug" in course_payload
            or "initialModuleId" in course_payload
            or "~" not in course_reference
        ):
            raise RuntimeError(
                f"course identifiers were not generated automatically: {course_payload} {course_reference}"
            )
        print("PASS  browser created a course through the manual form", flush=True)
        print("PASS  course and chapter identifiers stay hidden and are generated automatically", flush=True)
        print("PASS  corrected form fields can be submitted after a validation error", flush=True)
        if quick:
            return 0

        driver.navigate(
            f"{flow.BASE_URL}/teacher/courses/{urllib.parse.quote(course_reference, safe='')}/chapters/new"
        )
        driver.wait_for(
            "return document.body.dataset.createKind === undefined && document.getElementById('teacher-manual-create')?.dataset.createKind === 'chapter';",
            timeout=45,
            label="manual chapter form",
        )
        chapter_ui = driver.execute(
            """
            const root = document.getElementById('teacher-manual-create');
            return {
              course: root?.dataset.dojoId || '',
              sections: document.querySelectorAll('.manual-form-section').length,
              sectionNavigation: !!document.querySelector('.manual-section-nav'),
              floatingAgent: !!document.getElementById('manual-agent-shortcut'),
              fieldAiLinks: document.querySelectorAll('[data-ai-field]').length,
              primaryLabel: document.getElementById('manual-primary-submit')?.textContent.trim() || '',
            };
            """
        )
        if (
            chapter_ui.get("course") != course_reference
            or int(chapter_ui.get("sections") or 0) != 1
            or chapter_ui.get("sectionNavigation")
            or chapter_ui.get("floatingAgent")
            or int(chapter_ui.get("fieldAiLinks") or 0) != 0
            or chapter_ui.get("primaryLabel") != "创建章节"
        ):
            raise RuntimeError(f"chapter form is not a compact contextual form: {chapter_ui}")
        install_json_request_probe(driver)
        filled = form_values(
            driver,
            {
                "#manual-name": "浏览器安全基础",
                "#manual-description": "理解浏览器安全边界、输入处理和基础防护方法。",
            },
        )
        if filled is not True:
            raise RuntimeError(str(filled))
        driver.execute("document.getElementById('manual-primary-submit').click(); return true;")
        practice_href = driver.wait_for(
            """
            const title = document.getElementById('manual-result-title');
            const link = document.querySelector('#manual-result-actions a[href*="/practices/new"]');
            return title?.textContent.includes('已创建') && link ? link.href : null;
            """,
            timeout=45,
            label="chapter creation result",
        )
        practice_url = urllib.parse.urlsplit(practice_href)
        practice_query = urllib.parse.parse_qs(practice_url.query)
        selected_module_id = practice_query.get("module", [""])[0]
        chapter_payload = driver.execute(
            "return window.__manualJsonRequests.find(item => item.method === 'POST' && item.url.includes('/units'))?.body || null;"
        )
        if not selected_module_id or not chapter_payload or "id" in chapter_payload:
            raise RuntimeError(f"chapter result omitted its generated identifier: {practice_href}")
        print("PASS  browser created a chapter through the manual form", flush=True)

        driver.navigate(practice_href)
        driver.wait_for(
            "return document.getElementById('teacher-manual-create')?.dataset.createKind === 'practice';",
            timeout=45,
            label="manual practice form",
        )
        practice_ai = driver.execute(
            """
            const links = Array.from(document.querySelectorAll('[data-ai-field]')).map(link => {
              const url = new URL(link.href);
              return {
                field: link.dataset.aiField,
                dojo: url.searchParams.get('dojo'),
                module: url.searchParams.get('moduleIndex'),
                objectType: url.searchParams.get('objectType'),
                prompt: url.searchParams.get('prompt'),
                target: link.target,
              };
            });
            return {
              links,
              floatingAgent: !!document.getElementById('manual-agent-shortcut'),
              sectionNavigation: document.querySelectorAll('.manual-section-nav a').length,
              actionPosition: getComputedStyle(document.getElementById('manual-form-actions')).position,
            };
            """
        )
        if (
            practice_ai.get("floatingAgent")
            or int(practice_ai.get("sectionNavigation") or 0) != 3
            or practice_ai.get("actionPosition") != "sticky"
            or sorted(link.get("field") for link in practice_ai.get("links", []))
            != ["description", "objectives", "title"]
            or any(
                link.get("dojo") != course_reference
                or link.get("module") != "1"
                or link.get("objectType") != "practice"
                or link.get("target") != "_blank"
                or "浏览器安全基础" not in str(link.get("prompt"))
                for link in practice_ai.get("links", [])
            )
        ):
            raise RuntimeError(f"practice field-level AI context is incomplete: {practice_ai}")
        driver.set_window_size(390, 844)
        mobile_practice = driver.wait_for(
            """
            const root = document.getElementById('teacher-manual-create');
            const actions = document.getElementById('manual-form-actions');
            const navigation = document.querySelector('.manual-section-nav');
            const targets = Array.from(document.querySelectorAll(
              '.manual-section-nav a, .manual-field-ai, #manual-form-actions .hub-button'
            ));
            if (!root || !actions || !navigation || targets.length < 8) return null;
            return {
              overflow: document.documentElement.scrollWidth - innerWidth,
              rootWidth: root.getBoundingClientRect().width,
              viewport: innerWidth,
              actionsPosition: getComputedStyle(actions).position,
              navigationPosition: getComputedStyle(navigation).position,
              minTargetHeight: Math.min(...targets.map(node => node.getBoundingClientRect().height)),
              actionWidth: actions.getBoundingClientRect().width,
            };
            """,
            timeout=20,
            label="mobile manual practice form",
        )
        if (
            float(mobile_practice.get("overflow") or 0) > 2
            or float(mobile_practice.get("rootWidth") or 0)
            > float(mobile_practice.get("viewport") or 0) + 2
            or float(mobile_practice.get("actionWidth") or 0)
            > float(mobile_practice.get("viewport") or 0) + 2
            or mobile_practice.get("actionsPosition") != "sticky"
            or mobile_practice.get("navigationPosition") != "sticky"
            or float(mobile_practice.get("minTargetHeight") or 0) < 44
        ):
            raise RuntimeError(
                f"mobile manual practice form is clipped or hard to operate: {mobile_practice}"
            )
        driver.set_window_size(1440, 1000)
        print(
            "PASS  long manual form keeps sticky actions, section navigation and 44px touch targets on mobile",
            flush=True,
        )
        practice_ui = driver.execute(
            """
            return {
              identifierField: !!document.querySelector('#manual-id'),
              identifierCopy: Array.from(document.querySelectorAll('label, small, p'))
                .some(node => node.textContent.includes('题目标识')),
            };
            """
        )
        if practice_ui.get("identifierField") or practice_ui.get("identifierCopy"):
            raise RuntimeError(f"practice identifier leaked into the teacher form: {practice_ui}")
        install_json_request_probe(driver)
        filled = form_values(
            driver,
            {
                "#manual-name": "输入校验实践",
                "#manual-description": "在隔离终端运行 python3 /challenge/task.py，观察程序计算出的摘要，并将终端输出作为唯一答案提交。",
                "#manual-objectives": "运行给定程序\n理解摘要计算\n完成确定性结果提交",
                "#manual-tags": "输入校验, 摘要, 入门",
                "#manual-expected-answer": "4ac824dc1bb0",
                "#manual-teacher-solution": "运行 python3 /challenge/task.py，取得验证答案后执行 /challenge/check <答案> 获取动态 Flag。",
                "#manual-starter-path": "task.py",
                "#manual-starter-content": "import hashlib\n\nmessage = b\"xuanjia-input-validation\"\nprint(hashlib.sha256(message).hexdigest()[:12])\n",
            },
        )
        if filled is not True:
            raise RuntimeError(str(filled))
        autosave = driver.wait_for(
            """
            const state = document.getElementById('manual-autosave-state');
            const root = document.getElementById('teacher-manual-create');
            const key = `aisecedu:manual-create:practice:${root.dataset.dojoId}`;
            let snapshot = null;
            try { snapshot = JSON.parse(localStorage.getItem(key) || 'null'); }
            catch (error) { return null; }
            if (state?.dataset.state !== 'saved' || !snapshot?.values) return null;
            const sensitive = ['manual-expected-answer', 'manual-teacher-solution', 'manual-starter-content'];
            return {
              label: state.textContent.trim(),
              name: snapshot.values['manual-name'] || '',
              description: snapshot.values['manual-description'] || '',
              objectives: snapshot.values['manual-objectives'] || '',
              tags: snapshot.values['manual-tags'] || '',
              cachedSensitiveFields: sensitive.filter(id => Object.hasOwn(snapshot.values, id)),
            };
            """,
            timeout=10,
            label="manual practice autosave",
        )
        if (
            "已自动保存" not in str(autosave.get("label"))
            or autosave.get("name") != "输入校验实践"
            or not autosave.get("description")
            or not autosave.get("objectives")
            or autosave.get("tags") != "输入校验, 摘要, 入门"
            or autosave.get("cachedSensitiveFields")
        ):
            raise RuntimeError(f"manual autosave is incomplete or cached secrets: {autosave}")
        leave_guard = driver.execute(
            """
            const event = new Event('beforeunload', {cancelable: true});
            window.dispatchEvent(event);
            return event.defaultPrevented;
            """
        )
        if not leave_guard:
            raise RuntimeError("manual practice form did not protect unsaved changes")
        original_handle = driver.request(
            "GET", f"/session/{driver.session_id}/window"
        )
        driver.execute(
            "window.open(location.href, 'manual-autosave-restore'); return true;"
        )
        restore_handle = None
        for _ in range(30):
            handles = driver.request(
                "GET", f"/session/{driver.session_id}/window/handles"
            )
            restore_handle = next(
                (handle for handle in handles if handle != original_handle), None
            )
            if restore_handle:
                break
            time.sleep(0.2)
        if not restore_handle:
            raise RuntimeError("manual autosave restore window did not open")
        driver.request(
            "POST",
            f"/session/{driver.session_id}/window",
            {"handle": restore_handle},
        )
        restored = driver.wait_for(
            """
            const state = document.getElementById('manual-autosave-state');
            if (!document.getElementById('teacher-manual-create')?.dataset.manualReady
              || !state?.textContent.includes('已恢复')) return null;
            return {
              name: document.getElementById('manual-name')?.value || '',
              description: document.getElementById('manual-description')?.value || '',
              objectives: document.getElementById('manual-objectives')?.value || '',
              tags: document.getElementById('manual-tags')?.value || '',
              answer: document.getElementById('manual-expected-answer')?.value || '',
              solution: document.getElementById('manual-teacher-solution')?.value || '',
              starterContent: document.getElementById('manual-starter-content')?.value || '',
            };
            """,
            timeout=20,
            label="manual practice autosave restoration",
        )
        if (
            restored.get("name") != "输入校验实践"
            or not restored.get("description")
            or not restored.get("objectives")
            or restored.get("tags") != "输入校验, 摘要, 入门"
            or restored.get("answer")
            or restored.get("solution")
            or restored.get("starterContent")
        ):
            raise RuntimeError(
                f"manual autosave did not safely restore non-sensitive fields: {restored}"
            )
        driver.request(
            "POST",
            f"/session/{driver.session_id}/window",
            {"handle": original_handle},
        )
        print(
            "PASS  manual practice autosaves and restores non-sensitive fields while protecting secrets and unsaved changes",
            flush=True,
        )
        driver.execute(
            "document.querySelector('button[value=\"draft\"]').click(); return true;"
        )
        draft_result = driver.wait_for(
            """
            const title = document.getElementById('manual-result-title');
            const action = document.querySelector('[data-result-action="validate"]');
            return title?.textContent.includes('草稿已保存') && action ? title.textContent.trim() : null;
            """,
            timeout=45,
            label="practice draft result",
        )
        if draft_result != "实践题草稿已保存":
            raise RuntimeError(f"unexpected practice result: {draft_result}")
        practice_payload = driver.execute(
            "return window.__manualJsonRequests.find(item => item.method === 'POST' && item.url.includes('/manual-drafts'))?.body || null;"
        )
        if not practice_payload or "id" in practice_payload:
            raise RuntimeError(
                f"practice submission exposed a teacher-controlled identifier: {practice_payload}"
            )
        driver.execute(
            "document.querySelector('[data-result-action=\"validate\"]').click(); return true;"
        )
        validation_result = driver.wait_for(
            """
            const title = document.getElementById('manual-result-title');
            if (title?.textContent.includes('暂时不能发布')) return {status: 'failed', text: title.textContent.trim()};
            const publish = document.querySelector('[data-result-action="publish"]');
            return title?.textContent.includes('已准备好') && publish
              ? {status: 'ready', text: title.textContent.trim()}
              : null;
            """,
            timeout=1200,
            label="manual practice validation",
        )
        if validation_result.get("status") != "ready":
            detail = driver.execute(
                "return document.getElementById('manual-result-copy')?.textContent.trim();"
            )
            raise RuntimeError(f"manual practice validation failed: {detail}")
        print("PASS  manual practice passed the publish safety check", flush=True)
        driver.execute(
            "document.querySelector('[data-result-action=\"publish\"]').click(); return true;"
        )
        published_href = driver.wait_for(
            """
            const title = document.getElementById('manual-result-title');
            const link = document.querySelector('#manual-result-actions a.is-prominent');
            return title?.textContent.includes('发布成功') && link ? link.href : null;
            """,
            timeout=180,
            label="manual practice publication",
        )
        published_path = urllib.parse.unquote(urllib.parse.urlsplit(published_href).path)
        expected_prefix = f"/{course_reference}/{selected_module_id}/"
        challenge_id = published_path.removeprefix(expected_prefix)
        if (
            not published_path.startswith(expected_prefix)
            or not challenge_id
            or "/" in challenge_id
            or challenge_id == "input-validation"
        ):
            raise RuntimeError(f"published practice has an invalid destination: {published_href}")
        print("PASS  browser published the practice and received its exact destination", flush=True)
        print("PASS  practice identifier is hidden and generated automatically", flush=True)

        severe = [
            entry
            for entry in driver.browser_logs()
            if str(entry.get("level", "")).upper() == "SEVERE"
            and "favicon" not in str(entry.get("message", "")).lower()
            and not (
                "/events" in str(entry.get("message", ""))
                and "403" in str(entry.get("message", ""))
            )
        ]
        if severe:
            raise RuntimeError(f"browser console errors: {severe[-5:]}")
        print("PASS  manual course entry opens a complete large-type form", flush=True)
        print("PASS  browser created a course and chapter through manual pages", flush=True)
        print("PASS  browser saved a manual CTF practice draft", flush=True)
        print("PASS  practice field-level AI links carry the correct course and chapter context", flush=True)
        return 0
    except Exception as error:
        driver_status = driver.process.poll() if driver is not None else None
        print(f"FAIL  {error}; chromedriver={driver_status}", flush=True)
        return 1
    finally:
        if driver is not None:
            driver.close()
        if course_reference:
            try:
                for attempt in range(61):
                    response = client.delete(
                        flow.api_url(f"teaching/courses/{course_reference}"),
                        json={},
                        timeout=120,
                    )
                    if response.status_code == 200:
                        flow.unwrap(response)
                        break
                    if response.status_code != 409 or attempt == 60:
                        flow.unwrap(response)
                    time.sleep(2)
            except Exception as error:
                print(f"WARN  manual UI fixture cleanup failed: {error}", flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
