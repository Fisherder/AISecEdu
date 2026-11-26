"""Run the full agent-runtime TypeScript check and reject unrecorded diagnostics."""

import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DIAGNOSTIC = re.compile(r": error TS\d+:|^error TS\d+:")
TEST_DIAGNOSTIC = re.compile(r"^tests/.+\.test\.tsx?\(\d+,\d+\): error TS\d+:")


def diagnostic_blocks(output):
    blocks = []
    for line in output.splitlines():
        if DIAGNOSTIC.search(line) and not line.startswith(" "):
            blocks.append([line])
        elif blocks and line.startswith(" "):
            blocks[-1].append(line)
    return blocks


def fingerprint(block):
    return hashlib.sha256("\n".join(block).encode()).hexdigest()


def unrecorded_diagnostics(blocks, baseline):
    remaining = Counter((entry["location"], entry["sha256"]) for entry in baseline)
    unexpected = []
    for block in blocks:
        location = block[0].split(": error TS", 1)[0]
        key = (location, fingerprint(block))
        if TEST_DIAGNOSTIC.match(block[0]) and remaining[key]:
            remaining[key] -= 1
        else:
            unexpected.append(block[0])
    return unexpected


def main():
    baseline_path = Path(__file__).with_name("agent-runtime-typescript-baseline.json")
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))["diagnostics"]
    process = subprocess.run(
        ["pnpm", "exec", "tsc", "--noEmit", "--pretty", "false"],
        cwd=ROOT / "services/agent-runtime",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        encoding="utf-8",
        check=False,
    )
    sys.stdout.write(process.stdout)
    if process.returncode == 0:
        return 0
    blocks = diagnostic_blocks(process.stdout)
    if process.returncode != 2 or not blocks:
        return process.returncode
    unexpected = unrecorded_diagnostics(blocks, baseline)
    if unexpected:
        print(f"TypeScript found {len(unexpected)} unrecorded diagnostic(s):")
        for line in unexpected:
            print(line)
        return process.returncode
    print(f"TypeScript found only {len(blocks)} recorded historical test diagnostics.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
