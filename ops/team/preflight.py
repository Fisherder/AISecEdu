#!/usr/bin/env python3
import ast
import json
from pathlib import Path
import shutil
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]


def main():
    failures = []
    for folder in ('dojo_plugin', 'ops'):
        for path in (ROOT / folder).rglob('*.py'):
            try:
                ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
            except (SyntaxError, UnicodeError) as error:
                failures.append(f'{path.relative_to(ROOT)}: {error}')
    for command in (
        [sys.executable, 'dojo_plugin/authoring_standards/cli.py', 'lint'],
        [sys.executable, 'test/test_authoring_standards_unit.py'],
        [sys.executable, '-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_generation_release_unit.py'],
        [sys.executable, '-m', 'unittest', 'discover', '-s', 'test', '-p', 'test_team_control_unit.py'],
        [sys.executable, 'test/test_dojo_init_config_unit.py'],
        [sys.executable, 'test/test_workspace_extension_package_unit.py'],
        [sys.executable, 'test/test_ai_pr_unit.py'],
        [sys.executable, 'test/test_app_test_layout_unit.py'],
        *([[sys.executable, 'test/test_courseware_quiz_unit.py']] if (ROOT / 'test/test_courseware_quiz_unit.py').is_file() else []),
    ):
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode:
            failures.append(' '.join(command))
    node = '/opt/aisecedu-toolchains/node22/bin/node'
    if not Path(node).is_file():
        node = shutil.which('node')
    if node:
        version = subprocess.check_output([node, '-p', 'process.versions.node'], text=True).strip()
        if int(version.split('.')[0]) != 22:
            failures.append(f'团队 Node.js 基线为 22.x，当前 {version}')
        elif subprocess.run([node, '--experimental-vm-modules', 'test/browser/desktop-console-bootstrap.cjs'], cwd=ROOT).returncode:
            failures.append('桌面桥接来源与握手回归')
    else:
        failures.append('未找到 Node.js 22.x')
    print(json.dumps({'status': 'FAIL' if failures else 'PASS', 'failures': failures,
                      'scope': '静态语法、规范及不连接平台的定向单测；不代表完整平台或生成验收。'}, ensure_ascii=False))
    return bool(failures)


if __name__ == '__main__':
    sys.exit(main())
