import datetime as dt
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location("insights_contract", Path(__file__).resolve().parents[1] / "dojo_plugin/learning/insights_contract.py")
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)
NOW = dt.datetime(2026, 10, 23, 4)
ROSTER = [{"userId": 1, "name": "甲"}, {"userId": 2, "name": "乙"}]
TASKS = [{"key": "q:1", "id": 1, "name": "安全复制", "required": True}, {"key": "q:2", "id": 2, "name": "边界测试", "required": False}]


def report(facts=(), roster=ROSTER, tasks=TASKS, start=None):
    return contract.build_report(roster, tasks, list(facts), start=start, end=NOW, course={"name": "测试课程"}, scope={"label": "测试范围"})


def fact(kind="event", identity="a", user=1, task="q:1", days=1, **values):
    return {"kind": kind, "id": identity, "userId": user, "taskKey": task, "at": NOW - dt.timedelta(days=days), **values}


def test_time_filter_never_erases_prior_completion():
    facts = [fact("completion", days=60)]
    short = report(facts, start=NOW - dt.timedelta(days=7))
    lifetime = report(facts)
    assert short["summary"]["completionRate"] == lifetime["summary"]["completionRate"] == .5
    assert short["summary"]["newCompletions"] == 0
    assert short["summary"]["activeStudents"] == 0
    assert lifetime["summary"]["newCompletions"] == 1


def test_empty_denominators_are_unknown_not_zero():
    assert report(roster=[])["summary"]["completionRate"] is None
    assert report(tasks=[])["summary"]["completionRate"] is None
    assert report(tasks=[TASKS[1]])["summary"]["completionRate"] is None


def test_duplicate_source_records_do_not_inflate_counts():
    f = fact("completion")
    data = report([f, f, fact("completion", identity="b", user=2)])
    assert data["summary"]["completedPairs"] == 2
    assert data["summary"]["completionRate"] == 1
    assert data["summary"]["records"] == 2


def test_unknown_users_and_tasks_are_excluded():
    data = report([fact("completion", user=999), fact("completion", identity="b", task="q:999")])
    assert data["summary"]["completedPairs"] == 0
    assert data["summary"]["records"] == 0


def test_future_records_cannot_change_snapshot():
    data = report([fact("completion", days=-1)])
    assert data["summary"]["completedPairs"] == 0
    assert data["summary"]["activeStudents"] == 0


def test_formal_check_success_does_not_forge_completion():
    data = report([fact("check", passed=True)])
    row = next(s for s in data["students"] if s["userId"] == 1)
    assert row["status"] == "verified"
    assert row["completed"] == 0
    assert data["summary"]["pendingConfirmation"] == 1


def test_no_records_are_not_a_low_grade_or_a_help_prediction():
    data = report()
    assert data["summary"]["needsHelp"] == 0
    assert data["summary"]["notStarted"] == 2
    assert all(c["score"] is None for s in data["students"] for c in s["cells"])


def test_three_failed_formal_checks_are_a_concrete_help_signal():
    data = report([fact("check", identity=str(i), passed=False) for i in range(3)])
    row = next(s for s in data["students"] if s["userId"] == 1)
    assert row["status"] == "help"
    assert data["summary"]["needsHelp"] == 1
    assert "3 次正式核验" in row["reason"]


def test_terminal_failures_alone_do_not_mark_learning_difficulty():
    data = report([fact(identity=str(i)) for i in range(20)])
    assert data["summary"]["needsHelp"] == 0


def test_success_after_failed_checks_clears_the_failure_state():
    facts = [fact("check", identity=str(i), passed=False, days=2) for i in range(3)]
    facts.append(fact("check", identity="success", passed=True, days=1))
    data = report(facts)
    assert next(s for s in data["students"] if s["userId"] == 1)["status"] == "verified"


def test_completion_is_not_lost_after_new_failed_check():
    facts = [fact("completion", days=5), fact("check", passed=False)]
    data = report(facts)
    assert data["summary"]["completedStudents"] == 1
    assert next(s for s in data["students"] if s["userId"] == 1)["cells"][0]["status"] == "complete"


def test_period_active_students_are_distinct():
    data = report([fact(identity=str(i), days=i % 2) for i in range(8)], start=NOW-dt.timedelta(days=7))
    assert data["summary"]["activeStudents"] == 1
    assert data["summary"]["records"] == 8


def test_latest_confirmed_score_and_absent_score_are_distinct():
    data = report([fact("assessment", identity="old", score=90, days=3), fact("assessment", identity="new", score=0, days=1)])
    first = next(s for s in data["students"] if s["userId"] == 1)
    assert first["cells"][0]["score"] == 0
    assert not any(c["taskKey"] == "q:2" for c in first["cells"])


def test_nonfinite_scores_cannot_poison_json():
    data = report([fact("assessment", score=float("nan"))])
    assert data["tasks"][0]["averageScore"] is None


def test_daily_bins_use_beijing_time():
    item = fact()
    item["at"] = dt.datetime(2026, 10, 22, 17)
    data = report([item], start=NOW-dt.timedelta(days=1))
    assert next(t for t in data["trend"] if t["date"] == "2026-10-23")["activeStudents"] == 1


def test_weekly_active_students_are_union_not_sum():
    facts = [fact(identity=str(i), days=20 + i) for i in range(3)]
    data = report(facts, start=NOW-dt.timedelta(days=84))
    assert data["trendBucketDays"] == 7
    assert max(t["activeStudents"] for t in data["trend"]) == 1


def test_optional_completions_do_not_inflate_required_completion():
    data = report([fact("completion", task="q:2")])
    assert data["summary"]["completedPairs"] == 0
    assert data["summary"]["newCompletions"] == 1


def test_timezone_aware_datetimes_are_converted_not_stripped():
    assert contract.moment("2026-10-23T12:00:00+08:00") == NOW


def test_inquiry_completion_uses_the_same_accounting_unit():
    tasks = [{"key": "i:aes", "name": "AES 探究", "required": True}]
    data = report([fact("completion", task="i:aes")], tasks=tasks)
    assert data["summary"]["completedPairs"] == 1
    assert data["summary"]["requiredPairs"] == 2


def test_repeated_completion_on_different_days_is_new_only_once():
    tasks = [{"key": "i:aes", "name": "AES 探究", "required": True}]
    facts = [fact("completion", identity="second-attempt", task="i:aes", days=1), fact("completion", identity="first-attempt", task="i:aes", days=3)]
    data = report(facts, tasks=tasks)
    assert data["summary"]["newCompletions"] == 1
    assert sum(point["completions"] for point in data["trend"]) == 1
    assert next(point for point in data["trend"] if point["completions"])["date"] == "2026-10-20"


def test_repeating_old_completed_task_is_activity_not_new_completion():
    facts = [fact("completion", identity="new-attempt", days=1), fact("completion", identity="old-attempt", days=60)]
    data = report(facts, start=NOW-dt.timedelta(days=7))
    assert data["summary"]["newCompletions"] == 0
    assert data["summary"]["activeStudents"] == 1
    assert sum(point["completions"] for point in data["trend"]) == 0


def test_unobserved_matrix_cells_do_not_multiply_response_size():
    import json
    students = [{"userId": i, "name": f"学生 {i}"} for i in range(500)]
    tasks = [{"key": f"q:{i}", "name": f"任务 {i}", "required": True} for i in range(20)]
    data = report(roster=students, tasks=tasks)
    assert data["summary"]["requiredPairs"] == 10000
    assert all(not s["cells"] for s in data["students"])
    assert len(json.dumps(data, ensure_ascii=False).encode()) < 600000


def test_atlas_tiles_partition_current_roster_per_task():
    data = report([fact("completion"), fact("check", identity="b", user=2, passed=False)])
    assert data["version"].endswith(".v2")
    assert all(sum(row.values()) == 2 for row in data["atlas"]["taskStates"].values())
    assert data["atlas"]["taskStates"]["q:1"] == {"complete": 1, "working": 1}
    assert data["atlas"]["taskStates"]["q:2"] == {"not_started": 2}
    assert sum(row["students"] for row in data["atlas"]["completionBands"]) == 2


def test_atlas_formal_check_unknown_is_never_a_pass():
    data = report([fact("check", identity="p", passed=True), fact("check", identity="f", passed=False), fact("check", identity="u", passed=None)])
    checks = data["atlas"]["checks"]
    assert checks == {"total": 3, "passed": 1, "failed": 1, "unknown": 1, "checkedPairs": 1, "latestPassedPairs": 0}


def test_atlas_latest_activity_is_not_presented_as_a_new_completion():
    data = report([fact("completion", identity="c", days=5), fact("event", identity="e", days=1)])
    assert data["atlas"]["recent"][0]["at"] == contract.stamp(NOW-dt.timedelta(days=1))
    assert next(s for s in data["students"] if s["userId"] == 1)["cells"][0]["completedAt"] == contract.stamp(NOW-dt.timedelta(days=5))
    assert data["atlas"]["recent"][0]["recordCount"] == 2


def test_atlas_score_sample_preserves_zero_and_missing():
    data = report([fact("assessment", score=0)])
    assert data["atlas"]["scoreBands"] == [{"band": "<60", "count": 1}, {"band": "60–89", "count": 0}, {"band": "90+", "count": 0}]
    assert sum(row["count"] for row in data["atlas"]["scoreBands"]) == 1


def test_atlas_empty_roster_has_no_fabricated_evidence():
    atlas = report(roster=[])["atlas"]
    assert atlas["checks"]["total"] == 0
    assert atlas["recent"] == []
    assert all(sum(row.values()) == 0 for row in atlas["taskStates"].values())
