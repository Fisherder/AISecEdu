import datetime
import uuid

from sqlalchemy.dialects.postgresql import JSONB

from CTFd.models import db


def learning_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


class LearningChallengeProfiles(db.Model):
    __tablename__ = "learning_challenge_profiles"

    challenge_id = db.Column(
        db.Integer,
        db.ForeignKey("challenges.id", ondelete="CASCADE"),
        primary_key=True,
    )
    author_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    status = db.Column(db.String(32), default="PUBLISHED", nullable=False, index=True)
    version = db.Column(db.Integer, default=1, nullable=False)
    category = db.Column(db.String(64), default="GENERAL", nullable=False, index=True)
    difficulty = db.Column(db.Integer, default=1, nullable=False, index=True)
    objectives = db.Column(JSONB, default=list, nullable=False)
    tags = db.Column(JSONB, default=list, nullable=False)
    rubric = db.Column(JSONB, default=dict, nullable=False)
    hint_policy = db.Column(JSONB, default=dict, nullable=False)
    package = db.Column(JSONB, default=dict, nullable=False)
    validation = db.Column(JSONB, default=dict, nullable=False)
    package_digest = db.Column(db.String(80), index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )
    published = db.Column(db.DateTime)

    challenge = db.relationship("Challenges")
    author = db.relationship("Users")


class LearningDrafts(db.Model):
    __tablename__ = "learning_drafts"

    id = db.Column(db.String(48), primary_key=True, default=lambda: learning_id("draft"))
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_index = db.Column(db.Integer, nullable=False)
    author_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = db.Column(db.String(32), default="DRAFT", nullable=False, index=True)
    level = db.Column(db.String(8), default="L2", nullable=False)
    brief = db.Column(db.Text, nullable=False)
    constraints = db.Column(JSONB, default=dict, nullable=False)
    conversation = db.Column(JSONB, default=list, nullable=False)
    spec = db.Column(JSONB, default=dict, nullable=False)
    candidates = db.Column(JSONB, default=list, nullable=False)
    validation = db.Column(JSONB, default=dict, nullable=False)
    revision = db.Column(db.Integer, default=1, nullable=False)
    published_challenge_id = db.Column(
        db.Integer,
        db.ForeignKey("challenges.id", ondelete="SET NULL"),
        index=True,
    )
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    dojo = db.relationship("Dojos")
    author = db.relationship("Users", foreign_keys=[author_id])
    published_challenge = db.relationship("Challenges")


class LearningAttempts(db.Model):
    __tablename__ = "learning_attempts"
    __table_args__ = (
        db.ForeignKeyConstraint(
            ["dojo_id", "module_index", "challenge_index"],
            [
                "dojo_challenges.dojo_id",
                "dojo_challenges.module_index",
                "dojo_challenges.challenge_index",
            ],
            ondelete="CASCADE",
        ),
        db.UniqueConstraint("user_id", "dojo_id", "challenge_id", "epoch"),
        db.Index("ix_learning_attempt_active", "user_id", "status"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: learning_id("attempt"))
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(db.Integer, nullable=False, index=True)
    module_index = db.Column(db.Integer, nullable=False)
    challenge_index = db.Column(db.Integer, nullable=False)
    challenge_id = db.Column(
        db.Integer,
        db.ForeignKey("challenges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    epoch = db.Column(db.Integer, default=1, nullable=False)
    mode = db.Column(db.String(24), default="ASSESSMENT", nullable=False)
    status = db.Column(db.String(24), default="ACTIVE", nullable=False, index=True)
    reflection = db.Column(db.Text)
    objective_score = db.Column(db.Float, default=0, nullable=False)
    process_score = db.Column(db.Float, default=0, nullable=False)
    total_score = db.Column(db.Float, default=0, nullable=False)
    trust_score = db.Column(db.Float, default=1, nullable=False)
    data = db.Column(JSONB, default=dict, nullable=False)
    started = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    submitted = db.Column(db.DateTime)
    completed = db.Column(db.DateTime)

    user = db.relationship("Users")
    challenge = db.relationship("Challenges")
    dojo_challenge = db.relationship("DojoChallenges")


class LearningEvidenceEvents(db.Model):
    __tablename__ = "learning_evidence_events"
    __table_args__ = (
        db.UniqueConstraint("attempt_id", "sequence"),
        db.Index("ix_learning_evidence_timeline", "attempt_id", "occurred"),
    )

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    attempt_id = db.Column(
        db.String(48),
        db.ForeignKey("learning_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence = db.Column(db.Integer, nullable=False)
    event_type = db.Column(db.String(80), nullable=False, index=True)
    source = db.Column(db.String(32), nullable=False)
    trust_level = db.Column(db.Integer, nullable=False)
    payload = db.Column(JSONB, default=dict, nullable=False)
    previous_hash = db.Column(db.String(64), nullable=False)
    event_hash = db.Column(db.String(64), nullable=False, index=True)
    occurred = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    ingested = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    attempt = db.relationship("LearningAttempts")


class LearningTutorMessages(db.Model):
    __tablename__ = "learning_tutor_messages"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    attempt_id = db.Column(
        db.String(48),
        db.ForeignKey("learning_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role = db.Column(db.String(16), nullable=False)
    guidance_level = db.Column(db.Integer, default=1, nullable=False)
    content = db.Column(db.Text, nullable=False)
    metadata_json = db.Column("metadata", JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    attempt = db.relationship("LearningAttempts")
    user = db.relationship("Users")


class LearningAssessments(db.Model):
    __tablename__ = "learning_assessments"
    __table_args__ = (db.UniqueConstraint("attempt_id", "revision"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: learning_id("grade"))
    attempt_id = db.Column(
        db.String(48),
        db.ForeignKey("learning_attempts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision = db.Column(db.Integer, default=1, nullable=False)
    objective_score = db.Column(db.Float, nullable=False)
    process_score = db.Column(db.Float, nullable=False)
    total_score = db.Column(db.Float, nullable=False)
    criteria = db.Column(JSONB, default=list, nullable=False)
    abilities = db.Column(JSONB, default=dict, nullable=False)
    timeline = db.Column(JSONB, default=list, nullable=False)
    feedback = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(24), default="FINAL", nullable=False, index=True)
    source = db.Column(db.String(32), default="DETERMINISTIC", nullable=False)
    created_by = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    attempt = db.relationship("LearningAttempts")
    reviewer = db.relationship("Users")


class LearningAppeals(db.Model):
    __tablename__ = "learning_appeals"

    id = db.Column(db.String(48), primary_key=True, default=lambda: learning_id("appeal"))
    assessment_id = db.Column(
        db.String(48),
        db.ForeignKey("learning_assessments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(24), default="OPEN", nullable=False, index=True)
    resolution = db.Column(db.Text)
    reviewer_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    resolved = db.Column(db.DateTime)

    assessment = db.relationship("LearningAssessments")
    user = db.relationship("Users", foreign_keys=[user_id])
    reviewer = db.relationship("Users", foreign_keys=[reviewer_id])


class LearningSkillStates(db.Model):
    __tablename__ = "learning_skill_states"

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        primary_key=True,
    )
    dimension = db.Column(db.String(64), primary_key=True)
    mastery = db.Column(db.Float, default=0, nullable=False)
    confidence = db.Column(db.Float, default=0, nullable=False)
    evidence_count = db.Column(db.Integer, default=0, nullable=False)
    data = db.Column(JSONB, default=dict, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    user = db.relationship("Users")
    dojo = db.relationship("Dojos")


class LearningRecommendations(db.Model):
    __tablename__ = "learning_recommendations"

    id = db.Column(db.String(48), primary_key=True, default=lambda: learning_id("rec"))
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    challenge_id = db.Column(
        db.Integer,
        db.ForeignKey("challenges.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rank = db.Column(db.Integer, nullable=False)
    reason = db.Column(db.Text, nullable=False)
    snapshot = db.Column(JSONB, default=dict, nullable=False)
    status = db.Column(db.String(24), default="ACTIVE", nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    user = db.relationship("Users")
    dojo = db.relationship("Dojos")
    challenge = db.relationship("Challenges")


class LearningAuditEvents(db.Model):
    __tablename__ = "learning_audit_events"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action = db.Column(db.String(80), nullable=False, index=True)
    resource_type = db.Column(db.String(48), nullable=False)
    resource_id = db.Column(db.String(128), nullable=False, index=True)
    outcome = db.Column(db.String(16), nullable=False)
    details = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    actor = db.relationship("Users")
