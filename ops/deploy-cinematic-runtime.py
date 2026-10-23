import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time
import sys

ROOT = Path('/srv/aisecedu-dojo')
VERSION = sys.argv[1] if len(sys.argv)>1 else 'v1'
assert VERSION in {'v1','v2','v3','v4','v5','v6','v7','v8','v9','v10','v11','v12','v13','v14', 'v15', 'v16', 'v17', 'v18', 'v19'}
INCOMING = Path('/tmp/aisecedu-cinematic-20260912')/VERSION
WORK = ROOT/'data/cinematic-20260912'/('release-'+VERSION)
EXPECTED = {'v1':'sha256:7084ee46c865a4a3c97583138754847bcdd8c12d64545b0f27a88d2c92125333','v2':'sha256:b16bf1a75d5e0d5682fd1290316ef00b82cfcdf781c40d87ce2e4749da8833e7','v3':'sha256:51df21437f36d5ce74ffc9481a2a89206e68947f1b725c9bfb4fd3e6f331a6a3','v4':'sha256:65192bc8006a0a74164dc821677ce790fbb407b5dfa01d1462c2db0a5cc8f448','v5':'sha256:0e4d4c5bdb35e5755d5fe969e35b97425e3e961eab283a2befdc4c076b586adf','v6':'sha256:eb691ad8ad5118ace17f1735f7af0a436e9e15cc2b49fcf7b1166eb362f28899','v7':'sha256:bda6e8e5a82ed4a1dfb738f63dbc76d3f565ea16b536681160c50f76964cda97','v8':'sha256:037b35999e655830b476c8ef88a114fcf9d028aa46844273c67eaed1bdac3b36','v9':'sha256:419097771ad1dce5696cc467020af99595f5ff3dba0cf08324af15f10896a3ce','v10':'sha256:5255ff6f2fabe71c89360365bf6424ca6313b74670bd2c2f08ac38faf79994a5','v11':'sha256:e1770f85433f8e0b6710f8eff72ed7648135fe0237d17a7d3f435250e8112f04','v12':'sha256:460b998ab9e1694f19e2094a00e3934fefb124bfe7b18a2945c3104e239cef44','v13':'sha256:4355f3dac0ca9f7bd538783dc0a052860ee8816934f27c9da2332735988fbd2b','v14':'sha256:9101aaf2e50dfaf014a2e60d8584398abae9e4e217ff6f8ade99f64c92e1357b','v15':'sha256:e08ce95339fffcea7627dc5170b0a090990469c735ca1af39285487ce2efe0b5','v16':'sha256:96d4c2d3fc06a6c95fd5dfc8f96468bf7ded5eae1fcfeb4df91720c6cbeeeeed','v17':'sha256:6d2bd58f064a77b9ee13f9a4635c2d671c7b5e74824382ec7515da96a97afd34','v18':'sha256:42cb9afd37f41eb68c7dee98224dd693578d15a5c1996235c70ad9ebc03f8f37','v19':'sha256:077f4d6f265b92494a6980cde91eb23e307cf4a2688d8ca46c53dea0f45d926f'}[VERSION]
PREVIOUS_VERSION = {'v1':None,'v2':'v1','v3':'v2','v4':'v3','v5':'v4','v6':'v5','v7':'v6','v8':'v7','v9':'v8','v10':'v9','v11':'v10','v12':'v11','v13':'v12','v14':'v13','v15':'v14','v16':'v15','v17':'v16','v18':'v17','v19':'v18'}[VERSION]
BASE_IMAGE = 'aisecedu/agent-runtime:'+('authoring-projects-20260912-v5' if VERSION=='v1' else 'cinematic-20260912-'+PREVIOUS_VERSION)
IMAGE = 'aisecedu/agent-runtime:cinematic-20260912-'+VERSION

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inner(*args, **kwargs):
    return run('docker', 'exec', 'pwncollege-dojo', 'docker', *args, **kwargs)

def output(*args):
    return inner(*args, capture_output=True, text=True).stdout.strip()

def restart_runtime():
    run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')

def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None

def verified_image_id(reference, expected=None):
    value = output('image', 'inspect', reference, '--format', '{{.Id}}')
    if (not value.startswith('sha256:') or len(value) != 71
            or any(char not in '0123456789abcdef' for char in value[7:])
            or expected is not None and value != expected):
        raise RuntimeError('Unexpected image identity: ' + reference)
    return value

def prepare_build_base(reference, expected):
    identity = verified_image_id(reference, expected)
    # BuildKit interprets a bare image ID in FROM as a registry image name.
    # Give this build a unique local alias, then verify the alias at both ends.
    alias = 'aisecedu/agent-runtime:cinematic-build-base-' + VERSION + '-' + str(time.time_ns())
    inner('tag', identity, alias)
    verified_image_id(alias, identity)
    return identity, alias

def validate_runtime_only_release(previous, latest):
    allowed = ('services/agent-runtime/lib/', 'services/agent-runtime/app/',
               'services/agent-runtime/components/', 'services/agent-runtime/tests/',
               'ops/', 'docs/reports/')
    for name in previous.keys() | latest.keys():
        if previous.get(name, {}).get('after') != latest.get(name, {}).get('after'):
            if not name.startswith(allowed) or name not in latest:
                raise RuntimeError('Runtime-only release cannot change: ' + name)

def validate_runtime_build(config):
    if (not isinstance(config, dict) or config.get('basePath') != '/agent-runtime'
            or config.get('assetPrefix') != '/agent-runtime' or config.get('output') != 'standalone'):
        raise RuntimeError('Integrated runtime build must target /agent-runtime; live service was not changed')

def smoke_runtime_build(image):
    name = 'cinematic-smoke-' + VERSION + '-' + str(time.time_ns())
    report = {'image': image, 'container': name, 'network': 'none', 'ready': False}
    created = False
    probe = ('fetch("http://127.0.0.1:3000/agent-runtime/api/health",'
             '{signal:AbortSignal.timeout(3000)}).then(r=>{console.log("HEALTH="+r.status);'
             'if(r.status!==200)process.exit(1)}).catch(e=>{console.error(e.name);process.exit(1)})')
    try:
        inner('run', '--detach', '--name', name, '--network', 'none', '--restart', 'no',
              '--memory', '1g', '--cpus', '1', '--pids-limit', '128',
              '--env', 'HOSTNAME=0.0.0.0', '--env', 'PORT=3000', '--env', 'NODE_ENV=production',
              '--env', 'AISECEDU_INTEGRATED=true', image, capture_output=True, text=True, timeout=30)
        created = True
        for attempt in range(12):
            try:
                result = inner('exec', name, 'node', '-e', probe, capture_output=True, text=True, timeout=8)
                if result.stdout.strip() == 'HEALTH=200':
                    report['ready'] = True
                    return report
            except subprocess.SubprocessError as error:
                report['lastError'] = type(error).__name__
            time.sleep(2)
        raise RuntimeError('New runtime failed isolated /agent-runtime health probe; live service was not changed')
    finally:
        if created:
            try:
                logs = inner('logs', '--tail', '30', name, capture_output=True, text=True, timeout=10)
                report['logs'] = logs.stdout + logs.stderr
            finally:
                inner('stop', '--time', '5', name, capture_output=True, timeout=15)
                inner('rm', name, capture_output=True, timeout=10)
        (WORK / ('runtime-smoke-' + str(time.time_ns()) + '.json')).write_text(json.dumps(report, indent=2))

CTFD_PROBE = r'''
import hashlib
import importlib
import json
import os
from pathlib import Path
import signal
import sys
import urllib.request

request = json.loads(sys.argv[1])

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def process(pid):
    root = Path('/proc') / str(pid)
    fields = (root / 'stat').read_text().rsplit(')', 1)[1].split()
    return {'pid': int(pid), 'ppid': int(fields[1]), 'startTicks': int(fields[19]),
            'argv': (root / 'cmdline').read_bytes().decode().rstrip('\0').split('\0'),
            'cwd': os.readlink(root / 'cwd'), 'exe': os.readlink(root / 'exe'),
            'uid': root.stat().st_uid, 'state': fields[0]}

def snapshot():
    candidates = []
    for path in Path('/proc').iterdir():
        if not path.name.isdigit():
            continue
        try:
            entry = process(path.name)
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
        argv = entry['argv']
        if (any(Path(arg).name == 'gunicorn' for arg in argv[:2])
                or argv[0].startswith(('gunicorn: master', 'gunicorn: worker'))):
            candidates.append(entry)
    pids = {entry['pid'] for entry in candidates}
    masters = [entry for entry in candidates if entry['ppid'] not in pids]
    require(len(masters) == 1, 'Expected exactly one container-local Gunicorn master')
    master = masters[0]
    require('CTFd:create_app()' in master['argv'], 'Unexpected Gunicorn application/argv')
    require(master['cwd'] == '/opt/CTFd' and master['state'] not in {'Z', 'X'}, 'Invalid master identity')
    workers = [entry for entry in candidates if entry['ppid'] == master['pid']]
    require(len(workers) == len(candidates) - 1, 'Unexpected Gunicorn process tree')
    require(all(entry['cwd'] == master['cwd'] and entry['exe'] == master['exe']
                and entry['uid'] == master['uid'] and entry['argv'] == master['argv']
                and entry['state'] not in {'Z', 'X'} for entry in workers), 'Unexpected worker identity')
    return {'master': master, 'workers': sorted(workers, key=lambda entry: entry['pid']),
            'pidNamespace': os.readlink('/proc/self/ns/pid')}

def source_hashes():
    result = {}
    for name, expected in request['sources'].items():
        path = Path(name)
        require(not path.is_absolute() and '..' not in path.parts
                and path.parts[0] == 'dojo_plugin' and path.suffix == '.py', 'Unexpected Python source path')
        target = Path('/opt/CTFd/CTFd/plugins') / path
        actual = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
        require(actual == expected, 'Container source hash mismatch: ' + name)
        result[name] = actual
    require(bool(result), 'No CTFd Python sources to verify')
    return result

def same_master(left, right):
    return all(left[key] == right[key] for key in ('pid', 'ppid', 'startTicks', 'argv', 'cwd', 'exe', 'uid'))

result = snapshot()
result['sourceHashes'] = source_hashes()
result['configHash'] = hashlib.sha256(Path('/etc/ctfd/gunicorn.py').read_bytes()).hexdigest()
baseline = request.get('baseline')
if baseline:
    require(same_master(result['master'], baseline['master'])
            and result['pidNamespace'] == baseline['pidNamespace']
            and result['configHash'] == baseline['configHash'], 'Master/namespace/config changed')
mode = request['mode']
require(mode in {'check', 'hup', 'health'}, 'Unexpected probe mode')
if mode in {'check', 'hup'}:
    from gunicorn.app.wsgiapp import WSGIApplication
    argv = result['master']['argv']
    launch = next(index for index, arg in enumerate(argv[:2]) if Path(arg).name == 'gunicorn')
    sys.argv = ['gunicorn'] + argv[launch + 1:]
    app_config = WSGIApplication().cfg
    result['config'] = {'workers': app_config.workers, 'preload': app_config.preload_app,
                        'bind': app_config.bind, 'timeout': app_config.timeout,
                        'gracefulTimeout': app_config.graceful_timeout, 'config': app_config.config}
    require(result['config'] == {'workers': 32, 'preload': False, 'bind': ['0.0.0.0:8000'],
                                'timeout': 3600, 'gracefulTimeout': 3600,
                                'config': '/etc/ctfd/gunicorn.py'}, 'Unexpected effective Gunicorn configuration')
    require(len(result['workers']) >= app_config.workers, 'Insufficient existing workers')
    from CTFd import create_app
    with create_app().app_context():
        from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs
        result['activeJobs'] = TeachingJobs.query.filter(TeachingJobs.status.in_(['RUNNING', 'QUEUED', 'CANCEL_REQUESTED'])).count()
        require(result['activeJobs'] == 0, 'Active generation jobs; refusing reload')
        helper = request.get('helper')
        if helper:
            require(helper['module'].startswith('CTFd.plugins.dojo_plugin.')
                    and all(part.isidentifier() for part in helper['module'].split('.'))
                    and helper['symbol'].isidentifier(), 'Invalid helper import')
            module = importlib.import_module(helper['module'])
            require(callable(getattr(module, helper['symbol']))
                    and callable(getattr(module, '_serialize_teacher_agent_history')), 'History helpers are not callable')
            result['helperImport'] = dict(helper, scope='fresh-probe-process-not-serving-worker')
    if mode == 'hup':
        require(baseline is not None and request.get('release') == 'v8', 'HUP requires an explicit v8 baseline')
        require(hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'), 'pidfd is required; no PID fallback')
        descriptor = os.pidfd_open(result['master']['pid'])
        try:
            require(same_master(process(result['master']['pid']), result['master']), 'Master changed before signal')
            source_hashes()
            require(hashlib.sha256(Path('/etc/ctfd/gunicorn.py').read_bytes()).hexdigest() == result['configHash'], 'Config changed before signal')
            signal.pidfd_send_signal(descriptor, signal.SIGHUP)
            result['signal'] = 'SIGHUP'
        finally:
            os.close(descriptor)
else:
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open('http://127.0.0.1:8000/', timeout=8) as response:
        require(response.status == 200 and bool(response.read(1024)), 'CTFd HTTP health failed')
        result['http'] = {'url': response.url, 'status': response.status}
print('CTFD_PROBE=' + json.dumps(result, sort_keys=True))
'''

def ctfd_probe(mode, sources, baseline=None, helper=None):
    if VERSION != 'v8':
        raise RuntimeError('CTFd reload is v8-only')
    payload = dict(mode=mode, release=VERSION, sources=sources, baseline=baseline, helper=helper)
    result = inner('exec', 'ctfd', 'python', '-c', CTFD_PROBE, json.dumps(payload),
                   capture_output=True, text=True, timeout=45)
    lines = [line[len('CTFD_PROBE='):] for line in result.stdout.splitlines() if line.startswith('CTFD_PROBE=')]
    if len(lines) != 1:
        raise RuntimeError('Missing or ambiguous CTFd probe result')
    return json.loads(lines[0])

def ctfd_sources(hashes):
    return {name: value for name, value in hashes.items()
            if name.startswith('dojo_plugin/') and name.endswith('.py')}

def preserved_containers(containers):
    for item in containers:
        if item['Name'] == '/agent-runtime':
            continue
        current = json.loads(output('inspect', item['Id']))[0]
        if (current['Id'] != item['Id'] or current['Name'] != item['Name']
                or current['State']['StartedAt'] != item['State']['StartedAt']
                or current['State']['Running'] != item['State']['Running']):
            raise RuntimeError('Unrelated container changed: ' + item['Name'])

def reload_ctfd(sources, phase, baseline, containers, helper=None):
    if VERSION != 'v8' or phase not in {'forward', 'rollback'}:
        raise RuntimeError('Unexpected CTFd reload request')
    evidence = WORK / ('ctfd-' + phase + '-' + str(time.time_ns()) + '.json')
    report = {'phase': phase, 'sourceHashes': sources, 'signalSent': False,
              'workerModuleImportProven': False, 'evidence': str(evidence)}
    try:
        preserved_containers(containers)
        report['before'] = ctfd_probe('check', sources, baseline)
        evidence.write_text(json.dumps(report, indent=2))
        report['signalAttempted'] = True
        report['signalResult'] = ctfd_probe('hup', sources, report['before'], helper)
        report['signalSent'] = True
        old = {(entry['pid'], entry['startTicks']) for entry in report['before']['workers']}
        deadline = time.monotonic() + 180
        stable = 0
        previous_new = set()
        while time.monotonic() < deadline:
            try:
                current = ctfd_probe('health', sources, report['before'])
            except (RuntimeError, subprocess.SubprocessError) as error:
                report['lastHealthError'] = str(error)
                stable = 0
                time.sleep(2)
                continue
            cohort = {(entry['pid'], entry['startTicks']) for entry in current['workers']}
            fresh = cohort - old
            stable = stable + 1 if fresh == previous_new and len(fresh) >= 32 else 0
            previous_new = fresh
            report['after'] = current
            report['newWorkerCount'] = len(fresh)
            report['drainingOldWorkers'] = sorted(cohort & old)
            if stable >= 2:
                preserved_containers(containers)
                report['unrelatedContainersPreserved'] = True
                report['ready'] = True
                return report
            time.sleep(2)
        raise RuntimeError('CTFd did not reach a stable new 32-worker cohort and HTTP 200 within 180s')
    except Exception as error:
        report['error'] = str(error)
        raise
    finally:
        evidence.write_text(json.dumps(report, indent=2))

def backup_hashes(files):
    hashes = dict.fromkeys(files)
    with tarfile.open(WORK / 'source-before.tar') as archive:
        entries = {}
        for member in archive.getmembers():
            name = Path(member.name)
            if (name.is_absolute() or '..' in name.parts or member.name not in files
                    or member.name in entries or not (member.isfile() or member.issym())):
                raise RuntimeError('Unexpected rollback archive entry')
            entries[member.name] = member
        for name, member in entries.items():
            source = member
            if member.issym():
                # Existing theme aliases are adjacent files. Resolve only a
                # single relative basename to a regular file in this archive,
                # never the live filesystem, link chains or an outside path.
                link = Path(member.linkname)
                target = str(Path(name).parent / link)
                if (link.is_absolute() or len(link.parts) != 1 or link.name in {'.', '..'}
                        or target not in entries or not entries[target].isfile()):
                    raise RuntimeError('Unexpected rollback symlink target')
                source = entries[target]
            hashes[name] = hashlib.sha256(archive.extractfile(source).read()).hexdigest()
    return hashes

def restore_guarded_source(hashes):
    # Keep the state being replaced recoverable, including files introduced by
    # this release. Do not lose a concurrent edit during a failed deployment.
    with tarfile.open(WORK / ('source-rollback-replaced-' + str(time.time_ns()) + '.tar'), 'w') as snapshot:
        for name in hashes:
            target = ROOT / name
            if target.exists():
                snapshot.add(target, arcname=name, recursive=False)
    with tarfile.open(WORK / 'source-before.tar') as archive:
        archive.extractall(ROOT, filter='data')
    for name, expected in hashes.items():
        if expected is None:
            (ROOT / name).unlink(missing_ok=True)
    if any(digest(ROOT / name) != expected for name, expected in hashes.items()):
        raise RuntimeError('Restored source hash mismatch')

def rollback_guarded_release(hashes, baseline, containers, source_applied):
    report = {'previousImage': EXPECTED, 'errors': []}
    if source_applied:
        try:
            restore_guarded_source(hashes)
            report['sourceHashes'] = hashes
            if VERSION == 'v8':
                report['ctfd'] = reload_ctfd(ctfd_sources(hashes), 'rollback', baseline, containers)
        except Exception as error:
            report['errors'].append('source/CTFd rollback: ' + str(error))
    try:
        inner('tag', EXPECTED, 'pwncollege-agent-runtime:latest')
        restart_runtime()
        for attempt in range(30):
            if output('inspect', 'agent-runtime', '--format', '{{.State.Health.Status}}') == 'healthy':
                break
            time.sleep(2)
        else:
            raise RuntimeError('Previous runtime image failed health check')
        if output('inspect', 'agent-runtime', '--format', '{{.Image}}') != EXPECTED:
            raise RuntimeError('Previous runtime image not restored')
        preserved_containers(containers)
        report['unrelatedContainersPreserved'] = True
    except Exception as error:
        report['errors'].append('runtime rollback: ' + str(error))
    (WORK / ('rollback-' + str(time.time_ns()) + '.json')).write_text(json.dumps(report, indent=2))
    if report['errors']:
        raise RuntimeError('; '.join(report['errors']))

previous=json.loads(Path('/tmp/aisecedu-authoring-20260912/v5/manifest.json' if VERSION=='v1' else '/tmp/aisecedu-cinematic-20260912/'+PREVIOUS_VERSION+'/manifest.json').read_text())
latest=json.loads((INCOMING/'manifest.json').read_text())
if VERSION in {'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
    validate_runtime_only_release(previous['files'], latest['files'])
with tarfile.open(INCOMING/'source.tar') as archive:
    members=archive.getmembers()
    assert all(item.isfile() and item.name in latest['files'] for item in members), 'Unexpected source archive entry'
    assert set(item.name for item in members)==set(latest['files'])
with tarfile.open(INCOMING/'runtime.tgz') as archive:
    member = archive.getmember('.next/required-server-files.json')
    if not member.isfile() or member.size > 10000000:
        raise RuntimeError('Invalid runtime build configuration')
    validate_runtime_build(json.load(archive.extractfile(member)).get('config'))
assert output('inspect','agent-runtime','--format','{{.Image}}')==EXPECTED, 'Live image changed'
for name, hashes in latest['files'].items():
    assert not Path(name).is_absolute() and '..' not in Path(name).parts
    assert digest(ROOT/name) in {previous['files'].get(name,{}).get('after',hashes['before']),hashes['after']}, 'Concurrent edit: '+name
active=output('exec','ctfd','python','-c','from CTFd import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs; print("ACTIVE="+str(TeachingJobs.query.filter(TeachingJobs.status.in_(["RUNNING","QUEUED","CANCEL_REQUESTED"])).count()))')
assert active.split('ACTIVE=')[-1].strip()=='0', 'Active generation jobs; do not interrupt'
before=json.loads(output('inspect',*output('ps','-q').split()))
if WORK.exists():
    assert (WORK/'source-before.tar').is_file() and not (WORK/'deployed.json').exists(), 'Only an incomplete release can resume'
else:
    WORK.mkdir(parents=True)
    with tarfile.open(WORK/'source-before.tar','w') as archive:
        for name in latest['files']:
            if (ROOT/name).exists(): archive.add(ROOT/name,arcname=name,recursive=False)
    (WORK/'containers-before.json').write_text(json.dumps(before,indent=2))
if VERSION in {'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
    before = json.loads((WORK / 'containers-before.json').read_text())
    preserved_containers(before)
    rollback_hashes = backup_hashes(latest['files'])
    (WORK / 'source-before-hashes.json').write_text(json.dumps(rollback_hashes, indent=2))
if VERSION == 'v8':
    ctfd_baseline = ctfd_probe('check', ctfd_sources({name: digest(ROOT / name) for name in latest['files']}))
    (WORK / ('ctfd-baseline-' + str(time.time_ns()) + '.json')).write_text(json.dumps(ctfd_baseline, indent=2))
base_id,base_alias=prepare_build_base(BASE_IMAGE, EXPECTED)
build=WORK/'build-clean';build.mkdir(exist_ok=True)
with tarfile.open(INCOMING/'runtime.tgz') as archive:
    selected=[item for item in archive if item.name in {'server.js','.next'} or item.name.startswith('.next/')]
    assert all('..' not in Path(item.name).parts and not any(part.startswith('._') for part in Path(item.name).parts) and not item.issym() and not item.islnk() for item in selected)
    archive.extractall(build,members=selected,filter='data')
(build/'Dockerfile').write_text('FROM '+base_alias+'\nUSER root\nRUN rm -rf /app/.next\nCOPY --chown=nextjs:nodejs .next /app/.next\nCOPY --chown=nextjs:nodejs server.js /app/server.js\nUSER nextjs\n')
inner('build','-t',IMAGE,'/data/cinematic-20260912/release-'+VERSION+'/build-clean')
verified_image_id(base_alias,base_id)
built_image=verified_image_id(IMAGE)
runtime_smoke=smoke_runtime_build(built_image)
active=output('exec','ctfd','python','-c','from CTFd import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs; print("ACTIVE="+str(TeachingJobs.query.filter(TeachingJobs.status.in_(["RUNNING","QUEUED","CANCEL_REQUESTED"])).count()))')
assert active.split('ACTIVE=')[-1].strip()=='0', 'Active generation jobs after build; do not interrupt'
source_applied=False
try:
    with tarfile.open(INCOMING/'source.tar') as archive:
        members=archive.getmembers()
        assert all(item.isfile() and item.name in latest['files'] for item in members)
        assert set(item.name for item in members)==set(latest['files'])
        if VERSION in {'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
            source_applied=True
        archive.extractall(ROOT,filter='data')
    source_applied=True
    assert all(digest(ROOT/name)==hashes['after'] for name,hashes in latest['files'].items())
    inner('tag',IMAGE,'pwncollege-agent-runtime:latest');restart_runtime()
    for attempt in range(30):
        if output('inspect','agent-runtime','--format','{{.State.Health.Status}}')=='healthy': break
        time.sleep(2)
    else: raise RuntimeError('Cinematic runtime failed health check')
    assert output('inspect','agent-runtime','--format','{{.Image}}')==built_image, 'Running image differs from this build'
    status=output('exec','agent-runtime','node','-e','fetch("http://127.0.0.1:3000/agent-runtime/api/integration/jobs/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>console.log(r.status))')
    assert status in {'401','403'},status
    if VERSION == 'v8':
        ctfd_reload = reload_ctfd(ctfd_sources({name: hashes['after'] for name, hashes in latest['files'].items()}),
                                  'forward', ctfd_baseline, before,
                                  {'module': 'CTFd.plugins.dojo_plugin.api.v1.teaching',
                                   'symbol': '_teacher_agent_history_context'})
    preserved_containers(before)
except Exception:
    if VERSION in {'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
        rollback_guarded_release(rollback_hashes, ctfd_baseline if VERSION == 'v8' else None, before, source_applied)
    else:
        inner('tag',EXPECTED,'pwncollege-agent-runtime:latest');restart_runtime()
        if source_applied:
            with tarfile.open(WORK/'source-before.tar') as archive: archive.extractall(ROOT,filter='data')
    raise
deployment = {'image':built_image,'baseImage':base_id,'baseAlias':base_alias,'routeStatus':status,'unrelatedContainersPreserved':True,'previousImage':EXPECTED}
if VERSION == 'v8':
    deployment['ctfdReload'] = ctfd_reload
elif VERSION in {'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
    deployment['ctfdReload'] = {'required': False, 'reason': 'Runtime-only release; Python sources unchanged'}
if VERSION in {'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
    deployment['runtimeInflight'] = {'checked': False, 'count': None,
                                    'reason': 'No verified inflight endpoint on the previous runtime; database job statuses only'}
(WORK/'deployed.json').write_text(json.dumps(deployment,indent=2))
print('Cinematic runtime deployed; existing workspaces preserved')
