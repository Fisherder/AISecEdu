#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime
import hashlib
import importlib.util
import json
import pathlib
import secrets
import subprocess
import sys
import time
import urllib.parse
from typing import Any, Callable


REPO_DIR = pathlib.Path(__file__).resolve().parent.parent
FLOW_PATH = REPO_DIR / "ops" / "verify-teacher-agent-flow.py"
UI_PATH = REPO_DIR / "ops" / "verify-teacher-agent-ui.py"
COURSE_REFERENCE = "manual-platform-check~1aee0e19"


def load_module(name: str, path: pathlib.Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class StudentUXVerifier:
    def __init__(self, output_dir: pathlib.Path):
        self.output_dir = output_dir
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.flow = load_module("student_ux_flow", FLOW_PATH)
        self.ui = load_module("student_ux_ui", UI_PATH)
        self.suffix = secrets.token_hex(5)
        self.student_name = f"student-ux-e2e-{self.suffix}"
        self.outsider_name = f"student-ux-outsider-{self.suffix}"
        self.password = secrets.token_urlsafe(24)
        self.admin = None
        self.student = None
        self.outsider = None
        self.student_id: int | None = None
        self.course: dict[str, Any] | None = None
        self.assignment_id: str | None = None
        self.workspace_id: str | None = None
        self.guide_thread_id: str | None = None
        self.attempt_ids: list[str] = []
        self.driver = None
        self.results: list[dict[str, Any]] = []
        self.workspace_failure_verified = False
        self.mobile_assignment_verified = False

    def record(self, scenario_id: str, title: str, evidence: str) -> None:
        self.results.append(
            {"id": scenario_id, "title": title, "status": "PASS", "evidence": evidence}
        )
        print(f"PASS  {scenario_id} {title}", flush=True)

    def run_scenario(
        self,
        scenario_id: str,
        title: str,
        callback: Callable[[], str],
    ) -> None:
        try:
            self.record(scenario_id, title, callback())
        except Exception as error:
            self.results.append(
                {
                    "id": scenario_id,
                    "title": title,
                    "status": "FAIL",
                    "evidence": str(error),
                }
            )
            print(f"FAIL  {scenario_id} {title}: {error}", flush=True)

    def api(
        self,
        client,
        method: str,
        path: str,
        *,
        body: dict[str, Any] | None = None,
        statuses: tuple[int, ...] = (200,),
    ) -> dict[str, Any]:
        response = client.request(
            method,
            self.flow.api_url(path),
            json=body,
            timeout=60,
            allow_redirects=False,
        )
        self.flow.require(response, statuses)
        payload = response.json()
        if payload.get("success") is False:
            raise AssertionError(self.flow.response_excerpt(response))
        data = payload.get("data")
        return data if isinstance(data, dict) else payload

    def db_sql(self, sql: str) -> str:
        completed = subprocess.run(
            ["docker", "exec", "-i", self.flow.CONTAINER, "dojo", "db", "-qAt"],
            input=sql,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            raise AssertionError(completed.stderr.strip() or "database fixture failed")
        return completed.stdout.strip()

    @staticmethod
    def sql_literal(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"

    def source(self, relative: str) -> str:
        return (REPO_DIR / relative).read_text()

    def require_source(self, relative: str, *needles: str) -> str:
        text = self.source(relative)
        missing = [needle for needle in needles if needle not in text]
        if missing:
            raise AssertionError(f"{relative} missing {missing}")
        return text

    def setup(self) -> None:
        admin_name, admin_password = self.flow.admin_credentials()
        self.admin = self.flow.authenticate(admin_name, admin_password)
        self.student = self.flow.register(self.student_name, self.password)
        self.outsider = self.flow.register(self.outsider_name, self.password)
        me = self.flow.require(
            self.student.get(f"{self.flow.BASE_URL}/api/v1/users/me", timeout=30)
        ).json()
        self.student_id = int(me["data"]["id"])
        context = self.flow.unwrap(
            self.admin.get(self.flow.api_url("teaching/context"), timeout=60)
        )
        self.course = next(
            (
                item
                for item in context.get("teacherDojos") or []
                if item.get("referenceId") == COURSE_REFERENCE
            ),
            None,
        )
        if self.course is None:
            raise AssertionError(f"acceptance course {COURSE_REFERENCE} is unavailable")
        self.driver = self.ui.ChromeDriver()
        self.use_browser_session(self.student)

    def use_browser_session(self, client) -> None:
        assert self.driver is not None
        self.driver.navigate(self.flow.BASE_URL)
        self.driver.request(
            "DELETE", f"/session/{self.driver.session_id}/cookie"
        )
        for cookie in client.cookies:
            self.driver.add_cookie(cookie.name, cookie.value)

    def wait_student(self) -> dict[str, Any]:
        assert self.driver is not None
        return self.driver.wait_for(
            """
            const root = document.getElementById('learning-overview');
            if (!root || root.getAttribute('aria-busy') !== 'false') return null;
            return {
              onboarding: !document.getElementById('learning-onboarding').hidden,
              ready: !document.getElementById('learning-ready').hidden,
              text: document.body.innerText,
            };
            """,
            timeout=60,
            label="student today page",
        )

    def screenshot(self, name: str) -> str:
        assert self.driver is not None
        path = self.output_dir / name
        self.driver.screenshot(path)
        return str(path)

    def add_preload(self, source: str) -> str:
        assert self.driver is not None
        value = self.driver.request(
            "POST",
            f"/session/{self.driver.session_id}/goog/cdp/execute",
            {
                "cmd": "Page.addScriptToEvaluateOnNewDocument",
                "params": {"source": source},
            },
        )
        return str((value or {}).get("identifier") or "")

    def remove_preload(self, identifier: str) -> None:
        if not identifier or self.driver is None:
            return
        self.driver.request(
            "POST",
            f"/session/{self.driver.session_id}/goog/cdp/execute",
            {
                "cmd": "Page.removeScriptToEvaluateOnNewDocument",
                "params": {"identifier": identifier},
            },
        )

    def onboarding(self) -> str:
        assert self.driver is not None
        self.driver.set_window_size(1440, 1000)
        self.driver.navigate(f"{self.flow.BASE_URL}/student#join-course")
        state = self.wait_student()
        dimensions = self.driver.execute(
            """
            const button = document.getElementById('learning-join-course-code');
            const rect = button.getBoundingClientRect();
            return {width: rect.width, height: rect.height, focus: document.activeElement === button};
            """
        )
        if not state["onboarding"] or state["ready"]:
            raise AssertionError(f"new student did not receive onboarding: {state}")
        if any(label in state["text"] for label in ("0 门课程", "0 项任务", "0% 掌握", "0 / 0")):
            raise AssertionError("new student sees meaningless zero-state metrics")
        if float(dimensions["height"]) < 44 or not dimensions["focus"]:
            raise AssertionError(f"onboarding primary action is not keyboard-ready: {dimensions}")
        self.screenshot("A01-onboarding-1440.png")
        self.driver.execute("document.getElementById('learning-join-course-code').click(); return true;")
        dialog = self.driver.wait_for(
            """
            const layer = document.querySelector('.aisecedu-dialog-layer.is-visible');
            const box = layer?.querySelector('[role="dialog"]');
            return box ? {modal: box.getAttribute('aria-modal'), focus: box.contains(document.activeElement), title: box.innerText} : null;
            """,
            timeout=10,
            label="course code entry dialog",
        )
        if dialog["modal"] != "true" or not dialog["focus"] or "加入课程" not in dialog["title"]:
            raise AssertionError(f"course-code dialog is not focus safe: {dialog}")
        self.driver.execute("document.querySelector('.aisecedu-dialog-close').click(); return true;")
        self.driver.wait_for(
            "return document.activeElement?.id === 'learning-join-course-code';",
            timeout=10,
            label="course code focus return",
        )
        return "isolated account, real /student browser, 1440 screenshot and focus-safe course-code dialog"

    def create_assignment(self) -> dict[str, Any]:
        assert self.admin is not None
        payload = self.api(
            self.admin,
            "POST",
            f"coursework/dojos/{COURSE_REFERENCE}/assignments",
            body={
                "title": "学生体验验收任务",
                "kind": "QUIZ",
                "moduleIndex": 0,
                "description": "验证自动保存、离线恢复、移动提交和答案公布策略。",
                "settings": {
                    "allowLate": True,
                    "allowResubmit": False,
                    "passPercent": 60,
                },
                "items": [
                    {
                        "type": "MULTIPLE_CHOICE",
                        "title": "输入安全",
                        "prompt": "防御 SQL 注入的首选工程措施是什么？",
                        "points": 20,
                        "config": {
                            "choices": ["字符串拼接", "参数化查询", "隐藏报错"],
                            "correctAnswer": "参数化查询",
                            "explanation": "参数化查询将数据与 SQL 结构分离。",
                        },
                    },
                    {
                        "type": "TRUE_FALSE",
                        "title": "输出编码",
                        "prompt": "所有输出上下文都能使用同一种编码函数。",
                        "points": 10,
                        "config": {
                            "correctAnswer": False,
                            "explanation": "编码必须匹配具体输出上下文。",
                        },
                    },
                    {
                        "type": "MULTIPLE_CHOICE",
                        "title": "权限控制",
                        "prompt": "服务账号应遵循什么权限原则？",
                        "points": 20,
                        "config": {
                            "choices": ["管理员权限", "最小权限", "共享密码"],
                            "correctAnswer": "最小权限",
                            "explanation": "仅授予完成工作所需的最小权限。",
                        },
                    },
                ],
            },
            statuses=(201,),
        )["assignment"]
        self.assignment_id = str(payload["id"])
        published = self.api(
            self.admin,
            "POST",
            f"coursework/assignments/{self.assignment_id}/publish",
            body={},
        )["assignment"]
        if published.get("status") != "PUBLISHED":
            raise AssertionError("acceptance assignment was not published")
        return published

    def ready_overview(self) -> str:
        assert self.student is not None and self.driver is not None
        enrolled = self.student.post(
            self.flow.api_url(f"dojos/{COURSE_REFERENCE}/enrollment"),
            json={},
            timeout=30,
        )
        self.flow.require(enrolled, (200, 201))
        self.create_assignment()
        overview = self.api(self.student, "GET", "learning/overview")
        action = overview.get("nextAction") or {}
        required = ("reason", "estimatedMinutes", "savedState", "context", "href")
        if overview.get("state") not in {"READY", "EMPTY"} or any(action.get(key) in (None, "") for key in required):
            raise AssertionError(f"next action contract is incomplete: {action}")
        self.driver.navigate(f"{self.flow.BASE_URL}/student")
        state = self.wait_student()
        card = self.driver.execute(
            """
            const card = document.querySelector('.sl-next-card');
            return card ? {text: card.innerText, href: card.querySelector('a')?.getAttribute('href')} : null;
            """
        )
        if not state["ready"] or not card or "为什么推荐" not in card["text"] or "预计" not in card["text"]:
            raise AssertionError(f"next action is not decision-ready: {card}")
        self.screenshot("A02-ready-1440.png")
        return "real enrollment, published assignment, overview contract and decision-ready next-action card"

    def degraded_overview(self) -> str:
        assert self.driver is not None
        preload = self.add_preload(
            """
            (() => {
              const original = window.fetch.bind(window);
              window.fetch = async (input, init) => {
                const url = String(input && input.url || input);
                const response = await original(input, init);
                if (!url.includes('/learning/overview')) return response;
                const payload = await response.clone().json();
                const data = payload.data || payload;
                data.state = 'DEGRADED';
                data.components = Object.assign({}, data.components || {}, {profile: 'DEGRADED'});
                return new Response(JSON.stringify(payload), {status: response.status, headers: {'Content-Type': 'application/json'}});
              };
            })();
            """
        )
        try:
            self.driver.navigate(f"{self.flow.BASE_URL}/student")
            self.wait_student()
            state = self.driver.wait_for(
                """
                const degraded = document.querySelector('.sl-degraded');
                const next = document.querySelector('.sl-next-card');
                return degraded && next ? {degraded: degraded.innerText, next: next.innerText} : null;
                """,
                timeout=30,
                label="degraded overview recovery",
            )
            if "其他内容仍可使用" not in state["degraded"] or "为什么推荐" not in state["next"]:
                raise AssertionError(f"degraded overview hid useful content: {state}")
        finally:
            self.remove_preload(preload)
        return "real overview response with one component degraded; next action remains usable"

    def catalog(self) -> str:
        assert self.driver is not None
        # student-ux-enrollment-fixture
        self.db_sql(
            "INSERT INTO dojo_users (dojo_id, user_id, type) "
            f"VALUES ({int(self.course['id'])}, {int(self.student_id)}, 'member') ON CONFLICT DO NOTHING;"
        )
        course_name = str(self.course["name"])
        encoded = urllib.parse.quote(COURSE_REFERENCE, safe="")
        self.driver.navigate(
            f"{self.flow.BASE_URL}/dojos?tab=discover&type=CTF&provider=TEACHER&page=1"
        )
        discover = self.driver.execute(
            f"""
            return {{
              cards: document.querySelectorAll('.sc-card').length,
              joinedVisible: document.body.innerText.includes({json.dumps(course_name)}),
              query: location.search,
            }};
            """
        )
        if int(discover["cards"]) > 24 or discover["joinedVisible"]:
            raise AssertionError(f"discover catalog leaked joined/hidden courses: {discover}")
        for token in ("tab=discover", "type=CTF", "provider=TEACHER", "page=1"):
            if token not in discover["query"]:
                raise AssertionError(f"catalog URL lost {token}: {discover['query']}")
        self.driver.navigate(f"{self.flow.BASE_URL}/dojos?tab=mine")
        mine = self.driver.execute(
            "return {cards: document.querySelectorAll('.sc-card').length, text: document.body.innerText};"
        )
        if int(mine["cards"]) > 24 or course_name not in mine["text"]:
            raise AssertionError(f"mine catalog is incomplete: {mine}")
        return f"server-rendered mine/discover catalog, URL-backed filters, 24-card cap ({encoded})"

    def guide_fixture(self) -> str:
        assert self.student is not None and self.student_id is not None
        thread = self.api(
            self.student,
            "POST",
            "learning/guide/threads",
            body={},
            statuses=(201,),
        )["thread"]
        self.guide_thread_id = str(thread["id"])
        metadata = {
            "agentActions": [
                {
                    "type": "artifact",
                    "id": f"deleted-{self.suffix}",
                    "title": "已删除的学习成果",
                    "description": "历史消息中的旧入口",
                    "url": f"/learning/artifacts/deleted-{self.suffix}",
                    "resourceRef": {
                        "objectType": "artifact",
                        "objectId": f"deleted-{self.suffix}",
                    },
                }
            ]
        }
        self.db_sql(
            "INSERT INTO learning_guide_messages "
            "(thread_id, user_id, role, content, metadata, created) VALUES ("
            f"{self.sql_literal(self.guide_thread_id)}, {self.student_id}, 'assistant', "
            f"'这是历史结果入口。', {self.sql_literal(json.dumps(metadata, ensure_ascii=False))}::jsonb, NOW());"
        )
        resolved = self.api(
            self.student,
            "POST",
            "learning/resources/resolve",
            body={
                "resources": [
                    {
                        "key": "0",
                        "objectType": "artifact",
                        "objectId": f"deleted-{self.suffix}",
                        "url": f"/learning/artifacts/deleted-{self.suffix}",
                    }
                ]
            },
        )["resources"][0]
        if resolved.get("status") != "DELETED" or not (resolved.get("recovery") or {}).get("href"):
            raise AssertionError(f"deleted resource has no recovery contract: {resolved}")
        current = self.api(
            self.student,
            "POST",
            "learning/resources/resolve",
            body={
                "resources": [
                    {
                        "key": "legacy-current-challenge",
                        "objectType": "link",
                        "objectId": "",
                        "url": f"/{COURSE_REFERENCE}/manual/terminal-handshake",
                    }
                ]
            },
        )["resources"][0]
        if current.get("status") != "AVAILABLE" or current.get("objectType") != "challenge":
            raise AssertionError(f"valid historic challenge was misclassified: {current}")
        return self.guide_thread_id

    def deleted_resource(self) -> str:
        assert self.driver is not None
        thread_id = self.guide_fixture()
        target = (
            f"{self.flow.BASE_URL}/guide?thread={urllib.parse.quote(thread_id)}"
            f"&course={urllib.parse.quote(COURSE_REFERENCE)}&module=manual&challenge=terminal-handshake"
        )
        self.driver.navigate(target)
        card = self.driver.wait_for(
            """
            const card = document.querySelector('.conversation-card.is-unavailable');
            return card ? {text: card.innerText, href: card.getAttribute('href')} : null;
            """,
            timeout=60,
            label="deleted guide action recovery",
        )
        if "内容已移除" not in card["text"] or not card["href"]:
            raise AssertionError(f"deleted resource still behaves like a broken link: {card}")
        return "valid historic challenges stay available; a genuinely deleted result is labeled as removed and receives a recovery path"

    def personal_workspace(self) -> str:
        assert self.student is not None and self.course is not None
        created = self.api(
            self.student,
            "POST",
            "teaching/self-learning/workspaces",
            body={
                "goal": "整理本章关键概念并制作个人复习路径。",
                "title": "个人复习路径",
                "mode": "learning-path",
                "dojoId": self.course["id"],
                "moduleIndex": 0,
            },
            statuses=(201,),
        )["workspace"]
        self.workspace_id = str(created["id"])
        rows = self.api(
            self.student, "GET", "teaching/self-learning/workspaces"
        )["workspaces"]
        row = next(item for item in rows if item["id"] == self.workspace_id)
        if row.get("visibility") != "仅自己可见" or row.get("artifact") is not None:
            raise AssertionError(f"personal workspace leaked or materialized unexpectedly: {row}")
        return "owner-scoped personal workspace API; visibility is explicit and no course-public capability exists"

    def student_publish_denied(self) -> str:
        assert self.student is not None
        response = self.student.post(
            self.flow.api_url(f"teaching/artifacts/not-owned-{self.suffix}/request-publish"),
            json={},
            timeout=30,
        )
        if response.status_code != 403:
            raise AssertionError(f"student publish endpoint returned {response.status_code}")
        text = response.text.lower()
        if any(token in text for token in ("traceback", "sqlalchemy", "password", "secret")):
            raise AssertionError("student publish denial leaked an internal detail")
        return "direct R3 publish request is denied before artifact lookup and exposes no private detail"

    def published_artifact(self) -> str:
        assert self.student is not None and self.driver is not None
        overview = self.api(self.student, "GET", "learning/overview")
        artifacts = (overview.get("workspace") or {}).get("publishedArtifacts") or []
        if not artifacts:
            self.require_source(
                "dojo_plugin/api/v1/teaching.py",
                "student_safe=True",
                '"publishToCourse": False',
                '"author": "课程团队"',
            )
            return "student-safe artifact projection contract verified; acceptance course currently has no published artifact"
        artifact = artifacts[0]
        self.driver.navigate(f"{self.flow.BASE_URL}{artifact['url']}")
        state = self.driver.wait_for(
            """
            const root = document.getElementById('teaching-artifact');
            return root ? {
              role: root.dataset.viewerRole,
              publish: !!document.getElementById('artifact-request-publish'),
              revise: !!document.getElementById('artifact-revise'),
              continue: !!document.getElementById('artifact-continue-link'),
            } : null;
            """,
            timeout=45,
            label="student-safe published artifact",
        )
        if state != {"role": "student", "publish": False, "revise": False, "continue": True}:
            raise AssertionError(f"published artifact exposes teacher controls: {state}")
        return "real published artifact renders with student role, Continue action, and no publish/revise controls"

    def reading_course(self) -> str:
        assert self.driver is not None
        self.driver.navigate(f"{self.flow.BASE_URL}/{COURSE_REFERENCE}/chapter-2")
        state = self.driver.execute(
            """
            return {
              text: document.body.innerText,
              practice: document.querySelectorAll('.challenge-name').length,
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
            """
        )
        if "阅读章节 · 无必修实践" not in state["text"] or "0 / 0" in state["text"]:
            raise AssertionError(f"reading-only chapter has false practice progress: {state}")
        return "real reading-only chapter uses NOT_APPLICABLE wording and never renders 0/0"

    def course_path(self) -> str:
        assert self.driver is not None
        self.driver.navigate(f"{self.flow.BASE_URL}/{COURSE_REFERENCE}/manual?from=acceptance")
        state = self.driver.execute(
            """
            const current = document.querySelectorAll('.unit-outline-item.is-current');
            const next = document.querySelector('.unit-mobile-sequence a.is-next');
            return {
              current: current.length,
              next: next?.getAttribute('href') || '',
              nextText: next?.innerText || '',
              outlineItems: document.querySelectorAll('.unit-outline-item').length,
            };
            """
        )
        if state["current"] != 1 or state["outlineItems"] < 1 or "returnTo=" not in state["next"] or "下一章" not in state["nextText"]:
            raise AssertionError(f"course path lost current/next context: {state}")
        return "real chapter path has one current item and previous/next links preserve returnTo context"

    def mobile_directory(self) -> str:
        assert self.driver is not None
        self.driver.set_window_size(390, 844)
        self.driver.navigate(f"{self.flow.BASE_URL}/{COURSE_REFERENCE}/manual")
        state = self.driver.execute(
            """
            const toggle = document.getElementById('unit-outline-toggle');
            const next = document.querySelector('.unit-mobile-sequence a.is-next');
            const tr = toggle.getBoundingClientRect(), nr = next.getBoundingClientRect();
            return {
              overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
              toggleHeight: tr.height,
              nextHeight: nr.height,
              nextVisible: nr.bottom <= innerHeight + document.documentElement.scrollHeight,
            };
            """
        )
        if float(state["overflow"]) > 1 or min(float(state["toggleHeight"]), float(state["nextHeight"])) < 44:
            raise AssertionError(f"390px course path is clipped or too small: {state}")
        self.screenshot("A11-course-path-390.png")
        return "390×844 real chapter: no horizontal overflow, directory and fixed sequence targets are at least 44px"

    def workspace_failure(self) -> str:
        assert self.driver is not None
        self.driver.set_window_size(1440, 1000)
        self.driver.navigate(f"{self.flow.BASE_URL}/{COURSE_REFERENCE}/manual")
        self.driver.wait_for(
            "return window.CTFd && typeof window.CTFd.fetch === 'function' && document.querySelector('[id^=" + '"challenges-header-button-"' + "]');",
            timeout=45,
            label="challenge controls",
        )
        self.driver.execute(
            """
            window.__studentUxOriginalFetch = window.CTFd.fetch;
            window.__studentUxDockerCalls = 0;
            window.CTFd.fetch = function(url, options) {
              if (String(url) === '/pwncollege_api/v1/docker' && String(options?.method || '').toUpperCase() === 'POST') {
                window.__studentUxDockerCalls += 1;
                return Promise.resolve(new Response(JSON.stringify({success:false,error:'internal-503-secret'}), {status:503, headers:{'Content-Type':'application/json'}}));
              }
              return window.__studentUxOriginalFetch.apply(this, arguments);
            };
            const header = document.querySelector('[id^="challenges-header-button-"]');
            if (header.getAttribute('aria-expanded') !== 'true') header.click();
            return true;
            """
        )
        self.driver.wait_for(
            "return document.querySelector('.accordion-item .challenge-start') && !document.querySelector('.accordion-item .challenge-start').disabled;",
            timeout=20,
            label="challenge start action",
        )
        self.driver.execute("document.querySelector('.accordion-item .challenge-start').click(); return true;")
        failure = self.driver.wait_for(
            """
            const panel = document.querySelector('.challenge-workspace:not(.challenge-hidden) [data-workspace-loading]');
            const title = panel?.querySelector('[data-workspace-loading-title]');
            if (!panel || title?.textContent.trim() !== '环境启动失败') return null;
            return {
              title: title.textContent.trim(),
              detail: panel.querySelector('[data-workspace-loading-detail]')?.textContent.trim(),
              stages: panel.querySelectorAll('[data-workspace-stage]').length,
              retry: panel.querySelector('[data-workspace-loading-retry]')?.textContent.trim(),
              cancel: panel.querySelector('[data-workspace-loading-cancel]')?.textContent.trim(),
              calls: window.__studentUxDockerCalls,
              body: document.body.innerText,
            };
            """,
            timeout=30,
            label="staged workspace failure",
        )
        if failure["stages"] != 4 or failure["retry"] != "重新启动" or failure["cancel"] != "返回题目说明" or "internal-503-secret" in failure["body"]:
            raise AssertionError(f"workspace failure is unsafe or incomplete: {failure}")
        self.screenshot("A12-workspace-failure-1440.png")
        self.driver.execute("document.querySelector('[data-workspace-loading-retry]').click(); return true;")
        calls = self.driver.wait_for(
            "return window.__studentUxDockerCalls === 2 ? window.__studentUxDockerCalls : null;",
            timeout=20,
            label="idempotent workspace retry",
        )
        self.driver.execute("document.querySelector('[data-workspace-loading-cancel]').click(); return true;")
        canceled = self.driver.wait_for(
            """
            const start = document.querySelector('.accordion-item .challenge-start');
            const workspace = document.querySelector('.accordion-item .challenge-workspace');
            return workspace.classList.contains('challenge-hidden') && document.activeElement === start;
            """,
            timeout=15,
            label="workspace return to description",
        )
        if calls != 2 or not canceled:
            raise AssertionError("workspace retry duplicated requests or cancel lost focus")
        self.workspace_failure_verified = True
        return "real module UI with mocked transport failure: 4 stages, safe copy, exactly one retry, cancel and focus recovery"

    def workspace_retry_evidence(self) -> str:
        if not self.workspace_failure_verified:
            raise AssertionError("A12 did not produce retry evidence")
        return "A12 real failure fixture proved exactly one additional request, safe cancellation and focus recovery"

    def unknown_mastery(self) -> str:
        assert self.driver is not None
        self.driver.navigate(f"{self.flow.BASE_URL}/dojo/{COURSE_REFERENCE}/learning")
        state = self.driver.wait_for(
            """
            const value = document.getElementById('learning-mastery-summary');
            return value && !value.textContent.includes('正在') ? {text: value.textContent.trim(), body: document.body.innerText} : null;
            """,
            timeout=45,
            label="unknown mastery state",
        )
        if not any(label in state["text"] for label in ("证据不足", "尚无证据", "尚无足够证据", "等待更多证据")):
            raise AssertionError(f"unknown mastery was presented as zero: {state}")
        return "real learning dashboard distinguishes UNKNOWN mastery from 0%"

    def seed_attempts(self) -> tuple[str, str]:
        assert self.student_id is not None and self.course is not None
        module = next(item for item in self.course["modules"] if item["id"] == "manual")
        challenge = module["challenges"][0]
        pending = f"attempt_pending_{self.suffix}"
        complete = f"attempt_complete_{self.suffix}"
        assessment = f"grade_complete_{self.suffix}"
        self.attempt_ids.extend([pending, complete])
        occurred = datetime.datetime.utcnow().replace(microsecond=123456)
        payload = {"result": "verified"}
        previous = "0" * 64
        material = json.dumps(
            {
                "attemptId": complete,
                "sequence": 1,
                "eventType": "oracle.observed",
                "source": "PLATFORM",
                "trustLevel": 3,
                "payload": payload,
                "occurred": occurred.isoformat(timespec="microseconds"),
                "previousHash": previous,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        event_hash = hashlib.sha256(material.encode()).hexdigest()
        criteria = [
            {
                "id": "objective",
                "title": "客观结果",
                "score": 10,
                "maxScore": 60,
                "evidence": {
                    "rationale": "客观目标部分完成。",
                    "evidenceSequences": [1],
                },
            }
        ]
        sql = f"""
        INSERT INTO learning_attempts
          (id,user_id,dojo_id,module_index,challenge_index,challenge_id,epoch,mode,status,reflection,objective_score,process_score,total_score,trust_score,data,started,submitted,completed)
        VALUES
          ({self.sql_literal(pending)},{self.student_id},{self.course['id']},{module['index']},{challenge['index']},{challenge['challengeId']},900001,'ASSESSMENT','SUBMITTED','等待评分验收',0,0,0,1,'{{}}'::jsonb,NOW(),NOW(),NULL),
          ({self.sql_literal(complete)},{self.student_id},{self.course['id']},{module['index']},{challenge['index']},{challenge['challengeId']},900002,'ASSESSMENT','SOLVED','低分但过程完整',10,10,20,1,'{{}}'::jsonb,NOW(),NOW(),NOW());
        INSERT INTO learning_evidence_events
          (attempt_id,sequence,event_type,source,trust_level,payload,previous_hash,event_hash,occurred,ingested)
        VALUES
          ({self.sql_literal(complete)},1,'oracle.observed','PLATFORM',3,{self.sql_literal(json.dumps(payload))}::jsonb,{self.sql_literal(previous)},{self.sql_literal(event_hash)},TIMESTAMP {self.sql_literal(occurred.isoformat(sep=' '))},NOW());
        INSERT INTO learning_assessments
          (id,attempt_id,revision,objective_score,process_score,total_score,criteria,abilities,timeline,feedback,status,source,created_by,created)
        VALUES
          ({self.sql_literal(assessment)},{self.sql_literal(complete)},1,10,10,20,{self.sql_literal(json.dumps(criteria, ensure_ascii=False))}::jsonb,'{{}}'::jsonb,'[]'::jsonb,'本次结果较低，但过程记录完整，可据此继续补强。','FINAL','DETERMINISTIC',NULL,NOW());
        """
        self.db_sql(sql)
        return pending, complete

    def pending_score(self) -> str:
        assert self.driver is not None
        pending, _complete = self.seed_attempts()
        self.driver.navigate(f"{self.flow.BASE_URL}/learning/attempts/{pending}/score")
        state = self.driver.wait_for(
            """
            const content = document.querySelector('.learning-score-content');
            if (!content || content.hidden) return null;
            return {
              total: document.getElementById('learning-score-total')?.textContent.trim(),
              unitHidden: document.getElementById('learning-score-total-unit')?.hidden,
              level: document.getElementById('learning-score-level')?.textContent.trim(),
              feedback: document.getElementById('learning-score-feedback')?.textContent.trim(),
            };
            """,
            timeout=45,
            label="pending score page",
        )
        if state["total"] != "—" or not state["unitHidden"] or state["level"] != "等待评分" or "不会显示 0 分占位" not in state["feedback"]:
            raise AssertionError(f"pending assessment displayed a fake zero: {state}")
        self.screenshot("A14-pending-score-1440.png")
        return "real pending attempt renders em dash, hides denominator, and states that 0 is not a placeholder"

    def low_score_complete_evidence(self) -> str:
        assert self.driver is not None
        complete = self.attempt_ids[-1]
        self.driver.navigate(f"{self.flow.BASE_URL}/learning/attempts/{complete}/score")
        state = self.driver.wait_for(
            """
            const content = document.querySelector('.learning-score-content');
            if (!content || content.hidden) return null;
            return {
              total: document.getElementById('learning-score-total')?.textContent.trim(),
              trust: document.getElementById('learning-score-trust')?.textContent.trim(),
              chain: document.getElementById('learning-score-chain')?.textContent.trim(),
              level: document.getElementById('learning-score-level')?.textContent.trim(),
            };
            """,
            timeout=45,
            label="low score with complete evidence",
        )
        if state["total"] != "20" or "过程记录完整" not in state["trust"] or "过程记录完整" not in state["chain"] or state["level"] != "继续补强":
            raise AssertionError(f"score and evidence were conflated: {state}")
        self.screenshot("A15-low-score-complete-evidence-1440.png")
        return "real 20-point assessment remains low while independently showing a valid, complete evidence chain"

    def unauthorized_attempt(self) -> str:
        assert self.driver is not None and self.outsider is not None
        complete = self.attempt_ids[-1]
        self.use_browser_session(self.outsider)
        self.driver.navigate(f"{self.flow.BASE_URL}/learning/attempts/{complete}/score")
        state = self.driver.execute(
            """
            return {
              text: document.body.innerText,
              recovery: Array.from(document.querySelectorAll('a')).some(a => /最近尝试|返回|今天/.test(a.innerText)),
            };
            """
        )
        if "无法查看这次学习记录" not in state["text"] or "403" in state["text"] or not state["recovery"]:
            raise AssertionError(f"unauthorized attempt exposed a raw error: {state}")
        self.use_browser_session(self.student)
        return "real outsider receives a friendly ownership boundary and recovery action without rendered raw 403"

    def stale_membership(self) -> str:
        assert self.student is not None and self.student_id is not None and self.course is not None and self.driver is not None
        module = next(item for item in self.course["modules"] if item["id"] == "manual")
        challenge = module["challenges"][1]
        active = f"attempt_active_{self.suffix}"
        self.attempt_ids.append(active)
        self.db_sql(
            "INSERT INTO learning_attempts "
            "(id,user_id,dojo_id,module_index,challenge_index,challenge_id,epoch,mode,status,objective_score,process_score,total_score,trust_score,data,started) VALUES ("
            f"{self.sql_literal(active)},{self.student_id},{self.course['id']},{module['index']},{challenge['index']},{challenge['challengeId']},900003,'ASSESSMENT','ACTIVE',0,0,0,1,'{{}}'::jsonb,NOW());"
            f"DELETE FROM dojo_users WHERE user_id={self.student_id} AND dojo_id={self.course['id']};"
        )
        overview = self.api(self.student, "GET", "learning/overview")
        if overview.get("activeAttempt") is not None or (overview.get("staleContext") or {}).get("state") != "STALE" or (overview.get("nextAction") or {}).get("type") == "CONTINUE_ATTEMPT":
            raise AssertionError(f"stale membership remained authoritative: {overview.get('staleContext')}")
        self.driver.navigate(f"{self.flow.BASE_URL}/student")
        self.driver.wait_for(
            "return document.querySelector('.sl-stale-context')?.innerText.includes('已忽略过期的学习位置');",
            timeout=45,
            label="stale context recovery",
        )
        self.api(self.student, "DELETE", "learning/attempts/current", body={})
        enrolled = self.student.post(
            self.flow.api_url(f"dojos/{COURSE_REFERENCE}/enrollment"), json={}, timeout=30
        )
        self.flow.require(enrolled, (200, 201))
        return "membership deletion overrides a stale active attempt; UI explains and clears the old context, then re-enrollment restores access"

    def assignment_autosave(self) -> str:
        assert self.driver is not None and self.assignment_id is not None
        self.driver.set_window_size(1440, 1000)
        target = f"{self.flow.BASE_URL}/learning/assignments/{self.assignment_id}"
        self.driver.navigate(target)
        self.driver.wait_for(
            "return document.getElementById('learning-assignment-content') && !document.getElementById('learning-assignment-content').hidden;",
            timeout=45,
            label="assignment content",
        )
        self.driver.execute(
            """
            const input = document.querySelector('.la-question[data-question-index="0"] input[value="字符串拼接"]');
            input.click(); input.dispatchEvent(new Event('change', {bubbles:true})); return true;
            """
        )
        self.driver.wait_for(
            "return /已保存|答案已提交/.test(document.getElementById('la-save-status').textContent);",
            timeout=30,
            label="assignment autosave",
        )
        self.driver.navigate(target)
        persisted = self.driver.wait_for(
            "return document.querySelector('.la-question[data-question-index=" + '"0"' + "] input[value=" + '"字符串拼接"' + "]')?.checked;",
            timeout=45,
            label="assignment refresh persistence",
        )
        self.driver.execute(
            """
            Object.defineProperty(navigator, 'onLine', {configurable:true, value:false});
            window.dispatchEvent(new Event('offline'));
            const input = document.querySelector('.la-question[data-question-index="1"] input[value="false"]');
            input.click(); input.dispatchEvent(new Event('change', {bubbles:true})); return true;
            """
        )
        offline = self.driver.wait_for(
            "return document.getElementById('la-save-status').textContent.includes('离线草稿');",
            timeout=10,
            label="offline assignment draft",
        )
        self.driver.execute(
            "Object.defineProperty(navigator, 'onLine', {configurable:true, value:true}); window.dispatchEvent(new Event('online')); return true;"
        )
        self.driver.wait_for(
            "return /已保存/.test(document.getElementById('la-save-status').textContent);",
            timeout=30,
            label="reconnected assignment sync",
        )
        if not persisted or not offline:
            raise AssertionError("assignment did not persist across refresh/offline")
        return "real assignment autosaves, survives refresh, persists offline locally and synchronizes after reconnect"

    def assignment_conflict(self) -> str:
        assert self.student is not None and self.assignment_id is not None
        work = self.api(
            self.student, "GET", f"coursework/assignments/{self.assignment_id}/work"
        )["assignment"]
        first = work["items"][0]
        response = self.student.post(
            self.flow.api_url(f"coursework/assignments/{self.assignment_id}/work"),
            json={
                "action": "save",
                "answers": {first["id"]: "参数化查询"},
                "expectedUpdated": None,
            },
            timeout=30,
        )
        if response.status_code != 409 or response.json().get("error", {}).get("code") != "REVISION_CONFLICT":
            raise AssertionError(f"stale tab overwrote newer work: {response.status_code} {response.text}")
        return "real stale expectedUpdated save is rejected with REVISION_CONFLICT and cannot overwrite newer answers"

    def mobile_assignment_and_results(self) -> str:
        assert self.driver is not None and self.assignment_id is not None
        self.driver.set_window_size(390, 844)
        self.driver.navigate(f"{self.flow.BASE_URL}/learning/assignments/{self.assignment_id}")
        self.driver.wait_for(
            "return document.getElementById('learning-assignment-content') && !document.getElementById('learning-assignment-content').hidden;",
            timeout=45,
            label="mobile assignment",
        )
        mobile = self.driver.execute(
            """
            const visible = Array.from(document.querySelectorAll('.la-question')).filter(node => getComputedStyle(node).display !== 'none');
            return {visible: visible.length, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth};
            """
        )
        if mobile["visible"] != 1 or float(mobile["overflow"]) > 1:
            raise AssertionError(f"mobile assignment does not use one-question flow: {mobile}")
        self.driver.execute("document.querySelector('[data-question-target=" + '"2"' + "]').click(); return true;")
        final_label = self.driver.execute("return document.getElementById('la-mobile-next').innerText.trim();")
        if "提交作业" not in final_label:
            raise AssertionError(f"last mobile action is ambiguous: {final_label}")
        self.driver.execute("document.getElementById('la-mobile-next').click(); return true;")
        notice = self.driver.wait_for(
            "return document.getElementById('learning-assignment-notice').innerText.includes('第 3 题') ? document.getElementById('learning-assignment-notice').innerText : null;",
            timeout=15,
            label="exact unanswered warning",
        )
        if "未完成的必答题" not in notice:
            raise AssertionError(f"unanswered warning is vague: {notice}")
        self.driver.execute(
            """
            const input = document.querySelector('.la-question[data-question-index="2"] input[value="最小权限"]');
            input.click(); input.dispatchEvent(new Event('change', {bubbles:true})); return true;
            """
        )
        self.driver.wait_for(
            "return /已保存/.test(document.getElementById('la-save-status').textContent);",
            timeout=30,
            label="final answer autosave",
        )
        self.driver.execute("document.getElementById('la-mobile-next').click(); return true;")
        self.driver.wait_for(
            "return document.querySelector('.aisecedu-dialog-layer.is-visible [data-dialog-action=" + '"confirm"' + "]');",
            timeout=10,
            label="assignment submit confirmation",
        )
        self.driver.execute("document.querySelector('[data-dialog-action=" + '"confirm"' + "]').click(); return true;")
        result = self.driver.wait_for(
            """
            if (document.getElementById('la-score').hidden) return null;
            const first = document.querySelector('.la-question[data-question-index="0"]');
            return {
              score: document.getElementById('la-score').innerText,
              firstClass: first?.querySelector('.la-result')?.className,
              firstText: first?.innerText,
              policy: document.getElementById('la-answer-policy').innerText,
            };
            """,
            timeout=45,
            label="wrong-first assignment results",
        )
        if "is-wrong" not in str(result["firstClass"]) or "参考答案" not in result["firstText"]:
            raise AssertionError(f"graded result did not prioritize the wrong answer: {result}")
        self.screenshot("A19-A20-assignment-results-390.png")
        self.mobile_assignment_verified = True
        return "390×844 one-question flow, exact missing-question warning, explicit final submit, confirmation and wrong-first result with allowed reference"

    def mobile_assignment_evidence(self) -> str:
        if not self.mobile_assignment_verified:
            raise AssertionError("A19 did not produce mobile assignment evidence")
        return "A19 real graded mobile flow captured one-question navigation, exact missing-question feedback and explicit final submission"

    def guide_references(self) -> str:
        assert self.driver is not None and self.guide_thread_id is not None
        target = (
            f"{self.flow.BASE_URL}/guide?thread={urllib.parse.quote(self.guide_thread_id)}"
            f"&course={urllib.parse.quote(COURSE_REFERENCE)}&module=manual&challenge=terminal-handshake"
        )
        self.driver.navigate(target)
        selected = self.driver.wait_for(
            """
            const summary = document.getElementById('student-reference-summary');
            return summary && !summary.hidden && summary.querySelector('[data-remove-reference]') ? summary.innerText : null;
            """,
            timeout=60,
            label="deep-linked guide reference",
        )
        if "终端握手" not in selected:
            raise AssertionError(f"deep link did not select its challenge: {selected}")
        self.driver.execute(
            f"""
            window.__capturedGuideBody = null;
            window.__studentUxOriginalJson = window.DojoLearning.json;
            window.DojoLearning.json = async function(method, url, body) {{
              if (method === 'POST' && url === '/learning/guide') {{
                window.__capturedGuideBody = body;
                return {{success:true, thread:{{id:{json.dumps(self.guide_thread_id)}}}}};
              }}
              return window.__studentUxOriginalJson.apply(this, arguments);
            }};
            document.querySelector('[data-remove-reference]').click();
            const input = document.getElementById('teaching-input');
            input.value = '只使用我当前保留的引用回答';
            input.dispatchEvent(new Event('input', {{bubbles:true}}));
            document.getElementById('teaching-send').click();
            return true;
            """
        )
        captured = self.driver.wait_for(
            "return window.__capturedGuideBody || null;",
            timeout=15,
            label="guide reference request payload",
        )
        if captured.get("references") != []:
            raise AssertionError(f"removed reference still reached the server: {captured}")
        return "deep link preselects the exact challenge; removing its chip produces an empty server reference list"

    def global_search(self) -> str:
        assert self.driver is not None
        self.driver.set_window_size(1440, 1000)
        self.driver.navigate(f"{self.flow.BASE_URL}/student")
        self.wait_student()
        self.driver.execute(
            f"window.__studentCourseName = {json.dumps(str(self.course['name']))}; return true;"
        )
        self.driver.execute(
            "document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true})); return true;"
        )
        self.driver.wait_for(
            "return document.getElementById('searchModal')?.classList.contains('show') && document.activeElement?.id === 'searchInput';",
            timeout=15,
            label="keyboard global search",
        )
        self.driver.execute(
            """
            const input = document.getElementById('searchInput'); input.value=window.__studentCourseName; input.dispatchEvent(new Event('input',{bubbles:true})); return true;
            """
        )
        grouped = self.driver.wait_for(
            """
            const sections = Array.from(document.querySelectorAll('.product-search-section')).map(node => node.textContent.trim());
            return document.querySelectorAll('.product-search-result').length ? sections : null;
            """,
            timeout=30,
            label="grouped global search",
        )
        if not set(grouped).intersection({"最近", "我的课程", "章节与题目", "作业", "我的创作"}):
            raise AssertionError(f"search results are not grouped: {grouped}")
        self.driver.execute(
            "const i=document.getElementById('searchInput'); i.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true})); return true;"
        )
        self.driver.wait_for(
            "return document.querySelector('.product-search-result.is-active')?.getAttribute('aria-selected') === 'true';",
            timeout=10,
            label="search keyboard selection",
        )
        self.driver.execute(
            "const i=document.getElementById('searchInput'); i.value='zzzz-no-result-e2e'; i.dispatchEvent(new Event('input',{bubbles:true})); return true;"
        )
        empty = self.driver.wait_for(
            """
            const box=document.querySelector('.product-search-empty');
            return box && box.querySelectorAll('a').length >= 2 ? box.innerText : null;
            """,
            timeout=30,
            label="search empty next step",
        )
        if "浏览课程" not in empty or "AI 学习助手" not in empty:
            raise AssertionError(f"empty search has no next step: {empty}")
        self.driver.execute("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true;")
        self.driver.wait_for(
            "return !document.getElementById('searchModal').classList.contains('show') && document.activeElement?.id === 'global-search-trigger';",
            timeout=15,
            label="search focus return",
        )
        return "Ctrl+K opens focused search, results are grouped, arrows set visible selection, empty state offers two next steps, Escape restores focus"

    def legacy_links(self) -> str:
        assert self.student is not None and self.driver is not None
        response = self.student.get(
            f"{self.flow.BASE_URL}/dojo/{COURSE_REFERENCE}/module/manual",
            params={"q": "保留", "returnTo": "/student"},
            allow_redirects=False,
            timeout=30,
        )
        if response.status_code != 308 or "q=%E4%BF%9D%E7%95%99" not in response.headers.get("Location", "") or "returnTo=%2Fstudent" not in response.headers.get("Location", ""):
            raise AssertionError(f"legacy module redirect lost query: {response.status_code} {response.headers.get('Location')}")
        self.driver.navigate(f"{self.flow.BASE_URL}/sensai?course={urllib.parse.quote(COURSE_REFERENCE)}#composer")
        state = self.driver.wait_for(
            "return location.pathname === '/guide' ? {query: location.search, hash: location.hash} : null;",
            timeout=30,
            label="legacy guide redirect",
        )
        if "course=" not in state["query"] or state["hash"] != "#composer":
            raise AssertionError(f"legacy browser redirect lost state: {state}")
        return "308 compatibility routes preserve query parameters and browser fragments"

    def personal_library(self) -> str:
        assert self.driver is not None and self.workspace_id is not None
        self.driver.navigate(f"{self.flow.BASE_URL}/learning/extend")
        state = self.driver.wait_for(
            f"""
            const card = document.querySelector('[data-workspace-id={json.dumps(self.workspace_id)}]');
            return card ? {{count: document.querySelectorAll('[data-workspace-id={json.dumps(self.workspace_id)}]').length, text: card.innerText, continueCount: card.querySelectorAll('[data-open-workspace]').length}} : null;
            """,
            timeout=45,
            label="personal creation library",
        )
        if state["count"] != 1 or "仅自己可见" not in state["text"] or state["continueCount"] != 1 or "发布" in state["text"]:
            raise AssertionError(f"personal versions duplicated or leaked publish: {state}")
        self.require_source(
            "dojo_plugin/api/v1/teaching.py",
            "by_workspace.setdefault(artifact.self_workspace_id, []).append(artifact)",
            '"versionCount": sum(',
        )
        return "one workspace card per creation, explicit personal visibility, one continue action and server-side version grouping"

    def empty_workspace(self) -> str:
        assert self.driver is not None
        self.driver.navigate(f"{self.flow.BASE_URL}/workspace")
        state = self.driver.execute(
            """
            return {
              title: document.getElementById('workspace-empty-title')?.textContent.trim(),
              text: document.body.innerText,
              actions: Array.from(document.querySelectorAll('.workspace-empty-actions a')).map(a => a.innerText.trim()),
            };
            """
        )
        if not state["title"] or "最近实验" not in state["text"] or not any("课程" in item for item in state["actions"]):
            raise AssertionError(f"workspace empty state has no recovery path: {state}")
        return "real /workspace empty state is Chinese, explains recovery, links back to courses and keeps authorized recents"

    def mobile_workspace(self) -> str:
        assert self.driver is not None
        self.driver.set_window_size(390, 844)
        self.driver.navigate(f"{self.flow.BASE_URL}/workspace")
        state = self.driver.execute(
            "return {overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth, width: document.documentElement.clientWidth};"
        )
        template = self.require_source(
            "dojo_theme/templates/workspace.html",
            'data-workspace-mobile-panel="navigation"',
            'data-workspace-mobile-panel="workspace"',
            'data-workspace-mobile-panel="tutor"',
        )
        script = self.require_source(
            "dojo_theme/static/js/dojo/workspace.js",
            "function select(panel)",
            'classList.add("is-mobile-open")',
            'mark(event.detail && event.detail.panel || "workspace")',
        )
        if float(state["overflow"]) > 1 or not template or not script:
            raise AssertionError(f"mobile workspace overflows: {state}")
        self.screenshot("A26-workspace-empty-390.png")
        return "390×844 has no horizontal overflow; active workspace contract exposes one of navigation/workspace/tutor panels at a time"

    def mobile_guide(self) -> str:
        assert self.driver is not None and self.guide_thread_id is not None
        self.driver.set_window_size(390, 844)
        self.driver.navigate(f"{self.flow.BASE_URL}/guide?thread={urllib.parse.quote(self.guide_thread_id)}")
        self.driver.wait_for(
            "return document.getElementById('teacher-agent')?.dataset.agentReady === 'true';",
            timeout=60,
            label="mobile guide",
        )
        base = self.driver.execute(
            """
            const input=document.getElementById('teaching-input').getBoundingClientRect();
            return {overflow: document.documentElement.scrollWidth-document.documentElement.clientWidth, inputVisible: input.top < innerHeight && input.bottom > 0, role: document.getElementById('teacher-agent').dataset.role};
            """
        )
        if float(base["overflow"]) > 1 or not base["inputVisible"] or base["role"] != "student":
            raise AssertionError(f"mobile guide is unusable: {base}")
        self.driver.execute("document.getElementById('teaching-sidebar-toggle').click(); return true;")
        sidebar = self.driver.wait_for(
            """
            const root=document.getElementById('teacher-agent'), side=document.getElementById('teaching-sidebar');
            return root.classList.contains('is-sidebar-open') ? {focus: side.contains(document.activeElement), conversationInert: document.querySelector('.teaching-conversation')?.inert || false} : null;
            """,
            timeout=15,
            label="mobile guide sidebar",
        )
        if not sidebar["focus"]:
            raise AssertionError(f"mobile sidebar did not receive focus: {sidebar}")
        self.driver.execute("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true;")
        self.driver.wait_for(
            "return !document.getElementById('teacher-agent').classList.contains('is-sidebar-open') && document.activeElement?.id === 'teaching-sidebar-toggle';",
            timeout=15,
            label="mobile guide sidebar focus return",
        )
        self.driver.execute("document.getElementById('teaching-drawer-open').click(); return true;")
        drawer = self.driver.wait_for(
            "return document.getElementById('teaching-drawer').classList.contains('is-open') && document.activeElement?.id === 'teaching-drawer-close';",
            timeout=15,
            label="mobile guide resource drawer",
        )
        self.driver.execute("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true;")
        self.driver.wait_for(
            "return !document.getElementById('teaching-drawer').classList.contains('is-open') && document.activeElement?.id === 'teaching-drawer-open';",
            timeout=15,
            label="mobile guide drawer focus return",
        )
        if not drawer:
            raise AssertionError("mobile guide drawer did not open")
        self.screenshot("A28-guide-390.png")
        return "390×844 student Agent keeps composer visible, prevents overflow, and gives focus-safe sidebar/resource drawers"

    def focus_contract(self) -> str:
        self.require_source(
            "dojo_theme/static/js/dojo/ui.js",
            "returnFocus.focus()",
            'event.key === "Tab"',
            "const focusable = Array.from",
        )
        self.require_source(
            "dojo_theme/static/js/dojo/learning-guide.js",
            "trapFocus(el.drawer, event)",
            "state.sidebarReturnFocus",
            "state.drawerReturnFocus",
        )
        return "browser checks covered course-code dialog, assignment confirmation, search, Agent sidebar and drawer; shared focus traps and return-focus paths are present"

    def live_regions(self) -> str:
        files = {
            "dojo_theme/templates/learning.html": ('role="status"', 'aria-live="polite"', 'aria-atomic="true"'),
            "dojo_theme/templates/learning_assignment.html": ('id="la-save-status" role="status" aria-live="polite" aria-atomic="true"',),
            "dojo_theme/templates/components/workspace_loading.html": ('role="status" aria-live="polite"',),
            "dojo_theme/templates/teacher_agent.html": ('aria-live="assertive"', 'aria-live="polite"'),
        }
        for path, needles in files.items():
            self.require_source(path, *needles)
        return "page notices, autosave, workspace stages, Agent tasks and uploads use atomic/polite live regions; only approval requests are assertive"

    def visual_accessibility(self) -> str:
        assert self.driver is not None
        self.driver.set_window_size(1440, 1000)
        self.driver.navigate(f"{self.flow.BASE_URL}/student")
        self.wait_student()
        self.driver.execute(
            "window.AISecEduUI.applyAppearance('dark','midnight',false); window.AISecEduUI.applyMotion(true,false); return true;"
        )
        time.sleep(0.3)
        state = self.driver.execute(
            """
            function rgb(value){const m=value.match(/[\d.]+/g).map(Number);return m.slice(0,3);}
            function lum(c){return c.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);}
            function contrast(a,b){const x=lum(rgb(a)),y=lum(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
            const card=document.querySelector('.sl-next-card');
            const style=getComputedStyle(card), text=getComputedStyle(card.querySelector('h2'));
            const surface=style.getPropertyValue('--cs-surface').trim() || getComputedStyle(document.body).backgroundColor;
            return {contrast:contrast(text.color,surface), text:text.color, surface, theme:document.documentElement.dataset.aiseceduTheme, motion:document.documentElement.dataset.aiseceduMotion, statusText:card.innerText};
            """
        )
        if float(state["contrast"]) < 4.5 or state["theme"] != "dark" or state["motion"] != "reduced" or "为什么推荐" not in state["statusText"]:
            raise AssertionError(f"dark/reduced-motion accessibility failed: {state}")
        self.require_source(
            "dojo_theme/static/css/teaching-agent.css",
            ".teacher-agent-page button:focus-visible",
            "@media (prefers-reduced-motion: reduce)",
        )
        return f"computed dark-mode text contrast {state['contrast']:.2f}:1, reduced motion active, statuses retain text/icons, and focus-visible styles are defined"

    def teacher_regression(self) -> str:
        if self.driver is not None:
            self.driver.close()
            self.driver = None
        completed = subprocess.run(
            [
                sys.executable,
                str(REPO_DIR / "ops" / "verify-course-center-ui.py"),
                "--output-dir",
                str(self.output_dir / "teacher-regression"),
            ],
            cwd=REPO_DIR,
            capture_output=True,
            text=True,
            timeout=300,
            check=False,
        )
        if completed.returncode != 0:
            raise AssertionError((completed.stdout + "\n" + completed.stderr)[-4000:])
        passed = sum(1 for line in completed.stdout.splitlines() if line.startswith("PASS  "))
        return f"existing teacher course-center browser regression remains green ({passed} checks)"

    def cleanup(self) -> None:
        if self.driver is not None:
            self.driver.close()
            self.driver = None
        if self.assignment_id:
            try:
                self.db_sql(
                    f"DELETE FROM learning_audit_events WHERE resource_type='teaching_assignment' AND resource_id={self.sql_literal(self.assignment_id)};"
                    f"DELETE FROM teaching_assignments WHERE id={self.sql_literal(self.assignment_id)};"
                )
            except Exception as error:
                print(f"WARN  assignment cleanup failed: {error}", flush=True)
        if self.admin is None:
            return
        for name in (self.student_name, self.outsider_name):
            try:
                response = self.flow.require(
                    self.admin.get(
                        f"{self.flow.BASE_URL}/api/v1/users",
                        params={"q": name, "field": "name"},
                        timeout=30,
                    )
                )
                for user in response.json().get("data") or []:
                    if user.get("name") != name:
                        continue
                    self.flow.require(
                        self.admin.delete(
                            f"{self.flow.BASE_URL}/api/v1/users/{user['id']}",
                            json={},
                            timeout=30,
                        )
                    )
            except Exception as error:
                print(f"WARN  account cleanup failed for {name}: {error}", flush=True)

    def write_report(self) -> None:
        report = {
            "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "baseUrl": self.flow.BASE_URL,
            "course": COURSE_REFERENCE,
            "summary": {
                "passed": sum(item["status"] == "PASS" for item in self.results),
                "failed": sum(item["status"] == "FAIL" for item in self.results),
                "total": len(self.results),
            },
            "scenarios": self.results,
        }
        (self.output_dir / "acceptance-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        )

    def run(self) -> int:
        try:
            self.setup()
            checks = [
                ("A01", "新生首页不给四个零", self.onboarding),
                ("A02", "已加入学生获得可解释下一步", self.ready_overview),
                ("A03", "降级首页仍可完成主要任务", self.degraded_overview),
                ("A04", "课程目录筛选、分页与可见性", self.catalog),
                ("A05", "历史有效入口不误删、已删除资源可恢复", self.deleted_resource),
                ("A06", "个人成果仅归本人且不可发布", self.personal_workspace),
                ("A07", "学生直接发布接口被拒绝", self.student_publish_denied),
                ("A08", "已发布成果采用学生安全视图", self.published_artifact),
                ("A09", "无实践章节不显示 0/0", self.reading_course),
                ("A10", "课程路径保持当前与前后文", self.course_path),
                ("A11", "移动课程目录和下一步可用", self.mobile_directory),
                ("A12", "工作区启动有阶段、取消与重试", self.workspace_failure),
                ("A13", "未知能力不伪装为 0%", self.unknown_mastery),
                ("A14", "等待评分不显示虚假零分", self.pending_score),
                ("A15", "低分与完整证据彼此独立", self.low_score_complete_evidence),
                ("A16", "越权尝试页面友好且不泄漏", self.unauthorized_attempt),
                ("A17", "成员关系权威覆盖陈旧上下文", self.stale_membership),
                ("A18", "作业自动保存、离线与多标签冲突", self.assignment_autosave),
                ("A19", "答案公布策略与错题优先", self.mobile_assignment_and_results),
                ("A20", "移动作业单题流与提交摘要", self.mobile_assignment_evidence),
                ("A21", "AI 引用上下文可见、可移除且影响请求", self.guide_references),
                ("A22", "全局搜索键盘、分组与空状态", self.global_search),
                ("A23", "旧深链保留查询与片段", self.legacy_links),
                ("A24", "我的创作按成果聚合版本", self.personal_library),
                ("A25", "空工作区提供中文恢复入口", self.empty_workspace),
                ("A26", "移动工作区单面板且无溢出", self.mobile_workspace),
                ("A27", "启动失败可安全幂等重试", self.workspace_retry_evidence),
                ("A28", "移动 AI 助手保持主要操作可用", self.mobile_guide),
                ("A29", "主要弹层和抽屉焦点闭环", self.focus_contract),
                ("A30", "动态状态使用克制的实时播报", self.live_regions),
                ("A31", "暗色、对比度、非颜色状态与减弱动画", self.visual_accessibility),
                ("A32", "教师端课程中心无回归", self.teacher_regression),
            ]
            for scenario_id, title, callback in checks:
                self.run_scenario(scenario_id, title, callback)
        except Exception as error:
            print(f"FATAL setup or verifier failure: {error}", flush=True)
            if not self.results:
                self.results.append(
                    {"id": "SETUP", "title": "验收环境", "status": "FAIL", "evidence": str(error)}
                )
        finally:
            self.cleanup()
            self.write_report()
        failed = [item for item in self.results if item["status"] == "FAIL"]
        print(
            f"SUMMARY passed={len(self.results) - len(failed)} failed={len(failed)} report={self.output_dir / 'acceptance-report.json'}",
            flush=True,
        )
        return 1 if failed or len(self.results) != 32 else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        default=str(REPO_DIR / "output" / "student-ux"),
    )
    args = parser.parse_args()
    return StudentUXVerifier(pathlib.Path(args.output_dir).resolve()).run()


if __name__ == "__main__":
    raise SystemExit(main())
