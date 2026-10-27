import datetime
import uuid

from CTFd.models import db


def rainier_id():
    return uuid.uuid4().hex


class RainierIdentities(db.Model):
    __tablename__ = "rainier_identities"
    __table_args__ = (db.UniqueConstraint("host", "app_id", "external_code"),
                      db.UniqueConstraint("host", "app_id", "user_id"))
    id = db.Column(db.String(32), primary_key=True, default=rainier_id)
    host = db.Column(db.String(300), nullable=False)
    app_id = db.Column(db.String(80), nullable=False)
    external_code = db.Column(db.String(160), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)


class RainierSessions(db.Model):
    __tablename__ = "rainier_sessions"
    __table_args__ = (db.UniqueConstraint("host", "app_id", "exp_id"),)
    id = db.Column(db.String(32), primary_key=True, default=rainier_id)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    host = db.Column(db.String(300), nullable=False)
    app_id = db.Column(db.String(80), nullable=False)
    exp_id = db.Column(db.String(24), nullable=False)
    external_code = db.Column(db.String(160), nullable=False)
    dojo_id = db.Column(db.Integer, nullable=False)
    challenge_id = db.Column(db.Integer, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    expires = db.Column(db.DateTime, nullable=False)
    closed = db.Column(db.Boolean, default=False, nullable=False)


class RainierAttemptLinks(db.Model):
    __tablename__ = "rainier_attempt_links"
    attempt_id = db.Column(db.String(48), db.ForeignKey("learning_attempts.id", ondelete="CASCADE"), primary_key=True)
    session_id = db.Column(db.String(32), db.ForeignKey("rainier_sessions.id", ondelete="CASCADE"), nullable=False, index=True)


class RainierAICalls(db.Model):
    __tablename__ = "rainier_ai_calls"
    id = db.Column(db.String(32), primary_key=True, default=rainier_id)
    session_id = db.Column(db.String(32), nullable=False, index=True)
    attempt_id = db.Column(db.String(48), nullable=False, index=True)
    scenario = db.Column(db.String(160), nullable=False)
    model = db.Column(db.String(160), nullable=False)
    version = db.Column(db.String(160), nullable=False)
    provider = db.Column(db.String(160), nullable=False)
    deployment = db.Column(db.String(24), nullable=False)
    input_tokens = db.Column(db.Integer)
    output_tokens = db.Column(db.Integer)
    status = db.Column(db.String(16), default="DISPATCHED", nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)


class RainierSubmissions(db.Model):
    __tablename__ = "rainier_submissions"
    __table_args__ = (db.UniqueConstraint("session_id", "assessment_id"),)
    id = db.Column(db.String(32), primary_key=True, default=rainier_id)
    session_id = db.Column(db.String(32), db.ForeignKey("rainier_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    assessment_id = db.Column(db.String(48), db.ForeignKey("learning_assessments.id", ondelete="CASCADE"), nullable=False)
    job_id = db.Column(db.String(48))
    payload = db.Column(db.JSON, nullable=False)
    digest = db.Column(db.String(64), nullable=False)
    status = db.Column(db.String(24), default="QUEUED", nullable=False)
    response_code = db.Column(db.String(16))
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    sent = db.Column(db.DateTime)
