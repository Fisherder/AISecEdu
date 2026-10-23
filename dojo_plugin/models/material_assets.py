import datetime
import uuid

from CTFd.models import db


class MaterialAssetCopies(db.Model):
    __tablename__ = "material_asset_copies"
    __table_args__ = (
        db.CheckConstraint("resource_kind IN ('artifact', 'assignment', 'practice')"),
        db.UniqueConstraint("resource_kind", "resource_id", "token"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: "libasset_" + uuid.uuid4().hex)
    owner_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    course_id = db.Column(db.Integer, db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"), nullable=False, index=True)
    resource_kind = db.Column(db.String(16), nullable=False)
    resource_id = db.Column(db.String(48), nullable=False)
    token = db.Column(db.String(64), nullable=False)
    filename = db.Column(db.String(240), nullable=False)
    mime_type = db.Column(db.String(160), nullable=False)
    disposition = db.Column(db.String(16), nullable=False)
    sha256 = db.Column(db.String(64), nullable=False)
    data = db.Column(db.LargeBinary, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
