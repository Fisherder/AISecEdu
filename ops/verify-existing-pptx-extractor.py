#!/usr/bin/env python3
"""Read-only quality check of current PPTX originals with a staged extractor."""

import importlib.util
import json
import re
import time

from CTFd import create_app


spec = importlib.util.spec_from_file_location("local_extract_qa", "/tmp/aisecedu-local-extract-qa-20260930.py")
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)

app = create_app()
with app.app_context():
    from CTFd.models import db
    from CTFd.plugins.dojo_plugin import config
    from CTFd.plugins.dojo_plugin.models import (
        TeachingMaterialChunks,
        TeachingMaterialRevisions,
        TeachingMaterials,
    )

    root = config.AGENT_RUNTIME_STORAGE_ROOT.resolve()
    rows = TeachingMaterials.query.filter(TeachingMaterials.filename.ilike("%.pptx")).all()
    for number, material in enumerate(rows, 1):
        source = (root / material.storage_key).resolve()
        assert root in source.parents and source.is_file()
        started = time.monotonic()
        text = extractor.extract_local_text(material.filename, source.read_bytes())
        latest = (
            TeachingMaterialRevisions.query.filter_by(material_id=material.id)
            .order_by(TeachingMaterialRevisions.revision.desc()).first()
        )
        old_characters = sum(
            len(value or "") for (value,) in db.session.query(TeachingMaterialChunks.content)
            .filter_by(revision_id=latest.id).all()
        )
        print(json.dumps({
            "file": number,
            "newCharacters": len(text),
            "indexedCharacters": old_characters,
            "pages": len(re.findall(r"(?m)^第 \d+ 页$", text)),
            "seconds": round(time.monotonic() - started, 2),
        }), flush=True)
