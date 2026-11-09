import importlib.util
import os
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch


root = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("windows_acceleration", root / "workspace/services/windows-desktop/acceleration.py")
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class WindowsAccelerationTests(unittest.TestCase):
    def test_auto_uses_available_kvm(self):
        with patch.dict(os.environ, {"DOJO_WINDOWS_ACCELERATOR": "auto"}), patch.object(runtime.os, "access", return_value=True):
            self.assertEqual(runtime.acceleration(), "kvm")

    def test_auto_falls_back_without_kvm(self):
        with patch.dict(os.environ, {"DOJO_WINDOWS_ACCELERATOR": "auto"}), patch.object(runtime.os, "access", return_value=False):
            self.assertEqual(runtime.acceleration(), "tcg")

    def test_requested_kvm_cannot_silently_fall_back(self):
        with patch.dict(os.environ, {"DOJO_WINDOWS_ACCELERATOR": "kvm"}), patch.object(runtime.os, "access", return_value=False):
            with self.assertRaises(RuntimeError):
                runtime.acceleration()

    def test_requested_tcg_overrides_available_hardware(self):
        with patch.dict(os.environ, {"DOJO_WINDOWS_ACCELERATOR": "tcg"}), patch.object(runtime.os, "access", return_value=True):
            self.assertEqual(runtime.acceleration(), "tcg")

    def test_invalid_accelerator_is_rejected(self):
        with patch.dict(os.environ, {"DOJO_WINDOWS_ACCELERATOR": "invalid"}):
            with self.assertRaises(RuntimeError):
                runtime.acceleration()

    def test_tcg_drops_supplementary_groups_without_kvm_stat(self):
        with patch.object(runtime.os, "stat", side_effect=FileNotFoundError):
            self.assertEqual(runtime.identity_groups("tcg"), ["--clear-groups"])

    def test_kvm_preserves_device_group_access(self):
        with patch.object(runtime.os, "stat", return_value=SimpleNamespace(st_gid=108)):
            self.assertEqual(runtime.identity_groups("kvm"), ["--groups=108"])

    def test_legacy_cpu_and_core_count_are_preserved(self):
        options = runtime.guest_options("tcg", legacy=True)
        self.assertEqual(options[options.index("-cpu") + 1], "pentium3")
        self.assertEqual(options[options.index("-smp") + 1], "1")
        self.assertNotIn("-enable-kvm", options)


if __name__ == "__main__":
    unittest.main()
