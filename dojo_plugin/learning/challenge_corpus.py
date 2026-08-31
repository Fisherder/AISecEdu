import json
import math
import os
import pathlib
import re
import threading


DEFAULT_CORPUS_DIR = pathlib.Path("/var/ctf-corpus")
_CACHE_LOCK = threading.Lock()
_CACHE_KEY = None
_CACHE_ITEMS = ()
_TEXT_SUFFIXES = {
    ".c",
    ".cc",
    ".cpp",
    ".go",
    ".html",
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
_SOURCE_METADATA_FILES = {
    "dockerfile",
    "description.yml",
    "description.yaml",
    "metadata.json",
    "readme",
    "readme.md",
    "readme.txt",
}
_SENSITIVE_SOURCE_FILE = re.compile(
    r"(?:^|[-_.])(secret|solution|solve|solver|writeup|flag)(?:[-_.]|$)",
    re.IGNORECASE,
)
_LITERAL_FLAG = re.compile(r"(?i)(?:flag|ctf|htb|picoctf)\{[^}\n]{1,300}\}")


def _catalog_path():
    root = pathlib.Path(os.getenv("DOJO_CTF_CORPUS_DIR") or DEFAULT_CORPUS_DIR)
    return root / "catalog.jsonl"


def _tokens(value):
    return set(
        re.findall(
            r"[a-z0-9_+.#-]{2,}|[\u4e00-\u9fff]{1,4}",
            str(value or "").lower(),
        )
    )


def _load_items():
    global _CACHE_ITEMS, _CACHE_KEY
    path = _catalog_path()
    try:
        stat = path.stat()
    except OSError:
        return ()
    cache_key = (str(path), stat.st_mtime_ns, stat.st_size)
    if cache_key == _CACHE_KEY:
        return _CACHE_ITEMS
    with _CACHE_LOCK:
        if cache_key == _CACHE_KEY:
            return _CACHE_ITEMS
        items = []
        try:
            with path.open(encoding="utf-8") as handle:
                for line in handle:
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if not isinstance(item, dict) or not item.get("id"):
                        continue
                    items.append(item)
        except OSError:
            return ()
        _CACHE_ITEMS = tuple(items)
        _CACHE_KEY = cache_key
        return _CACHE_ITEMS


def reset_cache():
    global _CACHE_ITEMS, _CACHE_KEY
    with _CACHE_LOCK:
        _CACHE_ITEMS = ()
        _CACHE_KEY = None


def corpus_summary():
    path = _catalog_path()
    items = _load_items()
    sources = {}
    categories = {}
    for item in items:
        source = str(item.get("source") or "unknown")
        category = str(item.get("category") or "GENERAL")
        sources[source] = sources.get(source, 0) + 1
        categories[category] = categories.get(category, 0) + 1
    return {
        "available": bool(items),
        "catalogPath": str(path),
        "totalChallenges": len(items),
        "countsBySource": dict(sorted(sources.items())),
        "countsByCategory": dict(sorted(categories.items())),
    }


def _source_material(item, *, budget=7000, max_files=5):
    if not item.get("sourceAvailableLocally"):
        return []
    source = str(item.get("source") or "").strip()
    source_path = pathlib.PurePosixPath(str(item.get("sourcePath") or ""))
    if not source or source_path.is_absolute() or ".." in source_path.parts:
        return []
    corpus_root = _catalog_path().parent.resolve()
    source_root = (corpus_root / "sources" / source).resolve()
    challenge_root = (source_root / source_path).resolve()
    try:
        challenge_root.relative_to(source_root)
    except ValueError:
        return []
    files = [str(path) for path in item.get("files") or []]

    def priority(value):
        name = pathlib.PurePosixPath(value).name.lower()
        if name.startswith("readme"):
            return 0
        if name.startswith("description") or name == "metadata.json":
            return 1
        if name == "dockerfile":
            return 2
        return 3

    evidence = []
    remaining = max(0, int(budget))
    for relative in sorted(
        dict.fromkeys(files), key=lambda value: (priority(value), value)
    ):
        if len(evidence) >= max_files or remaining <= 0:
            break
        pure = pathlib.PurePosixPath(relative)
        name = pure.name.lower()
        if pure.is_absolute() or ".." in pure.parts:
            continue
        if _SENSITIVE_SOURCE_FILE.search(name):
            continue
        if (
            name not in _SOURCE_METADATA_FILES
            and pure.suffix.lower() not in _TEXT_SUFFIXES
        ):
            continue
        target = (challenge_root / pure).resolve()
        try:
            target.relative_to(challenge_root)
            stat = target.stat()
        except (OSError, ValueError):
            continue
        if not target.is_file() or stat.st_size > 512000:
            continue
        try:
            content = target.read_text(errors="replace")[: min(remaining, 2600)]
        except OSError:
            continue
        content = _LITERAL_FLAG.sub("[REDACTED_FLAG]", content).replace("\x00", " ")
        content = content.strip()
        if not content:
            continue
        evidence.append({"path": relative[:300], "excerpt": content})
        remaining -= len(content)
    return evidence


def search_corpus(brief, category, *, limit=12):
    query = str(brief or "")[:16000]
    query_tokens = _tokens(query)
    requested_category = str(category or "GENERAL").upper()
    ranked = []
    for item in _load_items():
        item_category = str(item.get("category") or "GENERAL").upper()
        name = str(item.get("name") or "")
        description = str(item.get("description") or "")
        tags = [str(tag) for tag in item.get("tags") or []]
        document = " ".join(
            [
                name,
                description,
                item_category,
                str(item.get("event") or ""),
                " ".join(tags),
                " ".join(str(path) for path in item.get("files") or []),
            ]
        )
        document_tokens = _tokens(document)
        name_tokens = _tokens(name)
        overlap = len(query_tokens & document_tokens)
        name_overlap = len(query_tokens & name_tokens)
        category_bonus = 14 if item_category == requested_category else 0
        general_bonus = 3 if requested_category == "GENERAL" else 0
        phrase_bonus = 0
        lowered_document = document.lower()
        for phrase in sorted(query_tokens, key=len, reverse=True)[:12]:
            if len(phrase) >= 4 and phrase in lowered_document:
                phrase_bonus += 1
        popularity = max(0, int(item.get("popularity") or 0))
        popularity_bonus = min(4.0, math.log10(popularity + 1))
        local_material_bonus = 1.5 if item.get("sourceAvailableLocally") else 0
        score = (
            overlap * 3
            + name_overlap * 4
            + category_bonus
            + general_bonus
            + min(6, phrase_bonus)
            + popularity_bonus
            + local_material_bonus
        )
        if score <= 0 or (overlap == 0 and category_bonus == 0 and not general_bonus):
            continue
        ranked.append(
            {
                "score": score,
                "difficulty": int(item.get("difficulty") or 2),
                "name": name.lower(),
                "overlap": overlap,
                "item": item,
            }
        )
    ranked.sort(
        key=lambda row: (
            -row["score"],
            row["difficulty"],
            row["name"],
        )
    )
    bounded_limit = max(1, min(40, int(limit)))
    selected = ranked[:1]
    selected_ids = {row["item"]["id"] for row in selected}
    selected_sources = {row["item"].get("source") for row in selected}
    for row in ranked[1:]:
        source = row["item"].get("source")
        if len(selected) >= min(4, bounded_limit):
            break
        if row["overlap"] <= 0 or source in selected_sources:
            continue
        selected.append(row)
        selected_ids.add(row["item"]["id"])
        selected_sources.add(source)
    for row in ranked:
        if len(selected) >= bounded_limit:
            break
        if row["item"]["id"] in selected_ids:
            continue
        selected.append(row)
        selected_ids.add(row["item"]["id"])
    results = []
    for row in selected:
        score = row["score"]
        difficulty = row["difficulty"]
        item = row["item"]
        source = str(item.get("source") or "external")
        corpus_id = str(item["id"])
        results.append(
            {
                "challengeId": f"corpus:{corpus_id}",
                "referenceId": f"corpus:{corpus_id}",
                "name": str(item.get("name") or "外部题库素材")[:240],
                "description": str(item.get("description") or "")[:1800],
                "category": str(item.get("category") or "GENERAL").upper(),
                "difficulty": max(1, min(5, difficulty)),
                "objectives": [],
                "tags": [str(tag)[:64] for tag in (item.get("tags") or [])[:20]],
                "image": None,
                "exerciseMode": "CONTAINER",
                "score": round(score, 2),
                "origin": "EXTERNAL_CORPUS",
                "reusable": False,
                "importable": False,
                "inspirationOnly": True,
                "sourceEvidence": {
                    "source": source,
                    "repository": str(item.get("repository") or ""),
                    "sourceUrl": str(item.get("sourceUrl") or ""),
                    "sourcePath": str(item.get("sourcePath") or ""),
                    "license": str(item.get("license") or ""),
                    "event": item.get("event"),
                    "year": item.get("year"),
                    "files": [
                        str(path)[:300] for path in (item.get("files") or [])[:16]
                    ],
                    "fileCount": max(0, int(item.get("fileCount") or 0)),
                    "hasContainer": bool(item.get("hasContainer")),
                    "catalogComplete": bool(item.get("catalogComplete")),
                    "sourceAvailableLocally": bool(item.get("sourceAvailableLocally")),
                },
                "materialEvidence": _source_material(item),
            }
        )
    return results
