import contextlib
import re
import time
import string
import random
from urllib.parse import urlsplit

from selenium.common.exceptions import NoSuchElementException, StaleElementReferenceException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

from utils import DOJO_URL, workspace_run

@contextlib.contextmanager
def vscode_terminal(browser):
    module_window = browser.current_window_handle

    browser.switch_to.new_window("tab")
    browser.get(f"{DOJO_URL}/workspace?service=code")

    wait = WebDriverWait(browser, 30)
    workspace_iframe = wait.until(lambda driver: (
        (frame := driver.find_element(By.ID, "workspace-iframe"))
        and ("folder=%2Fchallenge" in (frame.get_attribute("src") or "")
             or "folder=/challenge" in (frame.get_attribute("src") or ""))
        and frame.get_attribute("data-workspace-ready") == "true"
        and frame.get_attribute("aria-busy") == "false"
        and frame))
    iframe_src = workspace_iframe.get_attribute("src") or ""
    assert "folder=%2Fchallenge" in iframe_src or "folder=/challenge" in iframe_src
    browser.switch_to.frame(workspace_iframe)

    def wait_for_selector(*selectors):
        def locate(driver):
            for selector in selectors:
                elements = driver.find_elements(By.CSS_SELECTOR, selector)
                if elements:
                    return elements[-1]
            return False
        try:
            return wait.until(locate)
        except Exception as e:
            try:
                print(browser.get_full_page_screenshot_as_base64())
            except Exception:
                pass
            try:
                print(browser.switch_to.active_element.get_attribute("outerHTML"))
            except Exception:
                pass
            raise e

    surface = wait_for_selector(".monaco-workbench", "div.getting-started-step", "button.getting-started-step")
    surface.click()
    ActionChains(browser).send_keys(Keys.F1).perform()
    WebDriverWait(browser, 10).until(EC.visibility_of_element_located(
        (By.CSS_SELECTOR, ".quick-input-widget .quick-input-box input")))
    ActionChains(browser).key_down(Keys.CONTROL).send_keys("a").key_up(Keys.CONTROL) \
        .send_keys(">Terminal: Focus Terminal").perform()
    WebDriverWait(browser, 10).until(lambda driver: any(
        "Terminal: Focus Terminal" in item.text
        for item in driver.find_elements(By.CSS_SELECTOR, ".quick-input-list .monaco-list-row")))
    ActionChains(browser).send_keys(Keys.ENTER).perform()
    terminal = wait.until(lambda driver: driver.execute_script(
        "const input=document.activeElement;return input?.matches('textarea.xterm-helper-textarea')?input:null;"))

    yield terminal

    browser.close()
    browser.switch_to.window(module_window)

@contextlib.contextmanager
def desktop_terminal(browser, user_id):
    module_window = browser.current_window_handle

    browser.switch_to.new_window("tab")
    browser.get(f"{DOJO_URL}/workspace?service=desktop")
    time.sleep(10)
    workspace_run("DISPLAY=:0 xfce4-terminal &", user=user_id)
    wait = WebDriverWait(browser, 30)
    browser.switch_to.frame("workspace")
    wait.until(
        lambda driver: driver.execute_script(
            "return document.documentElement.dataset.consoleBridge;"
        )
        == "ready",
        message="Desktop bridge did not initialize",
    )
    wait.until(lambda driver: driver.execute_script(
        "return window.AISecEduNoVNC.UI.rfb._rfbConnectionState === 'connected';"))
    e = browser.find_element(By.CSS_SELECTOR, "#noVNC_canvas, #noVNC_container canvas")
    e.click()
    browser.execute_script("window.AISecEduNoVNC.UI.rfb.focus();")
    wait.until(
        lambda driver: driver.execute_script(
            "return document.activeElement && "
            "(document.activeElement.id === 'noVNC_keyboardinput' || "
            "document.activeElement.id === 'keyboardinput' || "
            "document.activeElement.tagName === 'CANVAS');"
        )
    )
    assert e.tag_name.lower() == "canvas"
    assert browser.find_elements(By.CSS_SELECTOR, 'script[src*="aisecedu-workspace-bridge.js"]')
    time.sleep(2)

    yield e

    browser.close()
    browser.switch_to.window(module_window)


@contextlib.contextmanager
def ttyd_terminal(browser):
    module_window = browser.current_window_handle

    browser.switch_to.new_window("tab")
    browser.get(f"{DOJO_URL}/workspace?service=terminal")

    wait = WebDriverWait(browser, 30)
    workspace_iframe = wait.until(EC.presence_of_element_located((By.ID, "workspace-iframe")))
    browser.switch_to.frame(workspace_iframe)

    # Wait for ttyd to be ready and find the terminal input
    time.sleep(10)
    # ttyd uses body as the input element
    body = browser.find_element("tag name", "body")
    body.click()  # Focus the terminal
    time.sleep(1)

    yield body

    browser.close()
    browser.switch_to.window(module_window)


# Expands the accordion entry of the challenge
def challenge_expand(browser, idx):
    browser.refresh()
    browser.find_element(By.CSS_SELECTOR, f'[data-challenge-index="{idx}"]').click()
    time.sleep(0.5)


def challenge_start(browser, idx, practice=False):
    challenge_expand(browser, idx)
    body = browser.find_element("id", f"challenges-body-{idx}")

    body.find_element(By.CSS_SELECTOR, ".challenge-priv" if practice else ".challenge-start").click()
    WebDriverWait(browser, 120, ignored_exceptions=(NoSuchElementException, StaleElementReferenceException)).until(
        lambda driver: "challenge-active" in (
            driver.find_element(By.CSS_SELECTOR, f'[data-challenge-index="{idx}"]')
            .get_attribute("class") or ""
        ) and driver.find_element("id", f"challenges-body-{idx}")
        .find_element(By.CSS_SELECTOR, ".challenge-start").is_enabled()
        and "challenge-hidden" not in (
            driver.find_element("id", f"challenges-body-{idx}")
            .find_element(By.CSS_SELECTOR, ".challenge-workspace").get_attribute("class") or ""
        )
    )
    time.sleep(1)


def challenge_submit(browser, idx, flag):
    body = browser.find_element("id", f"challenges-body-{idx}")
    body.find_element(By.CSS_SELECTOR, ".workspace-controls .flag-input").send_keys(flag)

    banner = WebDriverWait(browser, 20, ignored_exceptions=(NoSuchElementException, StaleElementReferenceException)).until(
        lambda driver: next(
            (
                element
                for element in driver.find_element("id", f"challenges-body-{idx}")
                .find_elements(By.CSS_SELECTOR, ".workspace-notification-banner")
                if element.is_displayed() and element.text.strip()
            ),
            False,
        )
    )
    assert banner.text.strip()
    assert not browser.find_elements(By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible")


def workspace_dialog(browser, *, accept=True):
    wait = WebDriverWait(browser, 10)
    dialog = wait.until(EC.visibility_of_element_located(
        (By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible")))
    message = dialog.text
    action = "confirm" if accept else "cancel"
    dialog.find_element(By.CSS_SELECTOR, f'[data-dialog-action="{action}"]').click()
    wait.until(EC.invisibility_of_element(dialog))
    return message


def workspace_launcher(browser, idx):
    wait = WebDriverWait(browser, 30)
    return wait.until(EC.visibility_of_element_located((
        By.CSS_SELECTOR, f'#challenges-body-{idx} [data-workspace-dedicated-hint] a')))


def lecture_player(browser):
    for attempt in range(2):
        try:
            return WebDriverWait(browser, 15).until(EC.presence_of_element_located((By.TAG_NAME, "iframe")))
        except TimeoutException:
            if attempt:
                print("LECTURE_FRAME_DIAGNOSTIC", browser.current_url, browser.page_source[:12000])
                raise
            browser.execute_script("window.location.reload();")


# Gets the accordion entry index
def challenge_idx(browser, name):
    headers = browser.find_elements(By.CSS_SELECTOR, "[data-challenge-index][data-challenge-name]")
    matches = [header for header in headers if header.get_attribute("data-challenge-name") == name]
    assert len(matches) == 1, [(header.get_attribute("data-challenge-name")) for header in headers]
    return int(matches[0].get_attribute("data-challenge-index"))


def read_flag(user_id):
    for _ in range(10):
        result = workspace_run("test -f /tmp/out && tail -n1 /tmp/out || true", user=user_id)
        parts = result.stdout.split()
        if parts:
            return parts[-1]
        time.sleep(1)
    raise AssertionError("flag not found")


def workspace_clipboard(browser, text=None):
    result = browser.execute_async_script("""
        const text = arguments[0], done = arguments[arguments.length - 1];
        const control = window.AISecEduRemoteConsole.forElement(document.getElementById('workspace-iframe'));
        if (!control || !control.ready) return done({ok: false, error: 'Console is not ready'});
        control.api(text === null ? 'GET' : 'POST', text === null ? null : {text})
            .then(value => done({ok: value.workspaceId === control.workspaceId, text: value.text || ''}),
                  error => done({ok: false, error: error.message}));
    """, text)
    assert result["ok"], result
    return result["text"]


def wait_for_vim(browser, user):
    def running(_driver):
        return workspace_run("pgrep -u 1000 -x vim || true", user=user).stdout.strip()
    try:
        WebDriverWait(browser, 15).until(running)
    except TimeoutException:
        print("TERMINAL_DIAGNOSTIC", browser.execute_script(
            "return Array.from(document.querySelectorAll('.xterm-screen')).map(node => node.innerText);"))
        raise


def test_welcome_desktop(random_user_browser, random_user_name, welcome_dojo):
    random_user_browser.get(f"{DOJO_URL}/welcome/welcome")
    idx = challenge_idx(random_user_browser, "The Flag File")

    challenge_start(random_user_browser, idx)
    with desktop_terminal(random_user_browser, random_user_name) as vs:
        vs.send_keys("vim -Nu NONE -n /tmp/desktop-escape-check\n")
        time.sleep(2)
        vs.send_keys("iDESKTOP_ESCAPE_OK")
        vs.send_keys(Keys.ESCAPE)
        vs.send_keys(":wq\n")
        time.sleep(2)
        assert workspace_run("cat /tmp/desktop-escape-check", user=random_user_name).stdout.strip() == "DESKTOP_ESCAPE_OK"

        clipboard_in = "玄甲 clipboard into desktop"
        random_user_browser.switch_to.parent_frame()
        workspace_clipboard(random_user_browser, clipboard_in)
        random_user_browser.switch_to.frame("workspace")
        for _ in range(20):
            copied = workspace_run(
                "DISPLAY=:0 xclip -selection clipboard -o 2>/dev/null || true",
                user=random_user_name,
            ).stdout
            if copied == clipboard_in:
                break
            time.sleep(0.25)
        assert copied == clipboard_in

        clipboard_out = "玄甲 clipboard out of desktop"
        workspace_run(
            f"printf %s {clipboard_out!r} | DISPLAY=:0 xclip -selection clipboard",
            user=random_user_name,
        )
        random_user_browser.switch_to.parent_frame()
        WebDriverWait(random_user_browser, 10).until(
            lambda driver: workspace_clipboard(driver) == clipboard_out
        )
        random_user_browser.switch_to.frame("workspace")

        vs.send_keys("/challenge/solve; cat /flag | tee /tmp/out\n")
        time.sleep(5)
        flag = read_flag(random_user_name)
    challenge_submit(random_user_browser, idx, flag)
    random_user_browser.close()


def test_welcome_vscode(random_user_browser, random_user_name, welcome_dojo):
    random_user_browser.get(f"{DOJO_URL}/welcome/welcome")
    idx = challenge_idx(random_user_browser, "Challenge Programs")

    challenge_start(random_user_browser, idx)
    with vscode_terminal(random_user_browser) as vs:
        random_user_browser.execute_script("""
            window.__workspaceKeyEvents=[];
            for(const type of ['keydown','focusin','blur']) window.addEventListener(type,event=>{
                window.__workspaceKeyEvents.push({type,key:event.key,code:event.code,
                    trusted:event.isTrusted,target:event.target?.className,time:performance.now()});
                if(window.__workspaceKeyEvents.length>60)window.__workspaceKeyEvents.shift();
            },true);
        """)
        vs.send_keys("vim -Nu NONE -n /tmp/code-escape-check\n")
        wait_for_vim(random_user_browser, random_user_name)
        time.sleep(2)
        vs.send_keys("iCODE_ESCAPE_OK")
        vs.send_keys(Keys.ESCAPE)
        vs.send_keys(":wq\n")
        time.sleep(2)
        result = workspace_run("cat /tmp/code-escape-check", user=random_user_name, check=False)
        if result.returncode or result.stdout.strip() != "CODE_ESCAPE_OK":
            print("VSCODE_KEYBOARD_DIAGNOSTIC", random_user_browser.execute_script(
                "return {events:window.__workspaceKeyEvents,bridge:document.documentElement.dataset.consoleBridge,"
                "kind:window.XuanjiaConsoleKind,active:document.activeElement?.outerHTML.slice(0,1000)};"))
            print(random_user_browser.get_full_page_screenshot_as_base64())
        assert result.returncode == 0 and result.stdout.strip() == "CODE_ESCAPE_OK", result.stderr
        vs.send_keys("/challenge/solve | tee /tmp/out\n")
        time.sleep(5)
        flag = read_flag(random_user_name)
    challenge_submit(random_user_browser, idx, flag)
    random_user_browser.close()


def test_welcome_ttyd(random_user_browser, random_user_name, welcome_dojo):
    random_user_browser.get(f"{DOJO_URL}/welcome/welcome")
    idx = challenge_idx(random_user_browser, "The Flag File")

    challenge_start(random_user_browser, idx)
    with ttyd_terminal(random_user_browser) as terminal:
        terminal.send_keys("vim -Nu NONE -n /tmp/terminal-escape-check\n")
        time.sleep(2)
        terminal.send_keys("iTERMINAL_ESCAPE_OK")
        terminal.send_keys(Keys.ESCAPE)
        terminal.send_keys(":wq\n")
        time.sleep(2)
        assert workspace_run("cat /tmp/terminal-escape-check", user=random_user_name).stdout.strip() == "TERMINAL_ESCAPE_OK"
        terminal.send_keys("pwd > /tmp/terminal-cwd; /challenge/solve; cat /flag | tee /tmp/out\n")
        time.sleep(5)
        flag = read_flag(random_user_name)
        assert "dojo evidence" not in terminal.text
        assert not re.search(r"\[\d+\]\s+\d+", terminal.text)
    assert workspace_run("cat /tmp/terminal-cwd", user=random_user_name).stdout.strip() == "/challenge"
    challenge_submit(random_user_browser, idx, flag)
    random_user_browser.close()


def skip_test_welcome_practice(random_user_browser, random_user_name, welcome_dojo):
    random_user_browser.get(f"{DOJO_URL}/welcome/welcome")
    idx = challenge_idx(random_user_browser, "Using Practice Mode")

    challenge_start(random_user_browser, idx, practice=True)
    with desktop_terminal(random_user_browser, random_user_name) as vs:
        vs.send_keys("sudo cp /challenge/secret /home/hacker/secret\n")
        time.sleep(1)

    random_user_browser.find_element(By.CSS_SELECTOR, "#workspace-change-privilege input").click()
    WebDriverWait(random_user_browser, 30).until(EC.alert_is_present())
    random_user_browser.switch_to.alert.accept()
    time.sleep(10)
    with desktop_terminal(random_user_browser, random_user_name) as vs:
        vs.send_keys("/challenge/solve < secret | tee /tmp/out\n")
        time.sleep(2)
        flag = read_flag(random_user_name)
    challenge_submit(random_user_browser, idx, flag)
    random_user_browser.close()

def get_interfaces(browser, idx):
    challenge_expand(browser, idx)
    body = browser.find_element("id", f"challenges-body-{idx}")
    return body.find_elements(By.CSS_SELECTOR, ".workspace-service")

def match_interfaces(interfaces, expected):
    assert len(interfaces) == len(expected)
    for interface, value in zip(interfaces, expected) :
        assert interface.get_attribute("data-service") == value

def test_interface_inherit(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    interfaces = get_interfaces(random_user_browser, idx)

    values = ["ssh: ", "terminal: 7681"]
    match_interfaces(interfaces, values)

def test_interface_chal_override(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test2")
    interfaces = get_interfaces(random_user_browser, idx)

    values = ["code: 8080", "desktop: 6080"]
    match_interfaces(interfaces, values)

def test_interface_chal_narrow(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test3")
    interfaces = get_interfaces(random_user_browser, idx)

    values = ["terminal: 7681"]
    match_interfaces(interfaces, values)

    challenge_start(random_user_browser, idx)
    random_user_browser.get(f"{DOJO_URL}/workspace")
    controls = random_user_browser.find_element(By.CSS_SELECTOR, ".workspace-controls")
    services = [button.get_attribute("data-service") for button in controls.find_elements(By.CSS_SELECTOR, ".workspace-service")]
    assert services == ["terminal: 7681"]
    WebDriverWait(random_user_browser, 30).until(
        lambda driver: "/7681/" in (driver.find_element(By.ID, "workspace-iframe").get_attribute("src") or ""))
    random_user_browser.close()

def test_actionbar_service_buttons(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)
    body = random_user_browser.find_element("id", f"challenges-body-{idx}")
    module_handle = random_user_browser.current_window_handle
    handles = set(random_user_browser.window_handles)
    wait = WebDriverWait(random_user_browser, 30)

    workspace_launcher(random_user_browser, idx).click()
    wait.until(lambda driver: len(driver.window_handles) == len(handles) + 1)
    popout_handle = (set(random_user_browser.window_handles) - handles).pop()
    random_user_browser.switch_to.window(popout_handle)
    wait.until(lambda driver: driver.current_url.endswith("/workspace?service=terminal"))

    random_user_browser.switch_to.window(module_handle)
    workspace_launcher(random_user_browser, idx).click()
    wait.until(lambda driver: len(driver.window_handles) == len(handles) + 2)
    second_handle = (set(random_user_browser.window_handles) - handles - {popout_handle}).pop()
    random_user_browser.switch_to.window(second_handle)
    wait.until(lambda driver: driver.current_url.endswith("/workspace?service=terminal"))
    random_user_browser.close()
    random_user_browser.switch_to.window(popout_handle)
    assert random_user_browser.current_url.endswith("/workspace?service=terminal")
    random_user_browser.switch_to.window(module_handle)

    random_user_browser.get(f"{DOJO_URL}/workspace")
    controls = random_user_browser.find_element(By.CSS_SELECTOR, ".workspace-controls")
    terminal_button = controls.find_element(By.CSS_SELECTOR, '.workspace-service[data-service="terminal: 7681"]')
    ssh_button = controls.find_element(By.CSS_SELECTOR, '.workspace-service[data-service="ssh: "]')
    ssh_button.click()
    wait.until(lambda driver: driver.find_element(By.CSS_SELECTOR, ".workspace-ssh").is_displayed())
    random_user_browser.execute_script("""
        window.__workspaceFetch = window.fetch.bind(window);
        window.fetch = function(input, init) {
            if (String(input).includes('/pwncollege_api/v1/workspace')) {
                return new Promise(resolve => setTimeout(() => resolve(window.__workspaceFetch(input, init)), 800));
            }
            return window.__workspaceFetch(input, init);
        };
    """)
    terminal_button.click()
    loading = random_user_browser.find_element(By.CSS_SELECTOR, "[data-workspace-loading]")
    wait.until(lambda driver: loading.is_displayed())
    assert loading.find_element(By.CSS_SELECTOR, "[data-workspace-loading-mode]").text == "终端"
    assert loading.find_element(By.CSS_SELECTOR, "[data-workspace-loading-title]").text
    wait.until(lambda driver: "/7681/" in (driver.find_element(By.ID, "workspace-iframe").get_attribute("src") or ""))
    wait.until(lambda driver: not loading.is_displayed())
    assert "active" in terminal_button.get_attribute("class")
    assert not random_user_browser.find_element(By.CSS_SELECTOR, ".workspace-ssh").is_displayed()

    ssh_button.click()
    wait.until(lambda driver: driver.find_element(By.CSS_SELECTOR, ".workspace-ssh").is_displayed())
    assert "SSH" in random_user_browser.find_element(By.ID, "workspace-iframe").get_attribute("class")

    random_user_browser.switch_to.window(popout_handle)
    random_user_browser.close()
    random_user_browser.switch_to.window(module_handle)
    random_user_browser.close()

def test_actionbar_port_popout(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test4")
    challenge_start(random_user_browser, idx)
    body = random_user_browser.find_element("id", f"challenges-body-{idx}")
    handles = set(random_user_browser.window_handles)
    wait = WebDriverWait(random_user_browser, 30)

    workspace_launcher(random_user_browser, idx).click()
    wait.until(lambda driver: len(driver.window_handles) == len(handles) + 1)
    popout_handle = (set(random_user_browser.window_handles) - handles).pop()
    random_user_browser.switch_to.window(popout_handle)
    wait.until(lambda driver: driver.current_url.endswith("/workspace?port=80"))
    address = wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, "[data-workspace-web-address]")))
    link = address.find_element(By.CSS_SELECTOR, "[data-workspace-web-link]")
    assert urlsplit(link.get_attribute("href")).scheme == urlsplit(DOJO_URL).scheme
    assert link.text == link.get_attribute("href")
    random_user_browser.close()

def test_actionbar_ssh_only_challenge(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test5")
    challenge_start(random_user_browser, idx)
    body = random_user_browser.find_element("id", f"challenges-body-{idx}")
    buttons = body.find_elements(By.CSS_SELECTOR, ".workspace-service")
    assert [button.get_attribute("data-service") for button in buttons] == ["ssh: "]

    wait = WebDriverWait(random_user_browser, 30)
    assert not body.find_elements(By.ID, "workspace-iframe")
    assert not body.find_elements(By.CSS_SELECTOR, ".workspace-ssh")
    assert workspace_launcher(random_user_browser, idx).is_displayed()

    random_user_browser.get(f"{DOJO_URL}/workspace?service=ssh")
    body = random_user_browser.find_element(By.CSS_SELECTOR, ".challenge-workspace")
    buttons = body.find_elements(By.CSS_SELECTOR, ".workspace-service")
    wait.until(lambda driver: body.find_element(By.CSS_SELECTOR, ".workspace-ssh").is_displayed())
    handles = len(random_user_browser.window_handles)
    buttons[0].click()
    time.sleep(1)
    assert len(random_user_browser.window_handles) == handles
    assert body.find_element(By.CSS_SELECTOR, ".workspace-ssh").is_displayed()
    assert "active" in buttons[0].get_attribute("class")
    iframe = wait.until(EC.presence_of_element_located((By.ID, "workspace-iframe")))
    wait.until(lambda driver: "SSH" in (iframe.get_attribute("class") or ""))
    assert iframe.size["height"] == 0
    assert random_user_browser.find_element(By.CSS_SELECTOR, ".workspace-ssh").is_displayed()
    random_user_browser.close()

def test_actionbar_ssh_toggle(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)
    random_user_browser.get(f"{DOJO_URL}/workspace?service=terminal")
    body = random_user_browser.find_element(By.CSS_SELECTOR, ".challenge-workspace")
    wait = WebDriverWait(random_user_browser, 30)
    iframe = wait.until(EC.presence_of_element_located((By.ID, "workspace-iframe")))
    wait.until(lambda driver: "/7681/" in (iframe.get_attribute("src") or ""))

    ssh_button = body.find_element(By.CSS_SELECTOR, '.workspace-service[data-service="ssh: "]')
    terminal_button = body.find_element(By.CSS_SELECTOR, '.workspace-service[data-service="terminal: 7681"]')
    assert ssh_button.find_elements(By.CSS_SELECTOR, ".fa-key")
    assert not ssh_button.find_elements(By.CSS_SELECTOR, ".popout-icon")
    assert terminal_button.find_elements(By.CSS_SELECTOR, ".fa-terminal")
    assert not terminal_button.find_elements(By.CSS_SELECTOR, ".hint-icon")

    ssh_box = body.find_element(By.CSS_SELECTOR, ".workspace-ssh")
    assert not ssh_box.is_displayed()
    handles = len(random_user_browser.window_handles)

    ssh_button.click()
    wait.until(lambda driver: ssh_box.is_displayed())
    assert random_user_browser.current_url.endswith("/workspace?service=ssh")
    assert "active" in ssh_button.get_attribute("class")
    assert "SSH" in (iframe.get_attribute("class") or "")
    assert iframe.size["height"] == 0
    assert len(random_user_browser.window_handles) == handles

    restart_button = body.find_element(By.CSS_SELECTOR, ".challenge-restart")
    restart_button.click()
    workspace_dialog(random_user_browser)
    wait.until(lambda driver: restart_button.get_attribute("disabled") is None)
    time.sleep(1)
    assert ssh_box.is_displayed()
    assert random_user_browser.current_url.endswith("/workspace?service=ssh")
    assert "active" in ssh_button.get_attribute("class")
    assert "SSH" in (iframe.get_attribute("class") or "")

    terminal_button.click()
    wait.until(lambda driver: not ssh_box.is_displayed())
    assert "active" not in ssh_button.get_attribute("class")
    assert "SSH" not in (iframe.get_attribute("class") or "")
    wait.until(lambda driver: "/7681/" in (iframe.get_attribute("src") or ""))
    assert "/7681/" in (iframe.get_attribute("src") or "")
    random_user_browser.close()

def test_actionbar_sudo_checkbox(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)
    random_user_browser.get(f"{DOJO_URL}/workspace?service=terminal")
    body = random_user_browser.find_element(By.CSS_SELECTOR, ".challenge-workspace")
    wait = WebDriverWait(random_user_browser, 30)

    control = body.find_element(By.CSS_SELECTOR, ".workspace-change-privilege")
    checkbox = control.find_element(By.CSS_SELECTOR, "input")
    assert not checkbox.is_selected()
    assert control.get_attribute("data-privileged") == "false"

    checkbox.click()
    assert "sudo" in workspace_dialog(random_user_browser, accept=False)
    assert not checkbox.is_selected()
    assert control.get_attribute("data-privileged") == "false"

    checkbox.click()
    workspace_dialog(random_user_browser)
    wait.until(lambda driver: control.get_attribute("data-privileged") == "true")
    wait.until(lambda driver: checkbox.is_enabled())
    assert checkbox.is_selected()

    def workspace_output(cmd):
        last_exception = None
        for _ in range(30):
            try:
                output = workspace_run(cmd, user=random_user_name).stdout
            except Exception as e:
                last_exception = e
                output = None
            if output:
                return output
            time.sleep(1)
        raise AssertionError(f"no output from workspace: {cmd} (last exception: {last_exception!r})") from last_exception

    assert workspace_output("sudo id -u || echo nosudo").strip() == "0"

    checkbox.click()
    workspace_dialog(random_user_browser, accept=False)
    assert checkbox.is_selected()
    assert control.get_attribute("data-privileged") == "true"

    checkbox.click()
    workspace_dialog(random_user_browser)
    wait.until(lambda driver: control.get_attribute("data-privileged") == "false")
    wait.until(lambda driver: checkbox.is_enabled())
    assert not checkbox.is_selected()

    assert "nosudo" in workspace_output("sudo id -u || echo nosudo")
    random_user_browser.close()


def test_actionbar_stop_and_restart(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)
    random_user_browser.get(f"{DOJO_URL}/workspace?service=terminal")
    body = random_user_browser.find_element(By.CSS_SELECTOR, ".challenge-workspace")
    controls = body.find_element(By.CSS_SELECTOR, ".workspace-controls")
    wait = WebDriverWait(random_user_browser, 60)

    restart_button = controls.find_element(By.CSS_SELECTOR, ".challenge-restart")
    stop_button = controls.find_element(By.CSS_SELECTOR, ".challenge-stop")
    reset_button = controls.find_element(By.CSS_SELECTOR, ".challenge-reset")
    assert restart_button.text.strip() == "重启"
    assert stop_button.text.strip() == "停止"
    assert reset_button.text.strip() == "重置"

    workspace_run(
        "touch /home/hacker/actionbar-home /tmp/actionbar-container",
        user=random_user_name,
    )
    stop_button.click()
    assert "保留 Home" in workspace_dialog(random_user_browser)
    wait.until(
        lambda driver: controls.get_attribute("data-workspace-running") == "false"
        and restart_button.is_enabled()
    )
    stopped_title = body.find_element(
        By.CSS_SELECTOR,
        "[data-workspace-loading-title]",
    )
    assert stopped_title.text == "实验环境已停止"
    assert not stop_button.is_enabled()
    assert not reset_button.is_enabled()

    restart_button.click()
    workspace_dialog(random_user_browser)
    wait.until(
        lambda driver: controls.get_attribute("data-workspace-running") == "true"
        and stop_button.is_enabled()
    )
    for _ in range(30):
        result = workspace_run(
            "test -f /home/hacker/actionbar-home "
            "&& test ! -e /tmp/actionbar-container",
            user=random_user_name,
            check=False,
        )
        if result.returncode == 0:
            break
        time.sleep(1)
    else:
        raise AssertionError("restart did not preserve Home while replacing container state")
    workspace_run("rm -f /home/hacker/actionbar-home", user=random_user_name)
    random_user_browser.close()


def test_actionbar_popout_mode(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)

    body = random_user_browser.find_element("id", f"challenges-body-{idx}")
    controls = body.find_element(By.CSS_SELECTOR, ".workspace-controls")
    assert controls.get_attribute("data-popout") == "true"
    assert not controls.find_elements(By.CSS_SELECTOR, ".workspace-fullscreen")
    assert not body.find_elements(By.ID, "workspace-select")
    assert not body.find_elements(By.CSS_SELECTOR, ".workspace-ssh")

    buttons = controls.find_elements(By.CSS_SELECTOR, ".workspace-service")
    assert [button.get_attribute("data-service") for button in buttons] == ["ssh: ", "terminal: 7681"]

    assert all(not button.is_displayed() for button in buttons)
    assert not body.find_elements(By.ID, "workspace-iframe")
    assert workspace_launcher(random_user_browser, idx).get_attribute("target") == "_blank"

    random_user_browser.get(f"{DOJO_URL}/workspace")
    controls = random_user_browser.find_element(By.CSS_SELECTOR, ".workspace-controls")
    assert controls.get_attribute("data-popout") == "false"
    assert controls.find_elements(By.CSS_SELECTOR, ".workspace-fullscreen")
    iframe = WebDriverWait(random_user_browser, 30).until(
        EC.presence_of_element_located((By.ID, "workspace-iframe")))
    WebDriverWait(random_user_browser, 30).until(
        lambda driver: "/7681/" in (iframe.get_attribute("src") or ""))
    services = [button.get_attribute("data-service") for button in controls.find_elements(By.CSS_SELECTOR, ".workspace-service")]
    assert services == ["ssh: ", "terminal: 7681"]
    random_user_browser.close()

def test_actionbar_popout_reload(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)
    body = random_user_browser.find_element("id", f"challenges-body-{idx}")
    module_handle = random_user_browser.current_window_handle
    handles = set(random_user_browser.window_handles)
    wait = WebDriverWait(random_user_browser, 30)

    workspace_launcher(random_user_browser, idx).click()
    wait.until(lambda driver: len(driver.window_handles) == len(handles) + 1)
    popout_handle = (set(random_user_browser.window_handles) - handles).pop()
    random_user_browser.switch_to.window(popout_handle)
    wait.until(lambda driver: driver.current_url.endswith("/workspace?service=terminal"))
    popout_page = random_user_browser.find_element(By.TAG_NAME, "body")

    random_user_browser.switch_to.window(module_handle)
    restart_button = body.find_element(By.CSS_SELECTOR, ".challenge-restart")
    restart_button.click()
    workspace_dialog(random_user_browser)
    wait.until(lambda driver: restart_button.get_attribute("disabled") is None)

    random_user_browser.switch_to.window(popout_handle)
    wait.until(EC.staleness_of(popout_page))
    assert random_user_browser.current_url.endswith("/workspace?service=terminal")
    random_user_browser.close()
    random_user_browser.switch_to.window(module_handle)
    random_user_browser.close()

def test_actionbar_first_ported_inline(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test2")
    challenge_start(random_user_browser, idx)
    assert workspace_launcher(random_user_browser, idx).get_attribute("href").endswith("/workspace?service=code")
    assert not random_user_browser.find_elements(By.CSS_SELECTOR, f"#challenges-body-{idx} #workspace-iframe")
    random_user_browser.get(f"{DOJO_URL}/workspace")
    wait = WebDriverWait(random_user_browser, 30)
    iframe = wait.until(EC.presence_of_element_located((By.ID, "workspace-iframe")))
    wait.until(lambda driver: "/8080/" in (iframe.get_attribute("src") or ""))
    random_user_browser.close()

def test_actionbar_popup_blocked(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")
    idx = challenge_idx(random_user_browser, "test1")
    challenge_start(random_user_browser, idx)
    body = random_user_browser.find_element("id", f"challenges-body-{idx}")
    handles = len(random_user_browser.window_handles)
    random_user_browser.execute_script("window.open = function() { return null; };")

    # The hidden legacy service component still handles blocked programmatic popouts.
    random_user_browser.execute_script("arguments[0].click();", body.find_element(
        By.CSS_SELECTOR, '.workspace-service[data-service="terminal: 7681"]'))
    banner = WebDriverWait(random_user_browser, 30).until(
        lambda driver: next(
            (
                element
                for element in body.find_elements(By.CSS_SELECTOR, ".workspace-notification-banner")
                if element.is_displayed() and "浏览器阻止" in element.text
            ),
            False,
        )
    )
    assert banner.is_displayed()
    assert not random_user_browser.find_elements(By.CSS_SELECTOR, ".aisecedu-dialog-layer.is-visible")
    assert len(random_user_browser.window_handles) == handles
    random_user_browser.close()

def test_actionbar_service_icons(random_user_browser, random_user_name, interfaces_dojo):
    random_user_browser.get(f"{DOJO_URL}/testing-interfaces/test")

    def interface_icon(name, service):
        idx = challenge_idx(random_user_browser, name)
        interfaces = get_interfaces(random_user_browser, idx)
        return next(i for i in interfaces if i.get_attribute("data-service") == service)

    assert interface_icon("test1", "terminal: 7681").find_elements(By.CSS_SELECTOR, ".fa-terminal")
    assert interface_icon("test4", "web: 80").find_elements(By.CSS_SELECTOR, ".fa-network-wired")
    assert interface_icon("test6", "lecture: 80").find_elements(By.CSS_SELECTOR, ".fa-video")
    random_user_browser.close()


def test_registration_commitment(browser_fixture):
    browser_fixture.get(f"{DOJO_URL}/register")
    wait = WebDriverWait(browser_fixture, 10)

    test_username = "test" + "".join(random.choices(string.ascii_lowercase, k=8))

    browser_fixture.find_element(By.ID, "name").send_keys(test_username)
    browser_fixture.find_element(By.ID, "email").send_keys(f"{test_username}@example.com")
    browser_fixture.find_element(By.ID, "password").send_keys("TestPassword123!")

    submit_button = browser_fixture.find_element(By.ID, "register-submit")
    submit_button.click()

    commitment_input = browser_fixture.find_element(By.ID, "commitment-input")
    assert browser_fixture.execute_script(
        "return arguments[0].validity.valueMissing", commitment_input
    )
    assert "/register" in browser_fixture.current_url

    commitment_input.click()

    submit_button.click()

    wait.until(lambda driver: "register" not in driver.current_url.lower())
    assert "register" not in browser_fixture.current_url.lower()

    browser_fixture.close()


def test_welcome_graded_lecture(random_user_browser, random_user_name, example_dojo):
    random_user_browser.get(f"{DOJO_URL}/{example_dojo}/lectures")
    idx = challenge_idx(random_user_browser, "Graded Lecture")

    challenge_start(random_user_browser, idx)

    wait = WebDriverWait(random_user_browser, 30)
    module_window = random_user_browser.current_window_handle
    handles = set(random_user_browser.window_handles)
    assert not random_user_browser.find_elements(By.CSS_SELECTOR, f"#challenges-body-{idx} #workspace-iframe")
    workspace_launcher(random_user_browser, idx).click()
    wait.until(lambda driver: len(driver.window_handles) == len(handles) + 1)
    random_user_browser.switch_to.window((set(random_user_browser.window_handles) - handles).pop())
    lecture_iframe = wait.until(EC.presence_of_element_located((By.ID, "workspace-iframe")))
    wait.until(lambda driver: "/80" in (lecture_iframe.get_attribute("src") or ""))
    assert lecture_iframe.is_displayed()
    lecture_iframe_src = lecture_iframe.get_attribute("src")
    assert lecture_iframe_src.rstrip("/").endswith("/80")

    random_user_browser.switch_to.frame(lecture_iframe)
    youtube_iframe_inline = lecture_player(random_user_browser)
    assert youtube_iframe_inline.is_displayed()
    inline_iframe_src = youtube_iframe_inline.get_attribute("src")
    assert "youtube.com" in inline_iframe_src or "youtube-nocookie.com" in inline_iframe_src
    assert "hh4XAU6XYP0" in inline_iframe_src
    random_user_browser.switch_to.default_content()
    random_user_browser.close()
    random_user_browser.switch_to.window(module_window)

    challenge_window = random_user_browser.current_window_handle
    random_user_browser.switch_to.new_window("tab")
    random_user_browser.get(f"{DOJO_URL}/workspace?port=80")

    time.sleep(2)

    youtube_iframe = wait.until(EC.presence_of_element_located((By.TAG_NAME, "iframe")))
    assert youtube_iframe.is_displayed()
    iframe_src = youtube_iframe.get_attribute("src")
    if "workspace.localhost" in iframe_src:
        assert iframe_src.rstrip("/").endswith("/80")
        random_user_browser.switch_to.frame(youtube_iframe)
        nested_iframe = lecture_player(random_user_browser)
        assert nested_iframe.is_displayed()
        nested_src = nested_iframe.get_attribute("src")
        assert "youtube.com" in nested_src or "youtube-nocookie.com" in nested_src
        assert "hh4XAU6XYP0" in nested_src
        random_user_browser.switch_to.default_content()
    else:
        assert "youtube.com" in iframe_src or "youtube-nocookie.com" in iframe_src
        assert "hh4XAU6XYP0" in iframe_src

    random_user_browser.close()
    random_user_browser.switch_to.window(challenge_window)
    random_user_browser.close()
