import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


root = Path(__file__).resolve().parents[1]
directory = root / "workspace/services/windows-desktop"
spec = importlib.util.spec_from_file_location("acceleration", directory / "acceleration.py")
acceleration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acceleration)
spec = importlib.util.spec_from_file_location("windows_runtime", directory / "runtime.py")
runtime = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"acceleration": acceleration}):
    spec.loader.exec_module(runtime)


class WindowsStateResumeTests(unittest.TestCase):
    def test_existing_disk_firmware_and_tpm_are_preserved(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            (state / "student.qcow2").write_bytes(b"existing student work")
            (state / "vars.fd").write_bytes(b"existing firmware")
            (state / "tpm").mkdir()
            (state / "tpm/state").write_bytes(b"existing TPM")
            before = {str(p.relative_to(state)): p.read_bytes() for p in state.rglob("*") if p.is_file()}
            with patch.object(runtime, "STATE", state), patch.object(runtime.os, "chown"), patch.object(runtime.subprocess, "run") as create, patch.object(runtime, "private_copy") as copy:
                runtime.initialize_state()
                runtime.initialize_state()
                create.assert_not_called()
                copy.assert_not_called()
            after = {str(p.relative_to(state)): p.read_bytes() for p in state.rglob("*") if p.is_file()}
            self.assertEqual(before, after)

    def test_new_firmware_does_not_recreate_an_existing_student_disk(self):
        with tempfile.TemporaryDirectory() as folder:
            state = Path(folder)
            (state / "student.qcow2").write_bytes(b"migrated student work")
            with patch.object(runtime, "STATE", state), patch.object(runtime.os, "chown"), patch.object(runtime.subprocess, "run") as create, patch.object(runtime, "private_copy") as copy:
                runtime.initialize_state()
                create.assert_not_called()
                self.assertEqual(copy.call_count, 2)
            self.assertEqual((state / "student.qcow2").read_bytes(), b"migrated student work")


if __name__ == "__main__":
    unittest.main()
