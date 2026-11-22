import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


STAGING = Path(__file__).resolve().parents[1] / 'ops' / 'staging'
SCRIPT = STAGING / 'teaching-rehearsal.py'
PROJECT = 'aisecedu-develop'


class TeachingRehearsalTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        for name in ('harness', 'auth', 'classroom'):
            (self.root / f'fixture-{name}.env').touch(mode=0o600)
        self.compose = ['docker-compose'] if shutil.which('docker-compose') else ['docker', 'compose']
        self.base = {
            'name': PROJECT,
            'services': {
                'app': {'image': 'synthetic/app', 'networks': {'backend': {}, 'frontend': {'aliases': ['app']}}},
                'db': {'image': 'synthetic/postgres', 'networks': {'backend': {}},
                       'volumes': [{'type': 'volume', 'source': 'postgres', 'target': '/pgdata'}]},
                'cache': {'image': 'synthetic/redis', 'networks': {'backend': {}}},
                'edge': {'image': 'synthetic/edge', 'networks': {'frontend': {}},
                         'volumes': [{'type': 'bind', 'source': './fixture-nginx.conf',
                                      'target': '/etc/nginx/nginx.conf', 'read_only': True}],
                         'ports': [{'host_ip': '127.0.0.1', 'published': '28081', 'target': 8080}]},
            },
            'networks': {'backend': {'internal': True}, 'frontend': {'internal': True}},
            'volumes': {'postgres': {}},
        }

    def write_json(self, name, data):
        path = self.root / name
        path.write_text(json.dumps(data))
        return path

    def run_script(self, *args):
        return subprocess.run([sys.executable, str(SCRIPT), *args], text=True, capture_output=True)

    def render(self, *paths):
        env = {'PATH': os.environ['PATH'], 'HOME': str(self.root)}
        for prefix in ('HARNESS', 'CLASSROOM', 'INSPECTOR'):
            env[f'AISECEDU_{prefix}_IMAGE'] = f'sha256:{"a" * 64}'
        env.update(AISECEDU_HARNESS_ENV_FILE=str(self.root / 'fixture-harness.env'),
                   AISECEDU_CLASSROOM_ENV_FILE=str(self.root / 'fixture-classroom.env'),
                   AISECEDU_CLASSROOM_AUTH_FILE=str(self.root / 'fixture-auth.env'),
                   AISECEDU_CLASSROOM_PUBLIC_ORIGIN='http://127.0.0.1:28081',
                   AISECEDU_CLASSROOM_AI_ENABLED='true')
        command = [*self.compose, '--env-file', '/dev/null', '--project-directory', str(self.root)]
        for path in paths:
            command.extend(('-f', str(path)))
        command.extend(('config', '--format', 'json', '--no-env-resolution'))
        result = subprocess.run(command, env=env, capture_output=True, text=True, timeout=15)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_baseline_rejects_wrong_project_exposed_port_and_nonprivate_app_network(self):
        for change in (
            lambda config: config.update(name='production'),
            lambda config: config['services']['edge']['ports'][0].update(host_ip='0.0.0.0'),
            lambda config: config['services']['edge']['ports'][0].pop('host_ip'),
            lambda config: config['services']['edge']['ports'][0].update(published='28080'),
            lambda config: config['services']['app'].update(ports=['127.0.0.1:8000:8000']),
            lambda config: config['services']['cache'].update(network_mode='host'),
            lambda config: config['networks']['backend'].update(internal=False),
            lambda config: config['networks'].update(teaching={}),
        ):
            bad = copy.deepcopy(self.base)
            change(bad)
            with self.subTest(base=bad):
                result = self.run_script(self.write_json('base.json', bad))
                self.assertEqual(result.returncode, 1)
                self.assertEqual(result.stdout, '')

    def test_native_compose_merges_and_validator_rejects_configuration_drift(self):
        try:
            version = subprocess.run([*self.compose, 'version'], capture_output=True, timeout=10,
                                     env={'PATH': os.environ['PATH'], 'HOME': str(self.root)})
        except FileNotFoundError:
            self.skipTest('Docker Compose CLI is required for the offline merge test')
        if version.returncode != 0:
            self.skipTest('Docker Compose CLI is required for the offline merge test')

        raw_base = self.write_json('host.json', self.base)
        rendered_base = self.write_json('base.json', self.render(raw_base))
        amendment = self.root / 'amendment.yaml'
        for edge_enabled in (False, True):
            with self.subTest(edge_enabled=edge_enabled):
                options = ('--edge',) if edge_enabled else ()
                result = self.run_script(*options, rendered_base)
                self.assertEqual(result.returncode, 0, result.stderr)
                amendment.write_text(result.stdout)
                config = self.render(raw_base, STAGING / 'harness.compose.yml', STAGING / 'classroom.compose.yml', amendment)
                self.assertEqual(set(config['services']['deepseek-harness']['networks']), {'teaching'})
                self.assertNotIn('model-egress', config['networks'])
                self.assertEqual('classroom-edge' in config['services']['edge']['networks'], edge_enabled)
                result = self.run_script(*options, rendered_base, self.write_json('candidate.json', config))
                self.assertEqual(result.returncode, 0, result.stderr)

                for change in (
                    lambda cfg: cfg['services']['db'].update(image='changed-db'),
                    lambda cfg: cfg['services']['cache'].update(command=['changed']),
                    lambda cfg: cfg['services']['edge']['volumes'].clear(),
                    lambda cfg: cfg['services']['edge']['ports'][0].update(host_ip='0.0.0.0'),
                    lambda cfg: cfg['services']['app']['networks']['frontend'].clear(),
                    lambda cfg: cfg['services']['app']['networks'].pop('teaching'),
                    lambda cfg: cfg['services']['agent-runtime'].update(ports=['0.0.0.0:3000:3000']),
                    lambda cfg: cfg['services']['agent-runtime']['environment'].update(DOJO_AI_ENABLED='true'),
                    lambda cfg: cfg['services']['agent-runtime']['environment'].update(AISECEDU_PUBLIC_ORIGIN='https://public.example'),
                    lambda cfg: cfg['services']['deepseek-harness']['networks'].update(frontend={}),
                    lambda cfg: cfg['services']['deepseek-harness']['environment'].update(DEEPSEEK_BASE_URL='https://provider.example'),
                    lambda cfg: cfg['networks']['teaching'].update(internal=False),
                    lambda cfg: cfg['networks'].update({'model-egress': {}}),
                    lambda cfg: cfg['services'].update({'teaching-worker': {}}),
                ):
                    bad = copy.deepcopy(config)
                    change(bad)
                    result = self.run_script(*options, rendered_base, self.write_json('candidate.json', bad))
                    self.assertEqual(result.returncode, 1, result.stdout)
                    self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
