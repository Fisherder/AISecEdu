import datetime

from CTFd.models import db
from sqlalchemy.dialects.postgresql import JSONB

from .global_agent import teaching_id


class DebateAttempts(db.Model):
    __tablename__ = "debate_attempts"
    __table_args__ = (db.UniqueConstraint("artifact_id", "user_id", "start_key"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("debate"))
    artifact_id = db.Column(db.String(48), db.ForeignKey("teaching_artifacts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    start_key = db.Column(db.String(64), nullable=False)
    revision = db.Column(db.Integer, nullable=False)
    side = db.Column(db.String(8), nullable=False)
    preview = db.Column(db.Boolean, nullable=False, default=False)
    spec = db.Column(JSONB, nullable=False)
    status = db.Column(db.String(16), nullable=False, default="ACTIVE")
    turns = db.Column(JSONB, nullable=False, default=list)
    reflection = db.Column(db.Text)
    report = db.Column(JSONB)
    pending = db.Column(JSONB)
    completed_request = db.Column(db.String(64))
    created = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)
    updated = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    user = db.relationship("Users")
