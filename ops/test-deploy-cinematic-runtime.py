"""Local mocks only: never import the deployer's executable release body."""
import ast
import io
import json
from pathlib import Path
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

SOURCE = Path(__file__).with_name('deploy-cinematic-runtime.py')
TREE = ast.parse(SOURCE.read_text())
SAFE = [node for node in TREE.body if isinstance(node, (ast.Import, ast.ImportFrom, ast.FunctionDef)) or
        isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'CTFD_PROBE' for target in node.targets)]


def assigns(node, name):
    return isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == name
                                               for target in node.targets)


def calls(node, name):
    return any(isinstance(child, ast.Call) and isinstance(child.func, ast.Name) and child.func.id == name
               for child in ast.walk(node))


def release_configuration(version):
    end = next(index for index, node in enumerate(TREE.body) if isinstance(node, ast.FunctionDef))
    nodes = [node for node in TREE.body[:end] if isinstance(node, (ast.Assign, ast.Assert))]
    namespace = {'Path': Path, 'sys': SimpleNamespace(argv=[str(SOURCE), version])}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)
    return namespace


class DeploymentSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cinematic-deploy-test-')
        self.addCleanup(self.temp.cleanup)
        self.ns = {}
        exec(compile(ast.Module(body=SAFE, type_ignores=[]), str(SOURCE), 'exec'), self.ns)
        self.ns.update(VERSION='v8', ROOT=Path(self.temp.name) / 'source', WORK=Path(self.temp.name) / 'evidence', EXPECTED='sha256:previous')
        self.ns['ROOT'].mkdir()
        self.ns['WORK'].mkdir()
        self.sources = {'dojo_plugin/api/v1/teaching.py': 'new-hash'}
        self.before = {'master': {'pid': 8}, 'workers': [{'pid': pid, 'startTicks': 1} for pid in range(20, 52)]}
        self.after = {'master': {'pid': 8}, 'workers': [{'pid': pid, 'startTicks': 2} for pid in range(60, 92)], 'http': {'status': 200}}

    def test_probe_is_scoped_to_container_not_host_pids(self):
        inner = Mock(return_value=SimpleNamespace(stdout='ignored startup notice\nCTFD_PROBE={"checked":true}\n'))
        with patch.dict(self.ns, inner=inner):
            result = self.ns['ctfd_probe']('check', self.sources)
        self.assertTrue(result['checked'])
        args, kwargs = inner.call_args
        self.assertEqual(args[:4], ('exec', 'ctfd', 'python', '-c'))
        self.assertEqual(json.loads(args[-1])['mode'], 'check')
        self.assertEqual(kwargs['timeout'], 45)
        self.assertIn('signal.pidfd_send_signal', args[4])
        self.assertNotIn('os.kill(', args[4])

    def test_probe_rejects_ambiguous_output_and_non_v8(self):
        with patch.dict(self.ns, inner=Mock(return_value=SimpleNamespace(stdout='CTFD_PROBE={}\nCTFD_PROBE={}'))):
            with self.assertRaisesRegex(RuntimeError, 'ambiguous'):
                self.ns['ctfd_probe']('check', self.sources)
        for version in ['v7', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            with self.subTest(version=version), patch.dict(self.ns, VERSION=version, inner=Mock()):
                for mode in ['check', 'hup', 'health']:
                    with self.assertRaisesRegex(RuntimeError, 'v8-only'):
                        self.ns['ctfd_probe'](mode, self.sources)
                self.ns['inner'].assert_not_called()

    def test_runtime_only_versions_cannot_reload_ctfd_in_either_direction(self):
        for version in ['v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            with self.subTest(version=version), patch.dict(self.ns, VERSION=version, ctfd_probe=Mock(), preserved_containers=Mock()):
                for phase in ['forward', 'rollback']:
                    with self.assertRaisesRegex(RuntimeError, 'Unexpected CTFd reload'):
                        self.ns['reload_ctfd'](self.sources, phase, self.before, [])
                self.ns['ctfd_probe'].assert_not_called()
                self.ns['preserved_containers'].assert_not_called()

    def test_forward_waits_for_stable_new_workers_and_health(self):
        probe = Mock(side_effect=[self.before, {'signal': 'SIGHUP'}, self.after, self.after, self.after])
        preserved = Mock()
        with patch.dict(self.ns, ctfd_probe=probe, preserved_containers=preserved), patch.object(self.ns['time'], 'sleep'):
            report = self.ns['reload_ctfd'](self.sources, 'forward', self.before, [])
        self.assertEqual([call.args[0] for call in probe.call_args_list], ['check', 'hup', 'health', 'health', 'health'])
        self.assertTrue(report['ready'])
        self.assertEqual(report['newWorkerCount'], 32)
        self.assertFalse(report['workerModuleImportProven'])
        self.assertEqual(preserved.call_count, 2)
        self.assertTrue(Path(report['evidence']).is_file())

    def test_failed_precheck_never_sends_hup(self):
        probe = Mock(side_effect=RuntimeError('source hash mismatch'))
        with patch.dict(self.ns, ctfd_probe=probe, preserved_containers=Mock()):
            with self.assertRaisesRegex(RuntimeError, 'source hash'):
                self.ns['reload_ctfd'](self.sources, 'forward', self.before, [])
        self.assertEqual([call.args[0] for call in probe.call_args_list], ['check'])
        report = json.loads(next(self.ns['WORK'].glob('ctfd-forward-*.json')).read_text())
        self.assertFalse(report['signalSent'])

    def test_health_timeout_is_not_reported_ready(self):
        probe = Mock(side_effect=[self.before, {'signal': 'SIGHUP'}, RuntimeError('health failed')])
        with patch.dict(self.ns, ctfd_probe=probe, preserved_containers=Mock()), patch.object(self.ns['time'], 'monotonic', side_effect=[0, 1, 181]), patch.object(self.ns['time'], 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'stable new'):
                self.ns['reload_ctfd'](self.sources, 'forward', self.before, [])
        report = json.loads(next(self.ns['WORK'].glob('ctfd-forward-*.json')).read_text())
        self.assertTrue(report['signalSent'])
        self.assertNotIn('ready', report)

    def test_container_preservation_rejects_unrelated_restart(self):
        item = {'Name': '/ctfd', 'Id': 'ctfd-id', 'State': {'StartedAt': 'original', 'Running': True}}
        changed = {**item, 'State': {**item['State'], 'StartedAt': 'new'}}
        with patch.dict(self.ns, output=Mock(return_value=json.dumps([changed]))):
            with self.assertRaisesRegex(RuntimeError, 'Unrelated container'):
                self.ns['preserved_containers']([item])

    def test_container_preservation_rejects_stop_without_changed_start_time(self):
        item = {'Name': '/ctfd', 'Id': 'ctfd-id', 'State': {'StartedAt': 'original', 'Running': True}}
        stopped = {**item, 'State': {**item['State'], 'Running': False}}
        with patch.dict(self.ns, output=Mock(return_value=json.dumps([stopped]))):
            with self.assertRaisesRegex(RuntimeError, 'Unrelated container'):
                self.ns['preserved_containers']([item])

    def test_image_identity_rejects_tag_drift_and_invalid_ids(self):
        expected = 'sha256:' + 'a' * 64
        for value in ['sha256:' + 'b' * 64, 'not-an-image', 'sha256:' + 'g' * 64]:
            with self.subTest(value=value), patch.dict(self.ns, output=Mock(return_value=value)):
                with self.assertRaisesRegex(RuntimeError, 'image identity'):
                    self.ns['verified_image_id']('previous-release-tag', expected)
        with patch.dict(self.ns, output=Mock(return_value=expected)):
            self.assertEqual(self.ns['verified_image_id']('previous-release-tag', expected), expected)

    def test_build_base_alias_uses_only_verified_existing_identity(self):
        expected = 'sha256:' + 'a' * 64
        for version in ['v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            verify, inner = Mock(return_value=expected), Mock()
            with self.subTest(version=version), patch.dict(self.ns, VERSION=version, verified_image_id=verify, inner=inner):
                identity, alias = self.ns['prepare_build_base']('previous-release-tag', expected)
            self.assertEqual(identity, expected)
            self.assertTrue(alias.startswith('aisecedu/agent-runtime:cinematic-build-base-' + version + '-'))
            inner.assert_called_once_with('tag', expected, alias)
            self.assertEqual(verify.call_args_list[0].args, ('previous-release-tag', expected))
            self.assertEqual(verify.call_args_list[1].args, (alias, expected))
        with patch.dict(self.ns, verified_image_id=Mock(side_effect=RuntimeError('drift')), inner=Mock()) as _:
            with self.assertRaisesRegex(RuntimeError, 'drift'):
                self.ns['prepare_build_base']('previous-release-tag', expected)
            self.ns['inner'].assert_not_called()

    def test_rollback_restores_source_before_reloading_and_runtime(self):
        order = []
        output = Mock(side_effect=['healthy', 'sha256:previous'])
        with patch.dict(self.ns,
            restore_guarded_source=lambda hashes: order.append('restore'),
            reload_ctfd=lambda *args: order.append('hup') or {'ready': True},
            inner=lambda *args: order.append('tag'), restart_runtime=lambda: order.append('runtime'),
            output=output, preserved_containers=Mock()):
            self.ns['rollback_guarded_release'](self.sources, self.before, [], True)
        self.assertEqual(order, ['restore', 'hup', 'tag', 'runtime'])

    def test_source_rollback_keeps_replaced_files_recoverable(self):
        root, work = self.ns['ROOT'], self.ns['WORK']
        (root / 'old.py').write_text('new revision')
        (root / 'added.py').write_text('recover this')
        with tarfile.open(work / 'source-before.tar', 'w') as archive:
            data = b'previous revision'
            entry = tarfile.TarInfo('old.py')
            entry.size = len(data)
            archive.addfile(entry, io.BytesIO(data))
        hashes = self.ns['backup_hashes'](['old.py', 'added.py'])
        self.ns['restore_guarded_source'](hashes)
        self.assertEqual((root / 'old.py').read_text(), 'previous revision')
        self.assertFalse((root / 'added.py').exists())
        with tarfile.open(next(work.glob('source-rollback-replaced-*.tar'))) as archive:
            self.assertEqual(archive.extractfile('old.py').read(), b'new revision')
            self.assertEqual(archive.extractfile('added.py').read(), b'recover this')

    def test_backup_and_restore_preserve_adjacent_theme_alias(self):
        root, work = self.ns['ROOT'], self.ns['WORK']
        (root / 'theme').mkdir()
        (root / 'theme/view.js').write_text('original source')
        (root / 'theme/view.min.js').symlink_to('view.js')
        names = ['theme/view.js', 'theme/view.min.js']
        with tarfile.open(work / 'source-before.tar', 'w') as archive:
            for name in names:
                archive.add(root / name, arcname=name, recursive=False)
        hashes = self.ns['backup_hashes'](names)
        self.assertEqual(hashes[names[0]], hashes[names[1]])
        (root / names[1]).unlink()
        (root / names[1]).write_text('new regular file')
        (root / names[0]).write_text('new source')
        self.ns['restore_guarded_source'](hashes)
        self.assertTrue((root / names[1]).is_symlink())
        self.assertEqual((root / names[1]).readlink(), Path('view.js'))
        self.assertEqual((root / names[1]).read_text(), 'original source')

    def test_backup_rejects_outside_missing_and_chained_symlinks(self):
        work = self.ns['WORK']
        for target in ['/etc/passwd', '../outside.js', 'missing.js', 'second.js']:
            with self.subTest(target=target):
                with tarfile.open(work / 'source-before.tar', 'w') as archive:
                    first = tarfile.TarInfo('theme/first.js')
                    first.type, first.linkname = tarfile.SYMTYPE, target
                    archive.addfile(first)
                    second = tarfile.TarInfo('theme/second.js')
                    second.type, second.linkname = tarfile.SYMTYPE, 'first.js'
                    archive.addfile(second)
                with self.assertRaisesRegex(RuntimeError, 'symlink target'):
                    self.ns['backup_hashes'](['theme/first.js', 'theme/second.js'])

    def test_runtime_only_release_rejects_python_theme_dependencies_or_deleted_source(self):
        validate = self.ns['validate_runtime_only_release']
        for name in ['dojo_plugin/api/v1/teaching.py', 'dojo_theme/templates/teaching_artifact.html',
                     'services/agent-runtime/package.json', 'services/agent-runtime/pnpm-lock.yaml']:
            with self.subTest(name=name), self.assertRaisesRegex(RuntimeError, 'cannot change'):
                validate({name: {'after': 'old'}}, {name: {'after': 'new'}})
        with self.assertRaisesRegex(RuntimeError, 'cannot change'):
            validate({'services/agent-runtime/lib/example.ts': {'after': 'old'}}, {})
        validate({'dojo_plugin/api/v1/teaching.py': {'after': 'old'}}, {
            'dojo_plugin/api/v1/teaching.py': {'after': 'old'},
            'services/agent-runtime/lib/cinematic/intent-diagnostics.ts': {'after': 'new'}})

    def test_runtime_only_rollback_restores_source_and_runtime_without_ctfd_signal(self):
        for version in ['v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            expected = release_configuration(version)['EXPECTED']
            order, reload, probe = [], Mock(), Mock()
            tag = Mock(side_effect=lambda *args: order.append('tag'))
            preserved = Mock()
            with self.subTest(version=version), patch.dict(self.ns,
                VERSION=version, EXPECTED=expected,
                restore_guarded_source=lambda hashes: order.append('restore'), reload_ctfd=reload,
                ctfd_probe=probe, inner=tag, restart_runtime=lambda: order.append('runtime'),
                output=Mock(side_effect=['healthy', expected]), preserved_containers=preserved):
                self.ns['rollback_guarded_release'](self.sources, None, [], True)
            self.assertEqual(order, ['restore', 'tag', 'runtime'])
            tag.assert_called_once_with('tag', expected, 'pwncollege-agent-runtime:latest')
            preserved.assert_called_once_with([])
            reload.assert_not_called()
            probe.assert_not_called()
            receipt = max(self.ns['WORK'].glob('rollback-*.json'), key=lambda path: path.name)
            report = json.loads(receipt.read_text())
            self.assertEqual(report['previousImage'], expected)
            self.assertEqual(report['errors'], [])
            self.assertTrue(report['unrelatedContainersPreserved'])
            self.assertNotIn('ctfd', report)

    def test_v10_configuration_pins_live_v9_as_previous_release(self):
        config = release_configuration('v10')
        self.assertEqual(config['EXPECTED'], 'sha256:5255ff6f2fabe71c89360365bf6424ca6313b74670bd2c2f08ac38faf79994a5')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v9')
        self.assertEqual(config['BASE_IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v9')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v10')
        self.assertEqual(config['INCOMING'], Path('/tmp/aisecedu-cinematic-20260912/v10'))
        self.assertEqual(config['WORK'].name, 'release-v10')
        self.assertEqual(release_configuration('v9')['PREVIOUS_VERSION'], 'v8')
        self.assertEqual(release_configuration('v9')['EXPECTED'], 'sha256:419097771ad1dce5696cc467020af99595f5ff3dba0cf08324af15f10896a3ce')
        with self.assertRaises(AssertionError):
            release_configuration('v20')

    def test_runtime_only_versions_use_every_guarded_rollback_gate(self):
        runtime_guard = next(node for node in TREE.body if isinstance(node, ast.If) and calls(node, 'validate_runtime_only_release'))
        backup_guard = next(node for node in TREE.body if isinstance(node, ast.If) and calls(node, 'backup_hashes'))
        rollback_guard = next(node for node in ast.walk(TREE) if isinstance(node, ast.If) and calls(node, 'rollback_guarded_release'))
        partial_source_guard = next(node for node in ast.walk(TREE) if isinstance(node, ast.If)
                                    and any(assigns(child, 'source_applied') for child in node.body))
        for guard, allowed in [(runtime_guard, {'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}), (backup_guard, {'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}),
                               (rollback_guard, {'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}), (partial_source_guard, {'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'})]:
            for version in ['v7', 'v8', 'v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19', 'v20']:
                with self.subTest(line=guard.lineno, version=version):
                    self.assertEqual(eval(compile(ast.Expression(guard.test), str(SOURCE), 'eval'), {'VERSION': version}), version in allowed)
        validate = Mock()
        for version in ['v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            namespace = {'VERSION': version, 'previous': {'files': {'old': {}}},
                         'latest': {'files': {'new': {}}}, 'validate_runtime_only_release': validate}
            exec(compile(ast.Module(body=[runtime_guard], type_ignores=[]), str(SOURCE), 'exec'), namespace)
        self.assertEqual(validate.call_count, 11)
        self.assertTrue(all(call.args == ({'old': {}}, {'new': {}}) for call in validate.call_args_list))

    def test_runtime_only_receipts_preserve_image_evidence_and_never_claim_ctfd_reload(self):
        start = next(index for index, node in enumerate(TREE.body) if assigns(node, 'deployment'))
        nodes = TREE.body[start:start + 2]
        self.assertIsInstance(nodes[1], ast.If)
        for version in ['v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            namespace = {**release_configuration(version), 'built_image': 'sha256:' + 'b' * 64,
                         'base_id': 'sha256:' + 'a' * 64, 'base_alias': 'unique-verified-build-alias', 'status': '403'}
            exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)
            report = namespace['deployment']
            self.assertEqual(report['image'], namespace['built_image'])
            self.assertEqual(report['baseImage'], namespace['base_id'])
            self.assertEqual(report['baseAlias'], namespace['base_alias'])
            self.assertEqual(report['previousImage'], namespace['EXPECTED'])
            self.assertEqual(report['routeStatus'], '403')
            self.assertTrue(report['unrelatedContainersPreserved'])
            self.assertEqual(report['ctfdReload'], {'required': False, 'reason': 'Runtime-only release; Python sources unchanged'})

    def test_zero_queue_is_still_required_before_building(self):
        index = next(index for index, node in enumerate(TREE.body) if assigns(node, 'active'))
        nodes = TREE.body[index:index + 2]
        self.assertIsInstance(nodes[1], ast.Assert)
        build = next(node for node in TREE.body if isinstance(node, ast.Assign) and calls(node, 'prepare_build_base'))
        self.assertLess(nodes[1].lineno, build.lineno)
        for count in ['0', '1', '2', 'unknown']:
            output = Mock(return_value='startup notice\nACTIVE=' + count)
            namespace = {'output': output}
            with self.subTest(count=count):
                if count == '0':
                    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)
                else:
                    with self.assertRaisesRegex(AssertionError, 'Active generation jobs'):
                        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)
            output.assert_called_once()
            self.assertEqual(output.call_args.args[:4], ('exec', 'ctfd', 'python', '-c'))
            self.assertIn('["RUNNING","QUEUED","CANCEL_REQUESTED"]', output.call_args.args[4])

    def test_queue_is_rechecked_after_build_before_any_source_change(self):
        indexes = [index for index, node in enumerate(TREE.body) if assigns(node, 'active')]
        self.assertEqual(len(indexes), 2)
        nodes = TREE.body[indexes[-1]:indexes[-1] + 2]
        built = next(node for node in TREE.body if assigns(node, 'built_image'))
        applied = next(node for node in TREE.body if assigns(node, 'source_applied'))
        self.assertLess(built.lineno, nodes[0].lineno)
        self.assertLess(nodes[1].lineno, applied.lineno)
        self.assertEqual(nodes[0].value.args[-1].value, TREE.body[indexes[0]].value.args[-1].value)
        for count in ['0', '1', '2', 'unknown']:
            with self.subTest(count=count):
                namespace = {'output': Mock(return_value='ACTIVE=' + count)}
                if count == '0':
                    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)
                else:
                    with self.assertRaisesRegex(AssertionError, 'after build'):
                        exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)

    def test_v11_configuration_pins_live_v10_as_previous_release(self):
        config = release_configuration('v11')
        self.assertEqual(config['EXPECTED'], 'sha256:e1770f85433f8e0b6710f8eff72ed7648135fe0237d17a7d3f435250e8112f04')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v10')
        self.assertEqual(config['BASE_IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v10')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v11')
        self.assertEqual(config['INCOMING'], Path('/tmp/aisecedu-cinematic-20260912/v11'))
        self.assertEqual(config['WORK'].name, 'release-v11')

    def test_restart_only_targets_runtime_without_dependencies(self):
        run = Mock()
        with patch.dict(self.ns, run=run):
            self.ns['restart_runtime']()
        run.assert_called_once_with('docker', 'exec', 'pwncollege-dojo', 'dojo', 'compose',
                                    'up', '-d', '--no-build', '--no-deps', 'agent-runtime')

    def test_v12_configuration_pins_live_v11_as_previous_release(self):
        config = release_configuration('v12')
        self.assertEqual(config['EXPECTED'], 'sha256:460b998ab9e1694f19e2094a00e3934fefb124bfe7b18a2945c3104e239cef44')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v11')
        self.assertEqual(config['BASE_IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v11')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v12')
        self.assertEqual(config['INCOMING'], Path('/tmp/aisecedu-cinematic-20260912/v12'))
        self.assertEqual(config['WORK'].name, 'release-v12')

    def test_runtime_only_rollback_rejects_wrong_restored_image(self):
        for version in ['v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            expected = release_configuration(version)['EXPECTED']
            inner, reload, probe, preserved = Mock(), Mock(), Mock(), Mock()
            with self.subTest(version=version), patch.dict(self.ns, VERSION=version, EXPECTED=expected, inner=inner,
                            reload_ctfd=reload, ctfd_probe=probe, preserved_containers=preserved,
                            restart_runtime=Mock(), output=Mock(side_effect=['healthy', 'sha256:' + 'b' * 64])):
                with self.assertRaisesRegex(RuntimeError, 'Previous runtime image not restored'):
                    self.ns['rollback_guarded_release']({}, None, [], False)
            inner.assert_called_once_with('tag', expected, 'pwncollege-agent-runtime:latest')
            reload.assert_not_called()
            probe.assert_not_called()
            preserved.assert_not_called()
            receipt = max(self.ns['WORK'].glob('rollback-*.json'), key=lambda path: path.name)
            report = json.loads(receipt.read_text())
            self.assertEqual(report['previousImage'], expected)
            self.assertEqual(len(report['errors']), 1)
            self.assertNotIn('unrelatedContainersPreserved', report)

    def test_v13_configuration_pins_live_v12_and_previous_release_paths(self):
        config = release_configuration('v13')
        self.assertEqual(config['EXPECTED'], 'sha256:4355f3dac0ca9f7bd538783dc0a052860ee8816934f27c9da2332735988fbd2b')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v12')
        self.assertEqual(config['BASE_IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v12')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v13')
        self.assertEqual(config['INCOMING'], Path('/tmp/aisecedu-cinematic-20260912/v13'))
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v13'))
        previous = release_configuration(config['PREVIOUS_VERSION'])
        self.assertEqual(previous['WORK'] / 'deployed.json',
                         Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v12/deployed.json'))
        manifest = next(node for node in TREE.body if assigns(node, 'previous'))
        manifest_path = next(node for node in ast.walk(manifest) if isinstance(node, ast.Call)
                             and isinstance(node.func, ast.Name) and node.func.id == 'Path')
        self.assertEqual(eval(compile(ast.Expression(manifest_path), str(SOURCE), 'eval'), config),
                         Path('/tmp/aisecedu-cinematic-20260912/v12/manifest.json'))

    def test_v14_configuration_pins_live_v13_and_previous_release_paths(self):
        config = release_configuration('v14')
        self.assertEqual(config['EXPECTED'], 'sha256:9101aaf2e50dfaf014a2e60d8584398abae9e4e217ff6f8ade99f64c92e1357b')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v13')
        self.assertEqual(config['BASE_IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v13')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v14')
        self.assertEqual(config['INCOMING'], Path('/tmp/aisecedu-cinematic-20260912/v14'))
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v14'))
        previous = release_configuration(config['PREVIOUS_VERSION'])
        self.assertEqual(previous['WORK'] / 'deployed.json',
                         Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v13/deployed.json'))
        manifest = next(node for node in TREE.body if assigns(node, 'previous'))
        manifest_path = next(node for node in ast.walk(manifest) if isinstance(node, ast.Call)
                             and isinstance(node.func, ast.Name) and node.func.id == 'Path')
        self.assertEqual(eval(compile(ast.Expression(manifest_path), str(SOURCE), 'eval'), config),
                         Path('/tmp/aisecedu-cinematic-20260912/v13/manifest.json'))

    def test_cancel_requested_blocks_both_active_job_filters(self):
        index = next(index for index, node in enumerate(TREE.body) if assigns(node, 'active'))
        guard_nodes = TREE.body[index:index + 2]
        active_command = guard_nodes[0].value.args[-1].value
        expected_statuses = {'RUNNING', 'QUEUED', 'CANCEL_REQUESTED'}
        for source in [active_command, self.ns['CTFD_PROBE']]:
            query = next(node for node in ast.walk(ast.parse(source)) if isinstance(node, ast.Call)
                         and isinstance(node.func, ast.Attribute) and node.func.attr == 'count')
            for statuses in [[], ['RUNNING'], ['QUEUED'], ['CANCEL_REQUESTED'],
                             ['FAILED', 'CANCELED', 'SUCCEEDED'], ['CANCELED', 'CANCEL_REQUESTED']]:
                select = Mock(side_effect=lambda requested: tuple(requested))
                filtered = Mock(side_effect=lambda requested: SimpleNamespace(
                    count=lambda: sum(status in requested for status in statuses)))
                jobs = SimpleNamespace(status=SimpleNamespace(in_=select), query=SimpleNamespace(filter=filtered))
                count = eval(compile(ast.Expression(query), str(SOURCE), 'eval'), {'TeachingJobs': jobs})
                self.assertEqual(set(select.call_args.args[0]), expected_statuses)
                self.assertEqual(count, sum(status in expected_statuses for status in statuses))
                output = Mock(return_value='ACTIVE=' + str(count))
                with self.subTest(filter='ctfd' if source == self.ns['CTFD_PROBE'] else 'runtime', statuses=statuses):
                    if count:
                        with self.assertRaisesRegex(AssertionError, 'Active generation jobs'):
                            exec(compile(ast.Module(body=guard_nodes, type_ignores=[]), str(SOURCE), 'exec'), {'output': output})
                    else:
                        exec(compile(ast.Module(body=guard_nodes, type_ignores=[]), str(SOURCE), 'exec'), {'output': output})

    def test_v12_receipt_keeps_unavailable_memory_inflight_unknown(self):
        start = next(index for index, node in enumerate(TREE.body) if assigns(node, 'deployment'))
        nodes = TREE.body[start:start + 3]
        self.assertIsInstance(nodes[2], ast.If)
        for version in ['v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            namespace = {**release_configuration(version), 'built_image': 'sha256:' + 'b' * 64,
                         'base_id': 'sha256:' + 'a' * 64, 'base_alias': 'verified-build-alias', 'status': '403'}
            exec(compile(ast.Module(body=nodes, type_ignores=[]), str(SOURCE), 'exec'), namespace)
            report = namespace['deployment']
            if version in {'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19'}:
                self.assertIs(report['runtimeInflight']['checked'], False)
                self.assertIsNone(report['runtimeInflight']['count'])
                self.assertIn('No verified inflight endpoint', report['runtimeInflight']['reason'])
                self.assertIn('database job statuses only', report['runtimeInflight']['reason'])
            else:
                self.assertNotIn('runtimeInflight', report)

    def test_integrated_build_is_rejected_before_image_or_source_mutation(self):
        valid = {'basePath': '/agent-runtime', 'assetPrefix': '/agent-runtime', 'output': 'standalone'}
        self.ns['validate_runtime_build'](valid)
        for config in [None, {}, {**valid, 'basePath': ''}, {**valid, 'assetPrefix': ''},
                       {**valid, 'output': 'export'}]:
            with self.subTest(config=config), self.assertRaisesRegex(RuntimeError, 'live service was not changed'):
                self.ns['validate_runtime_build'](config)
        guard = next(node for node in TREE.body if isinstance(node, ast.With) and calls(node, 'validate_runtime_build'))
        backup = next(node for node in TREE.body if isinstance(node, ast.If) and calls(node, 'backup_hashes'))
        build = next(node for node in TREE.body if isinstance(node, ast.Assign) and calls(node, 'prepare_build_base'))
        applied = next(node for node in TREE.body if assigns(node, 'source_applied'))
        self.assertLess(guard.lineno, min(backup.lineno, build.lineno, applied.lineno))

    def test_runtime_smoke_is_private_bounded_and_cleans_only_its_own_container(self):
        replies = [SimpleNamespace(stdout='created-id'), SimpleNamespace(stdout='HEALTH=200', stderr=''),
                   SimpleNamespace(stdout='ready', stderr=''), SimpleNamespace(), SimpleNamespace()]
        inner = Mock(side_effect=replies)
        with patch.dict(self.ns, VERSION='v15', inner=inner):
            report = self.ns['smoke_runtime_build']('sha256:' + 'a' * 64)
        self.assertTrue(report['ready'])
        args = inner.call_args_list[0].args
        name = args[args.index('--name') + 1]
        self.assertTrue(name.startswith('cinematic-smoke-v15-'))
        self.assertEqual(args[args.index('--network') + 1], 'none')
        self.assertEqual(args[args.index('--memory') + 1], '1g')
        self.assertNotIn('--publish', args)
        self.assertNotIn('--volume', args)
        self.assertEqual(inner.call_args_list[-2].args, ('stop', '--time', '5', name))
        self.assertEqual(inner.call_args_list[-1].args, ('rm', name))
        self.assertTrue(list(self.ns['WORK'].glob('runtime-smoke-*.json')))

    def test_runtime_smoke_failure_never_touches_live_container(self):
        def inner(*args, **kwargs):
            if args[0] == 'exec':
                raise self.ns['subprocess'].CalledProcessError(1, 'isolated health probe')
            return SimpleNamespace(stdout='', stderr='')
        wrapped = Mock(side_effect=inner)
        with patch.dict(self.ns, VERSION='v15', inner=wrapped), patch.object(self.ns['time'], 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'live service was not changed'):
                self.ns['smoke_runtime_build']('sha256:' + 'a' * 64)
        self.assertFalse(any('agent-runtime' in call.args for call in wrapped.call_args_list))
        smoke = next(node for node in TREE.body if assigns(node, 'runtime_smoke'))
        applied = next(node for node in TREE.body if assigns(node, 'source_applied'))
        self.assertLess(smoke.lineno, applied.lineno)

    def test_v15_configuration_pins_live_v14_and_previous_release_paths(self):
        config = release_configuration('v15')
        self.assertEqual(config['EXPECTED'], 'sha256:e08ce95339fffcea7627dc5170b0a090990469c735ca1af39285487ce2efe0b5')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v14')
        self.assertEqual(config['BASE_IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v14')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v15')
        self.assertEqual(config['INCOMING'], Path('/tmp/aisecedu-cinematic-20260912/v15'))
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v15'))

    def test_v16_configuration_pins_verified_live_v15(self):
        config = release_configuration('v16')
        self.assertEqual(config['EXPECTED'], 'sha256:96d4c2d3fc06a6c95fd5dfc8f96468bf7ded5eae1fcfeb4df91720c6cbeeeeed')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v15')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v16')
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v16'))

    def test_v17_configuration_pins_verified_live_v16(self):
        config = release_configuration('v17')
        self.assertEqual(config['EXPECTED'], 'sha256:6d2bd58f064a77b9ee13f9a4635c2d671c7b5e74824382ec7515da96a97afd34')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v16')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v17')
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v17'))

    def test_v19_configuration_pins_verified_live_v18(self):
        config = release_configuration('v19')
        self.assertEqual(config['EXPECTED'], 'sha256:077f4d6f265b92494a6980cde91eb23e307cf4a2688d8ca46c53dea0f45d926f')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v18')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v19')
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v19'))

    def test_v18_configuration_pins_verified_live_v17(self):
        config = release_configuration('v18')
        self.assertEqual(config['EXPECTED'], 'sha256:42cb9afd37f41eb68c7dee98224dd693578d15a5c1996235c70ad9ebc03f8f37')
        self.assertEqual(config['PREVIOUS_VERSION'], 'v17')
        self.assertEqual(config['IMAGE'], 'aisecedu/agent-runtime:cinematic-20260912-v18')
        self.assertEqual(config['WORK'], Path('/srv/aisecedu-dojo/data/cinematic-20260912/release-v18'))

    def test_live_image_precondition_still_rejects_drift_before_runtime_build(self):
        guard = next(node for node in TREE.body if isinstance(node, ast.Assert)
                     and isinstance(node.msg, ast.Constant) and node.msg.value == 'Live image changed')
        for version in ['v9', 'v10', 'v11', 'v12', 'v13', 'v14', 'v15', 'v16', 'v17', 'v18', 'v19']:
            expected = release_configuration(version)['EXPECTED']
            for image in [expected, 'sha256:' + 'b' * 64]:
                namespace = {'EXPECTED': expected, 'output': Mock(return_value=image)}
                with self.subTest(version=version, image=image):
                    if image == expected:
                        exec(compile(ast.Module(body=[guard], type_ignores=[]), str(SOURCE), 'exec'), namespace)
                    else:
                        with self.assertRaisesRegex(AssertionError, 'Live image changed'):
                            exec(compile(ast.Module(body=[guard], type_ignores=[]), str(SOURCE), 'exec'), namespace)
                namespace['output'].assert_called_once_with('inspect', 'agent-runtime', '--format', '{{.Image}}')


if __name__ == '__main__':
    unittest.main(verbosity=2)
