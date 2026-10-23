import json
import uuid
from .models import LearningAuditEvents
from CTFd.models import db

ACTION = 'lab.question.volume'

def resource(challenge):
    return f'{challenge.dojo_id}:{challenge.challenge_id}'

def selected_volume(owner_id, challenge, fallback):
    row = LearningAuditEvents.query.filter_by(actor_id=owner_id, action=ACTION, resource_id=resource(challenge), outcome='ALLOW').order_by(LearningAuditEvents.id.desc()).first()
    return row.details['volume'] if row else fallback

def switch_volume(owner_id, challenge, previous, restore_id=None):
    if restore_id is not None:
        row = LearningAuditEvents.query.filter_by(id=int(restore_id), actor_id=owner_id, action=ACTION, resource_id=resource(challenge), outcome='ALLOW').one_or_none()
        if row is None: raise ValueError('未找到本题的恢复点')
        volume = row.details['previousVolume']
    else:
        volume = f'dojo-question-{int(owner_id)}-{int(challenge.challenge_id)}-{uuid.uuid4().hex[:12]}'
    event = LearningAuditEvents(actor_id=owner_id, action=ACTION, resource_type='question_runtime', resource_id=resource(challenge), outcome='ALLOW', details={'volume':volume, 'previousVolume':previous, 'restoredFrom':restore_id, 'homeErased':False})
    db.session.add(event);db.session.flush()
    return event

def windows_volume(container):
    return next((mount['Name'] for mount in container.attrs.get('Mounts', []) if mount.get('Destination') == '/var/lib/windows-lab' and mount.get('Type') == 'volume'), None)

def coding_reset(container, apply=False, restore_id=None):
    command = ['/usr/bin/timeout','30','/opt/aisecedu/bin/labctl','restore' if restore_id else 'reset']
    if restore_id: command += ['--id',restore_id]
    if apply:command.append('--apply')
    result=container.exec_run(command,user='1000')
    payload=json.loads(result.output)
    if result.exit_code or not payload.get('success'):raise ValueError(payload.get('error') or '未完成本题代码恢复')
    return payload['result']
