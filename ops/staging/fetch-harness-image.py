"""Download the DSH image tested on an exact development or rehearsal commit."""

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile


REPOSITORY = "Fisherder/AISecEdu"


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch(branch, commit, destination):
    if not re.fullmatch("[0-9a-f]{40}", commit):
        raise ValueError("Supply the full 40-character Git commit.")
    if branch == "develop":
        artifact_prefix = "teaching-image-develop-"
    elif branch.startswith("team/teaching-harness-"):
        artifact_prefix = "teaching-image-candidate-"
    else:
        raise ValueError("Choose develop or a team/teaching-harness- rehearsal branch.")
    if destination.exists() or destination.is_symlink():
        raise ValueError(f"Choose a new destination directory: {destination}")

    result = subprocess.check_output([
        "gh", "run", "list", "-R", REPOSITORY, "--workflow", "team-checks.yml",
        "--event", "push", "--branch", branch, "--commit", commit, "--limit", "1",
        "--json", "databaseId,status,conclusion,headSha,url",
    ], text=True)
    runs = json.loads(result)
    if not runs or runs[0]["headSha"] != commit:
        raise ValueError("No push run was found on this branch for the supplied commit.")
    run = runs[0]
    if run["status"] != "completed" or run["conclusion"] != "success":
        raise ValueError(f"The push run has not passed: {run['url']}")

    with tempfile.TemporaryDirectory(prefix=".teaching-image-", dir=destination.parent) as temp:
        bundle = Path(temp) / "bundle"
        bundle.mkdir()
        subprocess.run([
            "gh", "run", "download", str(run["databaseId"]), "-R", REPOSITORY,
            "--name", artifact_prefix + commit, "--dir", str(bundle),
        ], check=True)
        if (bundle / "tested-commit").read_text().splitlines() != [commit]:
            raise ValueError("The archived tested-commit differs from the requested commit.")
        manifest = (bundle / "SHA256SUMS").read_text().splitlines()
        expected = [f"{checksum(bundle / name)}  {name}" for name in ("harness.tar.gz", "tested-commit")]
        if sorted(manifest) != sorted(expected):
            raise ValueError("The downloaded image or commit checksum differs from SHA256SUMS.")
        bundle.rename(destination)
    return run["url"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("commit")
    parser.add_argument("destination", type=Path, help="New directory inside an existing directory")
    parser.add_argument("--branch", default="develop", help="Source branch (default: develop)")
    args = parser.parse_args()
    try:
        url = fetch(args.branch, args.commit, args.destination)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"{error}\n")
    print(f"{args.commit}  {args.destination}\n{url}")


if __name__ == "__main__":
    main()
