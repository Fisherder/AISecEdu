import datetime
import uuid

from CTFd.models import db
from sqlalchemy.dialects.postgresql import JSONB


def library_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


class MaterialCollections(db.Model):
    __tablename__ = "material_collections"
    __table_args__ = (db.UniqueConstraint("owner_id", "name"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: library_id("collection"))
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = db.Column(db.String(128), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("dojos.dojo_id", ondelete="SET NULL"), index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)


class MaterialLibraryItems(db.Model):
    __tablename__ = "material_library_items"
    __table_args__ = (
        db.UniqueConstraint("owner_id", "source_kind", "source_id"),
        db.Index("ix_material_library_discovery", "archived", "visibility", "content_type", "updated"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: library_id("material"))
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source_kind = db.Column(db.String(24), nullable=False)
    source_id = db.Column(db.String(128), nullable=False)
    content_type = db.Column(db.String(48), nullable=False, index=True)
    title = db.Column(db.String(240), nullable=False)
    description = db.Column(db.Text, default="", nullable=False)
    visibility = db.Column(db.String(16), default="private", nullable=False)
    archived = db.Column(db.Boolean, default=False, nullable=False)
    version = db.Column(db.Integer, default=1, nullable=False)
    metadata_version = db.Column(db.Integer, default=1, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


class MaterialCollectionItems(db.Model):
    __tablename__ = "material_collection_items"

    collection_id = db.Column(db.String(48), db.ForeignKey("material_collections.id", ondelete="CASCADE"), primary_key=True)
    item_id = db.Column(db.String(48), db.ForeignKey("material_library_items.id", ondelete="CASCADE"), primary_key=True)


class MaterialLibraryVersions(db.Model):
    __tablename__ = "material_library_versions"
    __table_args__ = (db.UniqueConstraint("item_id", "version"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: library_id("libversion"))
    item_id = db.Column(db.String(48), db.ForeignKey("material_library_items.id", ondelete="CASCADE"), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False)
    payload = db.Column(JSONB, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    provenance = db.Column(JSONB, default=dict, nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)


class MaterialLibraryImports(db.Model):
    __tablename__ = "material_library_imports"
    __table_args__ = (db.UniqueConstraint("owner_id", "request_key"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: library_id("libimport"))
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    request_key = db.Column(db.String(128), nullable=False)
    request_hash = db.Column(db.String(64), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"), nullable=False, index=True)
    module_index = db.Column(db.Integer, nullable=False)
    result = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
