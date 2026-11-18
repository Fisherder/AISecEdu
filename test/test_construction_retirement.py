import uuid

from flask import current_app
from CTFd.models import Users, db

from dojo_plugin.account_activation import (
    activation_required, complete_password_change, require_password_change,
)
from dojo_plugin.agent_runtime.artifacts import artifact_capabilities
from dojo_plugin.library_sources import library_courses, list_sources, source_preview_href
from dojo_plugin.material_library import item_for_user, list_items
from dojo_plugin.models import DojoAdmins, Dojos, MaterialLibraryItems, TeachingArtifacts
from dojo_plugin.product.capabilities import teacher_mode_available
from dojo_plugin.agent_runtime.scope import ScopeError


def identity():
    token = uuid.uuid4().hex[:16]
    user = Users(name='retirement-' + token, email=token+'@example.invalid', password=token, type='user')
    db.session.add(user)
    db.session.flush()
    return user


def course(user, **data):
    dojo = Dojos(id='retirement-' + uuid.uuid4().hex[:12], name='Retirement regression', type='course', data=data)
    db.session.add(dojo)
    db.session.flush()
    db.session.add(DojoAdmins(dojo_id=dojo.dojo_id, user_id=user.id))
    db.session.flush()
    return dojo


def test_removed_tasks_are_not_registered_but_account_and_library_routes_remain():
    routes = {rule.rule for rule in current_app.url_map.iter_rules()}
    assert not any('/construction' in route for route in routes)
    assert not any(name.startswith('construction_') for name in db.metadata.tables)
    for route in ('/activate-account', '/teacher', '/teacher/library', '/teacher/artifacts/<artifact_id>'):
        assert route in routes


def test_password_activation_remains_independent_of_task_membership():
    user = identity()
    try:
        assert not activation_required(user)
        require_password_change(user)
        db.session.flush()
        assert activation_required(user)
        complete_password_change(user)
        db.session.flush()
        assert not activation_required(user)
        require_password_change(user)
        db.session.flush()
        assert activation_required(user)
    finally:
        db.session.rollback()


def test_teacher_identity_requires_an_editable_course_or_platform_admin_role():
    user = identity()
    try:
        assert not teacher_mode_available(user)
        course(user, readOnly=True, archived=True)
        assert not teacher_mode_available(user)
        course(user)
        assert teacher_mode_available(user)
        user.type = 'admin'
        assert teacher_mode_available(user)
    finally:
        db.session.rollback()


def test_shared_snapshot_preview_preserves_readonly_boundaries_and_library_access():
    owner, viewer, student = identity(), identity(), identity()
    try:
        snapshot = course(owner)
        editable = course(viewer)
        artifact = TeachingArtifacts(owner_id=owner.id, dojo_id=snapshot.dojo_id,
                                     artifact_type='slide-deck', title='Retained shared snapshot')
        db.session.add(artifact)
        db.session.flush()
        shared = MaterialLibraryItems(owner_id=owner.id, source_kind='artifact', source_id=artifact.id,
                                      content_type='slide-deck', title=artifact.title, visibility='teachers')
        private = MaterialLibraryItems(owner_id=owner.id, source_kind='artifact', source_id='private-'+artifact.id,
                                       content_type='slide-deck', title='Private', visibility='private')
        db.session.add_all([shared, private])
        db.session.flush()
        snapshot.data = {**snapshot.data, 'readOnly': True, 'archived': True}
        db.session.flush()
        assert source_preview_href(viewer, item_for_user(viewer, shared.id), share_snapshot=True).startswith('/teacher/artifacts/')
        assert artifact_capabilities(artifact, owner)['edit'] is False
        assert artifact_capabilities(artifact, viewer)['publishToCourse'] is False
        ids = {item['id'] for item in library_courses(viewer)}
        assert editable.dojo_id in ids and snapshot.dojo_id not in ids
        sources = list_sources(viewer)['sources']
        assert all(item['courseId'] != snapshot.dojo_id for item in sources)
        listed = list_items(viewer)['items']
        assert any(item['id'] == shared.id for item in listed)
        assert all('construction' not in item for item in listed)
        for user, item in ((viewer, private), (student, shared)):
            try:
                item_for_user(user, item.id)
            except ScopeError:
                pass
            else:
                raise AssertionError('Private material or non-teacher access was granted')
    finally:
        db.session.rollback()
