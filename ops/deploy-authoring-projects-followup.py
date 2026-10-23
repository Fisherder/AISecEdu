import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time

root = Path('/srv/aisecedu-dojo')
incoming = Path('/tmp/aisecedu-authoring-20260912/final')
work = root/'data/authoring-projects-20260912/followup'
previous = json.loads(Path('/tmp/aisecedu-authoring-20260912/manifest.json').read_text())
latest = json.loads((incoming/'manifest.json').read_text())

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inner(*args, **kwargs):
    return run('docker','exec','pwncollege-dojo','docker',*args,**kwargs)

def output(*args):
    return inner(*args,capture_output=True,text=True).stdout.strip()

def extract(source, destination):
    with tarfile.open(source) as archive:
        assert all(not item.name.startswith('/') and '..' not in Path(item.name).parts and not item.issym() and not item.islnk() for item in archive.getmembers())
        archive.extractall(destination,filter='data')

for name, hashes in latest['files'].items():
    target = root/name
    actual = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    allowed = {previous['files'].get(name,{}).get('after',hashes['before']), hashes['after']}
    if name == 'dojo_plugin/agent_runtime/jobs.py':
        allowed.add('11df453e09b0b5581b6071443d9bf881757810a5000cbd3b257e9b26247ded63')
    assert actual in allowed, 'Concurrent edit: '+name
active = output('exec','ctfd','python','-c','from CTFd import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs; print("ACTIVE="+str(TeachingJobs.query.filter(TeachingJobs.status.in_(["RUNNING","QUEUED"])).count()))')
assert active.split('ACTIVE=')[-1].strip() == '0', 'Wait for active teaching jobs'
before_image = output('inspect','agent-runtime','--format','{{.Image}}')
assert before_image == 'sha256:04ad0db96bb4ffdc320142fcfa6c830de243bb2125dfe755c3941674e8064c77'
work.mkdir()
before = json.loads(output('inspect', *output('ps','-q').split()))
with tarfile.open(work/'source-before.tar','w') as archive:
    for name in latest['files']:
        if (root/name).exists(): archive.add(root/name,arcname=name,recursive=False)
build = work/'build'
build.mkdir()
extract(incoming/'runtime.tgz',build)
(build/'Dockerfile').write_text('FROM aisecedu/agent-runtime:authoring-projects-20260912\nUSER root\nRUN rm -rf /app/.next\nCOPY --chown=nextjs:nodejs .next /app/.next\nCOPY --chown=nextjs:nodejs server.js /app/server.js\nUSER nextjs\n')
image = 'aisecedu/agent-runtime:authoring-projects-20260912-v2'
inner('build','-t',image,'/data/authoring-projects-20260912/followup/build')
extract(incoming/'source.tar',root)
for name, hashes in latest['files'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest() == hashes['after']
workers = ['ctfd','teaching-worker','teaching-interactive-worker','teaching-authoring-worker','teaching-authoring-worker-2']
inner('tag',image,'pwncollege-agent-runtime:latest')
run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')
inner('restart','--time','20',*workers)
for attempt in range(30):
    if all(output('inspect',name,'--format','{{.State.Health.Status}}') == 'healthy' for name in ['ctfd','agent-runtime']): break
    time.sleep(2)
else:
    inner('tag',before_image,'pwncollege-agent-runtime:latest')
    extract(work/'source-before.tar',root)
    run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')
    inner('restart','--time','20',*workers)
    raise RuntimeError('Health failed; previous application restored')
for item in before:
    name = item['Name'].lstrip('/')
    if name not in workers+['agent-runtime']:
        assert output('inspect',name,'--format','{{.Id}} {{.State.StartedAt}}') == item['Id']+' '+item['State']['StartedAt']
(work/'deployed.json').write_text(json.dumps({'image':output('inspect','agent-runtime','--format','{{.Image}}'),'unrelatedContainersPreserved':True},indent=2))
print('Follow-up deployed, healthy, unrelated workspaces preserved')
