import json
import os
import re

import requests


class UpstreamTurnError(ValueError):
    def __init__(self, message, *, category="service", retry_after=0):
        super().__init__(message)
        self.category = category
        self.retry_after = retry_after


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


def request_body(system_prompt, context):
    return {"messages": [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(context, ensure_ascii=False, sort_keys=True)},
    ]}


def invoke_turn(body, *, encoded=None):
    base_url = os.environ.get("HARNESS_INTERNAL_URL", "").strip().rstrip("/")
    secret = os.environ.get("HARNESS_SERVICE_SECRET", "")
    if not base_url or not secret:
        raise UpstreamTurnError("教学对话服务尚未配置", category="permanent")
    if encoded is None:
        encoded = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    if len(encoded) > 1024 * 1024:
        raise UpstreamTurnError("教学对话资料超出服务容量，请减少本轮引用的资料", category="permanent")
    try:
        with requests.post(
            f"{base_url}/v1/turn",
            headers={"Authorization": f"Bearer {secret}", "Content-Type": "application/json"},
            data=encoded,
            timeout=(8, 95),
            allow_redirects=False,
        ) as response:
            status = response.status_code
            if not 200 <= status < 300:
                transient = status in {408, 425, 429} or 500 <= status < 600
                raise UpstreamTurnError(
                    f"教学对话服务返回 HTTP {status}",
                    category="service" if transient else "permanent",
                    retry_after=response.headers.get("Retry-After", 0) if transient else 0,
                )
            result = response.json()
    except requests.Timeout:
        raise UpstreamTurnError("教学对话服务请求超时") from None
    except UpstreamTurnError:
        raise
    except (requests.RequestException, ValueError):
        raise UpstreamTurnError("教学对话服务请求失败") from None
    if not isinstance(result, dict):
        raise UpstreamTurnError("教学对话服务返回格式无效")
    text, model = result.get("text"), result.get("model")
    if not isinstance(text, str) or not text.strip() or not isinstance(model, str) or not model.strip():
        raise UpstreamTurnError("教学对话服务未返回完整答复")
    usage = result.get("usage")
    return {
        "text": text.strip(),
        "model": model.strip(),
        "usage": {
            key: usage[key]
            for key in ("prompt_tokens", "completion_tokens", "total_tokens")
            if isinstance(usage, dict) and type(usage.get(key)) is int and usage[key] >= 0
        },
    }


def result_object(text):
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE)
    result = json.loads(content)
    if not isinstance(result, dict):
        raise UpstreamTurnError("教学对话服务返回格式无效")
    return result
