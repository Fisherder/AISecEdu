import os
import secrets
from pathlib import Path

import pytest

from utils import DOJO_URL


REPO_ROOT = Path(__file__).resolve().parents[1]
SETTINGS_TEMPLATE = REPO_ROOT / "dojo_theme/templates/settings.html"
PROFILE_TEMPLATE = REPO_ROOT / "dojo_theme/templates/hacker.html"
PROFILE_SCRIPT = REPO_ROOT / "dojo_theme/static/js/dojo/activity.js"
PROFILE_PAGE = REPO_ROOT / "dojo_plugin/pages/users.py"
SETTINGS_SCRIPT = REPO_ROOT / "dojo_theme/static/js/dojo/settings.js"
UI_SCRIPT = REPO_ROOT / "dojo_theme/static/js/dojo/ui.js"
SETTINGS_STYLE = REPO_ROOT / "dojo_theme/static/css/account-settings.css"
BASE_TEMPLATE = REPO_ROOT / "dojo_theme/templates/base.html"
NAVBAR_TEMPLATE = REPO_ROOT / "dojo_theme/templates/components/navbar.html"


def source(path):
    return path.read_text(encoding="utf-8")


def test_global_navbar_has_no_theme_picker_but_settings_keeps_appearance_controls():
    navbar = source(NAVBAR_TEMPLATE)
    settings = source(SETTINGS_TEMPLATE)

    assert 'id="global-search-trigger"' in navbar
    assert 'id="product-account-toggle"' in navbar
    assert "data-theme-toggle" not in navbar
    assert "product-theme-control" not in navbar
    assert "product-theme-menu" not in navbar
    assert 'data-settings-appearance="system"' in settings
    assert 'data-settings-palette="academy"' in settings
    assert 'data-settings-palette="midnight"' in settings


def test_settings_uses_deep_real_account_sections_without_core_double_binding():
    template = source(SETTINGS_TEMPLATE)

    for section in ("profile", "account", "security", "appearance", "data"):
        assert f'data-settings-section="{section}"' in template
        assert f'data-settings-panel="{section}"' in template

    assert 'data-settings-endpoint="/pwncollege_api/v1/users/settings"' in template
    assert 'id="settings-token-form"' in template
    assert 'class="settings-delete-token"' in template
    assert "js/pages/settings.js" not in template
    assert 'id="user-profile-form"' not in template
    assert 'id="user-token-form"' not in template
    assert 'class="delete-token"' not in template


def test_archive_management_is_a_searchable_deep_page_with_restore_and_delete():
    template = source(SETTINGS_TEMPLATE)
    script = source(SETTINGS_SCRIPT)

    assert 'data-settings-open-subpage="archives"' in template
    assert 'data-settings-subpage="archives"' in template
    assert 'id="settings-archive-search"' in template
    assert "data-restore-thread" in script
    assert "data-delete-thread" in script
    assert 'method: "PATCH"' in script
    assert 'body: {archived: false}' in script
    assert 'method: "DELETE"' in script
    assert 'body: {confirmed: true}' in script
    assert "archiveEntry.hidden = !isTeacher" in script


def test_profile_security_and_appearance_controls_have_real_endpoints_and_consumers():
    template = source(SETTINGS_TEMPLATE)
    script = source(SETTINGS_SCRIPT)
    ui = source(UI_SCRIPT)
    base = source(BASE_TEMPLATE)

    assert 'id="settings-profile-hidden"' in template
    assert 'id="settings-password-form"' in template
    assert 'id="settings-reduced-motion"' in template
    assert 'data-settings-appearance="system"' in template
    assert 'settingsRequest(`${endpoint}/password`' in script
    assert 'settingsRequest("/api/v1/tokens"' in script
    assert 'preferences: {palette, appearance:' not in script
    assert "applyPreferences" in ui
    assert "applyMotion" in ui
    assert "aisecedu-reduced-motion" in ui
    assert 'dataset.aiseceduMotion = next ? "reduced" : "full"' in ui
    assert "persistAccountPreferences" in ui
    assert "account_preferences | default(none) | tojson" in base


def test_profile_page_is_a_complete_learning_record_and_uses_product_shell():
    template = source(PROFILE_TEMPLATE)
    style = source(SETTINGS_STYLE)
    script = source(PROFILE_SCRIPT)
    page = source(PROFILE_PAGE)

    assert 'class="profile-page-shell"' in template
    assert 'id="activity-tracker"' in template
    for section in (
        "profile-overview",
        "profile-activity",
        "profile-courses",
        "profile-achievements",
    ):
        assert f'id="{section}"' in template
    assert 'class="profile-stat-grid"' in template
    assert 'class="profile-next-card"' in template
    assert 'class="profile-completion-list"' in template
    assert 'class="profile-focus-list"' in template
    assert 'class="profile-recent-list"' in template
    assert "profile.courses" in template
    assert "profile.learning_focus" in template
    assert "profile.recent_activity" in template
    assert 'url_for(\'views.settings\')' in template
    assert "分享到 LinkedIn" not in template
    assert "分享到 X" not in template
    assert "linkedin.com/share" not in template
    assert "twitter.com/intent/tweet" not in template
    assert "def build_profile_overview" in page
    assert '"current_streak"' in page
    assert '"profile_completion"' in page
    assert '"learning_focus"' in page
    assert '"recent_activity"' in page
    assert "/pwncollege_api/v1/activity/" in script
    assert 'Intl.DateTimeFormat("zh-CN"' in script
    assert "completions" not in script
    assert "完成题目" in script
    assert ".profile-hero" in style
    assert ".profile-dashboard" in style
    assert ".profile-stat-grid" in style
    assert ".profile-activity-scroll" in style
    assert "@media (max-width: 720px)" in style
    assert "var(--product-surface)" in style


@pytest.mark.skipif(
    os.getenv("AISECEDU_SETTINGS_BROWSER") != "1",
    reason="set AISECEDU_SETTINGS_BROWSER=1 against a deployed stack",
)
@pytest.mark.timeout(120)
def test_account_settings_browser_flow(browser_fixture, admin_session):
    selenium_by = pytest.importorskip("selenium.webdriver.common.by")
    selenium_wait = pytest.importorskip("selenium.webdriver.support.ui")
    selenium_keys = pytest.importorskip("selenium.webdriver.common.keys")
    origin = DOJO_URL.rstrip("/")
    settings_api = f"{origin}/pwncollege_api/v1/users/settings"
    threads_api = f"{origin}/pwncollege_api/v1/teaching/threads"
    original = admin_session.get(settings_api).json()["data"]
    suffix = secrets.token_hex(4)
    active_title = f"侧栏未归档验收 {suffix}"
    restore_title = f"设置页恢复验收 {suffix}"
    delete_title = f"设置页删除验收 {suffix}"
    created_ids = []

    for title in (restore_title, delete_title):
        response = admin_session.post(threads_api, json={"title": title})
        assert response.status_code == 201, response.text
        thread_id = response.json()["data"]["thread"]["id"]
        created_ids.append(thread_id)
        archived = admin_session.patch(
            f"{threads_api}/{thread_id}", json={"archived": True}
        )
        assert archived.status_code == 200, archived.text

    active_response = admin_session.post(threads_api, json={"title": active_title})
    assert active_response.status_code == 201, active_response.text
    active_id = active_response.json()["data"]["thread"]["id"]
    created_ids.append(active_id)

    browser = browser_fixture
    wait = selenium_wait.WebDriverWait(browser, 45)
    try:
        browser.get(origin)
        for cookie in admin_session.cookies:
            browser.add_cookie({
                "name": cookie.name,
                "value": cookie.value,
                "path": cookie.path or "/",
                "secure": bool(cookie.secure),
            })
        browser.get(f"{origin}/teacher")
        active_row = wait.until(
            lambda driver: driver.find_element(
                selenium_by.By.CSS_SELECTOR, f'[data-thread-row="{active_id}"]'
            )
        )
        assert active_title in active_row.text
        sidebar = browser.find_element(selenium_by.By.ID, "teaching-sidebar")
        assert not sidebar.find_elements(
            selenium_by.By.CSS_SELECTOR, "[data-thread-view]"
        )
        assert restore_title not in sidebar.text
        assert delete_title not in sidebar.text

        browser.get(f"{origin}/settings#profile")
        wait.until(lambda driver: driver.find_element(selenium_by.By.ID, "account-settings-app").get_attribute("data-settings-ready") == "true")
        wait.until(lambda driver: driver.find_element(selenium_by.By.ID, "affiliation").get_attribute("value") is not None)

        affiliation = browser.find_element(selenium_by.By.ID, "affiliation")
        affiliation.clear()
        affiliation.send_keys(f"玄甲 UI QA {suffix}")
        browser.find_element(selenium_by.By.CSS_SELECTOR, "#settings-profile-form [type='submit']").click()
        wait.until(lambda driver: "个人资料已保存" in driver.find_element(selenium_by.By.ID, "settings-profile-status").text)
        saved = admin_session.get(settings_api).json()["data"]
        assert saved["profile"]["affiliation"] == f"玄甲 UI QA {suffix}"

        browser.find_element(selenium_by.By.CSS_SELECTOR, "[data-settings-section='appearance']").click()
        browser.find_element(selenium_by.By.CSS_SELECTOR, "[data-settings-palette='midnight']").click()
        wait.until(lambda driver: "外观偏好已保存" in driver.find_element(selenium_by.By.ID, "settings-appearance-status").text)
        motion = browser.find_element(selenium_by.By.ID, "settings-reduced-motion")
        if not motion.is_selected():
            browser.execute_script("arguments[0].click()", motion)
        wait.until(lambda driver: driver.execute_script("return document.documentElement.dataset.aiseceduMotion") == "reduced")
        browser.refresh()
        wait.until(lambda driver: driver.execute_script("return document.documentElement.dataset.aiseceduTheme") == "dark")
        assert browser.execute_script("return document.documentElement.dataset.aiseceduMotion") == "reduced"

        browser.set_window_size(390, 844)
        assert browser.execute_script("return document.documentElement.scrollWidth <= window.innerWidth")
        browser.get(f"{origin}/settings#data/archives")
        search = wait.until(lambda driver: driver.find_element(selenium_by.By.ID, "settings-archive-search"))
        search.send_keys(restore_title)
        restore = wait.until(lambda driver: driver.find_element(selenium_by.By.CSS_SELECTOR, f"[data-restore-thread='{created_ids[0]}']"))
        restore.click()
        wait.until(lambda driver: not driver.find_elements(selenium_by.By.CSS_SELECTOR, f"[data-archive-thread='{created_ids[0]}']"))

        search = browser.find_element(selenium_by.By.ID, "settings-archive-search")
        search.send_keys(selenium_keys.Keys.CONTROL, "a")
        search.send_keys(delete_title)
        delete = wait.until(lambda driver: driver.find_element(selenium_by.By.CSS_SELECTOR, f"[data-delete-thread='{created_ids[1]}']"))
        delete.click()
        confirm = wait.until(lambda driver: driver.find_element(selenium_by.By.CSS_SELECTOR, "[data-dialog-action='confirm']"))
        confirm.click()
        wait.until(lambda driver: not driver.find_elements(selenium_by.By.CSS_SELECTOR, f"[data-archive-thread='{created_ids[1]}']"))
        assert admin_session.get(f"{threads_api}/{created_ids[1]}").status_code == 404
        assert browser.execute_script("return document.documentElement.scrollWidth <= window.innerWidth")

        browser.get(f"{origin}/hacker/")
        wait.until(lambda driver: driver.find_element(selenium_by.By.CSS_SELECTOR, ".profile-page-shell"))
        assert browser.find_element(selenium_by.By.ID, "activity-tracker")
        assert browser.execute_script("return document.documentElement.scrollWidth <= window.innerWidth")
        assert browser.execute_script("return document.documentElement.dataset.aiseceduTheme") == "dark"
    finally:
        admin_session.patch(settings_api, json={
            "profile": {
                "name": original["profile"]["name"],
                "email": original["profile"]["email"],
                "website": original["profile"].get("website") or "",
                "affiliation": original["profile"].get("affiliation") or "",
                "country": original["profile"].get("country") or "",
                "hidden": bool(original["profile"].get("hidden")),
            },
            "preferences": original["preferences"],
        })
        for thread_id in created_ids:
            admin_session.delete(f"{threads_api}/{thread_id}", json={"confirmed": True})
