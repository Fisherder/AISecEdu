import inspect
from types import SimpleNamespace
from unittest.mock import patch

from CTFd import create_app
from CTFd.models import Users, db

app = create_app()
with app.app_context():
    from CTFd.plugins.dojo_plugin.api.v1 import teaching
    from CTFd.plugins.dojo_plugin.agent_runtime.artifacts import artifact_for_user
    from CTFd.plugins.dojo_plugin.agent_runtime.scope import AccessScope, ScopeError

    teacher = Users.query.filter_by(name='teacher').one()
    project_id = 'artifact_594e01b1d34745f9afe267a14fa5b8cf'
    project = artifact_for_user(project_id, teacher)
    assert project.dojo_id is None
    before = (project.current_revision, project.status, project.updated)
    stranger = SimpleNamespace(id=-2147483648, type='user')
    for function in [lambda: artifact_for_user(project_id, stranger), lambda: teaching._require_teacher(stranger), lambda: teaching._lesson_artifact('artifact_3bb5c4d3bb1b4d12916988ddb6fa1f7e', teacher, AccessScope(teacher.id,'teacher'))]:
        try: function()
        except ScopeError: pass
        else: raise AssertionError('Private project scope escaped')

    method = inspect.unwrap(teaching.ArtifactCourseBinding.post)
    for payload, expected in [
        ({'expectedRevision':0,'dojoId':813426961,'moduleIndex':0},409),
        ({'expectedRevision':before[0],'dojoId':813426961,'moduleIndex':999999},400),
        ({'expectedRevision':before[0],'dojoId':813426961,'moduleIndex':0},200),
    ]:
        savepoint = db.session.begin_nested()
        with app.test_request_context('/pwncollege_api/v1/teaching/artifacts/'+project_id+'/course',method='POST',json=payload), patch.object(teaching,'_current_user',return_value=teacher), patch.object(db.session,'commit',side_effect=db.session.flush), patch.object(db.session,'rollback'):
            result,status = method(teaching.ArtifactCourseBinding(), project_id)
            assert status == expected, (status,result)
            if status == 200:
                assert project.dojo_id == 813426961 and project.module_index == 0 and project.status != 'PUBLISHED'
        savepoint.rollback()
        db.session.expire_all()
    restored = artifact_for_user(project_id,teacher)
    assert restored.dojo_id is None and (restored.current_revision,restored.status,restored.updated) == before
    print('PASS: other users denied; project scope cannot load course artifacts; revision conflict and invalid module rejected; course binding works without publication; all binding test changes rolled back')
