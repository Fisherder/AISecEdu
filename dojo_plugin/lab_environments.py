import json
import time

from flask import abort, request, render_template
from flask_restx import Resource
from sqlalchemy import text
from CTFd.models import db
from CTFd.utils.decorators import authed_only
from CTFd.utils.user import get_current_user

from .agent_runtime.scope import dojo_for_user, ScopeError
from .models import LearningAuditEvents, LearningAttempts, DojoChallenges
from .utils import get_current_container
from .learning.evidence import append_evidence

ACTION = 'coding.submission.verified'
SUPPORTED_TASKS = {'secure-copy-homework1', 'hw02-bounds-check', 'hw03-safe-sprintf', 'lab03-shellcode-layout', 'lab04-ftp-fuzz', 'lab05-exception-dispatch', 'lab06-format-audit', 'lab07-sql-injection'}

def lab_context(user):
    container = get_current_container(user)
    if not container:
        return None, None, None
    result = container.exec_run(['/bin/cat', '/etc/aisecedu-lab.json'], user='0')
    if result.exit_code or len(result.output) > 16000:
        return None, None, None
    try:
        manifest = json.loads(result.output)
        dojo = dojo_for_user(user, container.labels.get('dojo.dojo_id'))
        module = next(m for m in dojo.modules if m.id == container.labels.get('dojo.module_id'))
        challenge = DojoChallenges.query.filter_by(dojo_id=dojo.dojo_id, id=container.labels.get('dojo.challenge_id'), module_index=module.module_index).one_or_none()
    except (ValueError, StopIteration, ScopeError):
        return None, None, None
    if manifest.get('taskId') not in SUPPORTED_TASKS or challenge is None or not (challenge.challenge_id == 1508 or ((challenge.data or {}).get('prepared_draft') and manifest.get('taskId') == challenge.id)):
        return None, None, None
    return container, manifest, challenge

def collect_coding_evidence(user, container=None, challenge=None):
    if container is None or challenge is None or (challenge.challenge_id != 1508 and not (challenge.data or {}).get('prepared_draft')):
        container, manifest, challenge = lab_context(user)
    if container is None:
        return []
    if not db.session.execute(text('SELECT pg_try_advisory_xact_lock(166712, :uid)'), {'uid': user.id}).scalar():
        return []
    response = container.exec_run(['/usr/bin/timeout', '12', '/usr/local/bin/python3', '-I', '/challenge/export_evidence.py'], user='0')
    if response.exit_code or len(response.output) > 30 * 1024 * 1024:
        return []
    receipts = json.loads(response.output).get('receipts', [])
    saved = []
    for receipt in receipts:
        identity = f'{user.id}:{challenge.dojo_id}:{challenge.challenge_id}:{receipt["id"]}'
        if LearningAuditEvents.query.filter_by(action=ACTION, resource_id=identity).first():
            continue
        payload = receipt['payload']
        attempt = LearningAttempts.query.filter_by(user_id=user.id, dojo_id=challenge.dojo_id, challenge_id=challenge.challenge_id).order_by(LearningAttempts.started.desc()).first()
        details = {'attemptId': attempt.id if attempt else None, 'dojoId': challenge.dojo_id, 'challengeId': challenge.challenge_id, 'userId': user.id, 'receipt': receipt, 'containerImageId': container.image.id, 'trialOnly': (challenge.data or {}).get('publication_state') == 'DRAFT'}
        db.session.add(LearningAuditEvents(actor_id=user.id, action=ACTION, resource_type='coding_submission', resource_id=identity, outcome='ALLOW', details=details))
        attempt = LearningAttempts.query.filter_by(user_id=user.id, dojo_id=challenge.dojo_id, challenge_id=challenge.challenge_id).order_by(LearningAttempts.started.desc()).first()
        if attempt:
            append_evidence(attempt, 'coding.submission.verified', {'receiptId': receipt['id'], 'sourceSha256': payload['sourceSha256'], 'templateVersion': payload['templateVersion'], 'testVersion': payload['testVersion'], 'passed': payload['passed'], 'checks': len(payload['results'])}, source='GRADER', trust_level=4)
        db.session.flush()
        event = LearningAuditEvents.query.filter_by(action=ACTION,resource_id=identity).one()
        from .coding_grading import supported, enqueue_review, update_attempt
        if supported(event):
            enqueue_review(event)
            update_attempt(event)
        saved.append(receipt['id'])
    db.session.flush()
    return saved

def register_api(namespace):
    @namespace.route('/environment')
    class Environment(Resource):
        @authed_only
        def get(self):
            user = get_current_user()
            container, manifest, challenge = lab_context(user)
            return {'success': True, 'supported': container is not None, 'manifest': manifest, 'dojoId': challenge.dojo_id if challenge else None, 'challengeId': challenge.challenge_id if challenge else None}

        @authed_only
        def post(self):
            user = get_current_user()
            data = request.get_json(silent=True) or {}
            operation = data.get('operation')
            if operation not in {'health', 'snapshot', 'history', 'restore', 'check', 'submit', 'sync', 'reset'}:
                abort(400)
            locked = db.session.execute(text('SELECT pg_try_advisory_xact_lock(166712, :uid)'), {'uid': user.id}).scalar()
            if not locked:
                return {'success': False, 'error': '本账号有操作进行中，请稍后重试。'}, 409
            container, manifest, challenge = lab_context(user)
            if not container:
                return {'success': False, 'error': '请先启动已升级的安全编码实验。'}, 409
            if operation == 'reset':
                expected = {'challengeId': challenge.challenge_id, 'taskId': manifest['taskId'], 'templateVersion': manifest['templateVersion']}
                if any(key in data and data[key] != value for key, value in expected.items()):
                    return {'success': False, 'error': '当前题目或环境版本已变化，请重新预览重置范围。'}, 409
            started = time.monotonic()
            if operation in {'check', 'submit'}:
                command = ['/usr/bin/timeout', '210', '/challenge/' + operation, manifest['workspace'] + '/' + manifest['studentSource']]
            else:
                command = ['/usr/bin/timeout', '30', '/opt/aisecedu/bin/labctl', operation if operation != 'sync' else 'history']
                if operation == 'restore':
                    command += ['--id', str(data.get('id') or '')]
                if operation in {'restore', 'reset'} and data.get('apply') is True:
                    command.append('--apply')
            executed = container.exec_run(command, user='1000')
            output = executed.output.decode('utf-8', 'replace')[-30000:]
            if operation in {'check', 'submit'}:
                category = 'PASS' if executed.exit_code == 0 else 'ENVIRONMENT' if executed.exit_code == 70 else 'TIMEOUT' if executed.exit_code == 124 else next((name for name in ('ENVIRONMENT', 'COMPILE', 'TIMEOUT', 'RUNTIME', 'TEST') if '[' + name + ']' in output), 'TEST')
                result = {'exitCode': executed.exit_code, 'output': output, 'category': category}
            else:
                try:
                    result = json.loads(output)
                except ValueError:
                    result = {'success': False, 'category': 'ENVIRONMENT', 'error': '环境操作未完成，请运行环境检查。'}
            imported = collect_coding_evidence(user, container, challenge)
            duration = round(time.monotonic() - started, 3)
            db.session.add(LearningAuditEvents(actor_id=user.id, action='coding.environment.operation', resource_type='workspace_runtime', resource_id=str(user.id), outcome='ALLOW' if executed.exit_code == 0 else 'ERROR', details={'dojoId': challenge.dojo_id, 'operation': operation, 'elapsedSeconds': duration, 'exitCode': executed.exit_code, 'templateVersion': manifest['templateVersion']}))
            db.session.commit()
            return {'success': True, 'result': result, 'imported': len(imported), 'elapsedSeconds': duration}

    @namespace.route('/environment/submissions')
    class EnvironmentSubmissions(Resource):
        @authed_only
        def get(self):
            user = get_current_user()
            course = request.args.get('dojo')
            query = LearningAuditEvents.query.filter_by(action=ACTION)
            if course:
                try:
                    dojo = dojo_for_user(user, course, teacher=True)
                except ScopeError:
                    abort(404)
                query = query.filter(LearningAuditEvents.details['dojoId'].astext == str(dojo.dojo_id))
            else:
                query = query.filter_by(actor_id=user.id)
            identity = request.args.get('id')
            if identity:
                if not identity.isdigit():
                    abort(400)
                query = query.filter_by(id=int(identity))
            rows = query.order_by(LearningAuditEvents.created.desc()).limit(100).all()
            result = []
            for row in rows:
                receipt = row.details['receipt']
                payload = dict(receipt['payload'])
                payload.pop('stageCredentials',None)
                from .coding_grading import grade_view
                payload['gradingView'] = grade_view(row)
                if not identity:
                    payload.pop('source', None)
                    payload.pop('results', None)
                    payload.pop('sources', None)
                result.append({'id': row.id, 'student': row.actor.name if row.actor else '已删除账号', 'verified': True, 'trialOnly': bool(row.details.get('trialOnly')), 'receiptId': receipt['id'], **payload})
            return {'success': True, 'submissions': result}

    @namespace.route('/environment/flags')
    class StageFlag(Resource):
        @authed_only
        def post(self):
            user=get_current_user();body=request.get_json(silent=True) or {}
            try:
                from .coding_grading import accept_flag
                result=accept_flag(user,body.get('challengeId',0),str(body.get('submission') or '').strip())
                db.session.commit()
                return {'success':True,'data':result}
            except (ValueError,TypeError) as error:
                db.session.rollback()
                return {'success':False,'error':str(error)},400

    @namespace.route('/environment/reviews')
    class CodingReview(Resource):
        @authed_only
        def post(self):
            user=get_current_user();body=request.get_json(silent=True) or {}
            identity=str(body.get('id') or '')
            if not identity.isdigit():abort(400)
            event=LearningAuditEvents.query.filter_by(id=int(identity),action=ACTION).first()
            if not event:abort(404)
            from .coding_grading import confirm_review,enqueue_review,review_job,supported
            if not supported(event):abort(409)
            operation=body.get('operation')
            if operation=='confirm':
                if event.actor_id==user.id:abort(403)
                if 'score' in body:return {'success':False,'error':'复核意见不变更分值，分数按 80+5×完成题数计算。'},400
                try:dojo_for_user(user,event.details['dojoId'],teacher=True)
                except ScopeError:abort(404)
                try:confirm_review(event,user,0,body.get('reason',''))
                except ValueError as error:return {'success':False,'error':str(error)},400
            elif operation=='retry':
                if event.actor_id!=user.id:
                    try:dojo_for_user(user,event.details['dojoId'],teacher=True)
                    except ScopeError:abort(404)
                job=review_job(event)
                if job and job.status in ('FAILED','CANCELED'):
                    from .agent_runtime.jobs import retry_job
                    retry_job(job,event.actor_id,'coding-review-manual-'+str(job.attempt_count))
                elif not job:enqueue_review(event)
            else:abort(400)
            db.session.commit()
            return {'success':True}

def register_pages(blueprint):
    @blueprint.route('/workspace/instructions')
    @authed_only
    def instructions_page():
        from .utils import render_markdown
        import bleach
        container, manifest, challenge = lab_context(get_current_user())
        if container is None: abort(409, description='请先启动安全编码题目，再打开作业说明。')
        name = request.args.get('file', '作业说明.md')
        if name not in ('作业说明.md', 'README.md'): abort(404)
        path = manifest['workspace'] + '/' + name
        program = "from pathlib import Path;import sys;p=Path(sys.argv[1]);assert p.is_file() and not p.is_symlink() and p.stat().st_size<1048576;print(p.read_text())"
        response = container.exec_run(['/run/dojo/bin/python3','-I','-c',program,path], user='1000')
        if response.exit_code: abort(404)
        html = bleach.clean(str(render_markdown(response.output.decode('utf-8'))), tags=['h1','h2','h3','h4','p','br','hr','blockquote','strong','em','code','pre','a','ul','ol','li','table','thead','tbody','tr','th','td'], attributes={'a':['href','title']}, protocols=['http','https'], strip=True)
        return render_template('assignment_instructions.html', instruction_html=html, instruction_name=name, instruction_title=challenge.name)

    @blueprint.route('/workspace/environment')
    @authed_only
    def environment_page():
        course = request.args.get('dojo')
        if course:
            try:
                dojo_for_user(get_current_user(), course, teacher=True)
            except ScopeError:
                abort(404)
        return render_template('lab_environment.html', environment_teacher=bool(course))


def coding_workspace_folder(user):
    container, manifest, challenge = lab_context(user)
    return manifest['workspace'] if container else '/challenge'
