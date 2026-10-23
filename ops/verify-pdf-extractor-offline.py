#!/usr/bin/env python3
"""Read-only extraction check for a private manifest of existing PDFs.

Run in an isolated image with /materials, /manifest.json and /local_extract.py
mounted read-only. Prints only coverage and timings, never document contents.
"""

import importlib.util
import json
import time
from pathlib import Path


spec = importlib.util.spec_from_file_location("local_extract_qa", "/local_extract.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)
root = Path("/materials").resolve()
manifest = json.loads(Path("/manifest.json").read_text())
assert isinstance(manifest, list)
for number, item in enumerate(manifest, 1):
    source = (root / item["storageKey"]).resolve()
    assert root in source.parents and source.is_file()
    started = time.monotonic()
    try:
        text = extractor.extract_local_text(item["filename"], source.read_bytes())
        print(json.dumps({"file": number, "status": "READY", "characters": len(text),
                          "pages": text.count("第 "), "seconds": round(time.monotonic() - started, 2)}), flush=True)
    except Exception as exc:
        print(json.dumps({"file": number, "status": "FAILED", "error": str(exc)[:160],
                          "seconds": round(time.monotonic() - started, 2)}, ensure_ascii=False), flush=True)
        raise
