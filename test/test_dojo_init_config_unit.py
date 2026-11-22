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


def test_ordinary_grading_grants_private_credentials_only_to_ctfd():
    settings = {
        "DOJO_ORDINARY_GRADING_MODE": "private-harness",
        "DOJO_ORDINARY_GRADING_HARNESS_URL": "https://grading.school.invalid:3081",
        "DOJO_ORDINARY_GRADING_HARNESS_TOKEN": "synthetic-grading-secret",
    }
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        first = initialize(folder)
        assert first.returncode == 0, first.stderr
        config = folder / "config.env"
        for name in settings:
            assert f"{name}=\n" in config.read_text()
        for overrides in (settings, {}):
            initialized = initialize(folder, **overrides)
            assert initialized.returncode == 0, initialized.stderr
            for name, value in settings.items():
                assert f"{name}={value}\n" in config.read_text()

        if not shutil.which("docker") or subprocess.run(
            ["docker", "compose", "version"], capture_output=True,
        ).returncode:
            raise unittest.SkipTest("Docker Compose is unavailable")
        result = subprocess.run(
            ["docker", "compose", "--env-file", str(config), "-f", str(ROOT / "docker-compose.yml"),
             "--profile", "main", "--profile", "workspace", "config", "--format", "json"],
            cwd=ROOT, capture_output=True, text=True, env={"PATH": os.environ["PATH"]},
        )
        assert result.returncode == 0, result.stderr
        services = json.loads(result.stdout)["services"]
        ctfd_env = services["ctfd"]["environment"]
        assert {key: ctfd_env.get(key) for key in settings} == settings
        for name, service in services.items():
            if name != "ctfd":
                assert not (settings.keys() & service.get("environment", {}).keys()), name


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


def test_coverage_compose_waits_for_schema_and_keeps_worker_dependencies():
    if not shutil.which("docker") or subprocess.run(
        ["docker", "compose", "version"], capture_output=True,
    ).returncode:
        raise unittest.SkipTest("Docker Compose is unavailable")

    def resolve(*files, profiles):
        command = ["docker", "compose"]
        for file in files:
            command.extend(("-f", file))
        for profile in profiles:
            command.extend(("--profile", profile))
        result = subprocess.run(
            [*command, "config", "--format", "json"], cwd=ROOT, capture_output=True,
            text=True, timeout=20, env={
                "PATH": os.environ["PATH"], "DOJO_HOST": "synthetic.example",
                "DOJO_ENV": "coverage", "GLOBAL_AGENT_RUNTIME_TICKET_SECRET": "synthetic-ticket",
                "GLOBAL_AGENT_RUNTIME_SERVICE_SECRET": "synthetic-service",
            },
        )
        assert result.returncode == 0, result.stderr
        return json.loads(result.stdout)["services"]

    base = "docker-compose.yml"
    overlay = "docker-compose.coverage.yml"
    ordinary = resolve(base, profiles=("main", "workspace"))
    for profiles in (("main",), ("main", "workspace")):
        coverage = resolve(base, overlay, profiles=profiles)
        assert coverage["db"]["healthcheck"]["test"] == ["CMD", "pg_isready", "-h", "127.0.0.1"]
        assert coverage["pgbouncer"]["depends_on"]["db"]["condition"] == "service_healthy"
        assert coverage["ctfd"]["depends_on"] == ordinary["ctfd"]["depends_on"]
        for name, service in coverage.items():
            if not any(str(part).endswith(("/worker/__main__.py", "/worker/image_pulls_main.py",
                                           "/worker/teaching_main.py")) for part in (service.get("command") or [])):
                continue
            previous = ordinary[name]["depends_on"]
            assert "ctfd" not in previous
            dependencies = service["depends_on"]
            assert dependencies["ctfd"]["condition"] == "service_healthy", name
            assert all(dependencies[key] == value for key, value in previous.items()), name
    workers_only = resolve(base, overlay, profiles=("workspace", "workspace_exclusive"))
    assert "ctfd" not in workers_only and "workspace-builder" in workers_only


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


def test_deploy_rejects_missing_restore_source_before_starting_containers():
    parser = (ROOT / "deploy.sh").read_text().split("ENV_ARGS=( )\n", 1)[1]
    parser = parser.split('\nif [ "$START"', 1)[0]
    with tempfile.TemporaryDirectory() as directory:
        missing = Path(directory) / "missing backup.dump"
        result = subprocess.run(
            ["/bin/bash", "-eu", "-c", "DEFAULT_CONTAINER_NAME=synthetic\nENV_ARGS=()\n" + parser,
             "deploy-parser", "-r", str(missing)],
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == 1 and "backup file does not exist" in result.stderr, result


def database_action_script():
    return (ROOT / "dojo/dojo").read_text().replace("/opt/pwn.college", ".").replace("/data/", "./").replace("/tmp/", "./")


def run_database_action(folder, action, commands, *arguments):
    return subprocess.run(
        ["/bin/bash", "-e", "-c", commands + "\n" + database_action_script(), "dojo", action, *arguments],
        cwd=folder, capture_output=True, text=True, timeout=10,
        env={"PATH": os.environ["PATH"], "DB_NAME": "test_database"},
    )


def test_database_backup_publishes_only_complete_private_dumps():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        backup_folder = folder / "backups"
        commands = r"""
date() { echo fixed-time; }
docker() {
    [ "$*" = "exec db pg_dump -Fc --dbname=test_database" ] || return 91
    printf 'archive'
}
"""
        first = run_database_action(folder, "backup", commands)
        second = run_database_action(folder, "backup", commands)
        assert first.returncode == second.returncode == 0, (first.stderr, second.stderr)
        dumps = sorted(backup_folder.iterdir())
        assert len(dumps) == 2, dumps
        for dump in dumps:
            assert dump.name.startswith("db-fixed-time.")
            assert dump.suffix == ".dump"
            assert dump.read_text() == "archive"
            assert dump.stat().st_mode & 0o777 == 0o600

        failed = run_database_action(folder, "backup", "docker() { printf 'partial'; return 7; }")
        assert failed.returncode == 7 and not failed.stdout, failed
        empty = run_database_action(folder, "backup", "docker() { return 0; }")
        assert empty.returncode != 0 and "backup is empty" in empty.stderr, empty
        assert sorted(backup_folder.iterdir()) == dumps


def test_database_backup_stops_on_dump_or_link_failure_with_either_invocation():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        backups = folder / "backups"
        backups.mkdir()
        previous = backups / "previous.dump"
        previous.write_text("previous archive")
        script = folder / "dojo"
        script.write_text(database_action_script())
        script.chmod(0o700)
        mocks = folder / "bin"
        mocks.mkdir()
        docker = mocks / "docker"
        docker.write_text("#!/bin/bash\nprintf 'synthetic archive'\nexit \"$DUMP_STATUS\"\n")
        link = mocks / "ln"
        link.write_text(
            "#!/bin/bash\ntouch link-called\n"
            "[ \"$LINK_STATUS\" -eq 0 ] || exit \"$LINK_STATUS\"\nexec /bin/ln \"$@\"\n"
        )
        for command in (docker, link):
            command.chmod(0o700)

        for invocation in ([str(script)], ["/bin/bash", str(script)]):
            for dump_status, link_status in ((7, 0), (0, 8)):
                marker = folder / "link-called"
                marker.unlink(missing_ok=True)
                result = subprocess.run(
                    [*invocation, "backup"], cwd=folder, capture_output=True, text=True, timeout=10,
                    env={
                        "PATH": os.pathsep.join((str(mocks), os.defpath)), "DB_NAME": "test_database",
                        "DUMP_STATUS": str(dump_status), "LINK_STATUS": str(link_status),
                    },
                )
                assert result.returncode == (dump_status or link_status), result
                assert "Created backup" not in result.stdout
                assert marker.exists() == (dump_status == 0)
                assert list(backups.iterdir()) == [previous]
                assert previous.read_text() == "previous archive"


def test_cloud_backup_skips_unpublished_dumps():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        (folder / "backups").mkdir()
        (folder / "backups/.db-fixed-time.partial").write_text("partial")
        (folder / "backups/complete backup.dump").write_text("complete")
        (folder / "key file").touch()
        commands = r"""
BACKUP_AES_KEY_FILE="key file"
S3_BACKUP_BUCKET=synthetic
openssl() {
    [ "$3" = "./backups/complete backup.dump" ] || return 91
    printf 'encrypted' > "$5"
}
aws() { printf '%s\n' "$4"; }
"""
        result = run_database_action(folder, "cloud-backup", commands)
        assert result.returncode == 0, result.stderr
        assert "s3://synthetic/complete backup.dump.enc" in result.stdout
        assert ".db-fixed-time.partial" not in result.stdout


def test_cloud_backup_stops_on_encryption_or_upload_failure_with_either_invocation():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        (folder / "backups").mkdir()
        (folder / "backups/synthetic.dump").write_text("synthetic backup")
        (folder / "key-placeholder").touch()
        script = folder / "dojo"
        script.write_text(database_action_script())
        script.chmod(0o700)
        mocks = folder / "bin"
        mocks.mkdir()
        openssl = mocks / "openssl"
        openssl.write_text("#!/bin/bash\necho openssl >> calls\nprintf synthetic > \"$5\"\nexit \"$OPENSSL_STATUS\"\n")
        aws = mocks / "aws"
        aws.write_text("#!/bin/bash\necho aws >> calls\nexit \"$AWS_STATUS\"\n")
        for command in (openssl, aws):
            command.chmod(0o700)

        for invocation in ([str(script)], ["/bin/bash", str(script)]):
            for encryption, upload, expected_calls in ((7, 0, ["openssl"]), (0, 8, ["openssl", "aws"])):
                (folder / "calls").write_text("")
                result = subprocess.run(
                    [*invocation, "cloud-backup"], cwd=folder, capture_output=True, text=True, timeout=10,
                    env={
                        "PATH": os.pathsep.join((str(mocks), os.defpath)),
                        "BACKUP_AES_KEY_FILE": "key-placeholder", "S3_BACKUP_BUCKET": "synthetic",
                        "OPENSSL_STATUS": str(encryption), "AWS_STATUS": str(upload),
                    },
                )
                assert result.returncode == (encryption or upload), result
                assert (folder / "calls").read_text().splitlines() == expected_calls
                assert "backed up" not in result.stdout


def test_database_restore_surfaces_missing_and_failed_transactional_restores():
    with tempfile.TemporaryDirectory() as directory:
        folder = Path(directory)
        (folder / "backups").mkdir()
        (folder / "backups/previous.dump").write_text("archive")
        commands = r"""
docker() {
    [ "$*" = "exec -i db pg_restore --single-transaction --clean --if-exists --dbname=test_database" ] || return 91
    [ "$(cat)" = "archive" ] || return 92
    return 7
}
"""
        failed = run_database_action(folder, "restore", commands, "previous.dump")
        assert failed.returncode == 7, failed
        missing = run_database_action(folder, "restore", commands, "missing.dump")
        assert missing.returncode == 1 and "missing file" in missing.stderr, missing


if __name__ == "__main__":
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith("test_") and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
