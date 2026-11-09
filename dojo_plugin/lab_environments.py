import json
import re
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

# Prepared labs may provide check/submit directly without the snapshot utility.
_PREPARED_HEALTH_PROGRAM = r'''
import json,os,sys,tempfile
from pathlib import Path
m=json.loads(sys.argv[1]);checks=[]
for key in ('compiler','debugger','python'):
    if m.get(key):
        wrapper='/challenge/bin/'+Path(m[key]).name
        path=wrapper if os.access(wrapper,os.X_OK) else m[key]
        checks.append({'name':key,'passed':os.access(path,os.X_OK),'output':path})
for command in ('check','submit'):
    path='/challenge/'+command
    checks.append({'name':command,'passed':os.access(path,os.X_OK),'output':path})
workspace=Path(m['workspace'])
try:
    with tempfile.TemporaryFile(dir=workspace) as f:
        f.write(b'health-check');f.flush()
    writable=True
except OSError:
    writable=False
checks.append({'name':'persistent workspace','passed':writable,'output':str(workspace)})
ready=all(c['passed'] for c in checks)
print(json.dumps({'success':ready,'ready':ready,'checks':checks}))
'''

def _structured_checks(output):
    checks = []
    declared = None
    for line in output.splitlines():
        match = re.match(r'^\[(PASS|ENVIRONMENT|COMPILE|TIMEOUT|RUNTIME|TEST)\] (.+)$', line)
        if match:
            category, name = match.groups()
            component = 'main' if name.startswith('主实现：') else 'student-tests' if name.startswith('自编测试：') else None
            for title, key in [('无界复制', 'unbounded'), ('没有结尾', 'termination'), ('意外截断', 'truncation'), ('差一错误', 'off_by_one')]:
                if name.startswith('修正练习 / ' + title + '：'):
                    component = 'repair.' + key
            checks.append({'id': 'output-' + str(len(checks) + 1), 'name': name, 'category': category,
                           'passed': category == 'PASS', 'component': component, 'feedback': ''})
        elif line.startswith('  ') and checks:
            checks[-1]['feedback'] = (checks[-1]['feedback'] + '\n' + line[2:]).strip()[:4000]
        else:
            total = re.match(r'^通过 (\d+) / (\d+) 项', line)
            if total:
                declared = {'passed': int(total[1]), 'total': int(total[2])}
    summary = {'total': len(checks), 'passed': sum(row['passed'] for row in checks),
               'failed': sum(not row['passed'] for row in checks), 'unknown': 0,
               'complete': declared is not None and declared['total'] == len(checks)}
    return {'tests': checks, 'summary': summary,
            'checkEvidence': {'source': 'grader-output', 'verifiedReceipt': False, 'declaredSummary': declared}}


_CHECK_RECEIPT_PROGRAM = r'''
import hashlib,hmac,json,os,stat,subprocess,sys,time
from pathlib import Path

def demote():
    os.setgroups([])
    os.setgid(1000)
    os.setuid(1000)

code = """import json,os,stat,sys
from pathlib import Path
root=Path(json.loads(Path('/etc/aisecedu-lab.json').read_text())['workspace'])/'evidence'
fd=os.open(root/sys.argv[1],os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
with os.fdopen(fd,'rb') as stream:
 info=os.fstat(stream.fileno())
 if not stat.S_ISREG(info.st_mode) or info.st_size>1000000:raise ValueError('Invalid receipt')
 print(stream.read(1000001).decode())
"""
try:
    mode = sys.argv[1]
    if mode not in ('self-test','formal'): raise ValueError('Invalid mode')
    manifest = json.loads(Path('/etc/aisecedu-lab.json').read_text())
    process = subprocess.run(['/usr/local/bin/python3','-I','-c',code,'self-test.json' if mode=='self-test' else 'formal-receipt.json'],preexec_fn=demote,capture_output=True,timeout=4)
    if process.returncode: raise ValueError('No receipt')
    receipt = json.loads(process.stdout)
    payload = receipt['payload']
    encoded = json.dumps(payload,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()
    key = Path('/etc/secure-coding-receipt.key').read_bytes()
    binding = hmac.new(key,Path('/flag').read_bytes(),hashlib.sha256).hexdigest()
    if not hmac.compare_digest(hmac.new(key,encoded,hashlib.sha256).hexdigest(),receipt['signature']):raise ValueError('Invalid signature')
    if receipt['id']!=hashlib.sha256(encoded).hexdigest() or payload['contextBinding']!=binding:raise ValueError('Invalid binding')
    if payload['mode']!=mode or payload['task']!='secure-copy-homework1' or payload['testVersion']!=manifest['testVersion']:raise ValueError('Invalid scope')
    if not float(sys.argv[2]) <= float(payload['startedAt']) <= float(payload['finishedAt']) <= time.time()+1:raise ValueError('Stale receipt')
    rows=payload['results']
    if not isinstance(rows,list) or any(not isinstance(row,dict) or not isinstance(row.get('passed'),bool) for row in rows):raise ValueError('Invalid results')
    allowed={'id','name','category','passed','component','group','feedback','input','criterion'}
    tests=[{k:v for k,v in row.items() if k in allowed} for row in rows]
    for row in tests:
        if isinstance(row.get('input'),dict) and isinstance(row['input'].get('capacity'),int):row['input']['capacityText']=str(row['input']['capacity'])
    print(json.dumps({'tests':tests,'summary':{'total':len(rows),'passed':sum(row['passed'] for row in rows),'failed':sum(not row['passed'] for row in rows),'unknown':0,'complete':True},'checkEvidence':{'source':'signed-receipt','verifiedReceipt':True,'mode':mode,'receiptId':receipt['id'],'startedAt':payload['startedAt'],'finishedAt':payload['finishedAt'],'sourceSha256':payload['sourceSha256'],'submissionSha256':payload.get('submissionSha256'),'testVersion':payload['testVersion']}}))
except (OSError,ValueError,KeyError,TypeError,subprocess.TimeoutExpired):
    print('{}')
'''


def _check_snapshot(container, manifest, operation, started_at, output):
    fallback = _structured_checks(output)
    if manifest.get('taskId') != 'secure-copy-homework1':
        return fallback
    try:
        response = container.exec_run(['/usr/bin/timeout', '7', '/usr/local/bin/python3', '-I', '-c',
                                       _CHECK_RECEIPT_PROGRAM, 'formal' if operation == 'submit' else 'self-test', str(started_at)], user='0')
        if response.exit_code or len(response.output) > 1000000:
            return fallback
        snapshot = json.loads(response.output)
        if snapshot.get('checkEvidence', {}).get('verifiedReceipt') is True:
            return snapshot
    except Exception:
        pass
    return fallback


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
            started_at = time.time()
            if operation in {'check', 'submit'}:
                command = ['/usr/bin/timeout', '210', '/challenge/' + operation, manifest['workspace'] + '/' + manifest['studentSource']]
            else:
                command = ['/usr/bin/timeout', '30', '/opt/aisecedu/bin/labctl', operation if operation != 'sync' else 'history']
                if operation == 'health' and container.exec_run(['/usr/bin/test', '-x', '/opt/aisecedu/bin/labctl'], user='1000').exit_code != 0:
                    command = ['/usr/bin/timeout', '30', '/usr/local/bin/python3', '-I', '-c', _PREPARED_HEALTH_PROGRAM, json.dumps(manifest)]
                if operation == 'restore':
                    command += ['--id', str(data.get('id') or '')]
                if operation in {'restore', 'reset'} and data.get('apply') is True:
                    command.append('--apply')
            executed = container.exec_run(command, user='1000')
            output = executed.output.decode('utf-8', 'replace')[-30000:]
            if operation in {'check', 'submit'}:
                category = 'PASS' if executed.exit_code == 0 else 'ENVIRONMENT' if executed.exit_code == 70 else 'TIMEOUT' if executed.exit_code == 124 else next((name for name in ('ENVIRONMENT', 'COMPILE', 'TIMEOUT', 'RUNTIME', 'TEST') if '[' + name + ']' in output), 'TEST')
                result = {'exitCode': executed.exit_code, 'output': output, 'category': category}
                result.update(_check_snapshot(container, manifest, operation, started_at, output))
                if manifest.get('taskId') == 'secure-copy-homework1':
                    from .lab_boundary_observations import observe_safe_copy_boundary
                    result['visualCases'] = observe_safe_copy_boundary(container, manifest)
                    source_hash = result.get('checkEvidence', {}).get('sourceSha256')
                    observation_hash = (result.get('visualCases') or {}).get('sourceSha256')
                    if result['visualCases'] is not None:
                        result['visualCases']['sourceMatchesChecks'] = source_hash == observation_hash if source_hash and observation_hash else None
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
