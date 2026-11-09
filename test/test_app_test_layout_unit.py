import ast
import importlib.util
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('app_test_layout', ROOT / 'ops/team/app_test_layout.py')
layout = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(layout)


def test_application_manifest_is_disjoint_complete_for_direct_framework_imports_and_real_nodes():
    manifest = layout.load_manifest()
    nodes = layout.application_nodes(manifest, ROOT)
    assert len(nodes) == len(set(nodes)) and nodes
    for path in (ROOT / 'test').glob('test_*.py'):
        tree = ast.parse(path.read_text())
        whole = any(isinstance(node, (ast.Import, ast.ImportFrom)) and ('CTFd' in ast.unparse(node) or 'dojo_plugin' in ast.unparse(node))
                    for node in tree.body)
        if whole:
            assert path.name in manifest['whole_files'], path.name
        for node in tree.body:
            if isinstance(node, ast.FunctionDef) and node.name.startswith('test_'):
                imports = any(isinstance(child, (ast.Import, ast.ImportFrom)) and ('CTFd' in ast.unparse(child) or 'dojo_plugin' in ast.unparse(child))
                              for child in ast.walk(node))
                if imports:
                    assert layout.application_test(manifest, path.name, node.name), (path.name, node.name)


def test_application_manifest_routes_hybrid_tests_and_keeps_http_tests_in_the_client():
    manifest = layout.load_manifest()
    assert layout.application_test(manifest, 'test_teaching.py', 'test_generation_option_bundle_requires_three_complete_distinct_prompts')
    assert layout.application_test(manifest, 'test_runtime_profiles.py', 'test_teacher_runtime_selection')
    assert not layout.application_test(manifest, 'test_teaching.py', 'test_global_agent_conversation_management')
    assert not layout.application_test(manifest, 'test_auth.py', 'test_login')


if __name__ == '__main__':
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith('test_') and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
