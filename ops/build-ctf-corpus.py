#!/usr/bin/env python3

import argparse
import collections
import datetime
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile
import urllib.parse

import yaml


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CORPUS = ROOT / "data" / "ctf-corpus"
SOURCES = {
    "ctf-archives": {
        "repository": "https://github.com/sajjadium/ctf-archives",
        "license": "MIT",
        "stars": 1556,
        "catalogOnly": True,
    },
    "google-ctf": {
        "repository": "https://github.com/google/google-ctf",
        "license": "Apache-2.0",
        "stars": 5008,
        "catalogOnly": False,
    },
    "cryptohack-ctf-archive": {
        "repository": "https://github.com/cryptohack/ctf_archive",
        "license": "MIT",
        "stars": 150,
        "catalogOnly": False,
    },
    "picoctf": {
        "repository": "https://github.com/picoCTF/picoCTF",
        "license": "MIT",
        "stars": 313,
        "catalogOnly": False,
    },
}
CATEGORY_ALIASES = {
    "web": "WEB",
    "web-exploitation": "WEB",
    "pwn": "PWN",
    "binary": "PWN",
    "binary-exploitation": "PWN",
    "re": "REV",
    "rev": "REV",
    "reverse": "REV",
    "reversing": "REV",
    "crypto": "CRYPTO",
    "cryptography": "CRYPTO",
    "forensic": "FORENSICS",
    "forensics": "FORENSICS",
    "stego": "FORENSICS",
    "steganography": "FORENSICS",
    "network": "FORENSICS",
    "misc": "MISC",
    "ppc": "MISC",
    "programming": "MISC",
    "jail": "MISC",
    "sandbox": "MISC",
    "hardware": "HARDWARE",
    "hw": "HARDWARE",
    "mobile": "MOBILE",
    "android": "MOBILE",
    "ios": "MOBILE",
    "blockchain": "BLOCKCHAIN",
    "smart-contract": "BLOCKCHAIN",
    "ethereum": "BLOCKCHAIN",
    "cloud": "CLOUD",
    "k8s": "CLOUD",
    "kubernetes": "CLOUD",
    "ai": "AI",
    "ml": "AI",
    "osint": "OSINT",
}
TAG_PATTERNS = {
    "buffer-overflow": r"buffer.?overflow|stack.?overflow|栈溢出",
    "heap": r"\bheap\b|use.?after.?free|double.?free",
    "format-string": r"format.?string|格式化字符串",
    "rop": r"\brop\b|return.?oriented",
    "sql-injection": r"sql.?injection|\bsqli\b|sql注入",
    "xss": r"\bxss\b|cross.?site.?script",
    "ssrf": r"\bssrf\b|server.?side.?request",
    "deserialization": r"deseriali[sz]|反序列化",
    "rsa": r"\brsa\b",
    "aes": r"\baes\b",
    "ecc": r"elliptic|\becc\b|ed25519",
    "lattice": r"lattice|格密码",
    "hash": r"\bhash|sha(?:1|2|3|256|512)|md5",
    "pcap": r"\bpcap\b|packet.?capture",
    "memory-forensics": r"memory.?forensic|volatility",
    "malware": r"malware|木马|恶意软件",
    "docker": r"dockerfile|docker.?compose|container",
    "kernel": r"kernel|vmlinuz|initramfs|\.ko\b",
    "browser": r"chrom(?:e|ium)|browser|v8\b",
    "wasm": r"webassembly|\bwasm\b",
    "android": r"android|\.apk\b",
    "smart-contract": r"solidity|smart.?contract|ethereum|\bevm\b",
}
TEXT_SUFFIXES = {
    ".c",
    ".cc",
    ".cpp",
    ".go",
    ".java",
    ".js",
    ".json",
    ".md",
    ".php",
    ".py",
    ".rb",
    ".rs",
    ".sage",
    ".sh",
    ".sol",
    ".txt",
    ".yaml",
    ".yml",
}


def revision(path):
    result = subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        check=False,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else None


def redacted_text(value, limit=1800):
    text = str(value or "").replace("\x00", " ")
    text = re.sub(
        r"(?i)(?:flag|ctf|htb|picoctf)\{[^}\n]{1,300}\}", "[REDACTED_FLAG]", text
    )
    text = re.sub(r"(?im)^\s*(?:flag|base64_flag|answer)\s*[:=].*$", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def category_for(value):
    text = str(value or "").strip().lower().replace("_", "-")
    if text in CATEGORY_ALIASES:
        return CATEGORY_ALIASES[text]
    for alias, category in CATEGORY_ALIASES.items():
        if re.search(rf"(?:^|[-/\s]){re.escape(alias)}(?:$|[-/\s])", text):
            return category
    return "GENERAL"


def difficulty_for(name, description="", score=None):
    text = f"{name} {description}".lower()
    if re.search(r"expert|insane|very.?hard|极难|专家", text):
        return 5
    if re.search(r"hard|advanced|困难|高阶", text):
        return 4
    if re.search(r"medium|intermediate|中等|进阶", text):
        return 3
    if re.search(r"easy|beginner|intro|baby|简单|入门|基础", text):
        return 1
    try:
        numeric = int(score)
        if numeric >= 400:
            return 5
        if numeric >= 250:
            return 4
        if numeric >= 120:
            return 3
        if numeric > 0:
            return 2
    except (TypeError, ValueError):
        pass
    return 2


def tags_for(*values):
    text = " ".join(str(value or "") for value in values).lower()
    tags = [tag for tag, pattern in TAG_PATTERNS.items() if re.search(pattern, text)]
    return tags[:16]


def entry_id(source, source_path):
    digest = hashlib.sha256(f"{source}:{source_path}".encode()).hexdigest()[:20]
    return f"{source}:{digest}"


def source_url(source, source_path):
    repository = SOURCES[source]["repository"]
    encoded = urllib.parse.quote(source_path, safe="/")
    return f"{repository}/tree/HEAD/{encoded}"


def make_entry(
    source,
    source_path,
    name,
    category,
    description,
    *,
    difficulty=2,
    tags=None,
    files=None,
    event=None,
    year=None,
    file_count=None,
):
    files = list(dict.fromkeys(str(item) for item in (files or []) if item))[:20]
    metadata = SOURCES[source]
    normalized_category = category_for(category)
    combined_tags = list(
        dict.fromkeys(
            [
                normalized_category.lower(),
                *(tags or []),
                *tags_for(name, description, " ".join(files)),
            ]
        )
    )[:20]
    return {
        "id": entry_id(source, source_path),
        "source": source,
        "repository": metadata["repository"],
        "sourceUrl": source_url(source, source_path),
        "sourcePath": source_path,
        "license": metadata["license"],
        "popularity": metadata["stars"],
        "name": redacted_text(name, 240) or pathlib.PurePosixPath(source_path).name,
        "description": redacted_text(description),
        "category": normalized_category,
        "difficulty": max(1, min(5, int(difficulty or 2))),
        "tags": combined_tags,
        "event": redacted_text(event, 160) or None,
        "year": int(year) if str(year or "").isdigit() else None,
        "files": files,
        "fileCount": max(len(files), int(file_count or 0)),
        "hasContainer": any(
            pathlib.PurePosixPath(path).name.lower()
            in {"dockerfile", "docker-compose.yml", "docker-compose.yaml"}
            for path in files
        ),
        "catalogComplete": True,
        "sourceAvailableLocally": not metadata["catalogOnly"],
        "inspirationOnly": True,
    }


def filesystem_files(root, limit=200):
    result = []
    for path in root.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        result.append(path.relative_to(root).as_posix())
        if len(result) >= limit:
            break
    return result


def read_text_file(path, limit=8000):
    try:
        if path.stat().st_size > 512000:
            return ""
        return path.read_text(errors="replace")[:limit]
    except OSError:
        return ""


def google_entries(root):
    roots = {}
    for path in root.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        relative = path.relative_to(root)
        parts = relative.parts
        challenge_root = None
        if len(parts) >= 4 and re.fullmatch(r"20\d{2}", parts[0]):
            challenge_root = pathlib.PurePosixPath(*parts[:3])
        elif path.name == "challenge.yaml" and len(parts) >= 2:
            challenge_root = pathlib.PurePosixPath(*parts[:-1])
        if challenge_root is None:
            continue
        bucket = roots.setdefault(challenge_root.as_posix(), [])
        if len(bucket) < 200:
            bucket.append(path.relative_to(root / challenge_root).as_posix())
    entries = []
    for source_path, files in sorted(roots.items()):
        challenge_root = root / source_path
        metadata = {}
        metadata_path = challenge_root / "metadata.json"
        if metadata_path.is_file():
            try:
                metadata = (
                    json.loads(read_text_file(metadata_path, 32000)).get("challenge")
                    or {}
                )
            except (json.JSONDecodeError, AttributeError):
                metadata = {}
        readme = next(
            (
                path
                for path in (
                    challenge_root / "README.md",
                    challenge_root / "README",
                    challenge_root / "readme.txt",
                )
                if path.is_file()
            ),
            None,
        )
        name = metadata.get("name") or challenge_root.name.replace("-", " ")
        description = metadata.get("description") or (
            read_text_file(readme) if readme else ""
        )
        year = source_path.split("/", 1)[0]
        category = metadata.get("category") or challenge_root.name
        entries.append(
            make_entry(
                "google-ctf",
                source_path,
                name,
                category,
                description,
                difficulty=difficulty_for(name, description),
                files=files,
                event="Google CTF",
                year=year,
                file_count=len(files),
            )
        )
    return entries


def cryptohack_entries(root):
    entries = []
    for description_path in sorted(root.glob("*/description.yml")):
        try:
            metadata = yaml.safe_load(read_text_file(description_path, 64000)) or {}
        except yaml.YAMLError:
            metadata = {}
        source_path = description_path.parent.relative_to(root).as_posix()
        files = filesystem_files(description_path.parent)
        name = metadata.get("name") or description_path.parent.name
        description = metadata.get("description") or ""
        entries.append(
            make_entry(
                "cryptohack-ctf-archive",
                source_path,
                name,
                "CRYPTO",
                description,
                difficulty=difficulty_for(name, description),
                tags=["cryptography"],
                files=files,
                event=metadata.get("original_ctf") or "CryptoHack CTF Archive",
                year=metadata.get("year"),
                file_count=len(files),
            )
        )
    return entries


def picoctf_entries(root):
    entries = []
    for metadata_path in sorted((root / "problems").rglob("problem.json")):
        try:
            metadata = json.loads(read_text_file(metadata_path, 64000))
        except json.JSONDecodeError:
            continue
        source_path = metadata_path.parent.relative_to(root).as_posix()
        files = filesystem_files(metadata_path.parent)
        name = metadata.get("name") or metadata_path.parent.name
        description = metadata.get("description") or ""
        entries.append(
            make_entry(
                "picoctf",
                source_path,
                name,
                metadata.get("category") or source_path,
                description,
                difficulty=difficulty_for(name, description, metadata.get("score")),
                files=files,
                event=metadata.get("event") or "picoCTF",
                file_count=len(files),
            )
        )
    return entries


def archive_entries(root):
    process = subprocess.Popen(
        ["git", "-C", str(root), "ls-tree", "-r", "--name-only", "HEAD"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    groups = {}
    if process.stdout is None:
        return []
    for raw_path in process.stdout:
        path = raw_path.strip()
        parts = pathlib.PurePosixPath(path).parts
        if len(parts) < 6 or parts[0] != "ctfs":
            continue
        category_index = next(
            (
                index
                for index, part in enumerate(parts[2:-1], start=2)
                if part.lower().replace("_", "-") in CATEGORY_ALIASES
            ),
            None,
        )
        if category_index is None or category_index + 2 > len(parts) - 1:
            continue
        source_path = pathlib.PurePosixPath(*parts[: category_index + 2]).as_posix()
        bucket = groups.setdefault(
            source_path,
            {
                "event": parts[1],
                "year": next(
                    (
                        part
                        for part in parts[2:category_index]
                        if re.fullmatch(r"20\d{2}", part)
                    ),
                    None,
                ),
                "category": parts[category_index],
                "name": parts[category_index + 1],
                "files": [],
                "fileCount": 0,
            },
        )
        bucket["fileCount"] += 1
        relative_file = pathlib.PurePosixPath(*parts[category_index + 2 :]).as_posix()
        if len(bucket["files"]) < 20:
            bucket["files"].append(relative_file)
    _, stderr = process.communicate()
    if process.returncode != 0:
        raise RuntimeError(stderr.strip() or "Unable to enumerate ctf-archives")
    entries = []
    for source_path, bucket in sorted(groups.items()):
        file_summary = ", ".join(bucket["files"][:8])
        description = (
            f"{bucket['event']} {bucket.get('year') or ''} {bucket['category']} challenge. "
            f"Available materials include: {file_summary}."
        )
        entries.append(
            make_entry(
                "ctf-archives",
                source_path,
                bucket["name"].replace("_", " "),
                bucket["category"],
                description,
                difficulty=difficulty_for(bucket["name"]),
                files=bucket["files"],
                event=bucket["event"],
                year=bucket["year"],
                file_count=bucket["fileCount"],
            )
        )
    return entries


def fetch_missing_sources(corpus_root):
    source_root = corpus_root / "sources"
    source_root.mkdir(parents=True, exist_ok=True)
    for name, metadata in SOURCES.items():
        target = source_root / name
        if (target / ".git").is_dir():
            continue
        if target.exists():
            raise SystemExit(f"Incomplete source directory already exists: {target}")
        command = ["git", "clone", "--depth", "1"]
        if metadata["catalogOnly"]:
            command.extend(["--filter=blob:none", "--no-checkout"])
        command.extend([metadata["repository"], str(target)])
        subprocess.run(command, check=True)


def build(corpus_root):
    source_root = corpus_root / "sources"
    required = {name: source_root / name for name in SOURCES}
    missing = [name for name, path in required.items() if not path.exists()]
    if missing:
        raise SystemExit(f"Missing corpus sources: {', '.join(missing)}")
    entries = []
    entries.extend(archive_entries(required["ctf-archives"]))
    entries.extend(google_entries(required["google-ctf"]))
    entries.extend(cryptohack_entries(required["cryptohack-ctf-archive"]))
    entries.extend(picoctf_entries(required["picoctf"]))
    entries.sort(
        key=lambda item: (
            item["category"],
            item["source"],
            item["name"].lower(),
            item["id"],
        )
    )
    corpus_root.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=corpus_root, delete=False
    ) as handle:
        catalog_temp = pathlib.Path(handle.name)
        digest = hashlib.sha256()
        for entry in entries:
            line = json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n"
            handle.write(line)
            digest.update(line.encode())
    os.replace(catalog_temp, corpus_root / "catalog.jsonl")
    by_source = collections.Counter(item["source"] for item in entries)
    by_category = collections.Counter(item["category"] for item in entries)
    manifest = {
        "schemaVersion": 1,
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "catalogSha256": digest.hexdigest(),
        "totalChallenges": len(entries),
        "countsBySource": dict(sorted(by_source.items())),
        "countsByCategory": dict(sorted(by_category.items())),
        "sources": [
            {
                "id": name,
                **metadata,
                "revision": revision(required[name]),
                "localPath": f"sources/{name}",
            }
            for name, metadata in SOURCES.items()
        ],
    }
    manifest_path = corpus_root / "manifest.json"
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=corpus_root, delete=False
    ) as handle:
        json.dump(manifest, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
        manifest_temp = pathlib.Path(handle.name)
    os.replace(manifest_temp, manifest_path)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus-root", type=pathlib.Path, default=DEFAULT_CORPUS)
    parser.add_argument("--fetch-missing", action="store_true")
    args = parser.parse_args()
    corpus_root = args.corpus_root.resolve()
    if args.fetch_missing:
        fetch_missing_sources(corpus_root)
    build(corpus_root)


if __name__ == "__main__":
    main()
