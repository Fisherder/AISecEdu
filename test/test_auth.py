import random
import re
import string
import urllib.parse
import os

import pytest
import requests

from utils import DOJO_URL, login, parse_csrf_token


ACCOUNT_SETTINGS_API = f"{DOJO_URL}/pwncollege_api/v1/users/settings"
UI_TELEMETRY_API = f"{DOJO_URL}/pwncollege_api/v1/ui/telemetry"


@pytest.mark.parametrize("endpoint", ["/", "/dojos", "/login", "/register"])
def test_unauthenticated_return_200(endpoint):
    response = requests.get(f"{DOJO_URL}{endpoint}")
    assert response.status_code == 200, (
        f"Expected status code 200, but got {response.status_code}"
    )


def test_login(admin_session):
    login("admin", "incorrect_password", success=False)
    response = admin_session.get(f"{DOJO_URL}/api/v1/users/me")
    assert response.status_code == 200


def test_register():
    random_id = "".join(random.choices(string.ascii_lowercase, k=16))
    login(random_id, random_id, register=True)


def test_student_portal_uses_real_account_scope_and_complete_learning_system(
    random_user_session,
):
    response = random_user_session.get(f"{DOJO_URL}/student", allow_redirects=False)
    assert response.status_code == 200
    assert 'id="learning-overview"' in response.text
    for element_id in (
        "learning-join-course-code",
        "learning-next-action",
        "learning-assignment-list",
        "learning-course-list",
        "learning-skill-list",
        "learning-creation-summary",
        "learning-progress-link",
    ):
        assert f'id="{element_id}"' in response.text

    # The Today surface intentionally links to secondary learning content
    # instead of eagerly rendering three more competing lists on first paint.
    assert 'href="/learning/extend"' in response.text
    assert 'href="/guide"' in response.text

    overview = random_user_session.get(
        f"{DOJO_URL}/pwncollege_api/v1/learning/overview"
    )
    assert overview.status_code == 200
    payload = overview.json()
    assert payload["success"] is True
    assert set(payload["profile"]) == {
        "summary",
        "weakestSkills",
        "strongestSkills",
        "recommendations",
        "recentAttempts",
    }
    assert payload["workspace"]["policy"]["role"] == "student"
    assert "read-other-students-data" in payload["workspace"]["policy"]["denied"]



def test_compact_learning_overview_contracts(random_user_session):
    full = random_user_session.get(
        f"{DOJO_URL}/pwncollege_api/v1/learning/overview"
    )
    assert full.status_code == 200
    full_payload = full.json()
    assert full_payload["success"] is True
    assert full_payload["workspace"]["policy"]["role"] == "student"

    today = random_user_session.get(
        f"{DOJO_URL}/pwncollege_api/v1/learning/overview?view=today"
    )
    assert today.status_code == 200
    today_payload = today.json()
    assert today_payload["success"] is True
    assert set(today_payload["workspace"]) == {"count"}
    assert all(course["modules"] == [] for course in today_payload["courses"])

    navigation = random_user_session.get(
        f"{DOJO_URL}/pwncollege_api/v1/learning/overview?view=navigation"
    )
    assert navigation.status_code == 200
    navigation_payload = navigation.json()
    assert navigation_payload["success"] is True
    assert set(navigation_payload) == {
        "success",
        "state",
        "membershipStatus",
        "courses",
    }


def test_product_telemetry_accepts_only_privacy_safe_events(random_user_session):
    accepted = random_user_session.post(
        UI_TELEMETRY_API,
        json={
            "name": "unknown_state",
            "eventVersion": 1,
            "journeyId": "ephemeral-test-journey",
            "surface": "course",
            "action": "workflow",
            "toState": "provider_pending",
            "result": "safe_fallback",
            "resource": {"type": "challenge", "id": "internal-test-resource"},
            "client": {"viewportClass": "desktop", "offline": False},
        },
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["data"] == {"accepted": True, "event": "unknown_state"}

    rejected = random_user_session.post(
        UI_TELEMETRY_API,
        json={"name": "unknown_state", "context": {"student_text": "private"}},
    )
    assert rejected.status_code == 422, rejected.text
    assert rejected.json()["error"]["code"] == "TELEMETRY_EVENT_REJECTED"


@pytest.mark.parametrize(
    "endpoint", ["/", "/dojos", "/login", "/register", "/reset_password"]
)
def test_public_pages_use_aisecedu_theme(endpoint):
    response = requests.get(f"{DOJO_URL}{endpoint}")
    assert response.status_code == 200
    assert 'class="product-brand"' in response.text
    assert "<strong>玄甲</strong>" in response.text
    assert 'data-aisecedu-palette="academy"' in response.text
    assert "data-theme-toggle" not in response.text
    assert "product-theme-control" not in response.text
    rendered = response.text.lower()
    configured_hosts = {
        urllib.parse.urlsplit(DOJO_URL).hostname,
        os.getenv("DOJO_HTTP_HOST"),
    }
    for host in configured_hosts:
        if host:
            rendered = rendered.replace(host.lower(), "[configured-host]")
    assert "pwn.college" not in rendered


def test_public_and_discord_failures_render_recoverable_product_states(
    random_user_session,
):
    missing = requests.get(f"{DOJO_URL}/content-that-does-not-exist")
    assert missing.status_code == 404
    assert "返回今天" not in missing.text
    assert "返回首页" in missing.text
    assert 'data-request-id="' in missing.text

    discord = random_user_session.get(
        f"{DOJO_URL}/discord/redirect",
        allow_redirects=False,
    )
    assert discord.status_code in {400, 503}
    assert discord.status_code != 501
    assert "text/html" in discord.headers.get("Content-Type", "")
    assert "返回账户设置" in discord.text
    assert "Discord" in discord.text
    assert 'data-request-id="' in discord.text


@pytest.mark.parametrize(
    "asset",
    [
        "learning-common",
        "learning-overview",
        "learning-dashboard",
        "learning-tutor",
        "course-admin",
        "self-learning-extend",
        "teaching-agent",
        "teaching-artifact",
        "navbar",
        "teacher-courses",
    ],
)
def test_learning_theme_assets_are_served(asset):
    response = requests.get(
        f"{DOJO_URL}/themes/dojo_theme/static/js/dojo/{asset}.min.js"
    )
    assert response.status_code == 200
    assert "javascript" in response.headers["Content-Type"]
    assert len(response.content) > 100


def test_versioned_theme_assets_are_compressed_and_cacheable():
    response = requests.get(
        f"{DOJO_URL}/themes/dojo_theme/static/js/dojo/teacher-courses.min.js",
        params={"v": "performance-contract-v1"},
        headers={"Accept-Encoding": "gzip"},
    )
    assert response.status_code == 200
    assert response.headers.get("Content-Encoding") == "gzip"
    assert "immutable" in response.headers.get("Cache-Control", "")
    assert "Set-Cookie" not in response.headers


def test_teaching_agent_theme_styles_are_served():
    response = requests.get(
        f"{DOJO_URL}/themes/dojo_theme/static/css/teaching-agent.min.css"
    )
    assert response.status_code == 200
    assert "css" in response.headers["Content-Type"]
    assert len(response.content) > 100
    assert ".teaching-shell" in response.text
    assert ".teaching-conversation" in response.text
    assert ".teaching-drawer" in response.text
    assert ".teaching-quick-prompts" in response.text


@pytest.mark.parametrize(
    ("asset", "source_selector"),
    [
        ("product-shell", ".product-navbar"),
        ("course-hub", ".course-hub"),
        ("learning-themes", '[data-aisecedu-palette="academy"]'),
    ],
)
def test_product_shell_styles_are_served(asset, source_selector):
    compiled = requests.get(f"{DOJO_URL}/themes/dojo_theme/static/css/{asset}.min.css")
    source = requests.get(f"{DOJO_URL}/themes/dojo_theme/static/css/{asset}.css")

    assert compiled.status_code == 200
    assert "css" in compiled.headers["Content-Type"]
    assert f'@import url("./{asset}.css?v=' in compiled.text
    assert source.status_code == 200
    assert "css" in source.headers["Content-Type"]
    assert source_selector in source.text


@pytest.mark.parametrize(
    ("endpoint", "destination"),
    [
        ("/forgot-password", "/reset_password"),
        ("/reset-password/example", "/reset_password/example"),
        ("/verify-email/example", "/confirm/example"),
        ("/community", "/dojos"),
        ("/leaderboard", "/dojos"),
    ],
)
def test_removed_frontend_routes_are_canonicalized(endpoint, destination):
    response = requests.get(f"{DOJO_URL}{endpoint}", allow_redirects=False)
    assert response.status_code == 308
    assert urllib.parse.urlparse(response.headers["Location"]).path == destination


def test_public_authentication_configuration():
    response = requests.get(f"{DOJO_URL}/pwncollege_api/v1/auth/config")
    assert response.status_code == 200
    data = response.json()["data"]
    assert isinstance(data["registrationEnabled"], bool)
    assert data["commitment"]["required"] is True
    assert "玄甲课程题目" in data["commitment"]["text"]
    assert "DOJO" not in data["commitment"]["text"]
    assert data["onboarding"] == {
        "roles": ["student", "teacher"],
        "studentDestination": "/student",
        "teacherDestination": "/teacher/courses/new?onboarding=1",
        "courseInvitationSupported": True,
    }


def test_auth_pages_use_unified_course_onboarding_ui():
    login_page = requests.get(f"{DOJO_URL}/login")
    register_page = requests.get(f"{DOJO_URL}/register")

    assert login_page.status_code == 200
    assert register_page.status_code == 200
    for response in (login_page, register_page):
        assert 'class="account-auth-shell"' in response.text
        assert any(
            asset in response.text
            for asset in ("css/account-auth.css", "css/account-auth.min.css")
        )
        assert any(
            asset in response.text
            for asset in (
                "js/dojo/account-auth.js",
                "js/dojo/account-auth.min.js",
            )
        )

    assert 'data-auth-page="login"' in login_page.text
    assert 'id="account-login-form"' in login_page.text
    assert 'data-auth-page="register"' in register_page.text
    assert 'id="account-register-form"' in register_page.text
    assert 'name="role" value="student"' in register_page.text
    assert 'name="role" value="teacher"' in register_page.text
    assert 'id="account-course-entry"' in register_page.text
    assert 'id="commitment-input" type="checkbox"' in register_page.text
    assert "完全按照下方显示内容输入承诺" not in register_page.text


def test_admin_overview_uses_lightweight_product_shell(admin_session):
    for endpoint in ("/admin", "/admin/statistics"):
        response = admin_session.get(f"{DOJO_URL}{endpoint}", allow_redirects=False)
        assert response.status_code == 200
        assert 'data-admin-overview-ready="true"' in response.text
        assert "平台健康与待处理事项" in response.text
        assert 'data-product-mode="admin"' in response.text
        assert re.search(r"vendor\.bundle(?:\.min)?\.js", response.text) is None
        assert "echarts.bundle.js" not in response.text
        assert "js/pages/statistics.js" not in response.text


@pytest.mark.parametrize(
    ("endpoint", "heading"),
    [
        ("/admin/users", "用户与权限"),
        ("/admin/challenges", "平台题目"),
        ("/admin/dojos", "课程健康与负责人"),
        ("/admin/desktops", "正在占用资源的实验环境"),
        ("/admin/submissions", "提交记录"),
    ],
)
def test_high_volume_admin_collections_use_bounded_product_pages(
    admin_session, endpoint, heading
):
    response = admin_session.get(f"{DOJO_URL}{endpoint}", allow_redirects=False)
    assert response.status_code == 200
    assert 'class="admin-product' in response.text
    assert heading in response.text
    assert re.search(r"vendor\.bundle(?:\.min)?\.js", response.text) is None
    rendered_rows = sum(
        len(re.findall(r"<tr(?:\s|>)", body))
        for body in re.findall(r"<tbody[^>]*>(.*?)</tbody>", response.text, re.S)
    )
    assert rendered_rows <= 25


def test_admin_runtime_stop_requires_admin_confirmation_and_idempotency(
    admin_session,
    random_user_session,
):
    admin_page = admin_session.get(
        f"{DOJO_URL}/admin/desktops", allow_redirects=False
    )
    assert admin_page.status_code == 200
    assert "js/dojo/admin-runtimes" in admin_page.text

    current_admin = admin_session.get(f"{DOJO_URL}/api/v1/users/me").json()["data"]
    endpoint = (
        f"{DOJO_URL}/pwncollege_api/v1/workspace/admin/runtimes/"
        f"{current_admin['id']}/stop"
    )

    missing_key = admin_session.post(
        endpoint,
        json={
            "confirmed": True,
            "confirmUser": current_admin["name"],
        },
    )
    assert missing_key.status_code == 422
    assert missing_key.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"
    assert missing_key.json()["meta"]["requestId"]

    wrong_confirmation = admin_session.post(
        endpoint,
        headers={"Idempotency-Key": "admin-runtime-contract-test"},
        json={
            "confirmed": True,
            "confirmUser": "not-the-target-account",
            "idempotencyKey": "admin-runtime-contract-test",
        },
    )
    assert wrong_confirmation.status_code == 422
    assert wrong_confirmation.json()["error"]["code"] == (
        "RUNTIME_STOP_CONFIRMATION_REQUIRED"
    )

    forbidden = random_user_session.post(
        endpoint,
        headers={"Idempotency-Key": "admin-runtime-forbidden-test"},
        json={
            "confirmed": True,
            "confirmUser": current_admin["name"],
            "idempotencyKey": "admin-runtime-forbidden-test",
        },
        allow_redirects=False,
    )
    assert forbidden.status_code in {302, 401, 403}


def test_admin_platform_role_change_previews_diff_is_immediate_and_audited(
    admin_session,
    random_user_session,
):
    target = random_user_session.get(
        f"{DOJO_URL}/api/v1/users/me"
    ).json()["data"]
    endpoint = (
        f"{DOJO_URL}/pwncollege_api/v1/admin/users/"
        f"{target['id']}/platform-role"
    )

    page = admin_session.get(
        f"{DOJO_URL}/admin/users",
        params={"q": target["name"], "field": "name"},
        allow_redirects=False,
    )
    assert page.status_code == 200
    assert "js/dojo/admin-users" in page.text
    assert "变更预览" in page.text
    assert f'data-user-id="{target["id"]}"' in page.text

    impact = admin_session.get(
        endpoint,
        params={"targetRole": "platform_admin"},
    )
    assert impact.status_code == 200
    impact_data = impact.json()["data"]
    assert impact_data["before"]["role"] == "standard"
    assert impact_data["after"]["role"] == "platform_admin"
    assert "users:manage" in impact_data["diff"]["granted"]
    assert impact_data["impact"]["takesEffect"] == (
        "immediately_on_next_request"
    )
    assert impact_data["impact"]["courseMembershipsChanged"] is False

    missing_key = admin_session.post(
        endpoint,
        json={
            "targetRole": "platform_admin",
            "confirmed": True,
            "confirmUser": target["name"],
            "reason": "验证平台权限治理契约",
        },
    )
    assert missing_key.status_code == 422
    assert missing_key.json()["error"]["code"] == "IDEMPOTENCY_KEY_REQUIRED"

    promote_key = f"role-promote-{target['id']}-{random.randint(10000, 99999)}"
    promote_body = {
        "targetRole": "platform_admin",
        "confirmed": True,
        "confirmUser": target["name"],
        "reason": "验证平台权限治理契约",
        "idempotencyKey": promote_key,
    }
    demote_key = f"role-demote-{target['id']}-{random.randint(10000, 99999)}"
    demote_body = {
        "targetRole": "standard",
        "confirmed": True,
        "confirmUser": target["name"],
        "reason": "验收完成立即撤销临时权限",
        "idempotencyKey": demote_key,
    }
    demoted = None
    try:
        promoted = admin_session.post(
            endpoint,
            headers={"Idempotency-Key": promote_key},
            json=promote_body,
        )
        assert promoted.status_code == 200
        promoted_data = promoted.json()["data"]
        assert promoted_data["effective"] is True
        assert promoted_data["auditEventId"]
        assert random_user_session.get(
            f"{DOJO_URL}/admin", allow_redirects=False
        ).status_code == 200

        replay = admin_session.post(
            endpoint,
            headers={"Idempotency-Key": promote_key},
            json=promote_body,
        )
        assert replay.status_code == 200
        assert replay.json()["data"]["replayed"] is True
        assert replay.json()["data"]["auditEventId"] == promoted_data["auditEventId"]
    finally:
        demoted = admin_session.post(
            endpoint,
            headers={"Idempotency-Key": demote_key},
            json=demote_body,
        )
    assert demoted.status_code == 200
    assert demoted.json()["data"]["after"]["role"] == "standard"
    assert random_user_session.get(
        f"{DOJO_URL}/admin", allow_redirects=False
    ).status_code in {302, 401, 403}


def test_admin_config_default_is_query_bounded_and_code_split(admin_session):
    response = admin_session.get(f"{DOJO_URL}/admin/config", allow_redirects=False)
    assert response.status_code == 200
    assert 'data-admin-config-section="settings"' in response.text
    assert "js/dojo/admin-config.js" in response.text
    assert re.search(r"vendor\.bundle(?:\.min)?\.js", response.text) is None
    assert re.search(r"js/pages/configs(?:\.min)?\.js", response.text) is None

    advanced = admin_session.get(
        f"{DOJO_URL}/admin/config?section=ctftime", allow_redirects=False
    )
    assert advanced.status_code == 200
    assert 'data-admin-config-section="ctftime"' in advanced.text
    assert re.search(r"js/pages/configs(?:\.min)?\.js", advanced.text)
    assert re.search(r"vendor\.bundle(?:\.min)?\.js", advanced.text)


@pytest.mark.parametrize(
    ("endpoint", "asset"),
    [
        ("/settings", "js/dojo/settings.js"),
        ("/hacker/", "js/dojo/activity.js"),
    ],
)
def test_account_surfaces_do_not_load_legacy_runtime(admin_session, endpoint, asset):
    response = admin_session.get(f"{DOJO_URL}{endpoint}", allow_redirects=False)
    assert response.status_code == 200
    # The production theme endpoint rewrites JavaScript assets to ``.min.js``.
    # Match the stable path stem so the contract covers both render modes.
    assert asset.removesuffix(".js") in response.text
    assert re.search(r"vendor\.bundle(?:\.min)?\.js", response.text) is None
    assert re.search(r"js/pages/main(?:\.min)?\.js", response.text) is None


def test_student_and_teacher_agents_share_one_workbench(
    random_user_session,
    admin_session,
):
    student = random_user_session.get(f"{DOJO_URL}/guide")
    teacher = admin_session.get(f"{DOJO_URL}/teacher")

    assert student.status_code == 200
    assert teacher.status_code == 200
    for response in (student, teacher):
        assert 'id="teacher-agent" class="teaching-shell"' in response.text
        assert any(
            asset in response.text
            for asset in (
                "css/teaching-agent.css",
                "css/teaching-agent.min.css",
            )
        )
        assert 'id="teaching-thread-list"' in response.text
        assert 'id="teaching-messages"' in response.text
        assert 'id="teaching-drawer"' in response.text

    assert 'data-role="student"' in student.text
    assert any(
        asset in student.text
        for asset in (
            "js/dojo/learning-guide.js",
            "js/dojo/learning-guide.min.js",
        )
    )
    assert 'id="student-reference-dialog"' in student.text
    assert 'class="guide-shell"' not in student.text
    assert 'data-role="teacher"' in teacher.text
    assert any(
        asset in teacher.text
        for asset in (
            "js/dojo/teaching-agent.js",
            "js/dojo/teaching-agent.min.js",
        )
    )
    assert 'id="student-reference-dialog"' not in teacher.text


def test_registration_atomically_creates_student_and_course_membership(
    simple_award_dojo,
):
    random_id = "course" + "".join(random.choices(string.ascii_lowercase, k=12))
    session = requests.Session()
    register_page = session.get(f"{DOJO_URL}/register")
    session.headers["CSRF-Token"] = parse_csrf_token(register_page.text)

    response = session.post(
        f"{DOJO_URL}/pwncollege_api/v1/auth/register",
        json={
            "name": random_id,
            "email": f"{random_id}@example.com",
            "password": f"{random_id}-Secure-1!",
            "role": "student",
            "course_id": simple_award_dojo,
            "commitment_accepted": True,
        },
    )
    assert response.status_code == 200, response.text
    onboarding = response.json()["data"]["onboarding"]
    assert onboarding["role"] == "student"
    assert onboarding["destination"] == f"/{simple_award_dojo}"
    assert onboarding["enrollment"]["id"] == simple_award_dojo

    overview = session.get(f"{DOJO_URL}/pwncollege_api/v1/learning/overview")
    assert overview.status_code == 200, overview.text
    assert simple_award_dojo in {
        course["id"] for course in overview.json()["enrolledCourses"]
    }


def test_teacher_registration_is_safe_bootstrap_not_self_promotion():
    random_id = "teacher" + "".join(random.choices(string.ascii_lowercase, k=12))
    session = requests.Session()
    register_page = session.get(f"{DOJO_URL}/register")
    session.headers["CSRF-Token"] = parse_csrf_token(register_page.text)

    response = session.post(
        f"{DOJO_URL}/pwncollege_api/v1/auth/register",
        json={
            "name": random_id,
            "email": f"{random_id}@example.com",
            "password": f"{random_id}-Secure-1!",
            "role": "teacher",
            "commitment_accepted": True,
        },
    )
    assert response.status_code == 200, response.text
    data = response.json()["data"]
    assert data["course_teacher"] is False
    assert data["onboarding"]["destination"] == "/teacher/courses/new?onboarding=1"
    assert session.get(f"{DOJO_URL}/teacher").status_code == 403
    onboarding_page = session.get(f"{DOJO_URL}/teacher/courses/new")
    assert onboarding_page.status_code == 200
    session.headers["CSRF-Token"] = parse_csrf_token(onboarding_page.text)

    reference_id = None
    try:
        created = session.post(
            f"{DOJO_URL}/pwncollege_api/v1/teaching/courses",
            json={
                "name": f"{random_id} 的第一门课程",
                "slug": random_id,
                "access": "private",
                "initialModuleName": "开始学习",
            },
        )
        assert created.status_code == 201, created.text
        reference_id = created.json()["data"]["course"]["referenceId"]
        assert session.get(f"{DOJO_URL}/teacher").status_code == 200
    finally:
        if reference_id:
            cleanup = session.delete(
                f"{DOJO_URL}/pwncollege_api/v1/teaching/courses/{reference_id}",
                json={},
            )
            assert cleanup.status_code == 200, cleanup.text


def test_account_profile_and_preferences_are_validated_and_persisted(random_user):
    name, session = random_user

    initial = session.get(ACCOUNT_SETTINGS_API)
    assert initial.status_code == 200, initial.text
    initial_data = initial.json()["data"]
    assert initial_data["profile"]["name"] == name
    assert initial_data["profile"]["hidden"] is False
    assert initial_data["preferences"] == {
        "appearance": "system",
        "palette": "academy",
        "reducedMotion": False,
    }
    assert initial_data["capabilities"]["archivedConversations"] is False
    assert initial_data["capabilities"]["canChangePassword"] is True

    saved = session.patch(
        ACCOUNT_SETTINGS_API,
        json={
            "profile": {
                "website": "https://example.com/teacher",
                "affiliation": "玄甲测试学院",
                "hidden": True,
            },
            "preferences": {
                "appearance": "dark",
                "palette": "forest",
                "reducedMotion": True,
            },
        },
    )
    assert saved.status_code == 200, saved.text
    saved_data = saved.json()["data"]
    assert saved_data["profile"]["website"] == "https://example.com/teacher"
    assert saved_data["profile"]["affiliation"] == "玄甲测试学院"
    assert saved_data["profile"]["hidden"] is True
    assert saved_data["preferences"] == {
        "appearance": "dark",
        "palette": "forest",
        "reducedMotion": True,
    }

    refreshed = session.get(ACCOUNT_SETTINGS_API)
    assert refreshed.status_code == 200, refreshed.text
    assert refreshed.json()["data"]["preferences"] == saved_data["preferences"]
    assert refreshed.json()["data"]["profile"]["hidden"] is True

    rejected = session.patch(
        ACCOUNT_SETTINGS_API,
        json={"preferences": {"palette": "not-a-real-palette"}},
    )
    assert rejected.status_code == 400, rejected.text
    assert rejected.json()["field"] == "preferences.palette"

    unknown = session.patch(
        ACCOUNT_SETTINGS_API,
        json={"preferences": {"timezone": "UTC"}},
    )
    assert unknown.status_code == 400, unknown.text
    assert unknown.json()["field"] == "preferences"

    unchanged = session.get(ACCOUNT_SETTINGS_API).json()["data"]
    assert unchanged["preferences"] == saved_data["preferences"]


def test_account_email_change_requires_current_password(random_user):
    name, session = random_user
    original = session.get(ACCOUNT_SETTINGS_API).json()["data"]["profile"]["email"]
    changed = f"{name}-updated@example.com"

    missing = session.patch(
        ACCOUNT_SETTINGS_API,
        json={"profile": {"email": changed}},
    )
    assert missing.status_code == 400, missing.text
    assert missing.json()["errorCode"] == "CURRENT_PASSWORD_REQUIRED"

    wrong = session.patch(
        ACCOUNT_SETTINGS_API,
        json={
            "profile": {"email": changed},
            "currentPassword": "incorrect-password",
        },
    )
    assert wrong.status_code == 403, wrong.text
    assert wrong.json()["errorCode"] == "CURRENT_PASSWORD_INVALID"

    updated = session.patch(
        ACCOUNT_SETTINGS_API,
        json={"profile": {"email": changed}, "currentPassword": name},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["data"]["profile"]["email"] == changed

    restored = session.patch(
        ACCOUNT_SETTINGS_API,
        json={"profile": {"email": original}, "currentPassword": name},
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["data"]["profile"]["email"] == original


def test_account_password_change_keeps_current_session_and_revokes_old_password(
    random_user,
):
    name, session = random_user
    changed_password = f"{name}-new-password"

    mismatch = session.post(
        f"{ACCOUNT_SETTINGS_API}/password",
        json={
            "currentPassword": name,
            "newPassword": changed_password,
            "confirmPassword": f"{changed_password}-mismatch",
        },
    )
    assert mismatch.status_code == 400, mismatch.text
    assert mismatch.json()["errorCode"] == "PASSWORD_MISMATCH"

    changed = session.post(
        f"{ACCOUNT_SETTINGS_API}/password",
        json={
            "currentPassword": name,
            "newPassword": changed_password,
            "confirmPassword": changed_password,
        },
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["data"]["reauthRequired"] is False
    assert session.get(ACCOUNT_SETTINGS_API).status_code == 200

    login(name, name, success=False)
    login(name, changed_password)

    restored = session.post(
        f"{ACCOUNT_SETTINGS_API}/password",
        json={
            "currentPassword": changed_password,
            "newPassword": name,
            "confirmPassword": name,
        },
    )
    assert restored.status_code == 200, restored.text
