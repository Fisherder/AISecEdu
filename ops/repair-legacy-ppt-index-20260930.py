#!/usr/bin/env python3
"""Invalidate superseded template-only PPT indexes after full reindexing.

Run inside the CTFd Python environment. Dry-run by default; --apply writes a
private rollback snapshot before changing any revision status.
"""

import argparse
import datetime
import json
import os
from pathlib import Path

from CTFd import create_app


EXPECTED_BAD = {
    "matrev_cc7a2a161b99439b8e4f18870963a505": 156,
    "matrev_e34bc5e9559449f4933d409744361efe": 156,
    "matrev_0f1af51605fe4bc5bf962167831ae5bd": 5,
    "matrev_68811dcdeb7d41d59d53af487e538891": 5,
    "matrev_c94aaa654870409e852477e6408b4f1b": 5,
    "matrev_db1aa3347cc44e07a0d4c1aa52888337": 5,
}
BACKUP = Path("/var/agent-runtime/.maintenance-backups/legacy-ppt-index-20260930.json")


def indexed_characters(db, chunks_model, revision_id):
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
        for revision_id, expected_characters in EXPECTED_BAD.items():
            revision = TeachingMaterialRevisions.query.filter_by(id=revision_id).one()
            material = TeachingMaterials.query.filter_by(id=revision.material_id).one()
            latest = (
                TeachingMaterialRevisions.query.filter_by(material_id=material.id)
                .order_by(TeachingMaterialRevisions.revision.desc()).first()
            )
            observed = indexed_characters(db, TeachingMaterialChunks, revision.id)
            latest_characters = indexed_characters(db, TeachingMaterialChunks, latest.id)
            assert material.filename.lower().endswith(".ppt")
            assert revision.status == "READY" and observed == expected_characters
            assert latest.id != revision.id and latest.status == material.status == "READY"
            assert latest_characters >= 1_000
            repairs.append((revision, latest, observed))
        print(json.dumps({"supersededInvalidIndexes": len(repairs),
                          "healthyLatestIndexes": len({revision.material_id for revision, _, _ in repairs})}))
        if not apply:
            db.session.rollback()
            return
        BACKUP.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        snapshot = [{
            "id": revision.id,
            "status": revision.status,
            "metadata": revision.metadata_json,
        } for revision, _, _ in repairs]
        descriptor = os.open(BACKUP, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(snapshot, handle, ensure_ascii=False, default=str)
        audited_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for revision, latest, observed in repairs:
            revision.status = "FAILED"
            revision.metadata_json = {
                **(revision.metadata_json or {}),
                "qualityAudit": {
                    "reason": "LEGACY_PPT_TEMPLATE_ONLY_INDEX",
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
