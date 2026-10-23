from CTFd.models import db

from ..models import TeachingAgentEventOutbox, TeachingAgentThreads
from .tool_plan import ToolPlanError, _copy, _digest, plan_rows


def generation_state(plan):
    state = {key: _copy(plan['metadata'][key]) for key in ('generationSelection', 'generationRefinement')
             if plan['metadata'].get(key)}
    decision = None
    for event_type in ('generation.decided', 'generation.admitted', 'generation.started'):
        rows = plan_rows(plan, event_type)
        if len(rows) > 1:
            raise ToolPlanError('生成方案有重复的决定记录。')
        for row in rows:
            payload = _copy(row.payload)
            identity = payload.pop('transitionId', None)
            if payload.get('version') != 1 or payload.get('planSha256') != plan['planSha256'] or identity != 'generation-transition:' + _digest(payload):
                raise ToolPlanError('生成方案记录不完整，未继续执行。')
            kind, value = payload.get('kind'), payload.get('value')
            if not isinstance(value, dict):
                raise ToolPlanError('生成方案状态格式无效。')
            if event_type == 'generation.decided':
                if kind not in {'selected', 'refined'} or state:
                    raise ToolPlanError('生成方案的决定顺序无效。')
                if kind == 'selected' and (value.get('status') != 'SELECTED' or value.get('optionId') not in {
                    option['id'] for option in plan['metadata']['generationOptions']['options']
                }):
                    raise ToolPlanError('选择记录不属于保存的方案。')
                if kind == 'refined' and (value.get('status') != 'SUPERSEDED' or not value.get('jobId')):
                    raise ToolPlanError('方案修改记录缺少后续任务。')
                key = 'generationSelection' if kind == 'selected' else 'generationRefinement'
                state[key] = value
                decision = identity
            else:
                selection = state.get('generationSelection') or {}
                expected_kind = 'admitted' if event_type == 'generation.admitted' else 'started'
                if kind != expected_kind or selection.get('status') != 'SELECTED' or payload.get('decisionId') != decision or value.get('optionId') != selection.get('optionId'):
                    raise ToolPlanError('正式生成与已选方案不一致。')
                if event_type == 'generation.admitted' and (not value.get('commandActionId') or not value.get('commandJobId')):
                    raise ToolPlanError('生成方案缺少已接收的命令。')
                if value.get('status') != ('SELECTED' if event_type == 'generation.admitted' else 'STARTED') or (event_type == 'generation.started' and not value.get('formalJobId')):
                    raise ToolPlanError('正式生成状态无效。')
                if event_type == 'generation.started' and selection.get('commandJobId') and value.get('commandJobId') != selection['commandJobId']:
                    raise ToolPlanError('正式生成与已接收的命令不一致。')
                state['generationSelection'] = value
    return state


def record_generation(context, kind, value):
    plan = context['plan']
    TeachingAgentThreads.query.filter_by(id=plan['threadId'], user_id=plan['ownerId']).with_for_update().populate_existing().one()
    state = generation_state(plan)
    value = _copy(value)
    if kind in {'admitted', 'started'}:
        prior = state.get('generationSelection') or {}
        if kind == 'admitted':
            if prior.get('commandJobId'):
                if prior == value:
                    return prior
                raise ToolPlanError('已选方案已经接收另一条生成命令。')
            if prior.get('status') != 'SELECTED' or value.get('status') != 'SELECTED' or value.get('optionId') != prior.get('optionId') or not value.get('commandJobId') or not value.get('commandActionId'):
                raise ToolPlanError('生成命令与已选方案不一致。')
            event_type = 'generation.admitted'
        else:
            if prior.get('status') == 'STARTED':
                if {key: item for key, item in prior.items() if key != 'startedAt'} == {key: item for key, item in value.items() if key != 'startedAt'}:
                    return prior
                raise ToolPlanError('已选方案已经登记另一条正式生成任务。')
            if prior.get('status') != 'SELECTED' or value.get('status') != 'STARTED' or value.get('optionId') != prior.get('optionId') or not value.get('formalJobId'):
                raise ToolPlanError('请先选择当前方案，再正式生成。')
            if prior.get('commandJobId') and value.get('commandJobId') != prior['commandJobId']:
                raise ToolPlanError('正式生成与已接收的命令不一致。')
            event_type = 'generation.started'
    else:
        if kind not in {'selected', 'refined'} or state:
            raise ToolPlanError('这一轮方案已经选定或提交修改。')
        if kind == 'selected' and (value.get('status') != 'SELECTED' or value.get('optionId') != context['option']['id']):
            raise ToolPlanError('所选方案与保存的计划不一致。')
        if kind == 'refined' and (value.get('status') != 'SUPERSEDED' or not value.get('jobId')):
            raise ToolPlanError('方案修改缺少后续任务。')
        event_type = 'generation.decided'
    decisions = plan_rows(plan, 'generation.decided')
    payload = {'version': 1, 'planId': plan['planId'], 'planSha256': plan['planSha256'],
               'kind': kind, 'value': value, 'decisionId': decisions[0].payload['transitionId'] if decisions else None}
    payload['transitionId'] = 'generation-transition:' + _digest(payload)
    db.session.add(TeachingAgentEventOutbox(thread_id=plan['threadId'], event_type=event_type, payload=payload))
    db.session.flush()
    return value
