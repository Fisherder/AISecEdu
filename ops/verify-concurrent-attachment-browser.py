#!/usr/bin/env python3
"""Run independent browser upload/send checks concurrently on a QA account.

The single-run verifier owns creation and cleanup of each temporary thread,
material, and job. Provide distinct PPTX fixtures to avoid account-level
deduplication when checking queue contention.
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=5)
    parser.add_argument("--fixture", required=True, help="Path template containing {n}")
    parser.add_argument("--marker", required=True, help="Last-page text template containing {n}")
    parser.add_argument("--min-characters", type=int, default=1000)
    parser.add_argument("--max-send-seconds", type=float, default=3)
    args = parser.parse_args()
    assert 1 <= args.count <= 8
    verifier = Path(__file__).with_name("verify-conversation-nonblocking-browser.py")
    assert verifier.is_file()

    runs = []
    for number in range(1, args.count + 1):
        fixture = Path(args.fixture.format(n=number)).resolve()
        if not fixture.is_file():
            raise FileNotFoundError(fixture)
        environment = os.environ.copy()
        environment.update({
            "QA_PPT_SOURCE": str(fixture),
            "QA_PPT_EXPECT_MARKER": args.marker.format(n=number),
            "QA_PPT_MIN_INDEX_CHARS": str(args.min_characters),
            "QA_PPT_EXPECT_INDEX_MODE": "source-index-worker",
            "QA_PPT_INDEX_WAIT_SECONDS": "180",
        })
        process = subprocess.Popen(
            [sys.executable, str(verifier)], env=environment,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        runs.append((number, process))

    results = []
    for number, process in runs:
        try:
            output, errors = process.communicate(timeout=240)
        except subprocess.TimeoutExpired:
            process.kill()
            output, errors = process.communicate()
        result = {"run": number, "exitCode": process.returncode}
        for line in output.splitlines():
            if line.startswith("BROWSER_RESULT="):
                result.update(json.loads(line.split("=", 1)[1]))
            elif line.startswith("CLEANUP="):
                result["cleaned"] = True
        if process.returncode or not result.get("passed") or not result.get("cleaned"):
            result["outputTail"] = output[-1200:]
            result["stderrTail"] = errors[-900:]
        print("CONCURRENT_RUN=" + json.dumps(result, ensure_ascii=False), flush=True)
        results.append(result)
    passed = all(
        result.get("passed") and result.get("cleaned")
        and result.get("realPptIndexMode") == "source-index-worker"
        and result.get("sendAcceptedWithinSeconds", float("inf")) < args.max_send_seconds
        for result in results
    )
    if not passed:
        raise RuntimeError("At least one concurrent browser check failed")
    print("CONCURRENT_SUMMARY=" + json.dumps({
        "passed": len(results),
        "worstSendSeconds": max(result["sendAcceptedWithinSeconds"] for result in results),
        "minIndexedCharacters": min(result["realPptIndexedCharacters"] for result in results),
    }), flush=True)


if __name__ == "__main__":
    main()
