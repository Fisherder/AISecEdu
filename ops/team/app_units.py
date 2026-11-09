import argparse
from pathlib import Path
import re
import subprocess


ROOT = Path(__file__).resolve().parents[2]
APP_TESTS = ('test_model_router.py', 'test_runtime_profiles.py')
DESTINATION = '/tmp/aisecedu-ci-app-units'
RUNNER = '''
import sys
import pytest
from CTFd import create_app

app = create_app()
with app.test_request_context('/'):
    for name, module in list(sys.modules.items()):
        if name == 'CTFd.plugins.dojo_plugin' or name.startswith('CTFd.plugins.dojo_plugin.'):
            sys.modules[name.removeprefix('CTFd.plugins.')] = module
    raise SystemExit(pytest.main([
        '--rootdir=/tmp/aisecedu-ci-app-units', '--confcutdir=/tmp/aisecedu-ci-app-units', '-v',
        '/tmp/aisecedu-ci-app-units/test_model_router.py',
        '/tmp/aisecedu-ci-app-units/test_runtime_profiles.py',
    ]))
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container', default='dojo')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]*', args.container):
        parser.error('Invalid container name')
    outer = ['docker', 'exec', args.container]
    inner = [*outer, 'docker', 'exec', 'ctfd']
    subprocess.run([*inner, 'python', '-c',
                    'import os; assert os.environ.get("DOJO_ENV") == "coverage", "Only an isolated coverage environment is allowed"'], check=True)
    subprocess.run([*inner, 'python', '-m', 'pip', 'install', '--disable-pip-version-check', 'pytest==8.3.5'], check=True)
    subprocess.run([*outer, 'mkdir', '-p', DESTINATION], check=True)
    subprocess.run([*inner, 'mkdir', '-p', DESTINATION], check=True)
    for filename in APP_TESTS:
        subprocess.run(['docker', 'cp', str(ROOT / 'test' / filename), f'{args.container}:{DESTINATION}/{filename}'], check=True)
        subprocess.run([*outer, 'docker', 'cp', f'{DESTINATION}/{filename}', f'ctfd:{DESTINATION}/{filename}'], check=True)
    subprocess.run(['docker', 'exec', '-i', args.container, 'docker', 'exec', '-i', 'ctfd', 'python', '-'],
                   input=RUNNER, text=True, check=True)


if __name__ == '__main__':
    main()
