import ast
import pathlib
import time
import unittest
from types import SimpleNamespace


def load_policy():
    path = pathlib.Path(__file__).resolve().parents[1] / 'dojo_plugin/api/v1/debate.py'
    tree = ast.parse(path.read_text())
    selected = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in {'_access', '_view', '_request_key'}]
    namespace = {'time': time, 'ScopeError': PermissionError, 're': __import__('re')}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), 'exec'), namespace)
    return namespace


class DebateScopeTests(unittest.TestCase):
    def setUp(self):
        self.policy = load_policy()
        self.user = SimpleNamespace(id=7)
        self.scope = SimpleNamespace(role='student', module_index=0)
        self.artifact = SimpleNamespace(id='artifact-1', owner_id=8, dojo_id=2, module_index=0, artifact_type='debate', status='PUBLISHED')
        self.spec = {'schema': 'debate-v1', 'rounds': [1, 2, 3]}
        self.visible = True
        self.policy.update({
            '_service_lesson_session': lambda: (self.user, self.scope, 'session'),
            '_lesson_artifact': lambda *args, **kwargs: self.artifact,
            'artifact_view': lambda _: {'revision': {'content': {'lesson': {'artifacts': [{'content': {'debate': self.spec}}]}}}},
            'artifact_course_teacher': lambda *args: True,
            'DojoModules': SimpleNamespace(query=SimpleNamespace(filter_by=lambda **kwargs: SimpleNamespace(first=lambda: SimpleNamespace(visible=lambda: self.visible)))),
        })

    def test_student_scope_does_not_gain_teacher_review(self):
        self.assertFalse(self.policy['_access']('artifact-1')[3])

    def test_scoped_token_cannot_enter_another_module(self):
        self.artifact.module_index = 1
        with self.assertRaises(PermissionError):
            self.policy['_access']('artifact-1')

    def test_student_cannot_enter_a_hidden_module(self):
        self.visible = False
        with self.assertRaises(PermissionError):
            self.policy['_access']('artifact-1')

    def test_archived_and_legacy_artifacts_cannot_start_sessions(self):
        self.artifact.status = 'ARCHIVED'
        with self.assertRaises(PermissionError):
            self.policy['_access']('artifact-1')
        self.artifact.status = 'PUBLISHED'
        self.spec['schema'] = 'legacy'
        with self.assertRaises(PermissionError):
            self.policy['_access']('artifact-1')

    def test_serialization_hides_internal_request_ids_and_pending_input(self):
        attempt = SimpleNamespace(id='a', revision=1, side='pro', preview=False, status='ACTIVE', spec=self.spec,
            turns=[{'id': 'turn-1', 'requestId': 'private-key', 'student': 'argument'}], reflection=None,
            report=None, pending={'expires': time.time()+60, 'message': 'pending message', 'lease': 'private-lease'},
            updated=__import__('datetime').datetime(2026, 9, 16), user=SimpleNamespace(name='student'))
        result = self.policy['_view'](attempt)
        self.assertNotIn('requestId', result['turns'][0])
        self.assertIs(result['pending'], True)
        self.assertNotIn('studentName', result)
        self.assertEqual(self.policy['_view'](attempt, True)['studentName'], 'student')
        attempt.pending['expires'] = 0
        self.assertFalse(self.policy['_view'](attempt)['pending'])

    def test_request_key_validation_rejects_missing_or_invalid_ids(self):
        for key in (None, '', 'short', '../outside', 'a'*65, 123):
            with self.assertRaises(ValueError):
                self.policy['_request_key']({'requestId': key})
        self.assertEqual(self.policy['_request_key']({'requestId': 'a'*32}), 'a'*32)


if __name__ == '__main__':
    unittest.main()
