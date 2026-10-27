import datetime
import math
import re
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


DOCUMENTATION_URL = "https://api.owvlab.net/page/expdocking.html#jump_expdocking_ai"
DEPLOYMENTS = {"公有云服务", "私有化部署", "混合服务", "本地运行"}
MAX_INTEGER = 2147483647
EVENT_LABELS = {
    "terminal.command.completed": "终端操作完成",
    "terminal.command.failed": "终端操作与调试",
    "workspace.file.saved": "保存实验文件",
    "runtime.state.snapshot": "实验环境状态观察",
    "milestone.observed": "实验目标观察",
    "tutor.chat.assistant": "AI 实验操作指导",
    "flag.compared": "提交实验结果核验",
    "oracle.observed": "客观目标核验",
    "coding.submission.verified": "代码正式核验",
    "coding.basic.completed": "基础编码目标完成",
    "simulation.action": "执行情境操作",
    "simulation.action.applied": "执行情境操作",
    "attempt.reflection.saved": "保存实验反思",
    "lab.stopped": "停止实验环境",
    "lab.reset.completed": "恢复本题实验状态",
}


class ContractError(ValueError):
    pass


def integer(value, field):
    if type(value) is not int or not 0 <= value <= MAX_INTEGER:
        raise ContractError(f"{field} 必须是 0–2147483647 的整数")
    return value


def text(value, field, maximum=240):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise ContractError(f"{field} 必须是有效非空文本")
    return value.strip()


def origin(value):
    try:
        parts = urlsplit(text(value, "host", 300))
        port = parts.port
    except ValueError:
        raise ContractError("host 地址无效") from None
    if (parts.scheme != "https" or parts.username or parts.password or not parts.hostname
            or parts.path not in {"", "/"} or parts.query or parts.fragment
            or port not in {None, 443}):
        raise ContractError("host 必须是 HTTPS 根域名，不允许路径、凭据或自定义端口")
    return f"https://{parts.hostname.lower()}"


def launch_parameters(values, applications):
    token = text(values.get("token"), "token", 180)
    app_id, separator, exp_id = token.rpartition("_")
    if not separator or not re.fullmatch(r"[A-Za-z0-9-]{1,80}", app_id) or not re.fullmatch(r"[0-9]{1,24}", exp_id):
        raise ContractError("token 应为平台提供的 appId_expId")
    application = applications.get(app_id)
    if not application or not application.get("enabled"):
        raise ContractError("此润尼尔项目尚未配置或启用")
    host = origin(values.get("host"))
    if host != origin(application["host"]):
        raise ContractError("启动链接的 host 与项目配置不一致")
    sequence = text(values.get("sequenceCode"), "sequenceCode", 128)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", sequence):
        raise ContractError("实验序列码格式错误")
    return {"appId": app_id, "expId": exp_id, "host": host, "sequenceCode": sequence}


def verified_user(response, exp_id):
    if not isinstance(response, dict) or response.get("error") not in (None, ""):
        raise ContractError("润尼尔实验序列码验证失败，请重新从平台进入")
    rows = response.get("expList")
    if not isinstance(rows, list) or not any(isinstance(row, dict) and str(row.get("expId")) == exp_id for row in rows):
        raise ContractError("序列码不属于本次实验预约")
    user = response.get("user")
    if not isinstance(user, dict):
        raise ContractError("平台没有返回可验证的用户身份")
    identifier = user.get("id")
    if identifier not in (None, ""):
        if type(identifier) is int and 0 < identifier < 10 ** 24:
            code = f"id:{identifier}"
        elif isinstance(identifier, str) and re.fullmatch(r"[1-9][0-9]{0,23}", identifier):
            code = f"id:{identifier}"
        else:
            raise ContractError("平台用户 id 必须是有效的正整数标识")
    else:
        code = "number:" + text(user.get("numberId"), "平台用户标识", 153)
    return {"code": code, "name": text(user.get("name"), "平台用户姓名", 160)}


def validate_ai_data(value):
    fields = {"ai_call_count", "ai_models_used", "ai_usage_scenarios", "ai_input_token_count", "ai_output_token_count", "ai_remark"}
    if not isinstance(value, dict) or not value or set(value) - fields:
        raise ContractError("ai_data 必须是仅包含官方六个字段的非空对象")
    integer(value.get("ai_call_count"), "ai_call_count")
    models = value.get("ai_models_used")
    if not isinstance(models, list) or not models:
        raise ContractError("ai_models_used 不能为空")
    for model in models:
        if not isinstance(model, dict) or set(model) - {"model", "version", "deployment", "provider"}:
            raise ContractError("AI 模型字段无效")
        for field in ("model", "version", "deployment"):
            text(model.get(field), field)
        if model["deployment"] not in DEPLOYMENTS:
            raise ContractError("AI deployment 不在官方允许范围")
        if model.get("provider") is not None and not isinstance(model["provider"], str):
            raise ContractError("AI provider 类型无效")
    scenarios = value.get("ai_usage_scenarios")
    if not isinstance(scenarios, list) or not scenarios:
        raise ContractError("ai_usage_scenarios 不能为空")
    for scenario in scenarios:
        text(scenario, "ai_usage_scenarios")
    for field in ("ai_input_token_count", "ai_output_token_count"):
        if field in value:
            integer(value[field], field)
    if value.get("ai_remark") is not None and not isinstance(value["ai_remark"], str):
        raise ContractError("ai_remark 类型无效")
    return value


def ai_data(calls):
    if not calls:
        return None
    models, scenarios = [], []
    for call in calls:
        model = {key: call[key] for key in ("model", "version", "deployment", "provider")}
        if model not in models:
            models.append(model)
        if call["scenario"] not in scenarios:
            scenarios.append(call["scenario"])
    result = {"ai_call_count": len(calls), "ai_models_used": models,
              "ai_usage_scenarios": scenarios,
              "ai_remark": "仅统计本次预约关联作答的实际模型请求（含失败和重试）；不含教师出题及其他学生。模型未返回独立版本时以调用的模型标识作为版本。"}
    for field, target in (("input_tokens", "ai_input_token_count"), ("output_tokens", "ai_output_token_count")):
        if all(type(call.get(field)) is int for call in calls):
            result[target] = sum(call[field] for call in calls)
    return validate_ai_data(result)


def utc(value):
    if value.tzinfo is None:
        value = value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)


def payload_for_assessment(app_id, exp_id, title, started, finished, score, events, calls, *,
                           expected_seconds=180, strict=True, timezone="Asia/Shanghai", report_keys=None):
    started, finished = utc(started), utc(finished)
    number = float(score)
    if not math.isfinite(number) or not 0 <= number <= 100:
        raise ContractError("玄甲成绩超出 0–100，不能自动映射")
    rounded = int(Decimal(str(score)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    zone = ZoneInfo(timezone)
    stamp = lambda value: value.astimezone(zone).strftime("%Y-%m-%d %H:%M:%S")
    begin = started.replace(microsecond=0) + datetime.timedelta(seconds=bool(started.microsecond))
    end = finished.replace(microsecond=0)
    cursor = begin
    observations = []
    for event in sorted(events, key=lambda item: (utc(item["occurred"]), item["sequence"])):
        label = EVENT_LABELS.get(event["type"])
        at = utc(event["occurred"]).replace(microsecond=0)
        if not label or at < cursor + datetime.timedelta(seconds=1) or at > end - datetime.timedelta(seconds=3):
            continue
        observations.append({**event, "label": label, "at": at})
        cursor = at + datetime.timedelta(seconds=1)
    rows = []
    cursor = begin
    group_size = max(1, math.ceil(len(observations) / 199))
    for offset in range(0, len(observations), group_size):
        group = observations[offset:offset + group_size]
        event = group[-1]
        at, label = event["at"], event["label"]
        rows.append({"moduleFlag": title[:160], "questionNumber": len(rows) + 1,
                     "questionStem": label, "score": 0, "trueOrFalse": "False",
                     "startTime": stamp(cursor), "endTime": stamp(at),
                     "expectTime": expected_seconds, "maxScore": 100, "repeatCount": len(group),
                     "evaluation": "已记录实际活动", "scoringModel": "过程观察（不另计分）",
                     "remarks": f"本区间合并 {len(group)} 项实际观察；末项证据序号 {event['sequence']}；不是命令执行时长"})
        cursor = at + datetime.timedelta(seconds=1)
    if cursor + datetime.timedelta(seconds=1) > end:
        raise ContractError("尚无完整的实际作答时间区间，不能构造实验步骤")
    rows.append({"moduleFlag": title[:160], "questionNumber": len(rows) + 1,
                 "questionStem": "平台正式成绩", "score": rounded, "trueOrFalse": "True",
                 "startTime": stamp(cursor), "endTime": stamp(end),
                 "expectTime": expected_seconds, "maxScore": 100, "repeatCount": 1,
                 "evaluation": "采用玄甲已保存的正式评测", "scoringModel": "正式评测总分（0–100）",
                 "remarks": f"原始成绩 {number:g}，按四舍五入映射为接口所需整数；未生成额外分项成绩"})
    if strict and (len(rows) < 10 or (end - begin).total_seconds() < 180):
        raise ContractError(f"实验空间要求至少 10 个实际步骤及 180 秒；当前 {len(rows)} 步、{int((end-begin).total_seconds())} 秒")
    keys = report_keys or {"summary": "text1", "score": "text2"}
    report = [{keys["summary"]: {"text": f"{title}；已保存正式评测，过程步骤来自本次预约的真实活动。"}},
              {keys["score"]: {"text": f"玄甲原始成绩：{number:g}/100；回传整数成绩：{rounded}/100。"}}]
    payload = {"appId": app_id, "expId": exp_id, "reportData": report, "expScoreDetails": rows}
    statistics = ai_data(calls)
    if statistics is not None:
        payload["ai_data"] = statistics
    return payload
