#!/usr/bin/env python3
import json
import os
from pathlib import Path
import subprocess

CONTROL = Path('/srv/aisecedu-development-control')


def main():
    state = json.loads((CONTROL / 'state.json').read_text())
    if os.geteuid() != 0 or state['container'] != 'aisecedu-development' or not state['stage'].startswith('full-home'):
        raise RuntimeError('Verified independent home snapshot is required')
    source = Path(state['source'])
    data = Path(state['data'])
    if source.is_relative_to(Path('/srv/aisecedu-dojo')) or data == Path('/srv/aisecedu-dojo/data'):
        raise RuntimeError('Development paths overlap production')
    args = ['docker', 'run', '-d', '--name', state['container'], '--restart', 'unless-stopped', '--privileged',
            '--memory=12g', '--memory-swap=12g', '--cpus=8', '--shm-size=64g',
            '--label', 'aisecedu.environment=development', '--label', 'aisecedu.production-source=pwncollege-dojo',
            '-v', f'{source}:/opt/pwn.college', '-v', f'{data}:/data:shared',
            '-v', '/lib/modules:/lib/modules:ro', '-v', '/run/udev:/host-run-udev:ro',
            '-v', f'{CONTROL}/pwn.college.service:/etc/systemd/system/pwn.college.service:ro',
            '-v', '/dev/null:/etc/systemd/system/pwn.college.backup.timer:ro',
            '-v', '/dev/null:/etc/systemd/system/pwn.college.cloud.backup.timer:ro',
            '-p', '127.0.0.1:28080:80', '-p', '127.0.0.1:28443:443', '-p', '127.0.0.1:24443:4443', '-p', '127.0.0.1:2224:22',
            '-e', 'DOJO_ENV=production', '-e', 'DOJO_HOST=127.0.0.1', '-e', 'WORKSPACE_HOST=127.0.0.1',
            '-e', 'DOJO_OFFLINE=true', '-e', 'DOJO_HTTP_ENABLED=true', '-e', 'DOJO_IP_MODE=true', '-e', 'DOJO_SHM_SIZE=64G',
            '-e', 'AISECEDU_PUBLIC_ORIGIN=http://127.0.0.1:28080', state['productionImage'], 'dojo', 'init']
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)
    state['stage'] = 'outer-started-awaiting-database-isolation'
    (CONTROL / 'state.json').write_text(json.dumps(state, indent=2))
    print(json.dumps({'container': state['container'], 'stage': state['stage'], 'origin': state['origin']}))


if __name__ == '__main__':
    main()
