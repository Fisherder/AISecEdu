import json
import logging
import re

import requests

from CTFd.models import db

from ..config import (
    DOJO_AI_API_KEY,
    DOJO_AI_BASE_URL,
    DOJO_AI_ENABLED,
    DOJO_AI_MODEL,
    DOJO_AI_TIMEOUT_SECONDS,
)
from ..models import LearningTutorMessages
from .evidence import append_evidence, redact_text
from .standards import DEFAULT_HINT_POLICY


logger = logging.getLogger(__name__)


def model_json(system_prompt, user_payload, *, temperature=0.2):
    if not DOJO_AI_ENABLED:
        return None
    headers = {"Content-Type": "application/json"}
    if DOJO_AI_API_KEY:
        headers["Authorization"] = f"Bearer {DOJO_AI_API_KEY}"
    response = requests.post(
        f"{DOJO_AI_BASE_URL}/chat/completions",
        headers=headers,
        json={
            "model": DOJO_AI_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": json.dumps(user_payload, ensure_ascii=False, sort_keys=True),
                },
            ],
            "temperature": temperature,
            "response_format": {"type": "json_object"},
        },
        timeout=DOJO_AI_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"].strip()
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content, flags=re.IGNORECASE)
    result = json.loads(content)
    return result if isinstance(result, dict) else None


def _latest_observation(events):
    failed = next(
        (event for event in reversed(events) if event.event_type == "terminal.command.failed"),
        None,
    )
    completed = next(
        (event for event in reversed(events) if event.event_type == "terminal.command.completed"),
        None,
    )
    return failed or completed


def _suggested_tools(challenge_profile, question):
    lowered = (question or "").lower()
    question_tools = (
        (("http", "web", "request", "网页", "请求", "接口"), "curl、浏览器开发者工具或 Burp Suite"),
        (("binary", "overflow", "heap", "stack", "二进制", "溢出", "栈", "堆"), "file、checksec、readelf 或 gdb/pwndbg"),
        (("reverse", "assembly", "decompile", "逆向", "汇编", "反编译"), "file、strings、objdump、Ghidra 或 IDA"),
        (("cipher", "crypto", "encrypt", "密码", "加密", "密文"), "file、xxd 和 Python"),
        (("pcap", "packet", "forensic", "流量", "数据包", "取证"), "file、exiftool、binwalk 或 Wireshark"),
        (("permission", "owner", "权限", "用户", "属主"), "id、ls -la、stat 或 find"),
        (("path", "directory", "file", "路径", "目录", "文件"), "pwd、ls -la、file 或 find"),
    )
    for keywords, tools in question_tools:
        if any(keyword in lowered for keyword in keywords):
            return tools
    category = str(getattr(challenge_profile, "category", "GENERAL") or "GENERAL").upper()
    return {
        "WEB": "curl、浏览器开发者工具或 Burp Suite",
        "PWN": "file、checksec、readelf 或 gdb/pwndbg",
        "REV": "file、strings、objdump、Ghidra 或 IDA",
        "CRYPTO": "file、xxd 和 Python",
        "FORENSICS": "file、exiftool、binwalk 或 Wireshark",
    }.get(category, "file、ls、find 或 grep")


def _fallback_tutor(question, events, challenge_profile):
    observation = _latest_observation(events)
    command = (observation.payload or {}).get("command") if observation else None
    tools = _suggested_tools(challenge_profile, question)
    focus = question.strip().rstrip("?？.!。")[:180]
    opening = f"关于你问的“{focus}”，" if focus else "针对当前问题，"
    if observation and observation.event_type == "terminal.command.failed":
        return (
            f"{opening}刚才的失败可以先当作一条线索，不必急着换方向。可以把原因拆成路径、输入格式、权限和目标状态，"
            f"再考虑用 {tools} 做一次只读检查；哪一项观察最能区分这些可能性？"
        )
    if command:
        return (
            f"{opening}可以先回到你刚才运行的 `{command}`：它想验证的单一假设是什么，实际输出又支持或反驳了哪一部分？"
            f"下一步不妨用 {tools} 补一个最小基线，再根据差异决定动作。"
        )
    return (
        f"{opening}可以先把它缩小成一个能够被证伪的假设，并写下预期会看到的现象。"
        f"随后不妨用 {tools} 做最小范围的只读观察；得到结果后，再判断哪一步最值得继续。"
    )


def _safe_tutor_text(value, fallback):
    value = redact_text(value).strip()[:6000]
    forbidden = (
        r"pwn\.college\{",
        r"(?i)final\s+(answer|payload)",
        r"最终答案",
        r"(?i)dynamic\s+secret",
        r"(?i)teacher\s+solution",
        r"(?i)bearer\s+[A-Za-z0-9._~+/=-]+",
    )
    if not value or any(re.search(pattern, value) for pattern in forbidden):
        return fallback, True
    return value, False


def tutor_reply(attempt, user, question, challenge_profile=None):
    question = redact_text(question).strip()[:4000]
    events = list(attempt.evidence_timeline) if hasattr(attempt, "evidence_timeline") else []
    if not events:
        from ..models import LearningEvidenceEvents

        events = (
            LearningEvidenceEvents.query.filter_by(attempt_id=attempt.id)
            .order_by(LearningEvidenceEvents.sequence)
            .all()
        )
    fallback = _fallback_tutor(question, events, challenge_profile)
    answer = fallback
    provider = "DETERMINISTIC"
    error = None
    try:
        generated = model_json(
            (
                "你是网络安全实训 Tutor。只根据当前 epoch 的公开题面和脱敏证据回答。"
                "采用统一的提示式问答：先回应学习者的问题，再委婉指出一至三个下一步思考、"
                "可验证动作或可能用到的工具。不要给出可直接照抄的完整命令、载荷或解题步骤。"
                "不得泄露 flag、最终答案、动态秘密、教师解法或认证信息。"
                "返回 JSON：{\"answer\": string, \"nextCheck\": string, \"confidence\": number}。"
            ),
            {
                "question": question,
                "challenge": {
                    "name": attempt.dojo_challenge.name,
                    "description": attempt.dojo_challenge.description,
                    "objectives": (challenge_profile.objectives if challenge_profile else []),
                },
                "attempt": {"epoch": attempt.epoch, "mode": attempt.mode, "status": attempt.status},
                "evidence": [
                    {
                        "type": event.event_type,
                        "trustLevel": event.trust_level,
                        "payload": event.payload,
                    }
                    for event in events[-12:]
                    if event.trust_level >= 2
                ],
                "policy": DEFAULT_HINT_POLICY,
            },
        )
        if generated:
            candidate = str(generated.get("answer") or "")
            next_check = str(generated.get("nextCheck") or "").strip()
            if next_check:
                candidate += f"\n\n可以接着想一想：{next_check}"
            answer, blocked = _safe_tutor_text(candidate, fallback)
            provider = "MODEL_BLOCKED" if blocked else "MODEL"
    except (requests.RequestException, KeyError, TypeError, ValueError, json.JSONDecodeError) as exception:
        error = str(exception)[:500]
        logger.warning("Tutor model request failed: %s", exception)

    db.session.add(
        LearningTutorMessages(
            attempt_id=attempt.id,
            user_id=user.id,
            role="user",
            guidance_level=1,
            content=question,
            metadata_json={"epoch": attempt.epoch, "mode": "SOCRATIC_HINTS"},
        )
    )
    assistant = LearningTutorMessages(
        attempt_id=attempt.id,
        user_id=user.id,
        role="assistant",
        guidance_level=1,
        content=answer,
        metadata_json={"provider": provider, "error": error, "mode": "SOCRATIC_HINTS"},
    )
    db.session.add(assistant)
    append_evidence(
        attempt,
        "tutor.chat.user",
        {"characters": len(question)},
        source="TUTOR",
        trust_level=2,
    )
    append_evidence(
        attempt,
        "tutor.chat.assistant",
        {"provider": provider},
        source="TUTOR",
        trust_level=2,
    )
    return {
        "answer": answer,
        "mode": "SOCRATIC_HINTS",
        "provider": provider,
        "policyVersion": DEFAULT_HINT_POLICY["version"],
        "epoch": attempt.epoch,
    }
