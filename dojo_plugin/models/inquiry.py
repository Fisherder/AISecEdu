import datetime
import uuid

from CTFd.models import db
from sqlalchemy.dialects.postgresql import JSONB


class InquiryReleases(db.Model):
    __tablename__ = "inquiry_releases"
    __table_args__ = (db.UniqueConstraint("artifact_id", "revision"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: "irelease_" + uuid.uuid4().hex)
    artifact_id = db.Column(db.String(48), db.ForeignKey("teaching_artifacts.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_id = db.Column(db.String(48), db.ForeignKey("teaching_artifact_revisions.id"), nullable=False)
    revision = db.Column(db.Integer, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    published_by = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    review = db.Column(JSONB, nullable=False)
    published = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)


class InquiryAttempts(db.Model):
    __tablename__ = "inquiry_attempts"
    __table_args__ = (db.UniqueConstraint("user_id", "artifact_id", "revision", "mode"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: "iattempt_" + uuid.uuid4().hex)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    artifact_id = db.Column(db.String(48), db.ForeignKey("teaching_artifacts.id", ondelete="CASCADE"), nullable=False, index=True)
    revision = db.Column(db.Integer, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    mode = db.Column(db.String(16), nullable=False)
    state = db.Column(JSONB, nullable=False)
    sequence = db.Column(db.Integer, default=0, nullable=False)
    completed = db.Column(db.DateTime)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow, nullable=False)


class InquiryEvents(db.Model):
    __tablename__ = "inquiry_events"
    __table_args__ = (db.UniqueConstraint("attempt_id", "sequence"), db.UniqueConstraint("attempt_id", "request_key"))

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    attempt_id = db.Column(db.String(48), db.ForeignKey("inquiry_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence = db.Column(db.Integer, nullable=False)
    request_key = db.Column(db.String(80), nullable=False)
    request_hash = db.Column(db.String(64), nullable=False)
    payload = db.Column(JSONB, nullable=False)
    response = db.Column(JSONB, nullable=False)
    previous_hash = db.Column(db.String(64), nullable=False)
    event_hash = db.Column(db.String(64), nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
