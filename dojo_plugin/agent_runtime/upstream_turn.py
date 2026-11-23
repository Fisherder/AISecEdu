import json
import os
import re
from urllib.parse import urlsplit

import requests


class UpstreamTurnError(ValueError):
    def __init__(self, message, *, category="service", retry_after=0, model=None, usage=None):
        super().__init__(message)
        self.category = category
        self.retry_after = retry_after
        self.model = model
        self.usage = usage


def upstream_enabled():
    setting = (os.environ.get("DOJO_AI_ENABLED") or "auto").strip().lower()
    if setting == "auto":
        setting = os.environ.get("HARNESS_CONFIGURED", "").strip().lower()
    return setting in {"1", "true", "yes"}


def ordinary_teaching_course(dojo_id):
    if type(dojo_id) is not int:
        return False
    configured = os.environ.get("HARNESS_ORDINARY_TEACHING_COURSE_IDS", "").split(",")
    ids = [item.strip() for item in configured]
    return all(re.fullmatch(r"-?[0-9]{1,10}", item) for item in ids) and dojo_id in {int(item) for item in ids}


def ordinary_slide_wording_request(instruction):
    # The renderer validates the actual page list against the saved deck.
    # Recognize the intent here even when a teacher mistypes a page number.
    if not isinstance(instruction, str):
        return False
    match = re.fullmatch(
        r"(?:请\s*)?(?:只|仅)\s*(?:修改|调整|润色)\s*([^：:\n]+?)\s*"
        r"(?:的\s*)?(?:文字|文案|措辞)\s*[：:]\s*(\S[\s\S]*)",
        instruction.strip(),
    )
    return bool(match and "页" in match[1])


def ordinary_teaching_image_allowed(user, scope, model_quota):
    capability = {"teacher": "agent:chat", "student": "self-learning:chat"}.get(scope.role)
    return bool(
        user.id == scope.user_id and capability and capability in scope.capabilities
        and model_quota.get("available") is True and upstream_enabled()
        and ordinary_teaching_course(scope.dojo_id)
    )


def teaching_image_enabled():
    setting = (os.getenv("HARNESS_DEEPSEEK_IMAGE_INPUT") or "auto").lower()
    model = (os.getenv("HARNESS_DEEPSEEK_MODEL") or "deepseek-flash").strip()
    supported = model in {"deepseek-flash", "deepseek-v4.1-flash"} if setting == "auto" else setting == "true"
    return bool(supported and upstream_enabled() and os.getenv("HARNESS_INTERNAL_URL") and os.getenv("HARNESS_SERVICE_SECRET"))


def request_body(system_prompt, context):
    return {"messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, sort_keys=True)},
    ]}


def invoke_turn(body, *, encoded=None):
    return _send_turn(body, "/v1/turn", 1024 * 1024, encoded)


def ordinary_grading_connection(base_url, token):
    enabled = (os.environ.get("DOJO_AI_ENABLED") or "auto").strip().lower()
    if enabled not in {"auto", "1", "true", "yes"} or not re.fullmatch(r"[A-Za-z0-9._~+/-]+=*", token):
        return None
    if token in {os.environ.get(name) for name in (
        "HARNESS_SERVICE_SECRET", "DEEPSEEK_API_KEY", "DOJO_AI_API_KEY",
    )}:
        return None

    base_url = base_url.strip()
    if re.search(r"[\s\x00-\x1f\x7f\\?#%]", base_url):
        return None
    try:
        url = urlsplit(base_url)
        shared_hosts = {"deepseek-harness", "api.deepseek.com"}
        for setting in ("HARNESS_INTERNAL_URL", "DOJO_AI_BASE_URL"):
            shared_host = urlsplit(os.environ.get(setting, "").strip()).hostname
            if shared_host:
                shared_hosts.add(shared_host.rstrip("."))
        port = url.port
    except ValueError:
        return None
    if (
        url.scheme not in {"http", "https"}
        or not re.fullmatch(r"(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\])(?::[0-9]+)?", url.netloc)
        or url.path not in {"", "/"} or port == 0
        or url.hostname.rstrip(".") in shared_hosts
        or (url.scheme == "http" and url.hostname not in {"localhost", "127.0.0.1", "::1"})
    ):
        return None
    return base_url.rstrip("/"), token


def invoke_ordinary_grading_turn(system_prompt, context, *, connection):
    if connection is None:
        raise UpstreamTurnError("校内评分服务尚未配置", category="permanent")
    return _send_turn(request_body(system_prompt, context), "/v1/turn", 1024 * 1024, connection=connection)


MATERIAL_TURN_PATH = "/v1/teaching-material-turn"
_USAGE_FIELDS = ("prompt_tokens", "completion_tokens", "total_tokens")


def _usage_counts(result):
    usage = result.get("usage")
    return {
        key: usage[key] for key in _USAGE_FIELDS
        if isinstance(usage, dict) and type(usage.get(key)) is int and usage[key] >= 0
    }


def valid_material_reads(reads, count):
    return (
        isinstance(reads, list) and 1 <= len(reads) <= count
        and all(type(index) is int and 1 <= index <= count for index in reads)
        and len(reads) == len(set(reads))
    )


def _material_failure_receipt(response):
    try:
        result = response.json()
    except ValueError:
        return None, None
    if not isinstance(result, dict) or not isinstance(result.get("model"), str):
        return None, None
    return result["model"], _usage_counts(result)


def invoke_teaching_material_turn(body, *, encoded=None):
    return _send_turn(body, MATERIAL_TURN_PATH, 128 * 1024, encoded)


def invoke_teaching_image_turn(body, image):
    # The caller resolves a single authorized, displayed illustration immediately before this call.
    if not teaching_image_enabled():
        raise UpstreamTurnError("当前教学模型未启用读图。", category="permanent")
    if not isinstance(image, dict) or set(image) != {"mediaType", "data"} or (
        image["mediaType"] not in ("image/png", "image/jpeg", "image/webp")
        or not isinstance(image["data"], str) or not 0 < len(image["data"]) <= 2796204
    ):
        raise UpstreamTurnError("教学插图格式或大小不符合要求。", category="permanent")
    return _send_turn({**body, "images": [image]}, "/v1/teaching-image-turn", 4 * 1024 * 1024)


def _send_turn(body, path, limit, encoded=None, *, connection=None):
    if connection is None:
        base_url = os.environ.get("HARNESS_INTERNAL_URL", "").strip().rstrip("/")
        secret = os.environ.get("HARNESS_SERVICE_SECRET", "")
    else:
        base_url, secret = connection
    if not base_url or not secret:
        raise UpstreamTurnError("教学对话服务尚未配置", category="permanent")
    if encoded is None:
        encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) > limit:
        raise UpstreamTurnError("教学对话资料超出服务容量，请减少本轮引用的资料", category="permanent")
    try:
        with requests.Session() as session:
            # Keep the internal Bearer credential and course material on the configured connection.
            session.trust_env = False
            session.verify = os.getenv("REQUESTS_CA_BUNDLE") or os.getenv("CURL_CA_BUNDLE") or True
            with session.post(
                f"{base_url}{path}",
                headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
                data=encoded,
                timeout=(8, 95),
                allow_redirects=False,
            ) as response:
                status = response.status_code
                if not 200 <= status < 300:
                    transient = status in {408, 425, 429} or 500 <= status < 600
                    model, usage = _material_failure_receipt(response) if (
                        path == MATERIAL_TURN_PATH and status in {502, 504}
                    ) else (None, None)
                    raise UpstreamTurnError(
                        f"教学对话服务返回 HTTP {status}",
                        category="service" if transient else "permanent",
                        retry_after=response.headers.get("Retry-After", 0) if transient else 0,
                        model=model, usage=usage,
                    )
                result = response.json()
    except requests.Timeout:
        raise UpstreamTurnError("教学对话服务请求超时") from None
    except UpstreamTurnError:
        raise
    except (requests.RequestException, ValueError):
        raise UpstreamTurnError("教学对话服务请求失败") from None
    except OSError:
        raise UpstreamTurnError("无法读取教学服务配置的信任证书", category="permanent") from None
    if not isinstance(result, dict):
        raise UpstreamTurnError("教学对话服务返回格式无效")
    text, model = result.get("text"), result.get("model")
    if not isinstance(text, str) or not text.strip() or not isinstance(model, str) or not model.strip():
        raise UpstreamTurnError("教学对话服务未返回完整答复")
    turn = {"text": text.strip(), "model": model.strip(), "usage": _usage_counts(result)}
    if path == MATERIAL_TURN_PATH:
        reads = result.get("materialReads")
        count = len(body.get("materials") or [])
        usage = turn["usage"]
        measured = (
            set(usage) == set(_USAGE_FIELDS) and usage["prompt_tokens"] > 0
            and usage["completion_tokens"] > 0
            and usage["total_tokens"] == usage["prompt_tokens"] + usage["completion_tokens"]
        )
        if (set(result) != {"text", "model", "usage", "materialReads"} or not measured
                or not valid_material_reads(reads, count)):
            raise UpstreamTurnError(
                "普通资料问答服务未返回完整的引用与用量回执",
                model=turn["model"], usage=usage if measured else None,
            )
        turn["materialReads"] = reads
    return turn


def result_object(text):
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    result = json.loads(content)
    if not isinstance(result, dict):
        raise UpstreamTurnError("教学对话服务返回格式无效")
    return result
