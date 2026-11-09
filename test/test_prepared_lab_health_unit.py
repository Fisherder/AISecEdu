import ast
import json
import subprocess
import sys
from pathlib import Path


def health_program():
    path = Path(__file__).resolve().parents[1] / "dojo_plugin/lab_environments.py"
    tree = ast.parse(path.read_text())
    value = next(node.value for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "_PREPARED_HEALTH_PROGRAM" for t in node.targets))
    return ast.literal_eval(value)


def test_missing_prepared_tools_and_workspace_fail_health(tmp_path):
    manifest = {"workspace": str(tmp_path / "absent"), "compiler": str(tmp_path / "missing-compiler")}
    result = subprocess.run([sys.executable, "-I", "-c", health_program(), json.dumps(manifest)], check=True, capture_output=True, text=True)
    health = json.loads(result.stdout)
    assert not health["ready"]
    assert not next(c for c in health["checks"] if c["name"] == "compiler")["passed"]
    assert not next(c for c in health["checks"] if c["name"] == "persistent workspace")["passed"]
    assert not (tmp_path / "absent").exists()


def test_health_probes_writable_workspace_without_leaving_files(tmp_path):
    manifest = {"workspace": str(tmp_path), "python": sys.executable}
    result = subprocess.run([sys.executable, "-I", "-c", health_program(), json.dumps(manifest)], check=True, capture_output=True, text=True)
    checks = json.loads(result.stdout)["checks"]
    assert next(c for c in checks if c["name"] == "persistent workspace")["passed"]
    assert list(tmp_path.iterdir()) == []
