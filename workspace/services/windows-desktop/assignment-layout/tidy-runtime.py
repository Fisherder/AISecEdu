from pathlib import Path
import json
import struct
import sys
import time
import textwrap

ROOT = Path('/usr/local/lib/windows-lab')
STATE = Path('/var/lib/windows-lab')
MODE = sys.argv[1]

import fcntl
import importlib.util

spec = importlib.util.spec_from_file_location('lab_clipboard',ROOT/'clipboard.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)
def apply_layout():
    lock = None
    guest = None
    try:
        ready = Path('/run/dojo/var/environment-check/result.json')
        until = time.monotonic()+180
        while time.monotonic()<until:
            try:
                environment_ready = json.loads(ready.read_text()).get('ready')
            except (OSError,ValueError):
                environment_ready = False
            editor_ready = not (ROOT/'code-editor').exists() or (STATE/'code-editor.json').exists()
            if environment_ready and editor_ready:
                break
            time.sleep(1)
        else:
            raise RuntimeError('Environment setup has not finished; directory cleanup deferred')
        lock = (STATE/'code-editor.lock').open('a')
        fcntl.flock(lock,fcntl.LOCK_EX)
        guest = transport.agent_session(60)
        guest.write(r'C:\Lab\Environment\desktop-shortcuts.py',(ROOT/'desktop-shortcuts-guest.py').read_bytes())
        if MODE == 'ollydbg':
            guest.write(r'C:\Lab\Environment\assignment-layout.py',(ROOT/'assignment-layout-guest.py').read_bytes())
            guest.write(r'C:\Lab\Environment\assignment-check.py',(ROOT/'assignment-check-guest.py').read_bytes())
        guest.write(r'C:\Lab\Environment\tidy-layout-20261012-shortcuts-r10.py',(ROOT/'tidy-guest.py').read_bytes())
        runner = textwrap.dedent(r'''
    import sys,json,struct,traceback
    sys.argv=[r'C:\Lab\Environment\tidy-layout-20261012-shortcuts-r10.py',sys.argv[1]]
    try:
     execfile(sys.argv[0],{'__name__':'__main__'})
    except Exception:
     text=traceback.format_exc().decode('utf-8','replace')
     raw=json.dumps({'error':text},ensure_ascii=True)
     block=struct.pack('<8sI','AISETIDY',len(raw))+raw
     block+='\0'*((-len(block))%512)
     f=open(r'\\.\PhysicalDrive1','r+b',0);f.seek(131072);f.write(block);f.flush();f.close()
     sys.exit(1)
    ''')
        guest.write(r'C:\Lab\Environment\tidy-runner-20261012.py',runner.encode())
        result = guest.run(r'C:\Python27\python.exe C:\Lab\Environment\tidy-runner-20261012.py '+MODE,timeout=60)
        with (STATE/'clipboard.img').open('rb') as handle:
            handle.seek(131072)
            magic,length = struct.unpack('<8sI',handle.read(12))
            if magic != b'AISETIDY' or length > 131000:
                raise RuntimeError('Invalid directory-organization receipt')
            report = json.loads(handle.read(length))
        if result.get('exitCode') != 0 or report.get('error'):
            raise RuntimeError(report.get('error') or 'Guest organizer exit %s' % result.get('exitCode'))
        target = STATE/'desktop-layout.json'
        target.write_text(json.dumps(report,ensure_ascii=False,indent=2))
        target.chmod(0o600)
        print(json.dumps({'mode':MODE,'visibleTaskFiles':report.get('visibleTaskFiles'),'originalTaskFilesUnchanged':report.get('originalTaskFilesUnchanged',report.get('alreadyApplied'))},ensure_ascii=False),flush=True)
        return report
    finally:
        if guest is not None:
            transport.close_agent(guest)
        if lock is not None:
            fcntl.flock(lock,fcntl.LOCK_UN)
            lock.close()

for attempt in range(1,4):
    try:
        report = apply_layout()
        break
    except Exception as error:
        failure = {'status':'FAILED','version':'20261012-shortcuts-r10','mode':MODE,'attempt':attempt,'error':str(error),'retrying':attempt < 3}
        status = STATE/'desktop-layout-status.json'
        status.write_text(json.dumps(failure,ensure_ascii=False,indent=2))
        status.chmod(0o600)
        print(json.dumps(failure,ensure_ascii=False),flush=True)
        if attempt == 3:
            raise
        time.sleep(5)
else:
    raise RuntimeError('Directory migration failed')
status = STATE/'desktop-layout-status.json'
status.write_text(json.dumps({'status':'READY','version':'20261012-shortcuts-r10','attempt':attempt,'mode':MODE,'root':report.get('assignmentLayout',{}).get('root')}))
status.chmod(0o600)
