import ast
import datetime
import logging
import pathlib
import sys
import types
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).parent / 'patches'
if not ROOT.exists():
    ROOT = pathlib.Path(__file__).resolve().parents[1]


def source(name):
    staged = ROOT / name
    if staged.exists():
        return staged
    return ROOT / {
        'guest_input.py': 'dojo_plugin/agent_runtime/guest_input.py',
        'docker.py': 'dojo_plugin/api/v1/docker.py',
        'docker_remove_containers.py': 'watchdog/docker_remove_containers.py',
    }[name]


def selected(path, names):
    tree = ast.parse(path.read_text())
    return [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names or isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in names for target in node.targets)]


def compile_nodes(nodes, namespace):
    exec(compile(ast.Module(body=nodes, type_ignores=[]), '<shutdown safety>', 'exec'), namespace)


class DockerError(Exception):
    pass


class NotFound(DockerError):
    pass


class ShutdownSafety(unittest.TestCase):
    def test_shutdown_confirmation(self):
        namespace = {}
        compile_nodes(selected(source('guest_input.py'), {'GUEST_SHUTDOWN_COMMAND'}), namespace)
        command = namespace['GUEST_SHUTDOWN_COMMAND']
        self.assertEqual(command[:4], ['/usr/bin/timeout', '45', 'python3', '-c'])
        cases = [
            ('already-stopped', False, False, False, 'running', 0),
            ('qmp-unreachable', True, True, False, 'running', 75),
            ('guest-exits', True, False, True, 'running', 0),
            ('guest-stuck', True, False, False, 'running', 75),
            ('guest-powered-off', True, False, False, 'shutdown', 0),
            ('qmp-lost-with-live-process', True, False, False, None, 75),
        ]
        for name, running, unreachable, exits, state, expected in cases:
            with self.subTest(name=name):
                process = {'running': running, 'queries': 0}

                class ProcPath:
                    name = '123'

                    def iterdir(self):
                        return [self] if process['running'] else []

                    def __truediv__(self, name):
                        return self

                    def read_bytes(self):
                        return b'/usr/bin/qemu-system-x86_64\0-drive\0file=/var/lib/windows-lab/student.qcow2,format=qcow2\0'

                def qmp(operation):
                    process['queries'] += 1
                    if unreachable or process['queries'] > 1 and state is None:
                        raise OSError('unavailable')
                    return {'status': state}

                def shutdown():
                    if exits:
                        process['running'] = False

                fake_pathlib = types.SimpleNamespace(Path=lambda value: ProcPath(), PurePosixPath=pathlib.PurePosixPath)
                fake_start = types.SimpleNamespace(qmp=qmp, shutdown_guest=shutdown)
                with patch.dict(sys.modules, {'pathlib': fake_pathlib, 'start': fake_start}):
                    with self.assertRaises(SystemExit) as raised:
                        exec(compile(command[-1], '<guest shutdown>', 'exec'), {})
                self.assertEqual(raised.exception.code, expected)

    def test_watchdog_retains_unconfirmed_windows(self):
        namespace = {'docker': types.SimpleNamespace(errors=types.SimpleNamespace(DockerException=DockerError, NotFound=NotFound)), 'logging': logging}
        compile_nodes(selected(source('docker_remove_containers.py'), {'GUEST_SHUTDOWN_COMMAND', 'remove_workspace'}), namespace)
        guest_namespace = {}
        compile_nodes(selected(source('guest_input.py'), {'GUEST_SHUTDOWN_COMMAND'}), guest_namespace)
        self.assertEqual(namespace['GUEST_SHUTDOWN_COMMAND'], guest_namespace['GUEST_SHUTDOWN_COMMAND'])

        class Container:
            id = 'test'

            def __init__(self, windows, code):
                self.labels = {'dojo.runtime_environment': 'windows2000' if windows else 'linux'}
                self.code = code
                self.calls = []

            def exec_run(self, *args, **kwargs):
                self.calls.append('shutdown')
                if self.code == 'exception':
                    raise DockerError()
                return self.code, b''

            def stop(self, **kwargs):
                self.calls.append('stop')

            def remove(self, **kwargs):
                self.calls.append('remove')

        for windows, code, expected in [(True, 0, ['shutdown', 'stop', 'remove']), (True, 75, ['shutdown']), (True, 124, ['shutdown']), (True, 'exception', ['shutdown']), (False, 0, ['remove'])]:
            with self.subTest(windows=windows, code=code):
                container = Container(windows, code)
                retained = namespace['remove_workspace'](container)
                self.assertEqual(container.calls, expected)
                self.assertEqual(retained, expected[-1] == 'remove')

    def test_stop_attempt_only_commits_after_removal(self):
        tree = ast.parse(source('docker.py').read_text())
        resource = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'RunDocker')
        delete = next(node for node in resource.body if isinstance(node, ast.FunctionDef) and node.name == 'delete')
        delete.decorator_list = []
        error_namespace = {}
        compile_nodes(selected(source('docker.py'), {'WindowsShutdownPending'}), error_namespace)
        pending = error_namespace['WindowsShutdownPending']
        for fails in (True, False):
            with self.subTest(shutdown_pending=fails):
                calls = []
                attempt = types.SimpleNamespace(status='ACTIVE', completed=None)

                def remove(user):
                    calls.append('remove')
                    self.assertEqual(attempt.status, 'ACTIVE')
                    if fails:
                        raise pending('pending')

                ns = {
                    'WindowsShutdownPending': pending,
                    'get_current_user': lambda: types.SimpleNamespace(id=1),
                    'optional_container': lambda user: object(),
                    'active_simulation_run': lambda user_id: None,
                    'active_attempt': lambda user_id: attempt,
                    'preserved_state': lambda: {'kind': 'windows-disk'},
                    'remove_container': remove,
                    'publish_stat_event': lambda *args: calls.append('publish'),
                    'append_evidence': lambda *args, **kwargs: calls.append('evidence'),
                    'db': types.SimpleNamespace(session=types.SimpleNamespace(commit=lambda: calls.append('commit'), rollback=lambda: calls.append('rollback'))),
                    'datetime': datetime,
                    'logger': logging,
                }
                compile_nodes([delete], ns)
                result = ns['delete'](None)
                if fails:
                    self.assertEqual(calls, ['remove', 'rollback'])
                    self.assertEqual(attempt.status, 'ACTIVE')
                    self.assertTrue(result[0]['shutdownPending'])
                    self.assertEqual(result[1], 409)
                else:
                    self.assertEqual(calls, ['remove', 'publish', 'evidence', 'commit'])
                    self.assertEqual(attempt.status, 'STOPPED')
                    self.assertTrue(result['success'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
