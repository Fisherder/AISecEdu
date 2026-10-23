import copy
import hashlib
import json
import secrets

from .aes128 import ENGINE_VERSION, STANDARD_URL, block, encrypt_trace, self_check, transform


PATTERN_ID = "process-inquiry"
PATTERN_VERSION = "1.0.0"
ARTIFACT_TYPE = "learning-flow"
SCHEMA = "xuanjia-inquiry/1"
PHASES = [
    {"id": "orient", "title": "情境与目标", "instruction": "一份消息如何在同一个密钥下变成密文？先明确本次只观察一个 16 字节分组。"},
    {"id": "observe", "title": "分步观察", "instruction": "沿同一份数据前进或回退，观察字节数值、位置和轮密钥。点击格子查看字节。"},
    {"id": "experiment", "title": "动手探究", "instruction": "保持密钥不变，只翻转明文的一位。比较每一轮的真实变化，不预设每次恰好改变一半。"},
    {"id": "challenge", "title": "迁移挑战", "instruction": "接手一个新的第 10 轮状态。选择正确的变换及顺序，亲自完成最后一轮，再交给服务端核验。"},
    {"id": "reflect", "title": "反馈与归纳", "instruction": "对照操作证据检查目标达成情况。可以返回任一环节重试，无需提交报告。"},
]
OBJECTIVES = ["追踪同一分组在 AES-128 各轮中的状态与轮密钥。", "通过单比特对照实验观察扩散，而不把实验现象当作安全证明。", "独立完成末轮的字节代换、行移位与轮密钥加，并通过服务端核验。"]
DEFAULT_PLAINTEXT = "00112233445566778899aabbccddeeff"
DEFAULT_KEY = "000102030405060708090a0b0c0d0e0f"


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def text(value, label, limit, *, required=True):
    if not isinstance(value, str) or len(value.strip()) > limit or (required and not value.strip()):
        raise ValueError(f"{label}需为{'1–' if required else '不超过 '}{limit} 字的文本。")
    return value.strip()


def catalog():
    return {"id": PATTERN_ID, "version": PATTERN_VERSION, "label": "流程探究式学习",
            "artifactType": ARTIFACT_TYPE, "phases": copy.deepcopy(PHASES),
            "engines": [{"id": "aes128", "label": "AES-128", "version": ENGINE_VERSION}],
            "creationTool": "module.inquiry", "reportRequired": False,
            "agentContract": "When selected, load process-inquiry-learning and create the actual draft with module.inquiry({moduleIndex?,spec:{engine:'aes128',title,audience,minutes,intro,objectives:[three observable objectives],phaseInstructions:{orient,observe,experiment,challenge,reflect}}}). This native tool is available even without a bound course. Do not substitute candidate.generate, challenge.generate, quiz or HTML delivery. Creation does not publish. Other mechanisms require an available engine.",
            "limits": "首期支持 AES-128 单分组探究；其他机制须先接入可信计算与核验组件，不能降级为文字问答。"}


def make_spec(values):
    if values.get("engine", "aes128") != "aes128":
        raise ValueError("当前模式的可用计算组件是 AES-128；不能声称已支持其他算法。")
    objectives = values.get("objectives", OBJECTIVES)
    if not isinstance(objectives, list) or len(objectives) != 3:
        raise ValueError("请提供与三个操作目标对应的三条学习目标。")
    objectives = [text(value, "学习目标", 200) for value in objectives]
    minutes = values.get("minutes", 30)
    if isinstance(minutes, bool) or not isinstance(minutes, int) or not 10 <= minutes <= 120:
        raise ValueError("学习时长需为 10–120 分钟。")
    plaintext, key = values.get("plaintext", DEFAULT_PLAINTEXT), values.get("key", DEFAULT_KEY)
    block(plaintext)
    block(key)
    phases = copy.deepcopy(PHASES)
    instructions = values.get("phaseInstructions", {})
    if not isinstance(instructions, dict) or set(instructions) - {phase["id"] for phase in phases}:
        raise ValueError("学习环节说明的格式无效。")
    for phase in phases:
        if phase["id"] in instructions:
            phase["instruction"] = text(instructions[phase["id"]], "环节说明", 1200)
    return {"schema": SCHEMA, "patternId": PATTERN_ID, "patternVersion": PATTERN_VERSION,
            "engine": "aes128", "engineVersion": ENGINE_VERSION,
            "title": text(values.get("title", "AES-128：追踪一个分组，完成一次加密"), "项目名称", 160),
            "audience": text(values.get("audience", "已了解字节与十六进制，第一次学习分组密码的学生"), "学生基础", 400),
            "intro": text(values.get("intro", "你将看到同一组字节如何经过多轮变换成为密文，再用新条件独立完成末轮操作。"), "情境说明", 1200),
            "minutes": minutes, "objectives": objectives, "phases": phases,
            "defaults": {"plaintext": plaintext.lower(), "key": key.lower()},
            "completion": {"rule": "contrast-and-final-round/1", "contrastRequired": True,
                           "finalRoundRequired": True, "reportRequired": False},
            "boundaries": "完整执行 AES-128 单分组算法；教学计算组件不用于保存真实秘密。未覆盖消息填充、工作模式、认证或完整密码系统的安全性。",
            "sources": [{"title": "NIST FIPS 197（2023 更新）", "url": STANDARD_URL, "location": "AES-128 算法、状态映射与密钥扩展"}]}


def validate_spec(spec):
    if not isinstance(spec, dict) or spec.get("schema") != SCHEMA:
        raise ValueError("学习项目规格不完整或版本不受支持。")
    defaults, phases = spec.get("defaults"), spec.get("phases")
    if not isinstance(defaults, dict) or not isinstance(phases, list) or len(phases) != len(PHASES) or any(
        not isinstance(phase, dict) or not isinstance(phase.get("id"), str) or not isinstance(phase.get("instruction"), str)
        for phase in phases
    ):
        raise ValueError("输入定义或学习环节不完整。")
    rebuilt = make_spec({**spec, **defaults,
                         "phaseInstructions": {phase["id"]: phase["instruction"] for phase in phases}})
    if spec != rebuilt:
        raise ValueError("流程、计算版本或完成标准被修改；请使用支持的项目编辑器修订。")
    return {**self_check(), "patternVersion": PATTERN_VERSION, "contentHash": digest(spec),
            "checksScope": "结构、标准算法向量、解密、轮次。浏览器可用性与教学内容由教师预览审核。"}


def new_state(spec):
    return {"phase": "orient", "plaintext": spec["defaults"]["plaintext"], "key": spec["defaults"]["key"],
            "step": 0, "observed": [], "contrast": None, "challenge": None,
            "contrastPassed": False, "challengePassed": False, "completed": False}


def public_state(state):
    result = copy.deepcopy(state)
    if result.get("challenge"):
        result["challenge"].pop("expected", None)
        result["challenge"].pop("plaintext", None)
        result["challenge"].pop("key", None)
    return result


def transition(spec, previous, action):
    state = copy.deepcopy(previous)
    kind = action.get("type")
    feedback, evidence = None, {}
    if kind == "navigate":
        phase = action.get("phase")
        if phase not in {value["id"] for value in PHASES}:
            raise ValueError("学习环节不存在。")
        state["phase"] = phase
    elif kind == "compute":
        plaintext, key = action.get("plaintext"), action.get("key")
        result = encrypt_trace(plaintext, key)
        state.update(plaintext=plaintext.lower(), key=key.lower(), step=0, contrast=None)
        evidence = {"inputHash": digest({"plaintext": plaintext, "key": key}), "ciphertext": result["ciphertext"]}
    elif kind == "observe":
        step = action.get("step")
        if isinstance(step, bool) or not isinstance(step, int) or not 0 <= step <= 40:
            raise ValueError("无效的流程位置。")
        state["step"] = step
        state["observed"] = sorted(set(state["observed"]) | {step})
        evidence = {"step": step}
    elif kind == "contrast":
        bit = action.get("bit")
        if isinstance(bit, bool) or not isinstance(bit, int) or not 0 <= bit < 128:
            raise ValueError("请选择 0–127 之间的一位。")
        original = block(state["plaintext"])
        changed = original[:]
        changed[bit // 8] ^= 1 << (7 - bit % 8)
        before = encrypt_trace(bytes(original).hex(), state["key"])
        after = encrypt_trace(bytes(changed).hex(), state["key"])
        distances = [sum((left ^ right).bit_count() for left, right in zip(a["state"], b["state"]))
                     for a, b in zip(before["trace"], after["trace"])]
        state["contrast"] = {"bit": bit, "plaintext": bytes(original).hex(), "changedPlaintext": bytes(changed).hex(),
                             "ciphertext": before["ciphertext"], "changedCiphertext": after["ciphertext"],
                             "distances": distances, "engineVersion": ENGINE_VERSION}
        state["contrastPassed"] = True
        evidence = copy.deepcopy(state["contrast"])
        feedback = "对照实验已保存。曲线来自两次真实计算；单次观察不能证明密码算法安全。"
    elif kind in {"challenge.start", "challenge.reset"}:
        plaintext, key = secrets.token_hex(16), secrets.token_hex(16)
        result = encrypt_trace(plaintext, key)
        initial = next(value["state"] for value in reversed(result["trace"]) if value["round"] == 9)
        state["challenge"] = {"id": secrets.token_hex(12), "plaintext": plaintext, "key": key,
                              "initial": initial, "state": initial[:], "roundKey": block(result["roundKeys"][10]),
                              "operations": [], "expected": result["ciphertext"], "verified": False}
        feedback = "已准备新的末轮任务。请完成字节代换、行移位和轮密钥加；可试错后重新开始。"
    elif kind == "challenge.apply":
        challenge = state.get("challenge")
        if not challenge or action.get("challengeId") != challenge["id"]:
            raise ValueError("任务已变化，请刷新当前挑战。")
        if challenge["verified"] or len(challenge["operations"]) >= 4:
            raise ValueError("本次操作已结束，请核验或重新开始。")
        operation = action.get("operation")
        if operation not in {"subBytes", "shiftRows", "mixColumns", "addRoundKey"}:
            raise ValueError("无效的变换。")
        challenge["state"] = transform(challenge["state"], operation, challenge["roundKey"])
        challenge["operations"].append(operation)
        evidence = {"challengeId": challenge["id"], "operation": operation,
                    "state": challenge["state"], "ordinal": len(challenge["operations"])}
    elif kind == "challenge.verify":
        challenge = state.get("challenge")
        if not challenge or action.get("challengeId") != challenge["id"]:
            raise ValueError("任务已变化，请刷新当前挑战。")
        valid_order = challenge["operations"] == ["subBytes", "shiftRows", "addRoundKey"]
        matches = bytes(challenge["state"]).hex() == challenge["expected"]
        passed = valid_order and matches
        challenge["verified"] = passed
        state["challengePassed"] = state["challengePassed"] or passed
        evidence = {"challengeId": challenge["id"], "passed": passed, "correctOrder": valid_order,
                    "correctState": matches, "operations": challenge["operations"],
                    "resultHash": digest(challenge["state"]), "engineVersion": ENGINE_VERSION}
        feedback = ("核验通过：操作顺序和最终状态均与服务端 AES-128 计算一致。" if passed
                    else "尚未通过。请检查顺序：末轮需要代换、移位和轮密钥加，不包含列混合。重新开始可保留已完成的学习记录。")
    elif kind == "reset":
        state.update(plaintext=spec["defaults"]["plaintext"], key=spec["defaults"]["key"], step=0, contrast=None)
        feedback = "实验已恢复初始输入，已核验的完成证据保留。"
    else:
        raise ValueError("不支持的学习操作。")
    state["completed"] = bool(state["contrastPassed"] and state["challengePassed"])
    return state, {"type": kind, "details": evidence, "feedback": feedback}
