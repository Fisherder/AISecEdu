import json
import os
import re
from pathlib import Path


def connection_settings():
    path = Path(__file__).resolve().parents[1] / 'agent_runtime/assets/ssh-connection.json'
    configured = json.loads(path.read_text()) if path.exists() else {}
    host = os.getenv('AISECEDU_SSH_PUBLIC_HOST') or configured.get('host')
    if not host:
        from flask import request
        host = request.host.split(':')[0]
    if not re.fullmatch(r'[a-zA-Z0-9.-]+', host):
        raise ValueError('SSH public host must be an IPv4 address or DNS name')
    port = int(os.getenv('AISECEDU_SSH_PUBLIC_PORT') or configured.get('port') or 22)
    if not 1 <= port <= 65535:
        raise ValueError('SSH public port is invalid')
    return {'host': host, 'port': port, 'username': 'hacker', 'host_fingerprint': configured.get('hostFingerprint', '')}


def connection_instructions(user_id):
    settings = connection_settings()
    host, port = settings['host'], settings['port']
    identity = '~/.ssh/xuanjia_ed25519'
    settings.update({
        'command': f'ssh -p {port} -i {identity} hacker@{host}',
        'sftp_command': f'sftp -P {port} -i {identity} hacker@{host}',
        'config': '\n'.join([
            f'Host xuanjia-{int(user_id)}', f'    HostName {host}', f'    Port {port}',
            '    User hacker', f'    IdentityFile {identity}', '    IdentitiesOnly yes',
            '    ServerAliveInterval 30', '    ServerAliveCountMax 3',
        ]) + '\n',
    })
    return settings
