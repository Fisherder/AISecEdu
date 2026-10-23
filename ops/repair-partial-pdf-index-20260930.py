#!/usr/bin/env python3
"""Invalidate two superseded PDF indexes with verified incomplete coverage.

Run inside CTFd. Dry-run by default; --apply takes a private rollback snapshot
before changing status. Existing artifact sourceRefs remain unchanged for audit.
"""

import argparse
import datetime
import json
import os
from pathlib import Path

from CTFd import create_app


EXPECTED_BAD = {
    "matrev_e08638ab443a4c1fa4f3a0ff9e425a11": 65_719,
    "matrev_ee1dba6e427d40fbbc208fc21c8b53e3": 2_757,
}
BACKUP = Path("/var/agent-runtime/.maintenance-backups/partial-pdf-index-20260930.json")


def characters(db, chunks_model, revision_id):
    return sum(
        len(content or "") for (content,) in db.session.query(chunks_model.content)
        .filter_by(revision_id=revision_id)
        .all()
    )


def main(apply):
    app = create_app()
    with app.app_context():
        from CTFd.models import db
        from CTFd.plugins.dojo_plugin.models import (
            TeachingMaterialChunks,
            TeachingMaterialRevisions,
            TeachingMaterials,
        )

        repairs = []
        for revision_id, expected in EXPECTED_BAD.items():
            revision = TeachingMaterialRevisions.query.filter_by(id=revision_id).one()
            material = TeachingMaterials.query.filter_by(id=revision.material_id).one()
            latest = (
                TeachingMaterialRevisions.query.filter_by(material_id=material.id)
                .order_by(TeachingMaterialRevisions.revision.desc()).first()
            )
            observed = characters(db, TeachingMaterialChunks, revision.id)
            latest_characters = characters(db, TeachingMaterialChunks, latest.id)
            assert material.filename.lower().endswith(".pdf")
            assert revision.status == "READY" and observed == expected
            assert latest.id != revision.id and latest.status == material.status == "READY"
            assert latest_characters > observed * 1.5
            repairs.append((revision, latest, observed))
        print(json.dumps({"supersededPartialIndexes": len(repairs),
                          "healthyLatestIndexes": len({revision.material_id for revision, _, _ in repairs})}))
        if not apply:
            db.session.rollback()
            return
        BACKUP.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        descriptor = os.open(BACKUP, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump([{
                "id": revision.id, "status": revision.status,
                "metadata": revision.metadata_json,
            } for revision, _, _ in repairs], handle, ensure_ascii=False, default=str)
        audited_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for revision, latest, observed in repairs:
            revision.status = "FAILED"
            revision.metadata_json = {
                **(revision.metadata_json or {}),
                "qualityAudit": {
                    "reason": "PARTIAL_PDF_INDEX",
                    "indexedCharacters": observed,
                    "supersededByRevisionId": latest.id,
                    "auditedAt": audited_at,
                },
            }
        db.session.commit()
        print(json.dumps({"invalidated": len(repairs), "rollbackSnapshot": str(BACKUP)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    main(parser.parse_args().apply)
