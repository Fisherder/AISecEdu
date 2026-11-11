import argparse
import json
from pathlib import Path
import re
import subprocess
import tempfile

from app_test_layout import load_manifest


ROOT = Path(__file__).resolve().parents[2]
DESTINATION = '/tmp/aisecedu-ci-app-project'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--container', default='dojo')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]*', args.container):
        parser.error('Invalid container name')
    load_manifest()
    outer = ['docker', 'exec', args.container]
    inner = [*outer, 'docker', 'exec', 'ctfd']
    subprocess.run([*inner, 'python', '-c',
                    'import os; assert os.environ.get("DOJO_ENV") == "coverage", "Only an isolated coverage environment is allowed"'], check=True)
    subprocess.run([*inner, 'python', '-m', 'pip', 'install', '--disable-pip-version-check', 'pytest==8.3.5'], check=True)
    subprocess.run([*inner, 'mkdir', '-p', DESTINATION], check=True)
    with tempfile.TemporaryDirectory(prefix='aisecedu-app-tests-') as directory:
        archive = Path(directory) / 'source.tar'
        with archive.open('wb') as output:
            subprocess.run(['git', 'archive', '--format=tar', 'HEAD'], cwd=ROOT, stdout=output, check=True)
        outer_archive = '/tmp/aisecedu-ci-app-source.tar'
        subprocess.run(['docker', 'cp', str(archive), f'{args.container}:{outer_archive}'], check=True)
        subprocess.run([*outer, 'docker', 'cp', outer_archive, 'ctfd:/tmp/aisecedu-ci-app-source.tar'], check=True)
    subprocess.run([*inner, 'tar', '-xf', '/tmp/aisecedu-ci-app-source.tar', '-C', DESTINATION], check=True)
    settings = {'admin_username': 'admin', 'admin_password': 'admin'}
    subprocess.run(['docker', 'exec', '-i', args.container, 'docker', 'exec', '-i', 'ctfd',
                    'python', DESTINATION + '/ops/team/app_test_runner.py'],
                   input=json.dumps(settings), text=True, check=True)


if __name__ == '__main__':
    main()
