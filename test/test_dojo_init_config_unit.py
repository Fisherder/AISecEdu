import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time
import unittest


ROOT = Path(__file__).resolve().parents[1]
SOURCE_LIST = "GLOBAL_AGENT_RUNTIME_FRAME_ANCESTORS"


def initialize(folder, **overrides):
    script = (ROOT / "dojo/dojo-init").read_text().split("\n. /data/config.env\n", 1)[0]
    script += '\n. /data/config.env\nprintf "%s\\000" "$GLOBAL_AGENT_RUNTIME_FRAME_ANCESTORS" "$GLOBAL_AGENT_RUNTIME_PUBLIC_ORIGIN" "$AISECEDU_PUBLIC_ORIGIN"\n'
    script = script.replace("/data", str(folder))
    return subprocess.run(
        ["/bin/sh", "-e", "-c", script], capture_output=True, text=True,
        env={"PATH": os.environ["PATH"], "DOJO_INIT_CONFIG_ONLY": "true", **overrides},
    )


def test_default_configuration_can_be_sourced_and_reinitialized():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        first = initialize(folder)
        assert first.returncode == 0, first.stderr
        assert first.stdout.split("\0")[:3] == [
            "https://localhost.pwn.college http://localhost.pwn.college",
            "https://localhost.pwn.college/agent-runtime", "https://localhost.pwn.college",
        ]
        saved = (folder / "config.env").read_bytes()
        second = initialize(folder)
        assert second.returncode == 0, second.stderr
        assert second.stdout == first.stdout
        assert (folder / "config.env").read_bytes() == saved
        assert (folder / "config.env").stat().st_mode & 0o777 == 0o600


def test_existing_unquoted_source_list_is_migrated_without_resetting_configuration():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        (folder / "config.env").write_text(
            f'DOJO_HOST=existing.example\nSECRET_KEY=synthetic-preserved-secret\n'
            f'{SOURCE_LIST}=https://embed.example http://embed.example\n'
        )
        result = initialize(folder)
        assert result.returncode == 0, result.stderr
        assert result.stdout.split("\0")[:3] == [
            "https://embed.example http://embed.example",
            "https://existing.example/agent-runtime", "https://existing.example",
        ]
        saved = (folder / "config.env").read_text()
        assert 'SECRET_KEY=synthetic-preserved-secret\n' in saved
        assert f'{SOURCE_LIST}="https://embed.example http://embed.example"\n' in saved


def test_environment_overrides_saved_values_and_supports_csp_keywords():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        (folder / "config.env").write_text(f'{SOURCE_LIST}="https://old.example"\nDOJO_HOST=old.example\n')
        value = "'self' https://new.example:8443 http://*.example"
        result = initialize(folder, DOJO_HOST="new.example", **{SOURCE_LIST: value})
        assert result.returncode == 0, result.stderr
        assert result.stdout.split("\0")[:3] == [
            value, "https://new.example/agent-runtime", "https://new.example",
        ]
        repeated = initialize(folder)
        assert repeated.returncode == 0, repeated.stderr
        assert repeated.stdout == result.stdout


def test_unsafe_source_lists_are_rejected_before_loading_or_replacing_saved_config():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        marker = folder / "executed"
        original = 'DOJO_HOST=existing.example\n'
        for value in (f'$(touch {marker})', f'`touch {marker}`', 'https://example/"bad',
                      'https://example/\\bad', 'https://example\nhttp://other', 'https://example\r', 'https://example\t'):
            (folder / "config.env").write_text(original)
            result = initialize(folder, **{SOURCE_LIST: value})
            assert result.returncode != 0, repr(value)
            assert "Invalid source-list configuration" in result.stderr
            assert not marker.exists()
            assert (folder / "config.env").read_text() == original


def test_generated_source_list_round_trips_through_docker_compose_when_available():
    if not shutil.which("docker") or subprocess.run(
        ["docker", "compose", "version"], capture_output=True,
    ).returncode:
        raise unittest.SkipTest("Docker Compose is unavailable")
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        value = "'self' https://example:8443 http://*.example"
        initialized = initialize(folder, **{SOURCE_LIST: value})
        assert initialized.returncode == 0, initialized.stderr
        compose = folder / "compose.yml"
        compose.write_text('services:\n  probe:\n    image: busybox\n    environment:\n      VALUE: ${GLOBAL_AGENT_RUNTIME_FRAME_ANCESTORS}\n')
        result = subprocess.run(
            ["docker", "compose", "--env-file", str(folder / "config.env"), "-f", str(compose), "config", "--format", "json"],
            capture_output=True, text=True, env={"PATH": os.environ["PATH"]},
        )
        assert result.returncode == 0, result.stderr
        assert json.loads(result.stdout)["services"]["probe"]["environment"]["VALUE"] == value


def test_coverage_uses_source_compose_and_preserves_deployment_overlays():
    script = (ROOT / "dojo/dojo").read_text().split('    "compose")\n', 1)[1].split('\n        ;;', 1)[0]
    script = script.replace('/data/config.env', 'config.env')
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        for name in ('docker-compose.override.yml', 'docker-compose.staging.yml',
                     'docker-compose.generation-release.yml'):
            (folder / name).touch()
        for mode in ('coverage', 'production'):
            result = subprocess.run(
                ['/bin/bash', '-e', '-c',
                 'jq() { echo false; }; docker() { printf "%s\\n" "$@"; };\n' + script,
                 'compose-test', 'config'], cwd=folder, capture_output=True, text=True,
                env={'PATH': os.environ['PATH'], 'DOJO_ENV': mode, 'WORKSPACE_NODE': '0'},
            )
            assert result.returncode == 0, result.stderr
            arguments = result.stdout.splitlines()
            assert 'docker-compose.yml' in arguments
            assert ('docker-compose.coverage.yml' in arguments) == (mode == 'coverage'), (mode, arguments)
            assert '--profile' in arguments and 'main' in arguments and 'workspace' in arguments
            assert arguments[-1] == 'config'
            for name in ('docker-compose.override.yml', 'docker-compose.staging.yml',
                         'docker-compose.generation-release.yml'):
                assert (name in arguments) == (mode == 'production'), (mode, arguments)


def test_http_readiness_accepts_rebranded_pages_and_stops_with_diagnostics_on_failure():
    function = (ROOT / 'deploy.sh').read_text().split('function wait_for_http_ready {', 1)[1].split('\n}\n', 1)[0]
    for success in (True, False):
        curl = 'curl() { printf "<html>玄甲</html>"; return 0; };' if success else 'curl() { SECONDS=$((SECONDS + 300)); return 22; };'
        result = subprocess.run(['/bin/bash', '-c',
                                 'docker() { echo ctfd-diagnostic; }; sleep() { :; };\n' + curl +
                                 '\nwait_for_http_ready() {' + function + '\n}; wait_for_http_ready http://synthetic.invalid'],
                                capture_output=True, text=True, env={'PATH': os.environ['PATH']})
        assert result.returncode == (0 if success else 1), result.stderr
        if not success:
            assert '300 seconds' in result.stderr and 'ctfd-diagnostic' in result.stderr


def test_workspace_builder_exit_status_is_not_confused_with_docker_wait_success():
    body = (ROOT / 'dojo/dojo').read_text().split('    "wait")\n', 1)[1].split('\n        ;;', 1)[0]
    for status in (0, 3):
        script = 'dojo() { echo "Finished pwn.college.service - pwn.college docker compose service"; };\n'
        script += 'docker() { case "$1" in inspect) return 0;; wait) echo ' + str(status) + ';; logs) echo builder-diagnostic;; ps) :;; esac; };\n'
        result = subprocess.run(['/bin/bash', '-e', '-c', script + body], capture_output=True, text=True)
        assert result.returncode == (0 if status == 0 else 1), result.stdout + result.stderr
        if status:
            assert 'workspace-builder failed (exit 3)' in result.stdout


def workspace_builder_fixture(folder):
    entrypoint = (ROOT / 'workspace/Dockerfile').read_text().split(
        "COPY --chmod=755 <<'EOF' /docker-entrypoint.sh\n", 1
    )[1].split('\nSUID_FILE=', 1)[0]
    script = folder / 'entrypoint.sh'
    script.write_text(entrypoint.replace('/nix/var/nix', str(folder / 'nix/var/nix')))
    binaries = folder / 'bin'
    binaries.mkdir()
    nix = binaries / 'nix'
    nix.write_text(f'#!{sys.executable}\n' + '''import json,os,pathlib,sys,time
args=sys.argv
source=pathlib.Path(args[args.index('--reference-lock-file')+1])
target=pathlib.Path(args[args.index('--output-lock-file')+1])
state=json.loads(source.read_text())
active=pathlib.Path('active-build')
active.touch(exist_ok=False)
try:
    target.write_text('')
    time.sleep(0.2)
    if os.environ.get('FAIL_BUILD')=='1':sys.exit(3)
    target.write_text(json.dumps({'generation':state['generation']+1}))
finally:
    active.unlink()
''')
    nix.chmod(0o755)
    if not shutil.which('flock'):
        portable = binaries / 'flock'
        portable.write_text(f'#!{sys.executable}\nimport fcntl,sys\nfcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX)\n')
        portable.chmod(0o755)
    (folder / 'flake.lock').write_text('{"generation":0}')
    environment = {'PATH': str(binaries) + os.pathsep + os.environ['PATH']}
    return script, environment, folder / 'nix/var/nix/dojo-workspace-flake.lock'


def test_shared_workspace_builds_serialize_and_publish_only_complete_lockfiles():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        script, environment, lockfile = workspace_builder_fixture(folder)
        processes = [subprocess.Popen(['/bin/sh', '-e', str(script)], cwd=folder,
                                      env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                      text=True) for _ in range(3)]
        deadline = time.monotonic() + 15
        while any(process.poll() is None for process in processes):
            if lockfile.exists():
                assert json.loads(lockfile.read_text())['generation'] in {1, 2, 3}
            assert time.monotonic() < deadline
            time.sleep(0.01)
        for process in processes:
            stdout, stderr = process.communicate()
            assert process.returncode == 0, (stdout, stderr)
        assert json.loads(lockfile.read_text()) == {'generation': 3}
        assert not (folder / 'active-build').exists()


def test_failed_workspace_build_preserves_previous_lockfile_and_releases_lock():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        script, environment, lockfile = workspace_builder_fixture(folder)
        lockfile.parent.mkdir(parents=True)
        lockfile.write_text('{"generation":7}')
        failed = subprocess.run(['/bin/sh', '-e', str(script)], cwd=folder,
                                env={**environment, 'FAIL_BUILD': '1'}, capture_output=True,
                                text=True, timeout=15)
        assert failed.returncode == 3, failed.stderr
        assert json.loads(lockfile.read_text()) == {'generation': 7}
        assert not list(lockfile.parent.glob('dojo-workspace-flake.??????'))
        succeeded = subprocess.run(['/bin/sh', '-e', str(script)], cwd=folder,
                                   env=environment, capture_output=True, text=True, timeout=15)
        assert succeeded.returncode == 0, succeeded.stderr
        assert json.loads(lockfile.read_text()) == {'generation': 8}


def test_ci_test_arguments_reach_pytest_without_becoming_deployment_options():
    command = next(line.strip() for line in (ROOT / '.github/workflows/ci.yml').read_text().splitlines()
                   if './deploy.sh ' in line and ' -t ' in line)
    parser = (ROOT / 'deploy.sh').read_text().split('ENV_ARGS=( )\n', 1)[1].split('\nif [ "$START"', 1)[0]
    script = 'DEFAULT_CONTAINER_NAME=synthetic\nENV_ARGS=()\n' + parser
    script += '\nprintf "%s\\0" "$TEST" "$START" "$DOJO_CONTAINER" "$MULTINODE" "$@"\n'
    for mode, flag in (('singlenode', ''), ('multinode', '-M')):
        arguments = shlex.split(re.sub(r'\$\{\{.*?\}\}', flag, command))[1:]
        result = subprocess.run(['/bin/bash', '-eu', '-c', script, 'ci-parser', *arguments], capture_output=True, text=True)
        assert result.returncode == 0 and not result.stderr, result.stderr
        assert result.stdout.split('\0') == [
            'yes', 'no', 'dojo', 'yes' if mode == 'multinode' else 'no',
            '--color=no', '',
        ], result.stdout


if __name__ == "__main__":
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith("test_") and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
