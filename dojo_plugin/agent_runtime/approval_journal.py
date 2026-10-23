from __future__ import annotations

import datetime
import hashlib
import json
import re

from CTFd.models import db

from ..models import TeachingAgentEventOutbox


class ApprovalJournalError(ValueError):
    def __init__(self, message, code, status=409):
        super().__init__(message)
        self.code = code
        self.status = status


def proposal_request(thread_id, message_id, index, proposal):
    return {
        'id': f'proposal:{thread_id}:{message_id}:{index}',
        'kind': 'tool-proposal',
        'threadId': thread_id,
        'messageId': message_id,
        'proposalIndex': index,
        'proposal': proposal,
    }


def action_request(action):
    return {
        'id': f'action:{action.id}',
        'kind': 'action',
        'threadId': action.thread_id,
        'actorId': action.actor_id,
        'actionType': action.action_type,
        'targetType': action.target_type,
        'targetId': action.target_id,
        'request': action.request_json or {},
        'draftId': (action.result or {}).get('draftId'),
    }


def request_reference(envelope):
    serialized = json.dumps(envelope, sort_keys=True, ensure_ascii=False,
                            separators=(',', ':'), allow_nan=False).encode()
    if len(serialized) > 1024 * 1024:
        raise ApprovalJournalError('批准请求过大，请缩小操作范围。', 'APPROVAL_REQUEST_TOO_LARGE', 400)
    return {'id': envelope['id'], 'sha256': hashlib.sha256(serialized).hexdigest()}


def journal_rows(thread_id, request_id=None):
    query = TeachingAgentEventOutbox.query.filter_by(thread_id=thread_id).filter(
        TeachingAgentEventOutbox.event_type.in_(['approval.requested', 'approval.decided']))
    if request_id is not None:
        query = query.filter(TeachingAgentEventOutbox.payload['requestId'].astext == request_id)
    return query.order_by(TeachingAgentEventOutbox.id).populate_existing().all()


def recorded_decision(thread_id, request_id):
    return next((row.payload for row in journal_rows(thread_id, request_id)
                 if row.event_type == 'approval.decided'), None)


def request_approval(envelope):
    reference = request_reference(envelope)
    existing = next((row.payload for row in journal_rows(envelope['threadId'], envelope['id'])
                     if row.event_type == 'approval.requested'), None)
    if existing and existing.get('requestSha256') != reference['sha256']:
        raise ApprovalJournalError('操作内容已变化，请重新提出请求。', 'APPROVAL_REQUEST_CHANGED')
    if not existing:
        db.session.add(TeachingAgentEventOutbox(
            thread_id=envelope['threadId'], event_type='approval.requested',
            payload={'requestId': reference['id'], 'requestSha256': reference['sha256'],
                     'request': envelope, 'version': 1}))
        db.session.flush()
    return reference


def _check_reference(envelope, expected):
    reference = request_reference(envelope)
    if not isinstance(expected, dict) or not expected.get('id') or not expected.get('sha256'):
        raise ApprovalJournalError('请刷新批准请求后，再确认本次操作。', 'APPROVAL_REFERENCE_REQUIRED')
    if expected != reference:
        raise ApprovalJournalError('操作内容已变化，请查看最新请求后再决定。', 'APPROVAL_REQUEST_CHANGED')
    return reference


def decide(envelope, expected, decision, actor_id, comment=''):
    if decision not in {'APPROVED', 'REJECTED'}:
        raise ApprovalJournalError('必须明确批准或拒绝。', 'CONFIRMATION_REQUIRED', 400)
    reference = _check_reference(envelope, expected)
    rows = journal_rows(envelope['threadId'], envelope['id'])
    request = next((row.payload for row in rows if row.event_type == 'approval.requested'), None)
    existing = next((row.payload for row in rows if row.event_type == 'approval.decided'), None)
    if request and request.get('requestSha256') != reference['sha256']:
        raise ApprovalJournalError('这项请求已变化，请重新提出操作。', 'APPROVAL_REQUEST_CHANGED')
    if existing:
        if existing['decision'] != decision:
            raise ApprovalJournalError('这项请求已有决定，不能改为相反决定。', 'ALREADY_DECIDED')
        return existing, True
    if not request:
        db.session.add(TeachingAgentEventOutbox(
            thread_id=envelope['threadId'], event_type='approval.requested',
            payload={'requestId': reference['id'], 'requestSha256': reference['sha256'],
                     'request': envelope, 'version': 1}))
    result = {
        'requestId': reference['id'], 'requestSha256': reference['sha256'],
        'decision': decision, 'actorId': actor_id,
        'decidedAt': datetime.datetime.utcnow().isoformat() + 'Z',
        'comment': str(comment or '')[:8000], 'version': 1,
    }
    db.session.add(TeachingAgentEventOutbox(
        thread_id=envelope['threadId'], event_type='approval.decided', payload=result))
    db.session.flush()
    return result, False


def require_approved(envelope, expected):
    reference = _check_reference(envelope, expected)
    decision = recorded_decision(envelope['threadId'], envelope['id'])
    if decision is None:
        raise ApprovalJournalError('请先批准这项操作，再继续执行。', 'APPROVAL_REQUIRED')
    if decision.get('requestSha256') != reference['sha256']:
        raise ApprovalJournalError('批准后操作内容发生变化，请重新提出请求。', 'APPROVAL_REQUEST_CHANGED')
    if decision['decision'] != 'APPROVED':
        raise ApprovalJournalError('这项操作已被拒绝，不能继续执行。', 'APPROVAL_REJECTED')
    return reference


def proposal_operation(request_key):
    match = re.fullmatch(r'agent-proposal:(\d+):(\d+)', str(request_key or ''))
    return (int(match[1]), int(match[2])) if match else None


def message_approval_metadata(thread_id, messages):
    decisions = {row.payload['requestId']: row.payload for row in journal_rows(thread_id)
                 if row.event_type == 'approval.decided'}
    output = {}
    for message in messages:
        from .tool_plan import message_metadata
        metadata = message_metadata(message, thread_id=thread_id)
        proposals = metadata.get('toolProposals')
        if message.role == 'assistant' and metadata.get('pending') is False and isinstance(proposals, list):
            references = {}
            cached_value = metadata.get('toolProposalDecisions')
            cached = dict(cached_value) if isinstance(cached_value, dict) and not metadata.get('toolPlan') else {}
            for index, proposal in enumerate(proposals):
                if not isinstance(proposal, dict) or proposal.get('requiresConfirmation') is not True:
                    continue
                envelope = proposal_request(thread_id, message.id, index, proposal)
                reference = request_reference(envelope)
                references[str(index)] = reference
                if reference['id'] in decisions:
                    cached[str(index)] = decisions[reference['id']]
            metadata['toolProposalApprovalRequests'] = references
            metadata['toolProposalDecisions'] = cached
        output[message.id] = metadata
    return output


def record_execution(action, stage, approval=None):
    if stage not in {'started', 'committed'}:
        raise ValueError('Invalid execution stage')
    event = TeachingAgentEventOutbox(
        thread_id=action.thread_id, event_type=f'execution.{stage}',
        payload={'actionId': action.id, 'actionType': action.action_type,
                 'actorId': action.actor_id, 'approvalRequest': approval,
                 'status': 'RUNNING' if stage == 'started' else action.status,
                 'result': action.result if stage == 'committed' else None,
                 'version': 1})
    db.session.add(event)
    return event
