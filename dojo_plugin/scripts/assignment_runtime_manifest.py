import json
import os
from pathlib import Path
import re
import sys


def update_manifest(config, manifest_path=Path('/etc/aisecedu-lab.json')):
    if not manifest_path.exists():
        return
    for key in ('course', 'assignment'):
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,79}', str(config.get(key, ''))):
            raise ValueError('无效工程目录')
    target = '/home/hacker/courses/' + config['course'] + '/' + config['assignment']
    previous = manifest_path.read_bytes()
    manifest = json.loads(previous)
    permitted = {target}
    if config.get('legacy_directory'):
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,99}', config['legacy_directory']):
            raise ValueError('无效旧工程目录')
        permitted.add('/home/hacker/' + config['legacy_directory'])
    if manifest.get('workspace') not in permitted:
        raise ValueError('环境模板与作业目录不匹配')
    if manifest['workspace'] == target:
        return
    backup = manifest_path.with_name(manifest_path.name + '.before-assignment-layout')
    if not backup.exists():
        backup.write_bytes(previous)
        backup.chmod(0o600)
    manifest['workspace'] = target
    manifest['workspaceLayoutVersion'] = 1
    manifest['assignmentDirectory'] = config['assignment']
    incoming = manifest_path.with_name(manifest_path.name + '.assignment-layout-incoming')
    incoming.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    incoming.chmod(0o644)
    os.replace(incoming, manifest_path)


if __name__ == '__main__':
    update_manifest(json.loads(sys.argv[1]))
