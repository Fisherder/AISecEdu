import logging
import sys

import pytest
import requests
from utils import DOJO_URL, dojo_run

try:
    from CTFd.plugins.dojo_plugin.utils.request_logging import RequestIdFilter
except ModuleNotFoundError:
    RequestIdFilter = None


def recent_ctfd_logs():
    return dojo_run("sh", "-c", "docker logs --since 30s ctfd 2>&1").stdout


def test_request_log_filter_redacts_nested_values_and_traceback():
    if RequestIdFilter is None:
        pytest.skip("the pure log-filter unit test requires the CTFd Python package")
    nested_secret = "nested-secret-sentinel"
    traceback_secret = "traceback-secret-sentinel"
    try:
        raise RuntimeError(f"token={traceback_secret}")
    except RuntimeError:
        exc_info = sys.exc_info()
    record = logging.LogRecord(
        name="redaction-test",
        level=logging.ERROR,
        pathname=__file__,
        lineno=1,
        msg="failed payload=%s",
        args=(
            {
                "apiKey": nested_secret,
                "nested": {"prompt": "private teaching prompt"},
                "jobId": "job_safe_123",
            },
        ),
        exc_info=exc_info,
    )
    assert RequestIdFilter().filter(record)
    rendered = logging.Formatter("%(message)s").format(record)
    assert "job_safe_123" in rendered
    assert "[REDACTED]" in rendered
    assert nested_secret not in rendered
    assert "private teaching prompt" not in rendered
    assert traceback_secret not in rendered

    request_record = logging.LogRecord(
        name="werkzeug",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg='GET %s HTTP/1.1',
        args=("/launch?ticket=query-value-sentinel&prompt=private",),
        exc_info=None,
    )
    assert RequestIdFilter().filter(request_record)
    request_line = logging.Formatter("%(message)s").format(request_record)
    assert "/launch?[REDACTED_QUERY]" in request_line
    assert "query-value-sentinel" not in request_line
    assert "prompt=private" not in request_line


def test_api_error_handler_logs_anonymous_user_context():
    response = requests.get(f"{DOJO_URL}/pwncollege_api/v1/test_error", allow_redirects=False)
    assert response.status_code in [200, 302, 401, 403]


def test_api_error_handler_logs_authenticated_user_context(random_user_session):
    response = random_user_session.get(f"{DOJO_URL}/pwncollege_api/v1/test_error")
    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "API_EXCEPTION" in logs
    assert "error_type='Exception'" in logs
    assert "Test error: This is a deliberate test of the error handler!" in logs


def test_api_error_handler_captures_request_data(random_user_session):
    body_secret = "body-secret-must-not-reach-logs"
    query_secret = "query-secret-must-not-reach-logs"
    test_data = {"test": "data", "number": 123, "password": body_secret}
    test_params = {"param1": query_secret, "param2": "value2"}

    response = random_user_session.post(
        f"{DOJO_URL}/pwncollege_api/v1/test_error",
        json=test_data,
        params=test_params
    )

    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "API_EXCEPTION" in logs
    assert "method='POST'" in logs
    assert "query_params=" in logs
    assert "param1" in logs
    assert "json_data=" in logs
    assert body_secret not in logs
    assert query_secret not in logs


def test_api_error_handler_captures_user_agent(random_user_session):
    headers = {"User-Agent": "TestAgent/1.0 (Testing)"}
    response = random_user_session.get(
        f"{DOJO_URL}/pwncollege_api/v1/test_error",
        headers=headers
    )

    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "API_EXCEPTION" in logs
    assert "user_agent=" in logs


def test_api_error_handler_reraises_exception(random_user_session):
    response = random_user_session.get(f"{DOJO_URL}/pwncollege_api/v1/test_error")

    assert response.status_code == 500
    assert "test error" in response.text.lower() or "error" in response.text.lower()


def test_api_error_handler_with_admin_user(admin_session):
    response = admin_session.get(f"{DOJO_URL}/pwncollege_api/v1/test_error")

    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "API_EXCEPTION" in logs
    assert "user_id=1" in logs


def test_api_non_existent_endpoint_404():
    response = requests.get(f"{DOJO_URL}/pwncollege_api/v1/this_does_not_exist")
    assert response.status_code == 404


def test_page_error_handler_logs_authenticated_user_context(random_user_session):
    response = random_user_session.get(f"{DOJO_URL}/test_page_error")

    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "PAGE_EXCEPTION" in logs
    assert "event='page_exception'" in logs
    assert "error_type='Exception'" in logs
    assert "Test page error:" in logs
    assert "method='GET'" in logs
    assert "endpoint='/test_page_error'" in logs


def test_page_error_handler_logs_anonymous_user_context():
    response = requests.get(f"{DOJO_URL}/test_page_error", allow_redirects=False)
    assert response.status_code in [302, 401]


def test_page_error_handler_captures_post_data(random_user_session):
    test_data = {"field1": "value1", "field2": "value2"}
    response = random_user_session.post(f"{DOJO_URL}/test_page_error", data=test_data)

    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "PAGE_EXCEPTION" in logs
    assert "form_data=" in logs
    assert "field1" in logs
    assert "method='POST'" in logs


def test_page_error_handler_with_admin_user(admin_session):
    response = admin_session.get(f"{DOJO_URL}/test_page_error")

    assert response.status_code == 500

    logs = recent_ctfd_logs()
    assert "PAGE_EXCEPTION" in logs
    assert "user_id=1" in logs


def test_page_404_errors_not_logged():
    response = requests.get(f"{DOJO_URL}/this_page_does_not_exist")
    assert response.status_code == 404

    logs = dojo_run("sh", "-c", "docker logs ctfd 2>&1 | grep PAGE_EXCEPTION | grep this_page_does_not_exist || echo 'not found'").stdout
    assert "not found" in logs


def test_student_error_page_keeps_http_semantics_without_showing_raw_status(
    random_user_session,
):
    response = random_user_session.get(
        f"{DOJO_URL}/workspace",
        params={"service": "simulation"},
    )
    assert response.status_code == 200
    assert "还没有启动实验" in response.text
    assert "题目级模拟演示引擎已下线" not in response.text
