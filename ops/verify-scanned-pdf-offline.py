#!/usr/bin/env python3
"""Check that scanning past the former 20-page limit retains the final page."""

import importlib.util
import json
import re
import time
from pathlib import Path


spec = importlib.util.spec_from_file_location("local_extract_qa", "/local_extract.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)
started = time.monotonic()
text = extractor.extract_local_text("qa-scanned.pdf", Path("/source.pdf").read_bytes())
page_markers = len(re.findall(r"^第 \d+ 页$", text, re.MULTILINE))
last_page_present = "SCAN QA PAGE 22" in text.upper()
print(json.dumps({"characters": len(text), "pages": page_markers,
                  "lastPagePresent": last_page_present,
                  "seconds": round(time.monotonic() - started, 2)}))
assert page_markers == 22 and last_page_present
