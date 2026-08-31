import pathlib
import subprocess
import sys


ROOT = pathlib.Path(__file__).resolve().parent.parent


def test_shared_ui_readability_contract():
    subprocess.run(
        [sys.executable, str(ROOT / "ops" / "verify-ui-readability.py")],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
