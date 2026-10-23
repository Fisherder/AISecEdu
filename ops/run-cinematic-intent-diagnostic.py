"""Bounded, standalone diagnostic for one existing failed test job."""
import json
from pathlib import Path
import subprocess
import sys

MODE = sys.argv[1] if len(sys.argv) == 2 else ''
assert MODE in {'--load-only', '--run'}, 'Explicit diagnostic mode required'
BUNDLE = '/tmp/aisecedu-cinematic-20260912/diagnose-intent-v8-main.cjs'
INNER = '/tmp/aisecedu-intentdiag-af3f6da7-v8-main-20260912.cjs'
assert Path(BUNDLE).is_file()

def run(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

run('docker', 'cp', BUNDLE, 'pwncollege-dojo:' + INNER)
run('docker', 'exec', 'pwncollege-dojo', 'docker', 'cp', INNER, 'agent-runtime:' + INNER)
run('docker', 'exec', 'pwncollege-dojo', 'docker', 'exec', '-u', '0', 'agent-runtime',
    'chown', 'nextjs:nodejs', INNER)

source = r'''
import json
from CTFd import create_app
with create_app().app_context():
    from CTFd.plugins.dojo_plugin.models.global_agent import TeachingJobs
    job = TeachingJobs.query.filter_by(id='job_af3f6da7f8644907be4698f7d2670f44', kind='artifact.materialize').one()
    assert job.status == 'FAILED'
    payload = job.payload
    result = {'jobId': job.id, 'modelString': 'deepseek:deepseek-v4-flash',
              'request': payload['requestPrompt'], 'plan': payload['plan'],
              'expectedMaterials': (payload.get('materialContext') or {}).get('expectedMaterialCount', 0)}
    print('DIAG_INPUT=' + json.dumps(result, ensure_ascii=False))
'''
data = '{}'
if MODE == '--run':
    query = run('docker', 'exec', 'pwncollege-dojo', 'docker', 'exec', 'ctfd', 'python', '-c', source,
                capture_output=True, text=True, timeout=45)
    lines = [line[len('DIAG_INPUT='):] for line in query.stdout.splitlines() if line.startswith('DIAG_INPUT=')]
    assert len(lines) == 1, 'Ambiguous diagnostic input'
    data = lines[0]

loader = '''try { require(process.argv[1]); } catch (error) {
  process.stdout.write(JSON.stringify({stage:"module-load-before-input",name:error.name,code:error.code,
    missingModule:error.code==="MODULE_NOT_FOUND"?error.message.split("\\n")[0]:null,
    locations:String(error.stack).split("\\n").slice(1,7)})+"\\n"); process.exitCode=1;
}'''
result = subprocess.run(['docker', 'exec', '-i', 'pwncollege-dojo', 'docker', 'exec', '-i',
    '-w', '/app', '-e', 'NODE_PATH=/app/node_modules', 'agent-runtime', 'node', '-e', loader, INNER],
    input=data, text=True, capture_output=True, timeout=150)
for line in result.stdout.splitlines():
    try:
        value = json.loads(line)
    except ValueError:
        continue
    if isinstance(value, dict) and ('diagnosticSetupError' in value or 'classificationCalls' in value or value.get('stage') == 'module-load-before-input'):
        print(json.dumps(value, ensure_ascii=False))
print(json.dumps({'mode': MODE, 'exitCode': result.returncode}))
sys.exit(result.returncode)
