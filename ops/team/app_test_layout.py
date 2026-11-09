import ast
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def load_manifest(root=ROOT):
    manifest = json.loads((root / 'ops/team/app_test_manifest.json').read_text())
    if manifest.get('schema') != 1 or set(manifest) != {'schema', 'whole_files', 'test_nodes'}:
        raise ValueError('Invalid application test manifest')
    whole = manifest['whole_files']
    nodes = manifest['test_nodes']
    if len(whole) != len(set(whole)) or set(whole) & set(nodes):
        raise ValueError('Duplicate application test ownership')
    for filename in [*whole, *nodes]:
        if not filename.startswith('test_') or not filename.endswith('.py') or Path(filename).name != filename:
            raise ValueError('Invalid application test filename')
        functions = {item.name for item in ast.parse((root / 'test' / filename).read_text()).body
                     if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))}
        if filename in nodes and (len(nodes[filename]) != len(set(nodes[filename])) or not set(nodes[filename]) <= functions):
            raise ValueError('Unknown or duplicate application test function: ' + filename)
    return manifest


def application_test(manifest, filename, name):
    return filename in manifest['whole_files'] or name in manifest['test_nodes'].get(filename, ())


def application_nodes(manifest, root):
    return [str(root / 'test' / filename) for filename in manifest['whole_files']] + [
        str(root / 'test' / filename) + '::' + name
        for filename, names in manifest['test_nodes'].items() for name in names
    ]
