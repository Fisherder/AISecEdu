import argparse
import grp
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import time

root = Path('/srv/aisecedu-dojo/data/windows-legacy-eval-20260912')
parser = argparse.ArgumentParser()
parser.add_argument('action', choices=['start', 'resume', 'status', 'key', 'screenshot', 'shutdown', 'close'])
parser.add_argument('value', nargs='?')
parser.add_argument('--cpu', choices=['Nehalem', 'host', 'qemu64'], default='host')
parser.add_argument('--accel', choices=['kvm', 'tcg'], default='kvm')
args = parser.parse_args()

def qmp(command, arguments=None):
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(10)
        connection.connect(str(root / 'qmp.sock'))
        stream = connection.makefile('rwb')
        stream.readline()
        for request in [{'execute':'qmp_capabilities'}, {'execute':command, 'arguments':arguments or {}}]:
            stream.write(json.dumps(request).encode()+b'\n')
            stream.flush()
            while True:
                response = json.loads(stream.readline())
                if 'error' in response:
                    raise RuntimeError(response['error'])
                if 'return' in response:
                    break
        return response['return']

if args.action in {'start', 'resume'}:
    assert not (root/'qmp.sock').exists(), 'An evaluation instance already exists'
    media = list((root/'extracted').rglob('*.vhd'))
    assert len(media) == 1, 'Exactly one official VHD is required'
    disk = root/'evaluation-session.qcow2'
    if args.action == 'start':
        assert not disk.exists(), 'Existing evaluation disk will not be overwritten'
        subprocess.run(['qemu-img','create','-f','qcow2','-F','vpc','-b',str(media[0]),str(disk)],check=True)
        os.chown(disk, 1000, 1000)
        disk.chmod(0o600)
        subprocess.run(['genisoimage','-J','-r','-V','AISECEVAL','-o',str(root/'tools.iso'),str(root/'tools')],check=True)
    else:
        assert disk.is_file() and (root/'tools.iso').is_file()
        previous = json.loads((root/'processes.json').read_text())
        assert not Path(f'/proc/{previous["qemu"]}').exists(), 'Previous VM must be fully stopped'
    command = ['setpriv','--reuid=1000','--regid=1000',f'--groups={grp.getgrnam("kvm").gr_gid}','--no-new-privs',
               'qemu-system-x86_64','-name','AISecEdu-Legacy-Internal-Evaluation','-accel',args.accel,
               '-machine','pc-i440fx-8.2','-cpu',args.cpu,'-m','2048','-smp','2',
               '-drive',f'file={disk},format=qcow2,if=ide','-cdrom',str(root/'tools.iso'),
               '-nic','none','-vga','std','-display','none','-vnc',f'unix:{root}/vnc.sock',
               '-qmp',f'unix:{root}/qmp.sock,server=on,wait=off','-monitor','none',
               '-chardev',f'file,id=evalserial,path={root}/guest-report.txt,append=on','-serial','chardev:evalserial','-usb','-device','usb-tablet']
    with (root/'qemu.log').open('ab') as output:
        guest = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
    for attempt in range(50):
        if (root/'qmp.sock').exists(): break
        if guest.poll() is not None: raise RuntimeError('QEMU failed; inspect qemu.log')
        time.sleep(.1)
    if args.action == 'resume' and Path(f'/proc/{previous["websockify"]}').exists():
        web_pid = previous['websockify']
        assert str(root/'vnc.sock').encode() in Path(f'/proc/{web_pid}/cmdline').read_bytes()
    else:
        with (root/'websockify.log').open('ab') as output:
            web = subprocess.Popen(['setpriv','--reuid=1000','--regid=1000','--clear-groups','--no-new-privs',
                                    'websockify','--web=/usr/share/novnc',f'--unix-target={root}/vnc.sock','127.0.0.1:26188'],
                                   stdin=subprocess.DEVNULL,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
        web_pid = web.pid
    (root/'processes.json').write_text(json.dumps({'qemu':guest.pid,'websockify':web_pid,'cpu':args.cpu,'accel':args.accel,'networkAdapters':0,'publicPorts':[]},indent=2))
    print(json.dumps(qmp('query-status')))
elif args.action == 'status':
    print(json.dumps(qmp('query-status')))
elif args.action == 'key':
    assert args.value and all(c.isalnum() or c in '_-' for c in args.value)
    print(qmp('human-monitor-command', {'command-line':'sendkey '+args.value}))
elif args.action == 'screenshot':
    print(qmp('screendump', {'filename':str(root/'screen.ppm')}))
elif args.action == 'shutdown':
    print(qmp('system_powerdown'))
elif args.action == 'close':
    previous = json.loads((root/'processes.json').read_text())
    assert not Path(f'/proc/{previous["qemu"]}').exists(), 'Shut down the evaluation guest first'
    web_pid = previous['websockify']
    if Path(f'/proc/{web_pid}').exists():
        assert str(root/'vnc.sock').encode() in Path(f'/proc/{web_pid}/cmdline').read_bytes()
        assert os.getpgid(web_pid) == web_pid
        os.killpg(web_pid, signal.SIGTERM)
    print('Evaluation guest stopped; private browser proxy closed; disk retained')
