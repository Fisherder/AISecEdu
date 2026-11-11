import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]


def reader_package_fixture(folder):
    folder.mkdir(parents=True, exist_ok=True)
    store = folder / 'store'
    store.mkdir()
    source = ROOT / 'workspace/services/assignment-reader'
    nix = (ROOT / 'workspace/services/code.nix').read_text()
    script = nix.split('readerExtension = pkgs.runCommand "xuanjia-assignment-reader" {} \'\'\n', 1)[1].split('\n  \'\';', 1)[0]
    for name in ('package.json', 'extension.js'):
        stored = store / ('synthetic-nix-hash-' + name)
        shutil.copyfile(source / name, stored)
        script = script.replace('${./assignment-reader/' + name + '}', str(stored))
    assert '${' not in script
    output = folder / 'output'
    built = subprocess.run(['/bin/sh', '-eu', '-c', script], capture_output=True, text=True,
                           env={'PATH': os.environ['PATH'], 'out': str(output)}, timeout=10)
    assert built.returncode == 0, built.stdout + built.stderr
    return output / 'share/vscode/extensions'


def test_managed_reader_package_contains_loadable_files_and_native_binding():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        packaged = reader_package_fixture(folder)
        reader = packaged / 'xuanjia.assignment-reader'
        assert (reader / 'package.json').is_file(), sorted(path.name for path in reader.iterdir())
        manifest = json.loads((reader / 'package.json').read_text())
        assert (reader / manifest['main']).read_bytes() == (ROOT / 'workspace/services/assignment-reader/extension.js').read_bytes()
        spec = importlib.util.spec_from_file_location('workspace_extension_bootstrap', ROOT / 'workspace/services/code-extensions.py')
        bootstrap = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bootstrap)
        destination = folder / 'state/extensions'
        bootstrap.sync_extensions(destination, [packaged])
        entries = json.loads((destination / 'extensions.json').read_text())
        assert len(entries) == 1
        assert entries[0]['identifier']['id'] == 'xuanjia.assignment-reader'
        assert entries[0]['version'] == manifest['version']
        installed = json.loads((destination / entries[0]['relativeLocation'] / 'package.json').read_text())
        escape = next(binding for binding in installed['contributes']['keybindings'] if binding['key'] == 'escape')
        assert escape['command'] == 'workbench.action.terminal.sendSequence'
        assert escape['args']['text'] == '\x1b'


if __name__ == '__main__':
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith('test_') and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
