from __future__ import annotations

import datetime

from sqlalchemy import func

from CTFd.models import db

from ..models import (
    DojoModules, Dojos, LearningDrafts, ObjectiveMappings, SelfLearningWorkspaces,
    TeachingArtifactRevisions, TeachingArtifacts, TeachingMaterials,
    TeachingMaterialRevisions, TeachingSessionEvents, TeachingSessions,
)
from .artifacts import content_hash
from .scope import ScopeError


class ApprovedActionError(ValueError):
    def __init__(self, message, code, status=409):
        super().__init__(message)
        self.code = code
        self.status = status


def _prepare_question(context):
    action = context['action']
    draft = LearningDrafts.query.filter_by(
        id=context['initialResult'].get('draftId'), author_id=action.actor_id,
        dojo_id=context['dojoId'],
    ).with_for_update().populate_existing().first()
    if draft is None or (draft.validation or {}).get('status') != 'PASS':
        raise ApprovedActionError('实践题尚未通过发布检查。', 'VALIDATION_REQUIRED')
    DojoModules.query.filter_by(dojo_id=draft.dojo_id, module_index=draft.module_index).with_for_update().populate_existing().one()
    context['draft'] = draft


def _prepare_material(context):
    action = context['action']
    material = TeachingMaterials.query.filter_by(
        id=action.target_id, owner_id=action.actor_id, dojo_id=context['dojoId'],
    ).with_for_update().populate_existing().first()
    if material is None:
        raise ScopeError('Material not found')
    request = action.request_json or {}
    revision = TeachingMaterialRevisions.query.filter_by(
        id=request.get('materialRevisionId'), material_id=material.id,
    ).populate_existing().first()
    chapters = request.get('chapters') or []
    if revision is None or content_hash(chapters) != request.get('chaptersHash'):
        raise ApprovedActionError('资料章节已变化，请重新提出导入请求。', 'REVISION_CONFLICT')
    if not isinstance(chapters, list) or any(not isinstance(chapter, dict) for chapter in chapters):
        raise ApprovedActionError('章节候选格式不正确。', 'INVALID_REQUEST')
    Dojos.query.filter_by(dojo_id=context['dojoId']).with_for_update().populate_existing().one()
    context.update(material=material, materialRevision=revision, chapters=chapters)


def _prepare_session(context):
    action = context['action']
    session = TeachingSessions.query.filter_by(
        id=action.target_id, dojo_id=context['dojoId'],
    ).with_for_update().populate_existing().first()
    if session is None:
        raise ScopeError('Teaching session not found')
    request = action.request_json or {}
    command = request.get('command')
    if session.status != request.get('expectedStatus'):
        raise ApprovedActionError('课堂状态已变化，请重新确认本次操作。', 'STATE_CONFLICT')
    if context['decision'] == 'APPROVED':
        if command == 'start' and session.status in {'READY', 'PAUSED'}:
            if not isinstance((session.state or {}).get('stage'), dict) or not (session.state or {}).get('scenes'):
                raise ApprovedActionError('课堂内容尚未就绪。', 'CLASSROOM_NOT_READY')
        elif command != 'end' or session.status != 'LIVE':
            raise ApprovedActionError('这项操作不适用于当前课堂状态。', 'STATE_CONFLICT')
    context.update(session=session, sessionCommand=command)


def _prepare_review(context):
    action = context['action']
    workspace = SelfLearningWorkspaces.query.filter_by(
        id=action.target_id, dojo_id=context['dojoId'], student_id=action.actor_id,
    ).with_for_update().populate_existing().first()
    if workspace is None:
        raise ScopeError('Self-learning workspace not found')
    if workspace.status != 'SUBMITTED':
        raise ApprovedActionError('成果已经处理或撤回，请查看最新提交。', 'STATE_CONFLICT')
    submitted = TeachingArtifacts.query.filter_by(
        id=workspace.submitted_artifact_id, self_workspace_id=workspace.id,
        owner_id=workspace.student_id, dojo_id=workspace.dojo_id,
    ).with_for_update().populate_existing().first()
    request = action.request_json or {}
    if submitted is None or submitted.id != request.get('artifactId') or submitted.current_revision != int(request.get('expectedRevision') or 0):
        raise ApprovedActionError('提交的成果已变化，请重新发起审核。', 'REVISION_CONFLICT')
    revision = TeachingArtifactRevisions.query.filter_by(
        artifact_id=submitted.id, revision=submitted.current_revision,
    ).populate_existing().first()
    if context['decision'] == 'APPROVED' and revision is None:
        raise ApprovedActionError('提交成果的内容版本不存在。', 'REVISION_CONFLICT')
    context.update(workspace=workspace, submitted=submitted, submittedRevision=revision)


def prepare_action(action, actor, decision='APPROVED', *, initial_result=None):
    from ..api.v1.teaching import _action_for_teacher

    _action_for_teacher(action, actor)
    if action.action_type not in ACTION_HANDLERS:
        raise ApprovedActionError('不支持这项批准操作。', 'UNSUPPORTED_ACTION')
    context = {'action': action, 'actor': actor, 'decision': decision,
               'dojoId': int((action.request_json or {}).get('dojoId')), 'artifact': None,
               'initialResult': dict(action.result or {}) if initial_result is None else dict(initial_result)}
    if action.action_type.startswith('publish-') and action.target_type != 'artifact':
        raise ScopeError('Artifact not found')
    if action.target_type == 'artifact':
        artifact = TeachingArtifacts.query.filter_by(
            id=action.target_id, dojo_id=context['dojoId'], owner_id=action.actor_id,
        ).with_for_update().populate_existing().first()
        if artifact is None:
            raise ScopeError('Artifact not found')
        expected = (action.request_json or {}).get('expectedRevision')
        if expected is None or artifact.current_revision != int(expected):
            raise ApprovedActionError('项目版本已变化，请重新提出发布请求。', 'REVISION_CONFLICT')
        if action.action_type.startswith('publish-') and artifact.status == 'PUBLISHED':
            raise ApprovedActionError('这个项目版本已经发布。', 'ALREADY_PUBLISHED')
        context['artifact'] = artifact
    prepare, _ = ACTION_HANDLERS[action.action_type]
    if prepare is not None:
        prepare(context)
    return context


def _publish_question(context, result):
    from ..learning.authoring import publish_draft

    artifact, draft = context['artifact'], context['draft']
    challenge = publish_draft(draft, context['actor'])
    if challenge is None:
        raise ApprovedActionError('实践题的发布身份不存在。', 'REVISION_CONFLICT')
    artifact.published_challenge_id = challenge.challenge_id
    artifact.status = 'PUBLISHED'
    artifact.published = datetime.datetime.utcnow()
    revision = TeachingArtifactRevisions.query.filter_by(
        artifact_id=artifact.id, revision=artifact.current_revision,
    ).first()
    if revision:
        revision.validation = {**(revision.validation or {}), 'status': 'PASS',
                               'publishedChallengeId': challenge.challenge_id}
    ObjectiveMappings.query.filter_by(
        dojo_id=artifact.dojo_id, module_index=artifact.module_index,
        target_type='challenge', target_id=str(challenge.challenge_id), active=True,
    ).update({'active': False}, synchronize_session=False)
    for index, objective in enumerate((draft.spec or {}).get('objectives') or [], 1):
        if isinstance(objective, dict):
            name = str(objective.get('name') or objective.get('title') or objective.get('objective') or f'目标 {index}')[:240]
            objective_id = str(objective.get('id') or f'objective-{index}')[:128]
            knowledge_point = objective.get('knowledgePointId')
            weight = float(objective.get('weight') or 1.0)
        else:
            name, objective_id, knowledge_point, weight = str(objective)[:240], f'objective-{index}', None, 1.0
        db.session.add(ObjectiveMappings(
            dojo_id=artifact.dojo_id, module_index=artifact.module_index,
            objective_id=objective_id, objective_name=name,
            knowledge_point_id=str(knowledge_point)[:128] if knowledge_point else None,
            target_type='challenge', target_id=str(challenge.challenge_id), weight=weight,
            rule={'completion': 'verified-solve'},
        ))
    result.update(publishedChallengeId=challenge.challenge_id, challengeReferenceId=challenge.reference_id)
    return challenge


def _publish_teaching(context, result):
    artifact = context['artifact']
    artifact.status = 'PUBLISHED'
    artifact.published = datetime.datetime.utcnow()
    result['publishedArtifactId'] = artifact.id


def _apply_material(context, result):
    from ..api.v1.teaching import _module_slug

    dojo_id, material, revision = context['dojoId'], context['material'], context['materialRevision']
    maximum = db.session.query(func.max(DojoModules.module_index)).filter_by(dojo_id=dojo_id).scalar()
    next_index = (maximum if maximum is not None else -1) + 1
    existing_ids = {row.id for row in DojoModules.query.filter_by(dojo_id=dojo_id).all()}
    applied = []
    for offset, chapter in enumerate(context['chapters']):
        module_index = next_index + offset
        base_slug = _module_slug(chapter.get('title'), f'material-{material.id[-8:]}-{module_index}')
        slug, suffix = base_slug, 2
        while slug in existing_ids:
            slug = f'{base_slug[:27]}-{suffix}'[:32]
            suffix += 1
        existing_ids.add(slug)
        module = DojoModules(
            dojo_id=dojo_id, module_index=module_index, id=slug,
            name=str(chapter.get('title') or slug)[:128],
            description=str(chapter.get('description') or '')[:8000],
            data={'importable': True, 'show_scoreboard': True, 'show_challenges': True,
                  'sourceMaterialId': material.id, 'sourceMaterialRevisionId': revision.id,
                  'sourceLocators': chapter.get('sourceLocators') or []},
        )
        db.session.add(module)
        for objective_index, objective in enumerate((chapter.get('objectives') or [])[:20], 1):
            if isinstance(objective, dict):
                name = str(objective.get('name') or objective.get('title') or objective.get('objective') or f'目标 {objective_index}')[:240]
                objective_id = str(objective.get('id') or f"material-{chapter.get('sourceIndex', offset)}-{objective_index}")[:128]
                knowledge_point = objective.get('knowledgePointId')
            else:
                name = str(objective)[:240]
                objective_id = f"material-{chapter.get('sourceIndex', offset)}-{objective_index}"[:128]
                knowledge_point = None
            db.session.add(ObjectiveMappings(
                dojo_id=dojo_id, module_index=module_index,
                objective_id=objective_id, objective_name=name,
                knowledge_point_id=str(knowledge_point)[:128] if knowledge_point else None,
                target_type='module', target_id=slug,
                rule={'source': 'material-analysis', 'materialId': material.id,
                      'materialRevisionId': revision.id},
            ))
        applied.append({'moduleIndex': module_index, 'moduleId': slug, 'title': module.name})
    result['modules'] = applied


def _apply_session(context, result):
    session, command, action = context['session'], context['sessionCommand'], context['action']
    now = datetime.datetime.utcnow()
    if command == 'start':
        session.status = 'LIVE'
        session.started = session.started or now
        event_type = 'session.started'
    else:
        session.status = 'ENDED'
        session.ended = now
        event_type = 'session.ended'
    sequence = (db.session.query(func.max(TeachingSessionEvents.sequence)).filter_by(session_id=session.id).scalar() or 0) + 1
    db.session.add(TeachingSessionEvents(
        session_id=session.id, sequence=sequence, actor_id=context['actor'].id,
        event_type=event_type, idempotency_key=f'approved-action:{action.id}',
        payload={'command': command, 'approvalActionId': action.id},
    ))
    result['sessionStatus'] = session.status


def _apply_review(context, result):
    workspace, submitted = context['workspace'], context['submitted']
    approved = context['decision'] == 'APPROVED'
    workspace.status = 'APPROVED' if approved else 'CHANGES_REQUESTED'
    submitted.status = 'APPROVED_PERSONAL' if approved else 'CHANGES_REQUESTED'
    workspace.updated = submitted.updated = datetime.datetime.utcnow()
    if approved:
        source = context['submittedRevision']
        reviewed = TeachingArtifacts(
            owner_id=context['actor'].id, dojo_id=workspace.dojo_id, module_index=workspace.module_index,
            artifact_type=submitted.artifact_type, title=f'学生提案：{submitted.title}'[:240],
            status='DRAFT', current_revision=1,
        )
        db.session.add(reviewed)
        db.session.flush()
        db.session.add(TeachingArtifactRevisions(
            artifact_id=reviewed.id, revision=1, parent_revision=None,
            instruction='教师审核学生自主学习成果后转为课程草稿',
            content=source.content, content_hash=source.content_hash,
            source_refs=list(source.source_refs or []) + [
                {'type': 'self-learning-submission', 'workspaceId': workspace.id,
                 'artifactId': submitted.id, 'revision': submitted.current_revision,
                 'studentId': workspace.student_id}],
            validation={'status': 'PENDING', 'reviewActionId': context['action'].id},
            created_by=context['actor'].id,
        ))
        result['reviewedArtifactId'] = reviewed.id
    result['workspaceStatus'] = workspace.status


ACTION_HANDLERS = {
    'publish-question-artifact': (_prepare_question, _publish_question),
    'publish-teaching-artifact': (None, _publish_teaching),
    'apply-material-chapters': (_prepare_material, _apply_material),
    'control-teaching-session': (_prepare_session, _apply_session),
    'review-self-artifact': (_prepare_review, _apply_review),
}


def apply_action(action, actor, decision, *, initial_result=None):
    context = prepare_action(action, actor, decision, initial_result=initial_result)
    result = dict(initial_result if initial_result is not None else action.result or {})
    if decision == 'REJECTED' and action.action_type != 'review-self-artifact':
        if context['artifact'] is not None:
            context['artifact'].status = 'DRAFT'
        return result, None
    _, apply = ACTION_HANDLERS[action.action_type]
    challenge = apply(context, result)
    return result, challenge
