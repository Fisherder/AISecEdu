import datetime
import math
from collections import Counter, defaultdict

VERSION = "2026-10-23.insights.v2"
STATUS_LABELS = {"complete": "已完成", "verified": "核验通过，待确认", "working": "正在练习", "help": "需要帮助", "idle": "待跟进", "not_started": "尚未开始", "empty": "暂无学习任务"}


def moment(value):
    if isinstance(value, str):
        value = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value is not None and value.tzinfo is not None:
        value = value.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return value


def stamp(value):
    value = moment(value)
    return value.isoformat(timespec="seconds") + "Z" if value else None


def ratio(top, bottom):
    return round(top / bottom, 4) if bottom else None


def numeric(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def in_period(value, start, end):
    value = moment(value)
    return value is not None and value <= end and (start is None or value >= start)


def build_atlas(students, tasks):
    task_states = {task["key"]: Counter() for task in tasks}
    completions = Counter()
    checks = {"total": 0, "passed": 0, "failed": 0, "unknown": 0, "checkedPairs": 0, "latestPassedPairs": 0}
    score_bands = Counter()
    recent = []
    for student in students:
        completions[student["completed"]] += 1
        observed = {cell["taskKey"]: cell for cell in student["cells"]}
        for task in tasks:
            cell = observed.get(task["key"])
            task_states[task["key"]][cell["status"] if cell else "not_started"] += 1
            if not cell:
                continue
            checks["total"] += cell["checks"]
            checks["failed"] += cell["failedChecks"]
            checks["passed"] += cell["passedChecks"]
            checks["checkedPairs"] += int(bool(cell["checks"]))
            checks["latestPassedPairs"] += int(cell["lastCheckPassed"] is True)
            if cell["score"] is not None:
                score_bands["90+" if cell["score"] >= 90 else "60–89" if cell["score"] >= 60 else "<60"] += 1
            if cell["lastActivity"]:
                recent.append({"studentId": student["userId"], "taskKey": task["key"], "at": cell["lastActivity"], "status": cell["status"], "recordCount": cell["recordCount"]})
    checks["unknown"] = checks["total"] - checks["failed"] - checks["passed"]
    modules = {}
    for task in tasks:
        key = task.get("moduleIndex")
        group = modules.setdefault(key, {"index": key, "name": task.get("moduleName") or "课程任务", "taskKeys": [], "completed": 0, "pairs": 0})
        group["taskKeys"].append(task["key"])
        group["completed"] += task["completed"]
        group["pairs"] += task["studentCount"]
    return {"taskStates": {key: dict(value) for key, value in task_states.items()}, "modules": list(modules.values()), "completionBands": [{"completed": count, "students": completions[count]} for count in range(max((student["required"] for student in students), default=0) + 1)], "checks": checks, "scoreBands": [{"band": band, "count": score_bands[band]} for band in ["<60", "60–89", "90+"]], "recent": sorted(recent, key=lambda row: (row["at"], row["studentId"], row["taskKey"]), reverse=True)[:12], "sceneEncoding": "task islands; one tile per current student; color is saved task status; no geographic or ability inference"}


def build_report(roster, tasks, facts, *, start, end, course, scope, followups=None):
    start, end = moment(start), moment(end)
    students = {row["userId"]: dict(row) for row in roster}
    task_map = {task["key"]: task for task in tasks}
    cells = defaultdict(lambda: {"startedAt": None, "lastActivity": None, "completedAt": None, "recordCount": 0, "periodRecords": 0, "checks": 0, "passedChecks": 0, "failedChecks": 0, "lastCheckPassed": None, "lastCheckAt": None, "score": None, "scoreAt": None})
    dates = defaultdict(lambda: {"active": set(), "completed": set(), "records": 0})
    seen = set()
    for fact in facts:
        user_id, key = fact["userId"], fact["taskKey"]
        if user_id not in students or key not in task_map:
            continue
        at = moment(fact.get("at"))
        if at is None or at > end:
            continue
        identity = (fact["kind"], str(fact["id"]))
        if identity in seen:
            continue
        seen.add(identity)
        cell = cells[user_id, key]
        cell["startedAt"] = min(cell["startedAt"], at) if cell["startedAt"] else at
        cell["lastActivity"] = max(cell["lastActivity"], at) if cell["lastActivity"] else at
        cell["recordCount"] += 1
        if fact["kind"] == "completion":
            cell["completedAt"] = min(cell["completedAt"], at) if cell["completedAt"] else at
        if fact["kind"] == "check":
            cell["checks"] += 1
            cell["passedChecks"] += int(fact.get("passed") is True)
            cell["failedChecks"] += int(fact.get("passed") is False)
            if cell["lastCheckAt"] is None or at >= cell["lastCheckAt"]:
                cell["lastCheckAt"], cell["lastCheckPassed"] = at, fact.get("passed")
        score = numeric(fact.get("score"))
        if score is not None and (cell["scoreAt"] is None or at >= cell["scoreAt"]):
            cell["score"], cell["scoreAt"] = round(score, 1), at
        if in_period(at, start, end):
            cell["periodRecords"] += 1
            local_day = (at + datetime.timedelta(hours=8)).date()
            dates[local_day]["active"].add(user_id)
            dates[local_day]["records"] += 1
    for (user_id, key), cell in cells.items():
        if in_period(cell["completedAt"], start, end):
            day = (cell["completedAt"] + datetime.timedelta(hours=8)).date()
            dates[day]["completed"].add((user_id, key))
    required = [task for task in tasks if task["required"]]
    task_results = {task["key"]: {**task, "completed": 0, "started": 0, "needsHelp": 0, "verified": 0, "newCompletions": 0, "scores": []} for task in tasks}
    statuses = Counter()
    student_rows = []
    for user_id, student in students.items():
        student_cells = []
        for task in tasks:
            cell = dict(cells[user_id, task["key"]])
            active = cell["lastActivity"]
            age = max(0, (end - active).days) if active else None
            if cell["completedAt"]:
                status = "complete"
            elif cell["lastCheckPassed"] is True:
                status = "verified"
            elif cell["failedChecks"] >= 3:
                status = "help"
            elif active and age >= 7:
                status = "idle"
            elif active:
                status = "working"
            else:
                status = "not_started"
            result = task_results[task["key"]]
            result["completed"] += int(status == "complete")
            result["started"] += int(active is not None)
            result["needsHelp"] += int(status == "help")
            result["verified"] += int(status == "verified")
            result["newCompletions"] += int(in_period(cell["completedAt"], start, end))
            if cell["score"] is not None:
                result["scores"].append(cell["score"])
            student_cells.append({"taskKey": task["key"], "status": status, "statusLabel": STATUS_LABELS[status], **{k: stamp(v) if k.endswith("At") or k == "lastActivity" else v for k, v in cell.items()}})
        by_key = {cell["taskKey"]: cell for cell in student_cells}
        completed = sum(by_key[t["key"]]["status"] == "complete" for t in required)
        all_completed = sum(c["status"] == "complete" for c in student_cells)
        period_records = sum(c["periodRecords"] for c in student_cells)
        latest = max((c["lastActivity"] for c in student_cells if c["lastActivity"]), default=None)
        important = next((c for c in student_cells if c["status"] == "help"), None)
        idle = next((c for c in student_cells if c["status"] == "idle"), None)
        pending = next((c for c in student_cells if c["status"] == "verified"), None)
        if not tasks:
            status, reason = "empty", "发布实践题或探究项目后，这里会显示学习进展。"
        elif required and completed == len(required):
            status, reason = "complete", f"已完成全部 {len(required)} 项必修任务。"
        elif important:
            status, reason = "help", f"《{task_map[important['taskKey']]['name']}》有 {important['failedChecks']} 次正式核验未通过，建议先核对检查反馈。"
        elif pending:
            status, reason = "verified", f"《{task_map[pending['taskKey']]['name']}》检查已通过，尚无平台完成确认。"
        elif idle:
            days = (end - moment(idle["lastActivity"])).days
            status, reason = "idle", f"《{task_map[idle['taskKey']]['name']}》尚未完成，已有 {days} 天没有新记录。"
        elif latest:
            status, reason = "working", "已有学习记录，仍有任务未完成。"
        else:
            status, reason = "not_started", "当前任务中尚无开始或提交记录；请先确认学生是否已经开始。"
        statuses[status] += 1
        student_rows.append({**student, "status": status, "statusLabel": STATUS_LABELS[status], "reason": reason, "completed": completed, "required": len(required), "allCompleted": all_completed, "completionRate": ratio(completed, len(required)), "activeInPeriod": bool(period_records), "periodRecords": period_records, "recordCount": sum(c["recordCount"] for c in student_cells), "lastActivity": latest, "cells": [c for c in student_cells if c["recordCount"]]})
    order = {"help": 0, "idle": 1, "verified": 2, "not_started": 3, "working": 4, "complete": 5, "empty": 6}
    student_rows.sort(key=lambda s: (order[s["status"]], s["name"], s["userId"]))
    for task in task_results.values():
        scores = task.pop("scores")
        task.update(studentCount=len(students), completionRate=ratio(task["completed"], len(students)), completionAmongStarted=ratio(task["completed"], task["started"]), scoreSample=len(scores), averageScore=round(sum(scores) / len(scores), 1) if scores else None)
    first_day = ((start or min((c["startedAt"] for c in cells.values() if c["startedAt"]), default=end)) + datetime.timedelta(hours=8)).date()
    last_day = (end + datetime.timedelta(hours=8)).date()
    span = (last_day - first_day).days + 1
    bucket_days = 1 if span <= 31 else 7 if span <= 182 else 30
    buckets = {}
    for offset in range(0, span, bucket_days):
        day = first_day + datetime.timedelta(days=offset)
        buckets[day] = {"date": day.isoformat(), "active": set(), "completed": set(), "records": 0}
    for day, row in dates.items():
        offset = (day - first_day).days // bucket_days * bucket_days
        bucket = buckets.get(first_day + datetime.timedelta(days=offset))
        if bucket is not None:
            bucket["active"].update(row["active"]); bucket["completed"].update(row["completed"]); bucket["records"] += row["records"]
    trend = [{"date": row["date"], "activeStudents": len(row["active"]), "completions": len(row["completed"]), "records": row["records"]} for row in buckets.values()]
    completed_pairs = sum(s["completed"] for s in student_rows)
    denominator = len(students) * len(required)
    summary = {"students": len(students), "tasks": len(tasks), "requiredTasks": len(required), "completedPairs": completed_pairs, "requiredPairs": denominator, "completionRate": ratio(completed_pairs, denominator), "completedStudents": statuses["complete"], "activeStudents": sum(s["activeInPeriod"] for s in student_rows), "newCompletions": sum(t["newCompletions"] for t in task_results.values()), "needsHelp": statuses["help"] + statuses["idle"], "notStarted": statuses["not_started"], "pendingConfirmation": statuses["verified"], "records": sum(s["periodRecords"] for s in student_rows)}
    definitions = [
        {"name": "累计完成", "text": "截至快照时间的完成记录，与时间筛选无关。必修完成比例 = 已完成的学生与必修任务组合数 ÷（当前学生数 × 当前已发布必修任务数）。"},
        {"name": "完成依据", "text": "实践题采用平台 Solves 判题记录；流程探究项目采用当前发布版本的服务端完成记录。脚本检查通过但未确认完成，单独显示为待确认。预览、草稿、单纯打开页面不计为完成。"},
        {"name": "时间范围", "text": "时间筛选只影响活跃人数、新增完成和趋势。日期按北京时间分桶，图表不把多日活跃人数相加当作独立人数。"},
        {"name": "需要帮助", "text": "当前未完成任务累计至少 3 次正式核验失败，或已开始的未完成任务至少 7 天没有新记录。正常命令报错、重置环境和使用 AI 辅导不用于判断能力。"},
        {"name": "成绩", "text": "只展示最近一次已确认评估的实际分数，不用浏览量、命令数或经验权重推测掌握度。没有评估时显示未评分。"},
        {"name": "数据边界", "text": "学生是当前课程的非教师成员。任务是当前已发布的实践题及流程探究项目；课件浏览、未接入的其他学习行为不代表已经掌握知识。"},
    ]
    atlas = build_atlas(student_rows, list(task_results.values()))
    return {"version": VERSION, "asOf": stamp(end), "course": course, "scope": scope, "summary": summary, "atlas": atlas, "statuses": [{"id": key, "label": label, "count": statuses[key]} for key, label in STATUS_LABELS.items()], "students": student_rows, "tasks": list(task_results.values()), "trend": trend, "trendBucketDays": bucket_days, "followups": followups or [], "definitions": definitions, "source": {"kind": "live", "label": "课程真实学习记录", "timezone": "Asia/Shanghai", "automaticGradeImpact": False, "runtimeProbing": False, "matrixEncoding": "observed_cells; missing means not_started"}}
