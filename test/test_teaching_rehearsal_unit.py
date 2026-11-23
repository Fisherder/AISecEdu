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
TEACHING_LAYERS = (STAGING / 'harness.compose.yml', STAGING / 'classroom.compose.yml')
APP_OVERLAY = STAGING / 'teaching-app.compose.yml'


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

    def render(self, *paths, ai_enabled='true'):
        env = {'PATH': os.environ['PATH'], 'HOME': str(self.root)}
        for prefix in ('HARNESS', 'CLASSROOM', 'INSPECTOR'):
            env[f'AISECEDU_{prefix}_IMAGE'] = f'sha256:{"a" * 64}'
        env.update(AISECEDU_HARNESS_ENV_FILE=str(self.root / 'fixture-harness.env'),
                   AISECEDU_CLASSROOM_ENV_FILE=str(self.root / 'fixture-classroom.env'),
                   AISECEDU_CLASSROOM_AUTH_FILE=str(self.root / 'fixture-auth.env'),
                   AISECEDU_CLASSROOM_PUBLIC_ORIGIN='http://127.0.0.1:28081',
                   AISECEDU_CLASSROOM_AI_ENABLED=ai_enabled)
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

    def require_compose(self):
        try:
            version = subprocess.run([*self.compose, 'version'], capture_output=True, timeout=10,
                                     env={'PATH': os.environ['PATH'], 'HOME': str(self.root)})
        except FileNotFoundError:
            self.skipTest('Docker Compose CLI is required for the offline merge test')
        if version.returncode != 0:
            self.skipTest('Docker Compose CLI is required for the offline merge test')

    def test_native_compose_merges_and_validator_rejects_configuration_drift(self):
        self.require_compose()
        raw_base = self.write_json('host.json', self.base)
        rendered_base = self.write_json('base.json', self.render(raw_base))
        amendment = self.root / 'amendment.yaml'
        for edge_enabled in (False, True):
            with self.subTest(edge_enabled=edge_enabled):
                options = ('--edge',) if edge_enabled else ()
                result = self.run_script(*options, rendered_base)
                self.assertEqual(result.returncode, 0, result.stderr)
                amendment.write_text(result.stdout)
                config = self.render(raw_base, *TEACHING_LAYERS, APP_OVERLAY, amendment)
                self.assertEqual(set(config['services']['deepseek-harness']['networks']), {'teaching'})
                self.assertNotIn('model-egress', config['networks'])
                self.assertEqual('classroom-edge' in config['services']['edge']['networks'], edge_enabled)
                result = self.run_script(*options, rendered_base, self.write_json('candidate.json', config))
                self.assertEqual(result.returncode, 0, result.stderr)

                without_overlay = self.render(raw_base, *TEACHING_LAYERS, amendment)
                result = self.run_script(*options, rendered_base, self.write_json('without-overlay.json', without_overlay))
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertIn('Missing or altered host integration network attachment', result.stderr)

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

    def test_app_connection_only_adds_app_to_teaching(self):
        self.require_compose()
        raw_base = self.write_json('host.json', self.base)
        for ai_enabled in ('false', 'true'):
            with self.subTest(ai_enabled=ai_enabled):
                before = self.render(raw_base, *TEACHING_LAYERS, ai_enabled=ai_enabled)
                after = self.render(raw_base, *TEACHING_LAYERS, APP_OVERLAY, ai_enabled=ai_enabled)
                self.assertEqual(after['services']['agent-runtime']['environment']['DOJO_AI_ENABLED'], ai_enabled)
                self.assertEqual(set(after['services']['deepseek-harness']['networks']), {'teaching', 'model-egress'})
                self.assertTrue(after['networks']['teaching']['internal'])
                self.assertEqual(after['services']['app']['networks']['frontend'], {'aliases': ['app']})
                self.assertEqual(set(after['services']['app']['networks']), {'backend', 'frontend', 'teaching'})
                self.assertEqual(after['volumes'], before['volumes'])
                for name in ('db', 'cache', 'edge'):
                    self.assertEqual(after['services'][name], before['services'][name])

                reference = self.write_json('before.json', before)
                candidate = self.write_json('after.json', after)
                result = self.run_script('--check-app-connection', reference, candidate)
                self.assertEqual(result.returncode, 0, result.stderr)

        for change in (
            lambda cfg: cfg['services']['app']['networks'].pop('teaching'),
            lambda cfg: cfg['services']['app']['networks'].pop('backend'),
            lambda cfg: cfg['services']['app']['networks'].update(**{'model-egress': {}}),
            lambda cfg: cfg['services']['app']['networks']['teaching'].update(aliases=['replacement']),
            lambda cfg: cfg['services']['db']['networks'].update(teaching={}),
            lambda cfg: cfg['services']['cache']['networks'].update(**{'model-egress': {}}),
            lambda cfg: cfg['services']['edge']['networks'].update(teaching={}),
            lambda cfg: cfg['services']['edge']['ports'][0].update(host_ip='0.0.0.0'),
            lambda cfg: cfg['services']['agent-runtime']['environment'].update(DOJO_AI_ENABLED='false'),
            lambda cfg: cfg['services']['deepseek-harness']['networks'].pop('model-egress'),
            lambda cfg: cfg['services']['deepseek-harness']['environment'].update(DEEPSEEK_BASE_URL='https://new.example'),
            lambda cfg: cfg['networks']['teaching'].update(internal=False),
            lambda cfg: cfg['volumes'].pop('postgres'),
            lambda cfg: cfg['services'].update({'teaching-worker': {'networks': {'teaching': {}}}}),
        ):
            bad = copy.deepcopy(after)
            change(bad)
            with self.subTest(candidate=bad):
                result = self.run_script('--check-app-connection', reference, self.write_json('bad.json', bad))
                self.assertEqual(result.returncode, 1, result.stdout)
                self.assertEqual(result.stdout, '')

    def test_app_connection_rejects_an_unsafe_reference(self):
        self.require_compose()
        raw_base = self.write_json('host.json', self.base)
        before = self.render(raw_base, *TEACHING_LAYERS)
        for change in (
            lambda cfg: cfg['networks']['teaching'].update(internal=False),
            lambda cfg: cfg['services']['db']['networks'].update(teaching={}),
            lambda cfg: cfg['services']['deepseek-harness']['networks'].update(backend={}),
            lambda cfg: cfg['services']['agent-runtime'].update(ports=['0.0.0.0:3000:3000']),
        ):
            unsafe = copy.deepcopy(before)
            change(unsafe)
            candidate = copy.deepcopy(unsafe)
            candidate['services']['app']['networks']['teaching'] = {}
            result = self.run_script('--check-app-connection', self.write_json('unsafe.json', unsafe),
                                     self.write_json('candidate.json', candidate))
            self.assertEqual(result.returncode, 1, result.stdout)
            self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
