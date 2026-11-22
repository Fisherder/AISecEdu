import hashlib
import gzip
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from argparse import Namespace
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('generation_release', Path(__file__).parents[1] / 'ops/generation-release.py')
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


def image_inspection(image_id, revision, operating_system='linux', architecture='amd64'):
    labels = {'org.opencontainers.image.revision': revision} if revision else None
    return json.dumps([{
        'Id': image_id, 'Os': operating_system, 'Architecture': architecture, 'Config': {'Labels': labels},
    }])


class GenerationReleaseTests(unittest.TestCase):
    def test_package_tested_pins_source_platform_and_exact_exported_ids(self):
        import subprocess
        import sys
        from contextlib import ExitStack

        commit = 'a' * 40
        ids = ['sha256:' + code * 64 for code in '12']
        popen = subprocess.Popen
        for case in ('valid', 'wrong-revision', 'wrong-platform', 'interrupted-export'):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as folder, ExitStack() as mocks:
                bundle = Path(folder) / 'release'
                args = Namespace(commit=commit, bundle=bundle, runtime_image='runtime', inspector_image='inspector')
                inspection = [
                    json.dumps([{'Id': image_id, 'Os': 'linux',
                                 'Architecture': 'arm64' if index == 1 and case == 'wrong-platform' else 'amd64',
                                 'Config': {'Labels': {'org.opencontainers.image.revision':
                                                        'b' * 40 if index == 1 and case == 'wrong-revision' else commit}}}])
                    for index, image_id in enumerate(ids)
                ]
                mocks.enter_context(patch.object(release, 'output', side_effect=inspection))

                def save(command, **kwargs):
                    self.assertEqual(command, ['docker', 'image', 'save', *ids])
                    result = 1 if case == 'interrupted-export' else 0
                    return popen([sys.executable, '-c', f"print('synthetic tar');raise SystemExit({result})"], **kwargs)

                exporter = mocks.enter_context(patch.object(release.subprocess, 'Popen', side_effect=save))
                if case != 'valid':
                    with self.assertRaises(ValueError):
                        release.package_tested(args)
                    self.assertFalse(bundle.exists())
                    self.assertEqual(exporter.called, case == 'interrupted-export')
                    continue
                release.package_tested(args)
                manifest = release.validate_manifest(bundle)
                self.assertEqual(list(manifest['images'].values()), ids)
                self.assertEqual(manifest['archiveSha256'], hashlib.sha256(b'synthetic tar\n').hexdigest())
                self.assertFalse((bundle / 'images.tar').exists())
                self.assertEqual(len((bundle / 'SHA256SUMS').read_text().splitlines()), 2)
                (bundle / 'images.tar.gz').write_bytes(gzip.compress(b'changed archive'))
                with self.assertRaisesRegex(ValueError, 'checksum'):
                    release.validate_manifest(bundle)

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
        with tempfile.TemporaryDirectory() as folder:
            bundle = Path(folder) / 'release'
            revision = 'b' * 40
            ids = ['sha256:' + char * 64 for char in '12']
            images = dict(zip(release.SERVICES, ids))

            def execute(args, **kwargs):
                kwargs['stdout'].write(b'exact running images')

            receipts = [revision, '', *ids, *(image_inspection(image_id, revision) for image_id in ids)]
            with patch.object(release, 'output', side_effect=receipts) as output, \
                    patch.object(release, 'command', side_effect=execute) as command:
                release.export_running(Namespace(bundle=bundle, container='development'))
                manifest = release.validate_manifest(bundle)
                self.assertEqual(manifest['commit'], revision)
                self.assertEqual(manifest['platform'], 'linux/amd64')
                self.assertEqual(manifest['images'], images)
                self.assertEqual(manifest['sourceContainer'], 'development')
                docker = ['docker', 'exec', 'development', 'docker']
                self.assertEqual([call.args[0] for call in output.call_args_list[2:]], [
                    *[docker + ['inspect', '--format', '{{.Image}}', name] for name in release.SERVICES],
                    *[docker + ['image', 'inspect', '--', image_id] for image_id in ids],
                ])
                command.assert_called_once()
                self.assertEqual(command.call_args.args[0], docker + ['save', *ids])

    def test_export_rejects_unverified_running_images_before_creating_the_bundle(self):
        revision = 'b' * 40
        ids = ['sha256:' + char * 64 for char in '12']
        cases = (
            (0, {'revision': None}, f'agent-runtime is not a linux/amd64 image for {revision}'),
            (1, {'revision': 'a' * 40}, f'courseware-inspector is not a linux/amd64 image for {revision}'),
            (0, {'operating_system': 'windows'}, f'agent-runtime is not a linux/amd64 image for {revision}'),
            (1, {'architecture': 'arm64'}, f'courseware-inspector is not a linux/amd64 image for {revision}'),
            (1, {'image_id': 'latest'}, 'courseware-inspector does not have a full image ID'),
            (1, {'image_id': ids[0]}, 'The classroom and inspector must use distinct images'),
            (1, {'image_id': 'sha256:' + '3' * 64}, 'Image inspection did not return the running image IDs'),
        )
        for index, overrides, error in cases:
            with self.subTest(index=index, overrides=overrides), tempfile.TemporaryDirectory() as folder:
                bundle = Path(folder) / 'new-release'
                previous = Path(folder) / 'previous-release'
                previous.mkdir()
                (previous / 'images.tar').write_bytes(b'preserved previous image pair')
                metadata = [{'image_id': image_id, 'revision': revision} for image_id in ids]
                metadata[index].update(overrides)
                receipts = [revision, '', *ids, *(image_inspection(**info) for info in metadata)]
                with patch.object(release, 'output', side_effect=receipts), \
                        patch.object(release, 'command') as command:
                    with self.assertRaisesRegex(ValueError, error):
                        release.export_running(Namespace(bundle=bundle, container='development'))
                command.assert_not_called()
                self.assertFalse(bundle.exists())
                self.assertEqual((previous / 'images.tar').read_bytes(), b'preserved previous image pair')

    def test_default_deploy_is_read_only(self):
        from argparse import Namespace
        with patch.object(release, 'validate_manifest', return_value={'commit': 'a' * 40, 'images': {}}), patch.object(release, 'output', return_value='a' * 40), patch.object(release, 'command') as command:
            release.deploy(Namespace(bundle=Path('/tmp/reviewed'), container='development', apply=False))
            command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
