import argparse
import fcntl
import hashlib
import json
import pathlib
import socket
import struct
import sys
import time

sys.path.insert(0, '/usr/local/lib/windows-lab')
from clipboard import agent_session, close_agent

ROOT = pathlib.Path('/usr/local/lib/windows-lab/hex-editor')
STATE = pathlib.Path('/var/lib/windows-lab')
REVISION = 'hxd-1.7.7.0-20261103-v1'
ARCHIVE_SHA256 = 'e64e7c6481d596bc62b8ec731bfadf21fe6609b953e104449cd5bb09be6744ba'


def qmp(command, arguments=None):
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(20)
        connection.connect(str(STATE / 'qmp.sock'))
        with connection.makefile('rwb') as stream:
            stream.readline()
            for request in [{'execute': 'qmp_capabilities'}, {'execute': command, 'arguments': arguments or {}}]:
                stream.write(json.dumps(request).encode() + b'\n')
                stream.flush()
                while True:
                    response = json.loads(stream.readline())
                    if 'error' in response:
                        raise RuntimeError(response['error'])
                    if 'return' in response:
                        break
            return response['return']


def install(live=False):
    if hashlib.sha256((ROOT / 'HxDchs.zip').read_bytes()).hexdigest() != ARCHIVE_SHA256:
        raise RuntimeError('HxD source archive digest mismatch')
    previous = None
    device = None
    agent = None
    try:
        if live:
            choices = [block for block in qmp('query-block') if block.get('removable') and block.get('inserted', {}).get('file', '').endswith('/code-editor/editor.iso')]
            if len(choices) != 1 or choices[0].get('locked'):
                raise RuntimeError('The installation CD drive is unavailable or busy')
            device = choices[0]['device']
            previous = choices[0]['inserted']['file']
            qmp('blockdev-change-medium', {'device': device, 'filename': str(ROOT / 'tools.iso'), 'format': 'raw'})
        agent = agent_session(180)
        agent.write(r'C:\Lab\Environment\install-hxd.py', (ROOT / 'install-guest.py').read_bytes(), chunk=1024)
        result = agent.run(r'C:\Python27\python.exe C:\Lab\Environment\install-hxd.py', timeout=90)
        with (STATE / 'clipboard.img').open('rb') as disk:
            disk.seek(131072)
            magic, length = struct.unpack('<8sI', disk.read(12))
            if magic != b'AISEHXDI' or length > 65000:
                raise RuntimeError('Invalid HxD installation receipt')
            report = json.loads(disk.read(length))
        if result.get('exitCode') != 0 or report.get('error') or report.get('revision') != REVISION:
            raise RuntimeError('HxD installation failed: ' + json.dumps(report, ensure_ascii=False))
        if report.get('archiveSha256') != ARCHIVE_SHA256 or not report.get('payloadPreserved'):
            raise RuntimeError('HxD installation integrity check failed')
        report['status'] = 'READY'
        report['checkedAt'] = time.time()
        (STATE / 'hex-editor.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        return report
    finally:
        if agent is not None:
            close_agent(agent)
        if previous is not None:
            qmp('blockdev-change-medium', {'device': device, 'filename': previous, 'format': 'raw'})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--live', action='store_true')
    args = parser.parse_args()
    with (STATE / 'code-editor.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        for attempt in range(3):
            try:
                print(json.dumps(install(args.live), ensure_ascii=False), flush=True)
                break
            except Exception as error:
                failure = {'status': 'FAILED', 'revision': REVISION, 'attempt': attempt + 1, 'error': str(error)}
                (STATE / 'hex-editor.json').write_text(json.dumps(failure, ensure_ascii=False))
                print(json.dumps(failure, ensure_ascii=False), flush=True)
                if attempt == 2:
                    raise
                time.sleep(5)
