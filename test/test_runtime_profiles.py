import json
from types import SimpleNamespace

import pytest

from CTFd.plugins.dojo_plugin.runtime_profiles import (
    authoring_runtime_constraints,
    container_runtime_profile,
    infer_runtime_environment,
    normalize_runtime_environment,
    runtime_profile,
    valid_windows_course_paths,
)


@pytest.mark.parametrize(('brief', 'environment'), [
    ('用 Windows 出一道原生 C 程序运行题', 'windows'),
    ('使用 Linux 环境练习文件操作', 'linux'),
    ('不要 Linux，改用 Windows 远程桌面', 'windows'),
    ('不用 Windows，使用 Ubuntu', 'linux'),
    ('Use Windows 11 for the exercise', 'windows'),
    ('Compare Windows and Linux', None),
    ('编写一个简单程序', None),
])
def test_teacher_runtime_selection(brief, environment):
    assert infer_runtime_environment(brief) == environment


def test_runtime_revision_changes_only_runtime_defaults():
    previous = {'runtimeEnvironment': 'windows', 'image': 'custom/windows:1', 'interfaces': [{'name': 'Desktop', 'port': 6080}], 'title': '练习'}
    changed = authoring_runtime_constraints('改用 Linux 环境', previous, revision=True)
    assert changed == {'runtimeEnvironment': 'linux', 'title': '练习'}
    assert authoring_runtime_constraints('降低难度', previous, revision=True) == previous
    assert previous['image'] == 'custom/windows:1'


def test_explicit_runtime_and_linux_compatibility():
    assert authoring_runtime_constraints('比较 Windows 和 Linux', {'runtimeEnvironment': 'windows'})['runtimeEnvironment'] == 'windows'
    assert authoring_runtime_constraints('普通运行题')['runtimeEnvironment'] == 'linux'
    assert normalize_runtime_environment('windows-qemu') == 'windows'
    with pytest.raises(ValueError):
        normalize_runtime_environment('unsupported')


@pytest.mark.parametrize('paths', [
    ['CON.txt'], ['x/aux'], ['folder./a.c'], ['a/../b.c'], ['Readme.txt', 'README.TXT'],
    ['check.cmd'], ['a//b.c'], ['a\\b.c'], ['x/./y.c'],
])
def test_windows_paths_reject_unusable_packages(paths):
    assert not valid_windows_course_paths(paths)


def test_windows_paths_accept_nested_source_files():
    assert valid_windows_course_paths(['source/main.c', 'app.ps1', 'readme.md'])


def test_profiles_select_native_images_and_desktop_resize():
    from CTFd.plugins.dojo_plugin.models import DojoChallenges
    linux = DojoChallenges(id='legacy')
    windows = DojoChallenges(id='native', runtime_environment='windows')
    assert linux.runtime_environment == 'linux'
    assert windows.image == runtime_profile('windows').image
    assert runtime_profile('windows').desktop_resize == 'scale'
    container = SimpleNamespace(labels={}, image=SimpleNamespace(attrs={'Config': {'Labels': {'org.aisecedu.runtime': 'windows-qemu'}}}))
    assert container_runtime_profile(container).id == 'windows'
    container.labels = {'dojo.runtime_environment': 'linux'}
    assert container_runtime_profile(container).id == 'linux'


def test_base_spec_cannot_reuse_wrong_os():
    from CTFd.plugins.dojo_plugin.learning.authoring import _base_spec
    spec = _base_spec('用 Windows 编程', {}, 'L1', [{'challengeId': 123, 'origin': 'LOCAL', 'runtimeEnvironment': 'linux'}])
    assert spec['mode'] == 'GENERATE_CUSTOM'
    assert spec['runtimeEnvironment'] == 'windows'
    assert spec['interfaces'][0] == {'name': 'Desktop', 'port': 6080}


def test_windows_package_contains_only_public_files_and_native_launcher(tmp_path, monkeypatch):
    from CTFd.plugins.dojo_plugin.learning import authoring
    monkeypatch.setattr(authoring, '_prepare_package_path', lambda *args: tmp_path)
    spec = authoring._base_spec('用 Windows 编程', {'verificationAnswer': 'private-check-value'}, 'L3', [])
    spec['starterFiles'] = [{'path': 'main.c', 'content': 'int main(void) { return 0; }'}]
    spec['oracleContract'] = {}
    spec['runtimeContract'] = {'services': []}
    authoring._write_custom_package(SimpleNamespace(spec=spec), 'native', 1)
    manifest = json.loads((tmp_path / 'runtime-public.json').read_text())
    assert manifest['files'] == spec['starterFiles']
    assert 'private-check-value' not in (tmp_path / 'runtime-public.json').read_text()
    assert 'windows-runtime-start' in (tmp_path / 'runtime-launcher.py').read_text()
    compile((tmp_path / 'check-server.py').read_text(), 'check-server.py', 'exec')


def test_windows_interpreter_contract():
    from CTFd.plugins.dojo_plugin.learning.authoring import _normalize_runtime_contract, _runtime_contract_diagnostics
    contract = {'services': [{'name': 'app', 'interpreter': 'powershell', 'entrypoint': 'app.ps1', 'arguments': [], 'port': 8000}]}
    normalized = _normalize_runtime_contract(contract)
    assert normalized['services'][0]['workingDirectory'] == 'C:\\Course'
    spec = {'runtimeEnvironment': 'windows', 'runtimeContract': contract, 'starterFiles': [{'path': 'app.ps1', 'content': 'Write-Output "hello"'}]}
    assert not _runtime_contract_diagnostics(spec, normalized)
    spec['runtimeEnvironment'] = 'linux'
    assert any('解释器' in item for item in _runtime_contract_diagnostics(spec, normalized))


@pytest.mark.parametrize(('environment', 'compiler', 'directory'), [
    ('windows', 'C:\\tcc\\tcc.exe', 'C:\\CourseWork'),
    ('linux', 'gcc', '/home/hacker'),
])
def test_runtime_tools_reach_teacher_and_solution_contexts(monkeypatch, environment, compiler, directory):
    from CTFd.plugins.dojo_plugin.api.v1 import teaching
    from CTFd.plugins.dojo_plugin.learning.solution_agent import _public_challenge_context
    monkeypatch.setattr(teaching, '_teacher_dojos', lambda user: [])
    monkeypatch.setattr(teaching, '_thread_attachment_views', lambda thread, user: [])
    thread = SimpleNamespace(id='runtime-tools', dojo_id=None, module_index=None, phase='PRE_CLASS')
    teacher = teaching._teacher_agent_context(SimpleNamespace(id=1), thread)
    selected = next(item for item in teacher['runtimeEnvironments'] if item['id'] == environment)
    challenge = SimpleNamespace(dojo=SimpleNamespace(name='Programming', reference_id='programming'), module=SimpleNamespace(name='C', id='c'), name='Compile C', id='compile', description='Compile and run the provided C program.', interfaces=[], runtime_environment=environment)
    learner = _public_challenge_context(challenge)
    assert selected['cCompiler'] == compiler
    assert selected['writableDirectory'] == directory
    assert learner['runtime'] == selected
    assert learner['nativeWorkspace'] == selected['workingDirectory']
