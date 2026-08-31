import random
import shutil
import string
import subprocess
import pytest
import json
import os

import requests
import requests.adapters
from urllib3.util.retry import Retry

try:
    from selenium.webdriver.firefox.service import Service as FirefoxService
    from selenium.webdriver import Firefox, FirefoxOptions
except ModuleNotFoundError:
    FirefoxService = None
    Firefox = None
    FirefoxOptions = None

#pylint:disable=redefined-outer-name,use-dict-literal,missing-timeout,unspecified-encoding,consider-using-with

from utils import TEST_DOJOS_LOCATION, DOJO_URL, login, make_dojo_official, create_dojo, create_dojo_yml, start_challenge, solve_challenge, wait_for_background_worker, db_sql, dojo_run

# Nested-docker port publishing drops for a few seconds while user containers
# attach/detach networks; retry connection establishment (never sent requests)
# so local test runs survive the window.
_original_session_init = requests.Session.__init__

def _retrying_session_init(self, *args, **kwargs):
    _original_session_init(self, *args, **kwargs)
    if os.getenv("DOJO_HTTP_HOST"):
        self.headers["Host"] = os.environ["DOJO_HTTP_HOST"]
    if os.getenv("DOJO_TLS_VERIFY", "true").strip().lower() in {"0", "false", "no"}:
        self.verify = False
    retry = Retry(total=None, connect=6, read=0, redirect=0, status=0, other=0, backoff_factor=0.5)
    adapter = requests.adapters.HTTPAdapter(max_retries=retry)
    self.mount("http://", adapter)
    self.mount("https://", adapter)

requests.Session.__init__ = _retrying_session_init


def _admin_credentials():
    username = os.getenv("DOJO_ADMIN_USERNAME", "admin")
    password = os.getenv("DOJO_ADMIN_PASSWORD")
    if password:
        return username, password

    credentials_path = os.getenv(
        "DOJO_ADMIN_CREDENTIALS",
        os.path.join(os.path.dirname(__file__), "..", "data", "admin-password.txt"),
    )
    try:
        with open(credentials_path, encoding="utf-8") as credentials_file:
            content = credentials_file.read().strip()
    except (FileNotFoundError, PermissionError):
        try:
            content = dojo_run("cat", "/data/admin-password.txt").stdout.strip()
        except (OSError, RuntimeError, subprocess.SubprocessError):
            return username, "admin"
    if "=" not in content:
        return username, content
    values = {"username": username}
    for line in content.splitlines():
        key, separator, value = line.partition("=")
        if separator:
            values[key.strip()] = value.strip()
    return values.get("username", username), values.get("password", "admin")


@pytest.fixture(scope="session")
def admin_session():
    username, password = _admin_credentials()
    session = login(username, password)
    yield session

@pytest.fixture(scope="session")
def admin_user():
    username, password = _admin_credentials()
    session = login(username, password)
    yield username, session

@pytest.fixture
def random_user():
    random_id = "".join(random.choices(string.ascii_lowercase, k=16))
    session = login(random_id, random_id, register=True)
    yield random_id, session

@pytest.fixture
def random_user_name(random_user):
    uid, _ = random_user
    yield uid

@pytest.fixture
def random_user_session(random_user):
    _, session = random_user
    yield session


@pytest.fixture
def completionist_user(simple_award_dojo, codepoints_award_dojo):
    random_id = "".join(random.choices(string.ascii_lowercase, k=16))
    session = login(random_id, random_id, register=True)

    response = session.get(f"{DOJO_URL}/dojo/{simple_award_dojo}/join/")
    assert response.status_code == 200
    for module, challenge in [ ("hello", "apple"), ("hello", "banana") ]:
        start_challenge(simple_award_dojo, module, challenge, session=session)
        solve_challenge(simple_award_dojo, module, challenge, session=session, user=random_id)

    response = session.get(f"{DOJO_URL}/dojo/{codepoints_award_dojo}/join/")
    assert response.status_code == 200
    for module, challenge in [ ("hello", "apple"), ("hello", "banana") ]:
        start_challenge(codepoints_award_dojo, module, challenge, session=session)
        solve_challenge(codepoints_award_dojo, module, challenge, session=session, user=random_id)

    wait_for_background_worker(timeout=2)

    yield random_id, session


@pytest.fixture(scope="session")
def guest_dojo_admin(admin_session):
    random_id = "".join(random.choices(string.ascii_lowercase, k=16))
    session = login(random_id, random_id, register=True)
    yield random_id, session
    response = admin_session.get(
        f"{DOJO_URL.rstrip('/')}/api/v1/users",
        params={"q": random_id, "field": "name", "view": "admin"},
    )
    if response.status_code != 200:
        return
    for user in response.json().get("data", []):
        if user.get("name") == random_id:
            admin_session.delete(
                f"{DOJO_URL.rstrip('/')}/api/v1/users/{user['id']}", json={}
            )

@pytest.fixture(scope="session")
def example_dojo(admin_session):
    try:
        rid = create_dojo("pwncollege/example-dojo", session=admin_session)
    except AssertionError:
        rid = "example"
    make_dojo_official(rid, admin_session)
    return rid

# this needs the example_dojo because it imports from it
@pytest.fixture(scope="session")
def belt_dojos(admin_session, example_dojo):
    belt_dojo_rids = {
        color: create_dojo_yml(
            open(TEST_DOJOS_LOCATION / f"fake_{color}.yml").read(), session=admin_session
        ) for color in [ "orange", "yellow", "green", "blue" ]
    }
    for rid in belt_dojo_rids.values():
        make_dojo_official(rid, admin_session)
    return belt_dojo_rids

@pytest.fixture(scope="session")
def example_import_dojo(admin_session, example_dojo):
    try:
        rid = create_dojo("pwncollege/example-import-dojo", session=admin_session)
    except AssertionError:
        rid = "example-import"
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture
def simple_award_dojo(admin_session):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "simple_award_dojo.yml").read(), session=admin_session)


@pytest.fixture
def simulation_domains_dojo(admin_session):
    return create_dojo_yml(
        open(TEST_DOJOS_LOCATION / "simulation_domains.yml").read(),
        session=admin_session,
    )


@pytest.fixture
def codepoints_award_dojo(admin_session):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "codepoints_award_dojo.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def no_practice_challenge_dojo(admin_session, example_dojo):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "no_practice_challenge.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def import_dojo(admin_session, example_dojo):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "import.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def import_override_dojo(admin_session, example_dojo):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "import_override.yml").read(), session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture(scope="session")
def transfer_src_dojo(admin_session):
    n = "".join(random.choices(string.ascii_lowercase, k=8))
    yml = open(TEST_DOJOS_LOCATION / "transfer_src.yml").read().replace("src-dojo", f"src-dojo-{n}")
    rid = create_dojo_yml(yml, session=admin_session)
    return rid

@pytest.fixture(scope="session")
def transfer_dst_dojo(transfer_src_dojo, admin_session):
    n = "".join(random.choices(string.ascii_lowercase, k=8))
    yml = open(
        TEST_DOJOS_LOCATION / "transfer_dst.yml"
    ).read().replace("src-dojo", transfer_src_dojo).replace("dst-dojo", f"dst-dojo-{n}")
    rid = create_dojo_yml(yml, session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture(scope="session")
def no_import_challenge_dojo(admin_session, example_dojo):
    n = "".join(random.choices(string.ascii_lowercase, k=8))
    rid = create_dojo_yml(
        open(TEST_DOJOS_LOCATION / "no_import_challenge.yml"
      ).read().replace("no-import-challenge", f"no-import-challenge-{n}"), session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture(scope="session")
def no_practice_dojo(admin_session, example_dojo):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "no_practice_dojo.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def lfs_dojo(admin_session):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "lfs_dojo.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def event_dojo(admin_session):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "event_dojo.yml").read(), session=admin_session)
    db_id = rid.split("~")[0]
    data = json.loads(db_sql(f"SELECT data FROM dojos WHERE id='{db_id}';"))
    data["permissions"] = ["grant_awards"]
    db_sql(f"UPDATE dojos SET data='{json.dumps(data)}' WHERE id='{db_id}';")
    return rid

@pytest.fixture(scope="session")
def welcome_dojo(admin_session):
    try:
        rid = create_dojo("pwncollege/welcome-dojo", session=admin_session)
    except AssertionError:
        rid = "welcome"
    make_dojo_official(rid, admin_session)
    return rid


@pytest.fixture
def searchable_dojo(admin_session, example_dojo):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "searchable_dojo.yml").read(), session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture
def searchable_xss_dojo(admin_session, example_dojo):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "searchable_xss_dojo.yml").read(), session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture
def hidden_challenges_dojo(admin_session, example_dojo):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "hidden_challenges.yml").read(), session=admin_session)
    return rid

@pytest.fixture(scope="session")
def progression_locked_dojo(admin_session, example_dojo):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "progression_locked_dojo.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def surveys_dojo(admin_session, example_dojo):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "surveys_dojo.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def privileged_dojo(admin_session, example_dojo):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "privileged_dojo.yml").read(), session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture(scope="session")
def visibility_test_dojo(admin_session, example_dojo):
    return create_dojo_yml(open(TEST_DOJOS_LOCATION / "visibility_test.yml").read(), session=admin_session)

@pytest.fixture(scope="session")
def interfaces_dojo(admin_session, example_dojo):
    rid = create_dojo_yml(open(TEST_DOJOS_LOCATION / "custom_interfaces.yml").read(), session=admin_session)
    make_dojo_official(rid, admin_session)
    return rid

@pytest.fixture
def random_private_dojo(admin_session):
    """Create a private (non-official, non-public) dojo with random ID"""
    n = "".join(random.choices(string.ascii_lowercase, k=8))
    yml = open(TEST_DOJOS_LOCATION / "private_test.yml").read().replace("private-dojo", f"private-dojo-{n}")
    rid = create_dojo_yml(yml, session=admin_session)
    return rid

@pytest.fixture
def browser_fixture():
    if Firefox is None:
        pytest.skip("Selenium is not installed in this test environment")
    options = FirefoxOptions()
    options.add_argument("--headless")
    geckodriver = shutil.which("geckodriver")
    service = FirefoxService(executable_path=geckodriver) if geckodriver else None
    browser = Firefox(options=options, service=service)
    yield browser
    browser.quit()

@pytest.fixture
def random_user_browser(browser_fixture, random_user_name):
    browser_fixture.get(f"{DOJO_URL}/login")
    browser_fixture.find_element("id", "name").send_keys(random_user_name)
    browser_fixture.find_element("id", "password").send_keys(random_user_name)
    browser_fixture.find_element("id", "_submit").click()
    return browser_fixture
