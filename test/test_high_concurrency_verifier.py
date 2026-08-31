import pathlib
import runpy


ROOT = pathlib.Path(__file__).resolve().parent.parent
MODULE = runpy.run_path(str(ROOT / "ops/verify-high-concurrency.py"))
Observation = MODULE["Observation"]


def test_percentile_uses_nearest_rank_and_handles_empty_input():
    percentile = MODULE["percentile"]
    assert percentile([], 95) is None
    assert percentile([1, 2, 3, 4, 5], 50) == 3
    assert percentile([1, 2, 3, 4, 5], 95) == 5


def test_summary_keeps_failures_and_latency_distribution_visible():
    summary = MODULE["summarize"](
        [
            Observation("content", "student-home", "one", True, 10, 200, 100),
            Observation("content", "student-home", "two", True, 20, 200, 120),
            Observation("content", "student-home", "three", False, 90, 503, 0, "busy"),
        ]
    )["content:student-home"]
    assert summary["requests"] == 3
    assert summary["successes"] == 2
    assert summary["failures"] == 1
    assert summary["successRate"] == 0.6667
    assert summary["p95Ms"] == 90
    assert summary["statuses"] == {"200": 2, "503": 1}
    assert summary["errors"] == {"busy": 1}


def test_compact_error_removes_multiline_payloads_and_bounds_output():
    compact = MODULE["compact_error"]("first\n  second\tthird", limit=18)
    assert compact == "first second third"
