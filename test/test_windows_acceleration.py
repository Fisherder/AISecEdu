import importlib.util
import pathlib
import unittest
from unittest.mock import patch


source = pathlib.Path(__file__).resolve().parents[1] / "workspace/services/windows-desktop/runtime.py"
spec = importlib.util.spec_from_file_location("windows_runtime", source)
runtime = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runtime)


class AccelerationTests(unittest.TestCase):
    def test_automatic_selection_preserves_kvm_and_supports_cloud_hosts(self):
        with patch.dict(runtime.os.environ, {}, clear=True):
            for available, expected in [(True, "kvm"), (False, "tcg")]:
                with self.subTest(available=available), patch.object(runtime.os, "access", return_value=available):
                    self.assertEqual(runtime.acceleration(), expected)

    def test_explicit_selection_does_not_silently_override_operator(self):
        with patch.dict(runtime.os.environ, {"DOJO_WINDOWS_ACCELERATOR": "kvm"}), patch.object(runtime.os, "access", return_value=False):
            with self.assertRaisesRegex(RuntimeError, "KVM was requested"):
                runtime.acceleration()
        with patch.dict(runtime.os.environ, {"DOJO_WINDOWS_ACCELERATOR": "tcg"}), patch.object(runtime.os, "access", return_value=True):
            self.assertEqual(runtime.acceleration(), "tcg")

    def test_software_emulation_does_not_request_host_cpu_passthrough(self):
        options = runtime.guest_options("tcg")
        self.assertEqual(options[options.index("-accel") + 1], "tcg,thread=multi")
        self.assertEqual(options[options.index("-cpu") + 1], "max")
        self.assertNotIn("-enable-kvm", options)

    def test_invalid_acceleration_fails_before_guest_start(self):
        with patch.dict(runtime.os.environ, {"DOJO_WINDOWS_ACCELERATOR": "invalid"}):
            with self.assertRaisesRegex(RuntimeError, "must be"):
                runtime.acceleration()


if __name__ == "__main__":
    unittest.main()
