import datetime
import uuid

from sqlalchemy import false
from sqlalchemy.dialects.postgresql import JSONB

from CTFd.models import db


def teaching_id(prefix):
    return f"{prefix}_{uuid.uuid4().hex}"


class TeachingAgentThreads(db.Model):
    __tablename__ = "teaching_agent_threads"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("thread"))
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="SET NULL"),
        index=True,
    )
    module_index = db.Column(db.Integer)
    title = db.Column(db.String(240), default="新教学对话", nullable=False)
    status = db.Column(db.String(24), default="ACTIVE", nullable=False, index=True)
    pinned = db.Column(
        db.Boolean,
        default=False,
        server_default=false(),
        nullable=False,
        index=True,
    )
    archived_at = db.Column(db.DateTime, index=True)
    phase = db.Column(db.String(32), default="COURSE_SETUP", nullable=False, index=True)
    context = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )

    user = db.relationship("Users")
    dojo = db.relationship("Dojos")
    messages = db.relationship(
        "TeachingAgentMessages",
        order_by="TeachingAgentMessages.id",
        cascade="all, delete-orphan",
        back_populates="thread",
    )


class UserAccountPreferences(db.Model):
    __tablename__ = "user_account_preferences"

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    appearance = db.Column(
        db.String(16),
        default="system",
        server_default="system",
        nullable=False,
    )
    palette = db.Column(
        db.String(16),
        default="academy",
        server_default="academy",
        nullable=False,
    )
    reduced_motion = db.Column(
        db.Boolean,
        default=False,
        server_default=false(),
        nullable=False,
    )
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    user = db.relationship("Users")


class TeachingAgentMessages(db.Model):
    __tablename__ = "teaching_agent_messages"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="CASCADE"),
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
    content = db.Column(db.Text, nullable=False)
    metadata_json = db.Column("metadata", JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    thread = db.relationship("TeachingAgentThreads", back_populates="messages")
    user = db.relationship("Users")


class TeachingAgentActions(db.Model):
    __tablename__ = "teaching_agent_actions"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("action"))
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    action_type = db.Column(db.String(80), nullable=False, index=True)
    risk_level = db.Column(db.String(8), default="R1", nullable=False, index=True)
    target_type = db.Column(db.String(48), nullable=False)
    target_id = db.Column(db.String(128), index=True)
    status = db.Column(db.String(24), default="PLANNED", nullable=False, index=True)
    idempotency_key = db.Column(db.String(128), unique=True, index=True)
    request_json = db.Column("request", JSONB, default=dict, nullable=False)
    result = db.Column(JSONB, default=dict, nullable=False)
    error = db.Column(db.Text)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    completed = db.Column(db.DateTime)

    thread = db.relationship("TeachingAgentThreads")
    actor = db.relationship("Users")


class TeachingAgentApprovals(db.Model):
    __tablename__ = "teaching_agent_approvals"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("approval"))
    action_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_actions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    approver_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    decision = db.Column(db.String(16), nullable=False, index=True)
    comment = db.Column(db.Text)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    action = db.relationship("TeachingAgentActions")
    approver = db.relationship("Users")


class TeachingJobs(db.Model):
    __tablename__ = "teaching_jobs"
    __table_args__ = (
        db.Index("ix_teaching_job_queue", "status", "priority", "created"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("job"))
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        index=True,
    )
    module_index = db.Column(db.Integer)
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="SET NULL"),
        index=True,
    )
    action_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_actions.id", ondelete="SET NULL"),
        index=True,
    )
    kind = db.Column(db.String(64), nullable=False, index=True)
    status = db.Column(db.String(24), default="QUEUED", nullable=False, index=True)
    stage = db.Column(db.String(64), default="queued", nullable=False)
    progress = db.Column(db.Integer, default=0, nullable=False)
    priority = db.Column(db.Integer, default=100, nullable=False)
    idempotency_key = db.Column(db.String(128), unique=True, nullable=False, index=True)
    trace_id = db.Column(db.String(64), index=True)
    payload = db.Column(JSONB, default=dict, nullable=False)
    result = db.Column(JSONB, default=dict, nullable=False)
    lease_owner = db.Column(db.String(128), index=True)
    lease_expires = db.Column(db.DateTime, index=True)
    heartbeat = db.Column(db.DateTime)
    attempt_count = db.Column(db.Integer, default=0, nullable=False)
    max_attempts = db.Column(db.Integer, default=3, nullable=False)
    error = db.Column(db.Text)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )
    completed = db.Column(db.DateTime)
    canceled = db.Column(db.DateTime)

    owner = db.relationship("Users")
    dojo = db.relationship("Dojos")
    thread = db.relationship("TeachingAgentThreads")
    action = db.relationship("TeachingAgentActions")
    events = db.relationship(
        "TeachingJobEvents",
        order_by="TeachingJobEvents.sequence",
        cascade="all, delete-orphan",
        back_populates="job",
    )


class TeachingGenerationBatches(db.Model):
    __tablename__ = "teaching_generation_batches"
    __table_args__ = (
        db.Index(
            "ix_teaching_generation_batch_owner_status",
            "owner_id",
            "status",
            "updated",
        ),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("batch"))
    owner_id = db.Column(
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
    module_index = db.Column(db.Integer, nullable=False)
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="SET NULL"),
        index=True,
    )
    action_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_actions.id", ondelete="SET NULL"),
        unique=True,
        index=True,
    )
    operation = db.Column(
        db.String(64),
        default="challenge.batch.generate",
        nullable=False,
        index=True,
    )
    status = db.Column(
        db.String(32),
        default="QUEUED",
        nullable=False,
        index=True,
    )
    requested_count = db.Column(db.Integer, nullable=False)
    independence = db.Column(
        db.String(48),
        default="independent_challenges",
        nullable=False,
    )
    exercise_mode = db.Column(db.String(32), default="CTF", nullable=False)
    publish_mode = db.Column(db.String(24), default="draft", nullable=False)
    difficulty_strategy = db.Column(JSONB, default=dict, nullable=False)
    plan = db.Column(JSONB, default=dict, nullable=False)
    counts = db.Column(JSONB, default=dict, nullable=False)
    idempotency_key = db.Column(db.String(128), unique=True, nullable=False, index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    confirmed = db.Column(db.DateTime, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )
    completed = db.Column(db.DateTime)
    canceled = db.Column(db.DateTime)

    owner = db.relationship("Users")
    dojo = db.relationship("Dojos")
    thread = db.relationship("TeachingAgentThreads")
    action = db.relationship("TeachingAgentActions")
    items = db.relationship(
        "TeachingGenerationBatchItems",
        order_by="TeachingGenerationBatchItems.item_index",
        cascade="all, delete-orphan",
        back_populates="batch",
    )


class TeachingGenerationBatchItems(db.Model):
    __tablename__ = "teaching_generation_batch_items"
    __table_args__ = (
        db.UniqueConstraint("batch_id", "item_index"),
        db.Index("ix_teaching_generation_batch_item_status", "batch_id", "status"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("bitem"))
    batch_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_generation_batches.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_index = db.Column(db.Integer, nullable=False)
    status = db.Column(db.String(32), default="PLANNED", nullable=False, index=True)
    task_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_jobs.id", ondelete="SET NULL"),
        unique=True,
        index=True,
    )
    authoring_job_id = db.Column(
        db.String(48),
        db.ForeignKey("learning_authoring_jobs.id", ondelete="SET NULL"),
        unique=True,
        index=True,
    )
    draft_id = db.Column(
        db.String(48),
        db.ForeignKey("learning_drafts.id", ondelete="SET NULL"),
        index=True,
    )
    spec = db.Column(JSONB, default=dict, nullable=False)
    validation = db.Column(JSONB, default=dict, nullable=False)
    error = db.Column(db.Text)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )
    completed = db.Column(db.DateTime)

    batch = db.relationship("TeachingGenerationBatches", back_populates="items")
    task = db.relationship("TeachingJobs")
    authoring_job = db.relationship("LearningAuthoringJobs")
    draft = db.relationship("LearningDrafts")


class TeachingJobOutbox(db.Model):
    """Transactional hand-off from PostgreSQL truth to Redis Streams."""

    __tablename__ = "teaching_job_outbox"

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    job_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_jobs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    payload = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    published = db.Column(db.DateTime, index=True)
    publish_attempts = db.Column(db.Integer, default=0, nullable=False)
    last_error = db.Column(db.Text)

    job = db.relationship("TeachingJobs")


class TeachingJobEvents(db.Model):
    __tablename__ = "teaching_job_events"
    __table_args__ = (db.UniqueConstraint("job_id", "sequence"),)

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    job_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence = db.Column(db.Integer, nullable=False)
    stage = db.Column(db.String(64), nullable=False, index=True)
    status = db.Column(db.String(24), nullable=False)
    message = db.Column(db.Text, nullable=False)
    details = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    job = db.relationship("TeachingJobs", back_populates="events")


class TeachingMaterials(db.Model):
    __tablename__ = "teaching_materials"
    __table_args__ = (
        db.UniqueConstraint("owner_id", "dojo_id", "sha256"),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("material"))
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title = db.Column(db.String(240), nullable=False)
    filename = db.Column(db.String(512), nullable=False)
    mime_type = db.Column(db.String(160), nullable=False)
    size = db.Column(db.BigInteger, nullable=False)
    sha256 = db.Column(db.String(64), nullable=False, index=True)
    storage_key = db.Column(db.String(1024), nullable=False, unique=True)
    status = db.Column(db.String(24), default="UPLOADED", nullable=False, index=True)
    metadata_json = db.Column("metadata", JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    owner = db.relationship("Users")
    dojo = db.relationship("Dojos")


class TeachingMaterialRevisions(db.Model):
    __tablename__ = "teaching_material_revisions"
    __table_args__ = (db.UniqueConstraint("material_id", "revision"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("matrev"))
    material_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_materials.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision = db.Column(db.Integer, nullable=False)
    storage_key = db.Column(db.String(1024), nullable=False)
    sha256 = db.Column(db.String(64), nullable=False, index=True)
    status = db.Column(db.String(24), default="PENDING", nullable=False, index=True)
    parser = db.Column(db.String(128))
    parser_version = db.Column(db.String(64))
    metadata_json = db.Column("metadata", JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    material = db.relationship("TeachingMaterials")


class TeachingMaterialChunks(db.Model):
    __tablename__ = "teaching_material_chunks"
    __table_args__ = (db.UniqueConstraint("revision_id", "ordinal"),)

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    revision_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_material_revisions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ordinal = db.Column(db.Integer, nullable=False)
    source_type = db.Column(db.String(32), nullable=False)
    source_locator = db.Column(JSONB, default=dict, nullable=False)
    content = db.Column(db.Text, nullable=False)
    metadata_json = db.Column("metadata", JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    revision = db.relationship("TeachingMaterialRevisions")


class TeachingCandidateSets(db.Model):
    __tablename__ = "teaching_candidate_sets"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("cset"))
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        index=True,
    )
    self_workspace_id = db.Column(
        db.String(48),
        db.ForeignKey("self_learning_workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    module_index = db.Column(db.Integer)
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="SET NULL"),
        index=True,
    )
    kind = db.Column(db.String(48), nullable=False, index=True)
    status = db.Column(db.String(24), default="DRAFT", nullable=False, index=True)
    request_json = db.Column("request", JSONB, default=dict, nullable=False)
    source_refs = db.Column(JSONB, default=list, nullable=False)
    selected_candidate_id = db.Column(db.String(48), index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    owner = db.relationship("Users")
    dojo = db.relationship("Dojos")
    thread = db.relationship("TeachingAgentThreads")


class TeachingArtifactCandidates(db.Model):
    __tablename__ = "teaching_artifact_candidates"
    __table_args__ = (db.UniqueConstraint("candidate_set_id", "ordinal"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("candidate"))
    candidate_set_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_candidate_sets.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ordinal = db.Column(db.Integer, nullable=False)
    title = db.Column(db.String(240), nullable=False)
    summary = db.Column(db.Text, nullable=False)
    strategy = db.Column(db.String(80), nullable=False)
    content = db.Column(JSONB, default=dict, nullable=False)
    differences = db.Column(JSONB, default=list, nullable=False)
    recommendation = db.Column(db.Text)
    status = db.Column(db.String(24), default="DRAFT", nullable=False, index=True)
    parent_candidate_id = db.Column(db.String(48), index=True)
    materialized_artifact_id = db.Column(db.String(48), index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    candidate_set = db.relationship("TeachingCandidateSets")


class TeachingArtifacts(db.Model):
    __tablename__ = "teaching_artifacts"
    __table_args__ = (
        db.Index(
            "ix_teaching_artifacts_course_order",
            "dojo_id",
            "module_index",
            "sort_order",
        ),
    )

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("artifact"))
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        index=True,
    )
    self_workspace_id = db.Column(
        db.String(48),
        db.ForeignKey("self_learning_workspaces.id", ondelete="CASCADE"),
        index=True,
    )
    module_index = db.Column(db.Integer)
    sort_order = db.Column(
        db.Integer,
        default=2147483647,
        server_default="2147483647",
        nullable=False,
    )
    candidate_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_artifact_candidates.id", ondelete="SET NULL"),
        index=True,
    )
    artifact_type = db.Column(db.String(48), nullable=False, index=True)
    title = db.Column(db.String(240), nullable=False)
    status = db.Column(db.String(24), default="DRAFT", nullable=False, index=True)
    current_revision = db.Column(db.Integer, default=1, nullable=False)
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
        index=True,
    )
    published = db.Column(db.DateTime)

    owner = db.relationship("Users")
    dojo = db.relationship("Dojos")
    candidate = db.relationship("TeachingArtifactCandidates")
    published_challenge = db.relationship("Challenges")


class TeachingArtifactRevisions(db.Model):
    __tablename__ = "teaching_artifact_revisions"
    __table_args__ = (db.UniqueConstraint("artifact_id", "revision"),)

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("revision"))
    artifact_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_artifacts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    revision = db.Column(db.Integer, nullable=False)
    parent_revision = db.Column(db.Integer)
    instruction = db.Column(db.Text)
    content = db.Column(JSONB, default=dict, nullable=False)
    storage_key = db.Column(db.String(1024))
    content_hash = db.Column(db.String(64), nullable=False, index=True)
    source_refs = db.Column(JSONB, default=list, nullable=False)
    validation = db.Column(JSONB, default=dict, nullable=False)
    created_by = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    artifact = db.relationship("TeachingArtifacts")
    creator = db.relationship("Users")


class ConversationCards(db.Model):
    __tablename__ = "conversation_cards"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("card"))
    message_id = db.Column(
        db.BigInteger,
        db.ForeignKey("teaching_agent_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    card_type = db.Column(db.String(48), nullable=False, index=True)
    object_type = db.Column(db.String(48), nullable=False)
    object_id = db.Column(db.String(128), nullable=False, index=True)
    revision_id = db.Column(db.String(48), index=True)
    state = db.Column(JSONB, default=dict, nullable=False)
    actions = db.Column(JSONB, default=list, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    message = db.relationship("TeachingAgentMessages")


class TeachingSessions(db.Model):
    __tablename__ = "teaching_sessions"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("session"))
    owner_id = db.Column(
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
    module_index = db.Column(db.Integer)
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="SET NULL"),
        index=True,
    )
    title = db.Column(db.String(240), nullable=False)
    status = db.Column(db.String(24), default="READY", nullable=False, index=True)
    state = db.Column(JSONB, default=dict, nullable=False)
    started = db.Column(db.DateTime)
    ended = db.Column(db.DateTime)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
    )

    owner = db.relationship("Users")
    dojo = db.relationship("Dojos")
    thread = db.relationship("TeachingAgentThreads")


class TeachingSessionEvents(db.Model):
    __tablename__ = "teaching_session_events"
    # API-side values are actor-scoped hashes. Keeping the existing two-column
    # constraint avoids a destructive migration while still isolating client
    # idempotency keys between classroom participants.
    __table_args__ = (
        db.UniqueConstraint("session_id", "sequence"),
        db.UniqueConstraint("session_id", "idempotency_key"),
    )

    id = db.Column(db.BigInteger, primary_key=True, autoincrement=True)
    session_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence = db.Column(db.Integer, nullable=False)
    actor_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))
    event_type = db.Column(db.String(64), nullable=False, index=True)
    idempotency_key = db.Column(db.String(128), nullable=False)
    payload = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    session = db.relationship("TeachingSessions")
    actor = db.relationship("Users")


class SelfLearningWorkspaces(db.Model):
    __tablename__ = "self_learning_workspaces"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("self"))
    student_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="SET NULL"),
        index=True,
    )
    module_index = db.Column(db.Integer)
    thread_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_agent_threads.id", ondelete="SET NULL"),
        index=True,
    )
    title = db.Column(db.String(240), nullable=False)
    goal = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(24), default="ACTIVE", nullable=False, index=True)
    quota = db.Column(JSONB, default=dict, nullable=False)
    state = db.Column(JSONB, default=dict, nullable=False)
    submitted_artifact_id = db.Column(db.String(48), index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )

    student = db.relationship("Users")
    dojo = db.relationship("Dojos")
    thread = db.relationship("TeachingAgentThreads")


class StudentAgentMemories(db.Model):
    """Small, user-owned facts the learning agent may reuse across conversations.

    Memory is deliberately stored outside an individual chat thread so a learner can
    continue naturally in a new conversation.  Every row remains visible and
    independently removable by its owner; imported course content is never written to
    this table.
    """

    __tablename__ = "student_agent_memories"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("memory"))
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category = db.Column(db.String(48), default="preference", nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    source = db.Column(db.String(48), default="USER_EXPLICIT", nullable=False)
    source_thread_id = db.Column(db.String(48), index=True)
    status = db.Column(db.String(24), default="ACTIVE", nullable=False, index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)
    updated = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
        nullable=False,
        index=True,
    )

    user = db.relationship("Users")


class ObjectiveMappings(db.Model):
    __tablename__ = "objective_mappings"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("objective"))
    dojo_id = db.Column(
        db.Integer,
        db.ForeignKey("dojos.dojo_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_index = db.Column(db.Integer, nullable=False)
    objective_id = db.Column(db.String(128), nullable=False, index=True)
    objective_name = db.Column(db.String(240), nullable=False)
    knowledge_point_id = db.Column(db.String(128), index=True)
    target_type = db.Column(db.String(48), nullable=False)
    target_id = db.Column(db.String(128), nullable=False, index=True)
    weight = db.Column(db.Float, default=1.0, nullable=False)
    rule = db.Column(JSONB, default=dict, nullable=False)
    version = db.Column(db.Integer, default=1, nullable=False)
    active = db.Column(db.Boolean, default=True, nullable=False, index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    dojo = db.relationship("Dojos")


class ModelInvocations(db.Model):
    __tablename__ = "model_invocations"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("model"))
    owner_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="SET NULL"),
        index=True,
    )
    job_id = db.Column(
        db.String(48),
        db.ForeignKey("teaching_jobs.id", ondelete="SET NULL"),
        index=True,
    )
    artifact_revision_id = db.Column(
        db.String(48),
        db.ForeignKey(
            "teaching_artifact_revisions.id",
            ondelete="SET NULL",
            deferrable=True,
            initially="DEFERRED",
        ),
        index=True,
    )
    route = db.Column(db.String(128), nullable=False, index=True)
    provider = db.Column(db.String(80), nullable=False)
    actual_model = db.Column(db.String(160), nullable=False, index=True)
    model_version = db.Column(db.String(80))
    parameters = db.Column(JSONB, default=dict, nullable=False)
    usage = db.Column(JSONB, default=dict, nullable=False)
    estimated_cost = db.Column(db.Float)
    latency_ms = db.Column(db.Integer)
    request_hash = db.Column(db.String(64), index=True)
    response_hash = db.Column(db.String(64), index=True)
    status = db.Column(db.String(24), nullable=False, index=True)
    degraded = db.Column(db.Boolean, default=False, nullable=False)
    error = db.Column(db.Text)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    owner = db.relationship("Users")
    job = db.relationship("TeachingJobs")
    artifact_revision = db.relationship("TeachingArtifactRevisions")


class AgentRuntimeLaunchTickets(db.Model):
    __tablename__ = "global_agent_launch_tickets"

    id = db.Column(db.String(48), primary_key=True, default=lambda: teaching_id("launch"))
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    audience = db.Column(db.String(80), nullable=False, index=True)
    scope = db.Column(JSONB, default=dict, nullable=False)
    nonce_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    expires = db.Column(db.DateTime, nullable=False, index=True)
    used = db.Column(db.DateTime, index=True)
    revoked = db.Column(db.DateTime, index=True)
    created = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    user = db.relationship("Users")
