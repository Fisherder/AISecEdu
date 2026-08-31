import datetime
import uuid

from sqlalchemy.dialects.postgresql import JSONB

from CTFd.models import db


def coursework_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


class TeachingAssignments(db.Model):
    """A lightweight teaching task attached to the native Dojo hierarchy.

    Courses, modules and runnable exercises continue to live in Dojos,
    DojoModules and DojoChallenges.  This table only adds the scheduling and
    delivery metadata needed for homework, quizzes, labs and debates.
    """

    __tablename__ = "teaching_assignments"
    __table_args__ = (
        db.Index("ix_teaching_assignment_course_status", "dojo_id", "status", "due_at"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: coursework_id("assignment"))
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_index = db.Column(db.Integer, index=True)
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    title = db.Column(db.String(240), nullable=False)
    kind = db.Column(db.String(32), default="HOMEWORK", nullable=False, index=True)
    status = db.Column(db.String(24), default="DRAFT", nullable=False, index=True)
    description = db.Column(db.Text, default="", nullable=False)
    instructions = db.Column(db.Text, default="", nullable=False)
    settings = db.Column(JSONB, default=dict, nullable=False)
    available_from = db.Column(db.DateTime, index=True)
    due_at = db.Column(db.DateTime, index=True)
    published_at = db.Column(db.DateTime)
    closed_at = db.Column(db.DateTime)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )

    dojo = db.relationship("Dojos")
    owner = db.relationship("Users", foreign_keys=[owner_id])
    items = db.relationship(
        "TeachingAssignmentItems",
        order_by="TeachingAssignmentItems.position",
        cascade="all, delete-orphan",
        back_populates="assignment",
    )
    submissions = db.relationship(
        "TeachingAssignmentSubmissions",
        cascade="all, delete-orphan",
        back_populates="assignment",
    )


class TeachingAssignmentItems(db.Model):
    __tablename__ = "teaching_assignment_items"
    __table_args__ = (
        db.UniqueConstraint("assignment_id", "position"),
        db.Index("ix_teaching_assignment_item_challenge", "assignment_id", "challenge_id"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: coursework_id("item"))
    assignment_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position = db.Column(db.Integer, nullable=False)
    item_type = db.Column(db.String(32), nullable=False, index=True)
    title = db.Column(db.String(240), nullable=False)
    prompt = db.Column(db.Text, default="", nullable=False)
    points = db.Column(db.Float, default=10.0, nullable=False)
    required = db.Column(db.Boolean, default=True, nullable=False)
    challenge_id = db.Column(
        db.Integer,
        db.ForeignKey("challenges.id", ondelete="SET NULL"),
        index=True,
    )
    artifact_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_artifacts.id", ondelete="SET NULL"),
        index=True,
    )
    config = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    assignment = db.relationship("TeachingAssignments", back_populates="items")
    challenge = db.relationship("Challenges")
    artifact = db.relationship("TeachingArtifacts")


class TeachingAssignmentSubmissions(db.Model):
    __tablename__ = "teaching_assignment_submissions"
    __table_args__ = (
        db.UniqueConstraint("assignment_id", "student_id"),
        db.Index("ix_teaching_assignment_submission_status", "assignment_id", "status"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: coursework_id("submission"))
    assignment_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_assignments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status = db.Column(db.String(24), default="IN_PROGRESS", nullable=False, index=True)
    answers = db.Column(JSONB, default=dict, nullable=False)
    item_results = db.Column(JSONB, default=list, nullable=False)
    objective_score = db.Column(db.Float, default=0.0, nullable=False)
    ai_score = db.Column(db.Float, default=0.0, nullable=False)
    total_score = db.Column(db.Float, default=0.0, nullable=False)
    max_score = db.Column(db.Float, default=0.0, nullable=False)
    trust_score = db.Column(db.Float, default=1.0, nullable=False)
    feedback = db.Column(db.Text, default="", nullable=False)
    grading = db.Column(JSONB, default=dict, nullable=False)
    grader_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    started = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    submitted_at = db.Column(db.DateTime)
    graded_at = db.Column(db.DateTime)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )

    assignment = db.relationship("TeachingAssignments", back_populates="submissions")
    student = db.relationship("Users", foreign_keys=[student_id])
    grader = db.relationship("Users", foreign_keys=[grader_id])
