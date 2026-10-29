import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

root = Path(__file__).resolve().parents[1]
module_path = root / 'dojo_plugin' / 'learning' / 'legacy_runtime.py'
if not module_path.exists():
    module_path = Path(__file__).with_name('legacy_runtime.py')
spec = importlib.util.spec_from_file_location('legacy_runtime', module_path)
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)


class LegacyRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.challenge = SimpleNamespace(
            dojo_id=3839952, module_index=0, id='lab03-shellcode',
            dojo=SimpleNamespace(reference_id='ollydbg-practice~003a97d0'),
            module=SimpleNamespace(id='reverse-debugging'),
            runtime_environment='windows2000', name='第三次实验：StackOverrun',
            description='# 第三次实验：StackOverrun\n运行 check.cmd',
            required=False, exercise_mode='CONTAINER', image='windows:current',
            interfaces=[{'name': 'Desktop', 'port': 6080}], allow_privileged=True,
            workspace_layout={'checkEntry': 'check.cmd'},
        )
        self.draft = SimpleNamespace(dojo_id=3839952, module_index=0, spec={
            'id': 'lab03-shellcode', 'challengeId': 'lab03-shellcode',
            'course': {'dojoId': 'ollydbg-practice~003a97d0', 'module': 'reverse-debugging'},
            'previewUrl': '/dojo/ollydbg-practice~003a97d0/reverse-debugging/lab03-shellcode',
            'name': '第三次实验思考题：StackOverrun',
            'runtimeEnvironment': 'linux', 'description': '运行 /challenge/check',
        })

    def test_legacy_runtime_reference_is_recognized(self):
        self.assertTrue(policy.runtime_reference_matches(self.draft, self.challenge))

    def test_projection_uses_canonical_windows_runtime_without_mutating_draft(self):
        before = copy.deepcopy(self.draft.spec)
        value = policy.runtime_spec(self.draft, self.challenge)
        self.assertEqual(value['name'], self.challenge.name)
        self.assertEqual(value['runtimeEnvironment'], 'windows2000')
        self.assertNotIn('/challenge/check', value['description'])
        self.assertEqual(value['workspaceLayout']['checkEntry'], 'check.cmd')
        self.assertFalse(value['required'])
        self.assertEqual(self.draft.spec, before)
        value['interfaces'][0]['port'] = 1
        self.assertEqual(self.challenge.interfaces[0]['port'], 6080)

    def test_cross_course_reference_is_rejected(self):
        self.draft.dojo_id = 42
        self.assertFalse(policy.runtime_reference_matches(self.draft, self.challenge))

    def test_cross_module_reference_is_rejected(self):
        self.draft.module_index = 1
        self.assertFalse(policy.runtime_reference_matches(self.draft, self.challenge))

    def test_matching_id_alone_cannot_hide_an_independent_draft(self):
        del self.draft.spec['previewUrl']
        self.assertFalse(policy.runtime_reference_matches(self.draft, self.challenge))

    def test_foreign_preview_url_is_rejected(self):
        self.draft.spec['previewUrl'] = 'https://example.invalid/'
        self.assertFalse(policy.runtime_reference_matches(self.draft, self.challenge))

    def test_new_authored_packages_are_not_legacy_aliases(self):
        for key, value in [('preparedRuntime', {'challengeId': 12}), ('starterFiles', [{'path': 'main.c'}]), ('privateSolution', {'method': 'new'}), ('libraryNativePackage', {'id': 12})]:
            draft = copy.deepcopy(self.draft)
            draft.spec[key] = value
            self.assertFalse(policy.runtime_reference_matches(draft, self.challenge))

    def test_non_windows_runtime_is_not_projected(self):
        self.challenge.runtime_environment = 'linux'
        self.assertFalse(policy.runtime_reference_matches(self.draft, self.challenge))

    def test_flask_icon_is_scoped_to_course_labs(self):
        self.assertEqual(policy.catalog_icon(self.challenge), 'fa-flask')
        self.challenge.dojo_id = 42
        self.assertEqual(policy.catalog_icon(self.challenge), 'fa-flag')


if __name__ == '__main__':
    unittest.main()
