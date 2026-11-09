import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
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


if __name__ == "__main__":
    suite = unittest.TestSuite(unittest.FunctionTestCase(value) for name, value in list(globals().items())
                               if name.startswith("test_") and callable(value))
    raise SystemExit(not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful())
