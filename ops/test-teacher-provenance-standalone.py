"""Run the four pure history tests without importing live-service fixtures."""
import ast
import json
import pathlib
from types import SimpleNamespace

source = pathlib.Path(__file__).resolve().parents[1] / 'test/test_teaching.py'
names = {
    'test_teacher_history_provenance_distinguishes_model_selection_from_teacher_text',
    'test_teacher_history_provenance_fails_closed_on_unverified_or_forged_selection_events',
    'test_teacher_history_provenance_budget_keeps_latest_whole_messages_without_mutating_history',
    'test_teacher_history_provenance_uses_existing_scope_checked_option_lookup_without_writes',
}
tree = ast.parse(source.read_text())
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in names | {'_teacher_history_serializers'}]
assert {node.name for node in functions} == names | {'_teacher_history_serializers'}
namespace = {'__file__': str(source), 'json': json, 'pathlib': pathlib, 'SimpleNamespace': SimpleNamespace}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), 'exec'), namespace)
for name in sorted(names):
    namespace[name]()
    print('PASS', name)
print('4 isolated history-provenance tests passed; no service/DB fixtures imported')
