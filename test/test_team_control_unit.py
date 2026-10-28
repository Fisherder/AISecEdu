import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace


SPEC = importlib.util.spec_from_file_location('team_control', Path(__file__).parents[1] / 'ops/team/control.py')
control = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = control
SPEC.loader.exec_module(control)


class TeamControlTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path = Path(self.folder.name) / 'state.sqlite3'
        self.coordinator = control.Coordinator(self.path, clock=lambda: 1000)
        self.alice = control.Actor(1001, 'dev_alice')
        self.bob = control.Actor(1002, 'dev_bob')
        self.admin = control.Actor(1000, 'maintainer', True)
        self.commit = 'a' * 40

    def tearDown(self):
        self.coordinator.db.close()
        self.folder.cleanup()

    def test_second_connection_cannot_replace_existing_lease(self):
        self.coordinator.reserve(self.alice, self.commit, '界面验收', 90)
        other = control.Coordinator(self.path)
        try:
            with self.assertRaises(ValueError):
                other.reserve(self.bob, self.commit, '另一任务', 90)
        finally:
            other.db.close()
        self.assertEqual(self.coordinator.status(self.admin)['lease']['owner'], 'dev_alice')

    def test_expired_lease_does_not_interrupt_work(self):
        self.coordinator.reserve(self.alice, self.commit, '验收', 15)
        self.coordinator.clock = lambda: 10000
        self.assertTrue(self.coordinator.status(self.admin)['lease']['expired'])
        with self.assertRaises(ValueError):
            self.coordinator.reserve(self.bob, self.commit, '验收', 90)

    def test_owner_boundary_for_release_and_task_listing(self):
        self.coordinator.reserve(self.alice, self.commit, '验收', 90)
        self.coordinator.request(self.alice, 'build', self.commit, '构建')
        with self.assertRaises(PermissionError):
            self.coordinator.release(self.bob, '交还')
        self.assertEqual(self.coordinator.status(self.bob)['tasks'], [])
        self.assertEqual(len(self.coordinator.status(self.admin)['tasks']), 1)

    def test_requests_are_durable_and_do_not_execute_code(self):
        task = self.coordinator.request(self.alice, 'build', self.commit, '构建')
        other = control.Coordinator(self.path)
        try:
            self.assertEqual(other.status(self.alice)['tasks'][0]['id'], task['id'])
            self.assertEqual(task['executor'], 'manual')
            self.assertEqual(task['status'], 'QUEUED')
        finally:
            other.db.close()

    def test_only_maintainer_can_resolve_and_tasks_are_serial(self):
        first = self.coordinator.request(self.alice, 'build', self.commit, '构建')['id']
        second = self.coordinator.request(self.bob, 'check', self.commit, '检查')['id']
        with self.assertRaises(PermissionError):
            self.coordinator.resolve(self.alice, first, 'RUNNING', '开始')
        self.coordinator.resolve(self.admin, first, 'RUNNING', '开始')
        with self.assertRaises(ValueError):
            self.coordinator.resolve(self.admin, second, 'RUNNING', '开始')
        self.coordinator.resolve(self.admin, first, 'SUCCEEDED', '检查通过')
        self.coordinator.resolve(self.admin, second, 'RUNNING', '开始')

    def test_running_task_blocks_environment_release(self):
        self.coordinator.reserve(self.alice, self.commit, '验收', 90)
        task = self.coordinator.request(self.alice, 'workspace', self.commit, '工作区验收')['id']
        self.coordinator.resolve(self.admin, task, 'RUNNING', '开始')
        with self.assertRaises(ValueError):
            self.coordinator.release(self.alice, '交还')

    def test_full_acceptance_requires_matching_owner_and_commit(self):
        self.coordinator.reserve(self.alice, self.commit, '验收', 90)
        task = self.coordinator.request(self.bob, 'browser', self.commit, '浏览器验收')['id']
        with self.assertRaises(ValueError):
            self.coordinator.resolve(self.admin, task, 'RUNNING', '开始')

    def test_terminal_tasks_cannot_be_reopened(self):
        task = self.coordinator.request(self.alice, 'build', self.commit, '构建')['id']
        self.coordinator.resolve(self.admin, task, 'CANCELED', '取消')
        with self.assertRaises(ValueError):
            self.coordinator.resolve(self.admin, task, 'RUNNING', '重开')

    def test_paths_and_shell_fragments_are_not_accepted_as_commits(self):
        for value in ('../../data', 'main', 'a' * 40 + '; id', 'b' * 39):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.coordinator.request(self.alice, 'build', value, '构建')

    def test_invalid_input_does_not_acquire_lease(self):
        with self.assertRaises(ValueError):
            self.coordinator.reserve(self.alice, self.commit, '验收', 999)
        self.assertIsNone(self.coordinator.status(self.admin)['lease'])

    def test_heavy_tasks_refuse_insufficient_memory(self):
        with patch.object(control.Path, 'read_text', return_value='MemAvailable: 1024 kB\n'):
            with self.assertRaisesRegex(ValueError, '内存'):
                control.capacity('build')

    def test_heavy_tasks_refuse_low_disk_space(self):
        with patch.object(control.Path, 'read_text', return_value='MemAvailable: 99999999 kB\n'), patch.object(control.shutil, 'disk_usage', return_value=SimpleNamespace(free=1024)):
            with self.assertRaisesRegex(ValueError, '存储'):
                control.capacity('browser')

    def test_quick_checks_do_not_require_heavy_task_capacity(self):
        with patch.object(control.Path, 'read_text', side_effect=AssertionError('unexpected memory probe')):
            control.capacity('check')


if __name__ == '__main__':
    unittest.main()
