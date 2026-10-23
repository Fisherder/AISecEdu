import datetime
import uuid

from CTFd.models import db
from sqlalchemy.dialects.postgresql import JSONB


def construction_id():
    return 'build_' + uuid.uuid4().hex


class ConstructionBatches(db.Model):
    __tablename__ = 'construction_batches'
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    name = db.Column(db.String(160), nullable=False)
    starts = db.Column(db.Date, nullable=False)
    ends = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(24), nullable=False, default='active')
    publisher_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    settings = db.Column(JSONB, default=dict, nullable=False)


class ConstructionMembers(db.Model):
    __tablename__ = 'construction_members'
    __table_args__ = (db.UniqueConstraint('batch_id', 'user_id'),)
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    batch_id = db.Column(db.String(48), db.ForeignKey('construction_batches.id'), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    role = db.Column(db.String(24), nullable=False, default='author')
    active = db.Column(db.Boolean, nullable=False, default=True)
    activated = db.Column(db.DateTime)
    workspace_id = db.Column(db.Integer, db.ForeignKey('dojos.dojo_id'), nullable=False)
    wip_limit = db.Column(db.Integer, nullable=False, default=2)
    data = db.Column(JSONB, default=dict, nullable=False)


class ConstructionCourses(db.Model):
    __tablename__ = 'construction_courses'
    __table_args__ = (db.UniqueConstraint('batch_id', 'code'),)
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    batch_id = db.Column(db.String(48), db.ForeignKey('construction_batches.id'), nullable=False, index=True)
    code = db.Column(db.String(32), nullable=False)
    name = db.Column(db.String(160), nullable=False)
    final_user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    collection_id = db.Column(db.String(48), db.ForeignKey('material_collections.id'), nullable=False)
    plan = db.Column(JSONB, default=dict, nullable=False)
    revision = db.Column(db.Integer, nullable=False, default=1)


class ConstructionTasks(db.Model):
    __tablename__ = 'construction_tasks'
    __table_args__ = (db.UniqueConstraint('course_id', 'code'),)
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    course_id = db.Column(db.String(48), db.ForeignKey('construction_courses.id'), nullable=False, index=True)
    code = db.Column(db.String(48), nullable=False)
    title = db.Column(db.String(240), nullable=False)
    chapter = db.Column(db.String(120), nullable=False)
    kind = db.Column(db.String(24), nullable=False)
    status = db.Column(db.String(24), nullable=False, default='planning', index=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('users.id'), index=True)
    peer_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    final_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    due = db.Column(db.Date, nullable=False)
    weight = db.Column(db.Integer, nullable=False, default=1)
    revision = db.Column(db.Integer, nullable=False, default=1)
    brief = db.Column(JSONB, default=dict, nullable=False)
    blocked = db.Column(db.Text, nullable=False, default='')
    current_submission = db.Column(db.String(48))
    material_id = db.Column(db.String(48), db.ForeignKey('material_library_items.id'))
    release_error = db.Column(db.Text)
    updated = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)


class ConstructionSubmissions(db.Model):
    __tablename__ = 'construction_submissions'
    __table_args__ = (db.UniqueConstraint('task_id', 'number'), db.UniqueConstraint('task_id', 'request_key'))
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    task_id = db.Column(db.String(48), db.ForeignKey('construction_tasks.id'), nullable=False, index=True)
    number = db.Column(db.Integer, nullable=False)
    request_key = db.Column(db.String(128), nullable=False)
    author_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    authors = db.Column(JSONB, default=list, nullable=False)
    source = db.Column(JSONB, nullable=False)
    snapshot = db.Column(JSONB, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    evidence = db.Column(JSONB, nullable=False)
    native_copy = db.Column(JSONB, nullable=False)
    peer_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    final_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    peer = db.Column(JSONB, default=dict, nullable=False)
    final = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)


class ConstructionSpaces(db.Model):
    __tablename__ = 'construction_spaces'
    course_id = db.Column(db.Integer, db.ForeignKey('dojos.dojo_id'), primary_key=True)
    submission_id = db.Column(db.String(48), db.ForeignKey('construction_submissions.id'), nullable=False, index=True)
    fingerprint = db.Column(db.String(64), nullable=False)


class ConstructionReleases(db.Model):
    __tablename__ = 'construction_releases'
    __table_args__ = (db.UniqueConstraint('material_id', 'version'),)
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    submission_id = db.Column(db.String(48), db.ForeignKey('construction_submissions.id'), nullable=False, unique=True)
    material_id = db.Column(db.String(48), db.ForeignKey('material_library_items.id'), nullable=False, index=True)
    version = db.Column(db.Integer, nullable=False)
    content_hash = db.Column(db.String(64), nullable=False)
    revoked = db.Column(db.Boolean, default=False, nullable=False)
    reason = db.Column(db.Text, default='', nullable=False)
    created = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)


class ConstructionEvents(db.Model):
    __tablename__ = 'construction_events'
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    batch_id = db.Column(db.String(48), db.ForeignKey('construction_batches.id'), nullable=False, index=True)
    task_id = db.Column(db.String(48), db.ForeignKey('construction_tasks.id'), index=True)
    actor_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    action = db.Column(db.String(48), nullable=False)
    data = db.Column(JSONB, default=dict, nullable=False)
    created = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)


class ConstructionNotices(db.Model):
    __tablename__ = 'construction_notices'
    id = db.Column(db.String(48), primary_key=True, default=construction_id)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    release_id = db.Column(db.String(48), db.ForeignKey('construction_releases.id'), nullable=False)
    import_id = db.Column(db.String(48), db.ForeignKey('material_library_imports.id'), nullable=False)
    resolution = db.Column(db.Text, default='', nullable=False)
    resolved = db.Column(db.DateTime)
