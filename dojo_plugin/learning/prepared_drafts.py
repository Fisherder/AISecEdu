import datetime
import hashlib
import json
from pathlib import Path

from CTFd.models import db

from ..authoring_standards import bind_constraints
from ..models import DojoChallenges, LearningAuditEvents, LearningChallengeProfiles

ROOT = Path('/var/agent-runtime/generated/prepared-drafts')


def package_digest(root):
    digest = hashlib.sha256()
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError('题包不能包含符号链接')
        if path.is_file() and path.name != 'runtime-qa.json' and '__pycache__' not in path.parts and path.suffix != '.pyc':
            digest.update(str(path.relative_to(root)).encode() + b'\0' + path.read_bytes())
    return digest.hexdigest()


def runtime_challenge(draft):
    metadata = (draft.spec or {}).get('preparedRuntime') or {}
    challenge = DojoChallenges.query.filter_by(dojo_id=draft.dojo_id, challenge_id=metadata.get('challengeId')).first()
    if not challenge or (challenge.data or {}).get('prepared_draft') != draft.id:
        return None
    return challenge


def runtime_view(draft):
    challenge = runtime_challenge(draft)
    return {'available': bool(challenge), 'studentVisible': draft.status == 'PUBLISHED', 'workspaceUrl': '/workspace?service=code', 'message': '教师试运行与正式题共用题包；发布前学生不可访问。' if challenge else '运行题包尚未验收。'}


def validate_prepared(draft, actor):
    if not draft.dojo.is_admin(actor):
        raise PermissionError('只有本课程教师可以操作草稿')
    challenge = runtime_challenge(draft)
    metadata = (draft.spec or {}).get('preparedRuntime') or {}
    root = Path(str(metadata.get('packagePath') or '')).resolve()
    if not challenge or not root.is_relative_to(ROOT) or not root.is_dir() or str(challenge.path.resolve()) != str(root):
        raise ValueError('草稿运行题包不存在或归属不一致')
    if draft.module_index != challenge.module_index:
        raise ValueError('草稿单元已变化，需要重新配置运行题包')
    attestation = json.loads((root / 'runtime-qa.json').read_text())
    actual = package_digest(root)
    if actual != metadata.get('packageDigest') or actual != attestation.get('packageDigest'):
        raise ValueError('题包已改变，需要重新执行环境验收')
    if not attestation.get('passed') or not all(attestation.get(name) for name in ('starterRejected', 'referencePassed', 'studentUserVerified', 'workPreserved')):
        raise ValueError('题包未通过完整运行验收')
    current = bind_constraints(draft.dojo, draft.constraints, assignment_id=(draft.spec or {}).get('id'), spec=draft.spec)['authoringStandards']
    from ..authoring_standards.runtime import draft_checks
    checks = draft_checks(draft, draft.spec, current)
    if any(row.get('status') not in ('PASS', 'WARN') for row in checks):
        raise ValueError('出题规范检查未通过：'+json.dumps(checks, ensure_ascii=False))
    report = {'status': 'PASS', 'packageDigest': actual, 'validatedAt': datetime.datetime.utcnow().isoformat()+'Z', 'authoringStandards': current, 'checks': [{'name':'真实运行验收','status':'PASS','message':f"初始版本失败、参考实现通过、普通用户运行及代码保留已验证；正式检查 {attestation['formalChecks']} 项。"},{'name':'题包及规范一致性','status':'PASS','message':'已复核当前文件摘要、课程、单元与出题规范。'}]}
    report['checks'].extend(checks)
    draft.validation = report
    draft.updated = datetime.datetime.utcnow()
    db.session.add(LearningAuditEvents(actor_id=actor.id, action='authoring.draft.runtime.validate', resource_type='learning_draft',resource_id=draft.id,outcome='ALLOW',details={'packageDigest':actual,'studentVisible':False}))
    return report


def promote_prepared(draft, actor):
    prior = (draft.validation or {}).get('authoringStandards', {}).get('digest')
    current = bind_constraints(draft.dojo, draft.constraints, assignment_id=(draft.spec or {}).get('id'), spec=draft.spec)['authoringStandards']['digest']
    if not prior or prior != current:
        raise ValueError('规范已变化，请先复验草稿')
    validate_prepared(draft, actor)
    challenge = runtime_challenge(draft)
    from ..authoring_standards.runtime import lock_coding_publication
    lock_coding_publication(draft, draft.validation['authoringStandards'])
    challenge.name = draft.spec['name']
    challenge.description = draft.spec['description']
    challenge.required = True
    challenge.visibility = None
    challenge.challenge.state = 'visible'
    challenge.data = {**challenge.data, 'publication_state':'PUBLISHED'}
    profile = LearningChallengeProfiles.query.get(challenge.challenge_id)
    profile.status = 'PUBLISHED';profile.published = datetime.datetime.utcnow();profile.validation = draft.validation
    draft.status = 'PUBLISHED';draft.published_challenge_id = challenge.challenge_id
    db.session.add(LearningAuditEvents(actor_id=actor.id,action='authoring.publish',resource_type='dojo_challenge',resource_id=challenge.reference_id,outcome='ALLOW',details={'draftId':draft.id,'packageDigest':draft.validation['packageDigest'],'sameRuntimeIdentity':True}))
    return challenge


def remove_runtime(draft):
    challenge = runtime_challenge(draft)
    if challenge:
        db.session.delete(challenge.challenge)


def register_trial_completion(app):
    from flask import request, jsonify
    from CTFd.utils.user import get_current_user
    from ..utils.dojo import get_current_dojo_challenge

    @app.before_request
    def prepared_trial_completion():
        if request.path != '/api/v1/challenges/attempt' or request.method != 'POST':
            return None
        user = get_current_user()
        if not user:
            return None
        challenge = get_current_dojo_challenge(user)
        if not challenge or (challenge.data or {}).get('publication_state') != 'DRAFT' or not challenge.dojo.is_admin(user):
            return None
        data = request.get_json(silent=True) or {}
        if str(data.get('challenge_id')) != str(challenge.challenge_id):
            return None
        from ..utils import unserialize_user_flag
        from itsdangerous import BadSignature
        try:
            account_id, challenge_id = unserialize_user_flag(str(data.get('submission') or ''))
            correct = account_id == user.account_id and challenge_id == challenge.challenge_id
        except BadSignature:
            correct = False
        if correct:
            from ..lab_environments import collect_coding_evidence
            collect_coding_evidence(user)
            db.session.add(LearningAuditEvents(actor_id=user.id,action='authoring.draft.runtime.complete',resource_type='learning_draft',resource_id=challenge.data['prepared_draft'],outcome='ALLOW',details={'challengeId':challenge.challenge_id,'trialOnly':True}))
            db.session.commit()
        return jsonify({'success':True,'data':{'status':'correct' if correct else 'incorrect','message':'草稿试运行核验成功，未发布且不计入学生成绩。' if correct else '完成凭证不正确。'}})
