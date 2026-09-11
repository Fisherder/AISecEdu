#!/usr/bin/python3
import fcntl
import hashlib
import hmac
import json
import os
import pathlib
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time


STATE = pathlib.Path("/var/lib/windows-lab")
ROOT = pathlib.Path("/usr/local/lib/windows-runtime")
UID = 60000


def acceleration():
    mode = os.environ.get("DOJO_WINDOWS_ACCELERATOR", "auto")
    if mode not in {"auto", "kvm", "tcg"}:
        raise RuntimeError("DOJO_WINDOWS_ACCELERATOR must be auto, kvm, or tcg")
    available = os.access("/dev/kvm", os.R_OK | os.W_OK)
    if mode == "kvm" and not available:
        raise RuntimeError("KVM was requested but is unavailable on this workspace node")
    return "kvm" if mode == "kvm" or mode == "auto" and available else "tcg"


def guest_options(mode):
    if mode == "kvm":
        return ["-accel", "kvm", "-cpu", "host", "-smp", "4"]
    return ["-accel", "tcg,thread=multi", "-cpu", "max", "-smp", "2"]


def private_copy(source, destination):
    if source.is_dir():
        shutil.copytree(source, destination)
        entries = [destination, *destination.rglob("*")]
    else:
        shutil.copyfile(source, destination)
        entries = [destination]
    for entry in entries:
        os.chown(entry, UID, UID)
        entry.chmod(0o700 if entry.is_dir() else 0o600)


def qmp(command, arguments=None):
    with socket.socket(socket.AF_UNIX) as connection:
        connection.settimeout(10)
        connection.connect(str(STATE / "qmp.sock"))
        with connection.makefile("rwb") as stream:
            stream.readline()
            for request in ({"execute": "qmp_capabilities"}, {"execute": command, "arguments": arguments or {}}):
                stream.write(json.dumps(request).encode() + b"\n")
                stream.flush()
                while True:
                    response = json.loads(stream.readline())
                    if "error" in response:
                        raise RuntimeError(response["error"])
                    if "return" in response:
                        break
            return response["return"]


def workspace_commands():
    default = pathlib.Path("/nix/var/nix/profiles/dojo-workspace")
    profile = pathlib.Path("/run/windows-workspace")
    (profile / "bin").mkdir(parents=True, exist_ok=True)
    for entry in default.iterdir():
        if entry.name != "bin":
            (profile / entry.name).symlink_to(entry)
    for entry in (default / "bin").iterdir():
        (profile / "bin" / entry.name).symlink_to(entry)
    for name, target in {"dojo-desktop": "/usr/local/bin/windows-desktop", "windows-exec": "/usr/local/bin/windows-exec", "windows-request": "/usr/local/bin/windows-request"}.items():
        link = profile / "bin" / name
        link.unlink(missing_ok=True)
        link.symlink_to(target)
    system = pathlib.Path("/run/current-system/sw")
    system.unlink()
    system.symlink_to(profile)


def supervise():
    os.umask(0o077)
    children = []
    tpm_root = pathlib.Path(tempfile.mkdtemp(prefix="aisecedu-windows-tpm-"))
    os.chown(tpm_root, UID, UID)
    private_copy(STATE / "tpm", tpm_root / "state")
    mode = acceleration()
    groups = ["--groups=" + str(os.stat("/dev/kvm").st_gid)] if mode == "kvm" else ["--clear-groups"]
    identity = ["/usr/bin/setpriv", f"--reuid={UID}", f"--regid={UID}", *groups, "--no-new-privs"]

    def launch(command, *, guest_user=False):
        child = subprocess.Popen((identity if guest_user else []) + command, stdin=subprocess.DEVNULL)
        children.append(child)
        return child

    def wait_socket(path, child):
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if child.poll() is not None:
                raise RuntimeError(f"Runtime process exited: {child.returncode}")
            if path.exists():
                return
            time.sleep(0.1)
        raise RuntimeError(f"Timed out waiting for {path.name}")

    def stop(signum, frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        tpm = launch(["/usr/bin/swtpm", "socket", "--tpm2", "--tpmstate", f"dir={tpm_root}/state", "--ctrl", f"type=unixio,path={tpm_root}/tpm.sock"], guest_user=True)
        wait_socket(tpm_root / "tpm.sock", tpm)
        guest = launch([
            "/usr/bin/qemu-system-x86_64", "-name", "AISecEdu-Windows-Workspace", *guest_options(mode),
            "-machine", "pc-q35-8.2,smm=on", "-m", "4096",
            "-uuid", "51dc9b66-281d-42f1-9bfb-344489e36424",
            "-global", "driver=cfi.pflash01,property=secure,value=on",
            "-drive", "if=pflash,format=raw,unit=0,readonly=on,file=/opt/windows/firmware.fd",
            "-drive", f"if=pflash,format=raw,unit=1,file={STATE}/vars.fd",
            "-chardev", f"socket,id=chrtpm,path={tpm_root}/tpm.sock", "-tpmdev", "emulator,id=tpm0,chardev=chrtpm", "-device", "tpm-tis,tpmdev=tpm0",
            "-drive", f"file={STATE}/student.qcow2,format=qcow2,if=ide,cache=writeback",
            "-nic", "none", "-vga", "std", "-display", "none",
            "-vnc", f"unix:{STATE}/vnc.sock,password=on", "-qmp", f"unix:{STATE}/qmp.sock,server=on,wait=off",
            "-chardev", f"socket,id=check,path={STATE}/check.sock,server=on,wait=off", "-serial", "chardev:check",
            "-chardev", f"socket,id=agent,path={STATE}/agent.sock,server=on,wait=off", "-serial", "chardev:agent",
            "-drive", "if=none,id=environment-tools,media=cdrom,readonly=on", "-device", "ide-cd,drive=environment-tools,bus=ide.1",
            "-usb", "-device", "usb-tablet", "-rtc", "base=localtime",
        ], guest_user=True)
        wait_socket(STATE / "qmp.sock", guest)
        auth = pathlib.Path("/run/dojo/var/auth_token").read_text().strip().encode()
        password = hmac.new(auth, b"desktop-interact", hashlib.sha256).hexdigest()[:8]
        qmp("set_password", {"protocol": "vnc", "password": password})
        web = launch(["/usr/bin/websockify", "--web=/usr/share/novnc", f"--unix-target={STATE}/vnc.sock", "0.0.0.0:6080"], guest_user=True)
        launch(["/usr/bin/python3", str(ROOT / "gateway.py")])
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            try:
                with socket.create_connection(("127.0.0.1", 6080), timeout=1):
                    break
            except OSError:
                if web.poll() is not None:
                    raise RuntimeError("Windows desktop service exited")
                time.sleep(0.1)
        else:
            raise RuntimeError("Windows desktop service did not become ready")
        (STATE / "started").write_text(str(os.getpid()))
        while True:
            for child in children:
                if child.poll() is not None:
                    raise RuntimeError(f"Runtime process exited: {child.args[0]} ({child.returncode})")
            time.sleep(2)
    finally:
        (STATE / "started").unlink(missing_ok=True)
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    child.kill()
                    child.wait()
        shutil.rmtree(tpm_root)


def initialize():
    if os.geteuid() != 0:
        raise RuntimeError("The platform must initialize the Windows runtime")
    with open("/run/windows-runtime-init.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if (STATE / "started").exists():
            return
        acceleration()
        STATE.mkdir(mode=0o700)
        os.chown(STATE, UID, UID)
        subprocess.run(["/usr/bin/qemu-img", "create", "-f", "qcow2", "-F", "qcow2", "-b", "/opt/windows/course-seed.qcow2", str(STATE / "student.qcow2")], check=True)
        os.chown(STATE / "student.qcow2", UID, UID)
        (STATE / "student.qcow2").chmod(0o600)
        private_copy(pathlib.Path("/opt/windows/firmware-vars.fd"), STATE / "vars.fd")
        private_copy(pathlib.Path("/opt/windows/tpm-base"), STATE / "tpm")
        pathlib.Path("/usr/share/novnc/lab-result.json").unlink(missing_ok=True)
        workspace_commands()
        with open("/run/dojo/var/root/windows-runtime.log", "ab") as output:
            os.chmod(output.name, 0o600)
            child = subprocess.Popen(["/usr/bin/python3", str(ROOT / "runtime.py"), "--supervisor"], stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if (STATE / "started").exists():
                print("Windows is starting. Open Desktop; course files will appear in C:\\Course.")
                return
            if child.poll() is not None:
                raise RuntimeError("Windows initialization failed; see the platform runtime log")
            time.sleep(0.1)
        child.terminate()
        raise RuntimeError("Windows initialization timed out")


if __name__ == "__main__":
    supervise() if "--supervisor" in sys.argv else initialize()
