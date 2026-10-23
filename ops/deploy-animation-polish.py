import hashlib
import json
from pathlib import Path
import subprocess
import tarfile
import time

root = Path('/srv/aisecedu-dojo')
incoming = Path('/tmp/aisecedu-authoring-20260912/v5')
work = root/'data/authoring-projects-20260912/polish-v5'
previous = json.loads(Path('/tmp/aisecedu-authoring-20260912/v4/manifest.json').read_text())
latest = json.loads((incoming/'manifest.json').read_text())

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inner(*args, **kwargs):
    return run('docker','exec','pwncollege-dojo','docker',*args,**kwargs)

def output(*args):
    return inner(*args,capture_output=True,text=True).stdout.strip()

for name, hashes in latest['files'].items():
    target = root/name
    actual = hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else None
    assert actual in {previous['files'].get(name,{}).get('after',hashes['before']), hashes['after']}, 'Concurrent edit: '+name
expected = 'sha256:189407b061934eb6bd9b89c4c28f653be637f091b0148ef1588ff51d3752c172'
assert output('inspect','agent-runtime','--format','{{.Image}}') == expected
active = output('exec','ctfd','python','-c','from CTFd import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs; print("ACTIVE="+str(TeachingJobs.query.filter(TeachingJobs.status.in_(["RUNNING","QUEUED"])).count()))')
assert active.split('ACTIVE=')[-1].strip() == '0'
before = json.loads(output('inspect',*output('ps','-q').split()))
work.mkdir()
with tarfile.open(work/'source-before.tar','w') as archive:
    for name in latest['files']:
        if (root/name).exists(): archive.add(root/name,arcname=name,recursive=False)
build = work/'build'
build.mkdir()
with tarfile.open(incoming/'runtime.tgz') as archive:
    selected = [item for item in archive if item.name == 'server.js' or item.name == '.next' or item.name.startswith('.next/')]
    assert all('..' not in Path(item.name).parts and not item.issym() and not item.islnk() for item in selected)
    archive.extractall(build,members=selected,filter='data')
(build/'Dockerfile').write_text('FROM aisecedu/agent-runtime:authoring-projects-20260912-v4\nUSER root\nRUN rm -rf /app/.next\nCOPY --chown=nextjs:nodejs .next /app/.next\nCOPY --chown=nextjs:nodejs server.js /app/server.js\nRUN node -e "const {Linter}=require(\'eslint\'); if(new Linter().verify(\'missingFunction();\',{rules:{\'no-undef\':\'error\'}}).length!==1)process.exit(1)"\nUSER nextjs\n')
image = 'aisecedu/agent-runtime:authoring-projects-20260912-v5'
inner('build','-t',image,'/data/authoring-projects-20260912/polish-v5/build')
with tarfile.open(incoming/'source.tar') as archive:
    assert all(not item.name.startswith('/') and '..' not in Path(item.name).parts and not item.issym() and not item.islnk() for item in archive)
    archive.extractall(root,filter='data')
for name, hashes in latest['files'].items():
    assert hashlib.sha256((root/name).read_bytes()).hexdigest() == hashes['after']
inner('tag',image,'pwncollege-agent-runtime:latest')
run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')
for attempt in range(30):
    if output('inspect','agent-runtime','--format','{{.State.Health.Status}}') == 'healthy': break
    time.sleep(2)
else:
    inner('tag',expected,'pwncollege-agent-runtime:latest')
    run('docker','exec','pwncollege-dojo','dojo','compose','up','-d','--no-build','--no-deps','agent-runtime')
    raise RuntimeError('Previous runtime restored after failed health check')
status = output('exec','agent-runtime','node','-e','fetch("http://127.0.0.1:3000/agent-runtime/api/integration/jobs/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(r=>console.log(r.status))')
assert status in {'401','403'}, status
for item in before:
    if item['Name'] != '/agent-runtime':
        assert output('inspect',item['Id'],'--format','{{.State.StartedAt}}') == item['State']['StartedAt']
(work/'deployed.json').write_text(json.dumps({'image':output('inspect','agent-runtime','--format','{{.Image}}'),'routeStatus':status,'unrelatedContainersPreserved':True},indent=2))
print('Animation polish deployed; execution route and unchanged workspaces verified')
