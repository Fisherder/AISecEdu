import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('generation_release', Path(__file__).parents[1] / 'ops/generation-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class GenerationReleaseTests(unittest.TestCase):
    def test_rejects_tampered_archive_and_unpinned_images(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = b'immutable image archive'
            (root / 'images.tar').write_bytes(archive)
            manifest = {'schema': 'aisecedu-generation-release-v1', 'commit': 'a' * 40,
                        'images': {'agent-runtime': 'sha256:' + 'b' * 64, 'courseware-inspector': 'sha256:' + 'c' * 64},
                        'archiveSha256': hashlib.sha256(archive).hexdigest()}
            (root / 'release.json').write_text(json.dumps(manifest))
            self.assertEqual(release.validate_manifest(root), manifest)
            (root / 'images.tar').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError, 'checksum'):
                release.validate_manifest(root)
            manifest['images']['agent-runtime'] = 'aisecedu/agent-runtime:latest'
            (root / 'release.json').write_text(json.dumps(manifest))
            with self.assertRaisesRegex(ValueError, 'pin both'):
                release.validate_manifest(root)

    def test_overlay_promotes_both_images_with_scoped_feature_flag(self):
        value = release.overlay({'agent-runtime': 'sha256:runtime', 'courseware-inspector': 'sha256:inspector'})
        self.assertEqual(set(value['services']), set(release.SERVICES))
        self.assertEqual(value['services']['agent-runtime']['environment']['AISECEDU_TEACHING_DEMO_ENGINE'], 'html-v1')
        self.assertNotIn('build', value['services']['agent-runtime'])
        self.assertEqual(value['services']['agent-runtime']['pull_policy'], 'never')

    def test_apply_checks_pair_and_restores_previous_pair_on_health_failure(self):
        from argparse import Namespace
        for fail in (False, True):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                previous = {name: 'sha256:' + '1' * 64 for name in release.SERVICES}
                current = {name: 'sha256:' + '2' * 64 for name in release.SERVICES}
                manifest = {'commit': 'a' * 40, 'images': current}
                (root / 'images.tar').write_bytes(b'test archive')
                def execute(args, **kwargs):
                    if fail and args[-1].startswith('fetch('):
                        raise release.subprocess.CalledProcessError(1, args)
                with patch.object(release, 'ROOT', root), patch.object(release, 'validate_manifest', return_value=manifest), patch.object(release, 'output', return_value='AISECEDU_TEACHING_DEMO_ENGINE='), patch.object(release, 'read_active_override', return_value=('docker-compose.staging.yml', {'services': {'ctfd': {'environment': {'KEEP': 'original'}}, 'agent-runtime': {'environment': {'API_KEY': 'private-test'}}}})), patch.object(release, 'installed_ids', side_effect=[previous, current]), patch.object(release, 'command', side_effect=execute) as command, patch.object(release, 'restore') as restore:
                    args = Namespace(bundle=root, container='development', apply=True)
                    if fail:
                        with self.assertRaises(release.subprocess.CalledProcessError):
                            release.deploy(args)
                        restore.assert_called_once()
                    else:
                        release.deploy(args)
                        restore.assert_not_called()
                    calls = [item.args[0] for item in command.call_args_list]
                    self.assertTrue(any('--no-build' in item and '--no-deps' in item for item in calls))
                    saved = json.loads((root / '.local-state/generation-releases/development/previous.json').read_text())
                    self.assertEqual(saved['services']['agent-runtime']['image'], previous['agent-runtime'])
                    self.assertEqual(saved['services']['ctfd']['environment'], {'KEEP': 'original'})
                    pending = json.loads((root / '.local-state/generation-releases/development/pending.json').read_text())
                    self.assertEqual(pending['services']['agent-runtime']['environment']['API_KEY'], 'private-test')
                    self.assertEqual(pending['services']['ctfd']['environment'], {'KEEP': 'original'})
                    self.assertEqual(saved['services']['agent-runtime']['environment']['AISECEDU_TEACHING_DEMO_ENGINE'], '')

    def test_export_keeps_the_verified_running_images_without_building(self):
        from argparse import Namespace
        with tempfile.TemporaryDirectory() as folder:
            bundle = Path(folder) / 'release'
            images = {name: 'sha256:' + 'a' * 64 for name in release.SERVICES}
            def execute(args, **kwargs):
                kwargs['stdout'].write(b'exact running images')
            with patch.object(release, 'output', side_effect=['b' * 40, '']), patch.object(release, 'installed_ids', return_value=images), patch.object(release, 'command', side_effect=execute) as command:
                release.export_running(Namespace(bundle=bundle, container='development'))
                manifest = release.validate_manifest(bundle)
                self.assertEqual(manifest['images'], images)
                self.assertEqual(command.call_args.args[0][:5], ['docker', 'exec', 'development', 'docker', 'save'])

    def test_default_deploy_is_read_only(self):
        from argparse import Namespace
        with patch.object(release, 'validate_manifest', return_value={'commit': 'a' * 40, 'images': {}}), patch.object(release, 'output', return_value='a' * 40), patch.object(release, 'command') as command:
            release.deploy(Namespace(bundle=Path('/tmp/reviewed'), container='development', apply=False))
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
