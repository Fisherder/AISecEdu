from functools import wraps
import json

from flask import request, session
from flask_restx import Namespace, Resource
from CTFd.models import db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user
from CTFd.utils.security.signing import hmac

from ... import construction as center
from ...agent_runtime.scope import ScopeError
from ...material_library import LibraryConflict

construction_namespace = Namespace('construction', description='课程素材团队建设任务中心')


def body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise ValueError('请求内容必须为对象。')
    return value


def submission_body():
    if request.mimetype != 'multipart/form-data':
        return body(), None
    raw = request.form.get('submission', '')
    if len(raw.encode('utf-8')) > 100000:
        raise ValueError('提交说明不得超过 100 KB。')
    try:
        value = json.loads(raw)
    except (ValueError, TypeError):
        raise ValueError('提交内容格式无效。') from None
    if not isinstance(value, dict) or value.get('source') != {'kind': 'file'}:
        raise ValueError('文件提交的内容格式无效。')
    return value, request.files.getlist('files')


def query_integer(name, default=None):
    raw = request.args.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except (ValueError, TypeError):
        raise ValueError('项目筛选条件格式无效。') from None


def endpoint(function):
    @wraps(function)
    @authed_only
    def decorated(*args, **kwargs):
        try:
            user = get_current_user()
            result = function(*args, user=user, **kwargs)
            if request.method != 'GET':
                db.session.commit()
                session["hash"] = hmac(user.password)
            return {'success': True, 'data': result}, 200
        except (ScopeError, LibraryConflict, ValueError, KeyError, TypeError) as exc:
            db.session.rollback()
            status = 404 if isinstance(exc, ScopeError) else 409 if isinstance(exc, LibraryConflict) else 400
            message = '填写内容不完整或格式无效。' if isinstance(exc, (KeyError, TypeError)) else str(exc)
            return {'success': False, 'error': {'message': message, 'code': 'CONSTRUCTION_ERROR'}}, status
        except Exception:
            db.session.rollback()
            raise
    return decorated


@construction_namespace.route('/context')
class Context(Resource):
    @endpoint
    def get(self, *, user):
        return center.context(user, request.args.get('batchId'))


@construction_namespace.route('/courses/<string:course_id>')
class Course(Resource):
    @endpoint
    def patch(self, course_id, *, user):
        return center.save_course(user, course_id, body())


@construction_namespace.route('/courses/<string:course_id>/tasks')
class Tasks(Resource):
    @endpoint
    def post(self, course_id, *, user):
        return center.save_task(user, course_id, body())


@construction_namespace.route('/tasks/<string:task_id>')
class Task(Resource):
    @endpoint
    def get(self, task_id, *, user):
        return center.detail(user, task_id)

    @endpoint
    def patch(self, task_id, *, user):
        task, course, _, _ = center.task_access(user, task_id)
        return center.save_task(user, course.id, body(), task.id)


@construction_namespace.route('/tasks/<string:task_id>/<string:action>')
class TaskAction(Resource):
    @endpoint
    def get(self, task_id, action, *, user):
        if action == 'create-context':
            return center.creation_context(user, task_id)
        if action == 'submission-options':
            return center.submission_options(user, task_id)
        if action == 'submission-sources':
            return center.submission_sources(user, task_id, kind=request.args.get('kind', 'artifact'),
                                              course_id=query_integer('courseId'), search=request.args.get('q', ''),
                                              content_type=request.args.get('type', ''),
                                              offset=query_integer('offset', 0), limit=query_integer('limit', 24))
        raise ScopeError('入口不存在。')

    @endpoint
    def post(self, task_id, action, *, user):
        if action == 'submit':
            value, files = submission_body()
            return center.submit(user, task_id, value, files=files)
        handlers = {'action': center.action, 'submit': center.submit, 'review': center.review, 'publish': center.publish}
        if action not in handlers:
            raise ScopeError('入口不存在。')
        return handlers[action](user, task_id, body())


@construction_namespace.route('/submissions/<string:submission_id>/preview')
class SubmissionPreview(Resource):
    @endpoint
    def post(self, submission_id, *, user):
        return center.native_preview(user, submission_id=submission_id)


@construction_namespace.route('/materials/<string:material_id>/preview')
class MaterialPreview(Resource):
    @endpoint
    def post(self, material_id, *, user):
        return center.native_preview(user, material_id=material_id)


@construction_namespace.route('/releases/<string:release_id>/revoke')
class Revoke(Resource):
    @endpoint
    def post(self, release_id, *, user):
        return center.revoke(user, release_id, body())


@construction_namespace.route('/batches/<string:batch_id>/activate')
class Activate(Resource):
    @endpoint
    def post(self, batch_id, *, user):
        return center.activate(user, batch_id, body())


@construction_namespace.route('/members/<string:member_id>')
class Member(Resource):
    @endpoint
    def patch(self, member_id, *, user):
        return center.edit_member(user, member_id, body())


@construction_namespace.route('/courses/<string:course_id>/accept-chapter')
class Chapter(Resource):
    @endpoint
    def post(self, course_id, *, user):
        return center.chapter_accept(user, course_id, body())


@construction_namespace.route('/notices/<string:notice_id>')
class Notice(Resource):
    @endpoint
    def patch(self, notice_id, *, user):
        return center.resolve_notice(user, notice_id, body())


@construction_namespace.route('/report')
class Report(Resource):
    @endpoint
    def get(self, *, user):
        return center.report(user, request.args.get('batchId'))


@construction_namespace.route('/batches/<string:batch_id>')
class Batch(Resource):
    @endpoint
    def patch(self, batch_id, *, user):
        return center.edit_batch(user, batch_id, body())
