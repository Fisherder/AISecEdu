import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time

root = Path('/srv/aisecedu-dojo')
incoming = Path('/tmp/aisecedu-authoring-20260912')
manifest = json.loads((incoming / 'manifest.json').read_text())
work = root / 'data/authoring-projects-20260912'

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inner(*args, **kwargs):
    return run('docker', 'exec', 'pwncollege-dojo', 'docker', *args, **kwargs)

def output(*args):
    return inner(*args, capture_output=True, text=True).stdout.strip()

def extract(archive_path, destination):
    with tarfile.open(archive_path) as archive:
        assert all(not member.name.startswith('/') and '..' not in Path(member.name).parts and not member.issym() and not member.islnk() for member in archive.getmembers())
        archive.extractall(destination, filter='data')

assert run('git','-C',str(root),'rev-parse','HEAD',capture_output=True,text=True).stdout.strip() == manifest['base']
for name, expected in manifest['files'].items():
    target = root / name
    actual = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    assert actual == expected['before'], 'Concurrent source change: ' + name
active = output('exec','ctfd','python','-c','from CTFd import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs; print("ACTIVE="+str(TeachingJobs.query.filter(TeachingJobs.status.in_(["RUNNING","QUEUED"])).count()))')
assert active.split('ACTIVE=')[-1].strip() == '0', 'Active generation jobs: wait for them before deployment'
before_image = output('inspect','agent-runtime','--format','{{.Image}}')
assert before_image == 'sha256:5636a5dc8f3112a37a6aacc21303bde1e1650bfc008eb8487bac4f81dbb0e039'
before_containers = json.loads(output('inspect', *output('ps','-q').split()))
work.mkdir(exist_ok=True)
assert not (work/'deployed.json').exists(), 'Already deployed; inspect before retrying'
with tarfile.open(work / 'source-before.tar','w') as archive:
    for name, expected in manifest['files'].items():
        if expected['before'] is not None:
            archive.add(root / name, arcname=name, recursive=False)
(work/'containers-before.json').write_text(json.dumps([{ 'name':item['Name'], 'id':item['Id'], 'started':item['State']['StartedAt']} for item in before_containers],indent=2))
build = work / 'build'
build.mkdir(exist_ok=True)
extract(incoming / 'runtime.tgz', build)
before_tag = 'aisecedu/agent-runtime:before-authoring-projects-20260912'
inner('tag',before_image,before_tag)
(build/'Dockerfile').write_text(f'FROM {before_tag}\nUSER root\nRUN rm -rf /app/.next\nCOPY --chown=nextjs:nodejs .next /app/.next\nCOPY --chown=nextjs:nodejs server.js /app/server.js\nUSER nextjs\n')
image = 'aisecedu/agent-runtime:authoring-projects-20260912'
inner('build','-t',image,'/data/authoring-projects-20260912/build')
extract(incoming / 'source.tar', root)
for name, expected in manifest['files'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest() == expected['after'], name
inner('tag', image, 'pwncollege-agent-runtime:latest')
run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')
workers = ['ctfd','teaching-worker','teaching-interactive-worker','teaching-authoring-worker','teaching-authoring-worker-2']
inner('restart','--time','20',*workers)
for attempt in range(30):
    if all(output('inspect',name,'--format','{{.State.Health.Status}}') == 'healthy' for name in ['ctfd','agent-runtime']):
        break
    time.sleep(2)
else:
    inner('tag',before_image,'pwncollege-agent-runtime:latest')
    extract(work/'source-before.tar',root)
    run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')
    inner('restart','--time','20',*workers)
    raise RuntimeError('Health check failed; restored prior runtime and source')
changed = set(workers + ['agent-runtime'])
for item in before_containers:
    name = item['Name'].lstrip('/')
    if name not in changed:
        assert output('inspect',name,'--format','{{.Id}} {{.State.StartedAt}}') == item['Id']+' '+item['State']['StartedAt'], 'Unrelated container changed: '+name
(work/'deployed.json').write_text(json.dumps({'image':output('inspect','agent-runtime','--format','{{.Image}}'),'sourceFiles':len(manifest['files']),'unrelatedContainersPreserved':True},indent=2))
print('Deployed; application healthy; unrelated containers preserved.')
