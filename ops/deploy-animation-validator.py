import json
from pathlib import Path
import subprocess
import time

root = Path('/srv/aisecedu-dojo/data/authoring-projects-20260912/validator-v3')

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def inner(*args, **kwargs):
    return run('docker', 'exec', 'pwncollege-dojo', 'docker', *args, **kwargs)

def output(*args):
    return inner(*args, capture_output=True, text=True).stdout.strip()

expected = 'sha256:41b25d2da0ab73ff6486fe028c4e2064b6983595ecf60a7d6cde734df07c0ecc'
assert output('inspect', 'agent-runtime', '--format', '{{.Image}}') == expected
active = output('exec', 'ctfd', 'python', '-c', 'from CTFd import create_app; app=create_app(); ctx=app.app_context(); ctx.push(); from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs; print("ACTIVE="+str(TeachingJobs.query.filter(TeachingJobs.status.in_(["RUNNING","QUEUED"])).count()))')
assert active.split('ACTIVE=')[-1].strip() == '0'
before = json.loads(output('inspect', *output('ps', '-q').split()))
image = 'aisecedu/agent-runtime:authoring-projects-20260912-v3'
inner('build', '-t', image, '/data/authoring-projects-20260912/validator-v3')
inner('tag', image, 'pwncollege-agent-runtime:latest')
run('docker', 'exec', 'pwncollege-dojo', 'dojo', 'compose', 'up', '-d', '--no-build', '--no-deps', 'agent-runtime')
for attempt in range(30):
    if output('inspect', 'agent-runtime', '--format', '{{.State.Health.Status}}') == 'healthy': break
    time.sleep(2)
else:
    raise RuntimeError('Runtime health failed')
status = output('exec', 'agent-runtime', 'node', '-e', 'fetch("http://127.0.0.1:3000/agent-runtime/api/integration/jobs/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}).then(async r=>{console.log(r.status);if(r.status===500)process.exit(1)})')
assert status in {'401', '403'}, status
for item in before:
    if item['Name'] != '/agent-runtime':
        assert output('inspect', item['Id'], '--format', '{{.State.StartedAt}}') == item['State']['StartedAt']
(root/'deployed.json').write_text(json.dumps({'image':output('inspect','agent-runtime','--format','{{.Image}}'),'routeStatus':status,'unrelatedContainersPreserved':True}, indent=2))
print('Runtime dependency and actual execution route verified; other containers unchanged')
