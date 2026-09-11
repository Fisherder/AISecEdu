# Windows course runtime

The shared runtime profile selects the image, memory allowance, native working
directory, service interpreters and desktop behavior. Linux remains the default.
Teachers can say `用 Windows 远程桌面出一道 C 程序运行题` or `改用 Linux 环境`;
the three generation choices and later draft revisions preserve that selection.
The manual authoring form also exposes a Linux/Windows selector.

Authoring requests use `constraints.runtimeEnvironment: windows`; imported
course YAML uses `runtime_environment: windows` at course, module or challenge
level. The field survives package publication and source reuse. Deployment
settings `DOJO_LINUX_RUNTIME_IMAGE` and `DOJO_WINDOWS_RUNTIME_IMAGE` select the
installed images, defaulting to `pwncollege/challenge-legacy:latest` and
`aisecedu/windows-runtime:1`. A custom image can still be specified explicitly.

```yaml
id: programming
name: Programming practice
modules:
  - id: native
    name: Native Windows
    runtime_environment: windows
    challenges:
      - id: hello
        name: Compile and run
```

Windows uses a fresh QEMU copy-on-write disk per workspace and 4 GiB guest RAM
inside a 6 GiB unprivileged course container. It automatically uses KVM with
4 guest CPUs when `/dev/kvm` is available, or TCG with 2 guest CPUs otherwise.
`DOJO_WINDOWS_ACCELERATOR` can explicitly select `kvm` or `tcg`. QEMU runs as
UID 60000 and has no virtual network adapter. Software emulation takes longer
to boot; set `DOJO_WINDOWS_BOOT_TIMEOUT_SECONDS` in the deployment config to
give the command bridge and solution agent a matching startup budget.
Only two legacy serial ports are configured: COM1 for course checks and COM2
for provisioning and native commands. A third port shares COM1's IRQ and can
make Windows reject both devices with resource error 12.

For small disks, `DOJO_WINDOWS_SEED_PATH` can supply a shared host QCOW2 file
instead of embedding it in the runtime image. The platform mounts this file
read-only into Windows workspaces. Deployment and artifact details are in
[`ops/small-cloud-deployment.md`](../../../ops/small-cloud-deployment.md).

Public starter files are copied to `C:\Course`; learner output belongs in
`C:\CourseWork`. The installed evaluation seed provides Windows, OllyDbg,
native VS Code, PowerShell 5.1 and Tiny C Compiler. The browser Desktop entry
opens Windows; the existing Code and Terminal entries remain available for
workspace tooling. Native commands can be run from the terminal or solution
agent with `windows-exec '<PowerShell command>'`.

The runtime profile supplies the same public tool and directory facts to the
teacher assistant, package authoring and solution agent. Windows uses
`C:\tcc\tcc.exe`; Linux uses `gcc`. Windows compiler output belongs in
`C:\CourseWork`, for example from PowerShell:

```powershell
& 'C:\tcc\tcc.exe' 'C:\Course\main.c' -o 'C:\CourseWork\main.exe'
& 'C:\CourseWork\main.exe'
```

The compiler does not need to be on `PATH`. A replacement runtime image must
provide the tools declared by its profile. Compilation exercises require the
solution agent to compile and run the supplied program before checking it.

`guest-agent.ps1` transfers public files with SHA-256 verification, starts
PowerShell/cmd services, and returns native process exit status and output.
Private answers and the dynamic Flag remain in the platform checker. Running
`C:\Course\check.cmd` uses the same checker as `/challenge/check`. Declarative
`FLAG_GATE_V1` checks query the declared service on Windows localhost through
the serial bridge, verifying the original process identity and course files.
Successful checks also populate the browser's result button. Resetting the
workspace creates a fresh disk and removes the previous result.

The runtime image builds a small Win32 serial client from `guest-check.c`
with MinGW. Bootstrap copies it into Windows and installs a course-local
`check.cmd` wrapper after service initialization. This avoids launching another
PowerShell process for each check under TCG. The client preserves UTF-8 messages
and the existing checker protocol; private validation and Flag binding still
run on the platform. The evaluation seed's protected scripts stay intact.

## Building an evaluation seed

Use a licensed, fully configured Windows evaluation VM on the deployment host.
Acceptance of Microsoft's evaluation license is a human decision. In this
deployment the user accepted the official 90-day evaluation, activated through
2026-12-10. The disk and activation state are local artifacts and are excluded
from Git.

Copy `guest-agent.ps1`, `guest-check.ps1`, `guest-check.cmd` and
`install-guest.ps1` onto installation media, run `install-guest.ps1` from the
Student session, then shut Windows down normally. Preserve the matching UEFI
variables and TPM state. The seed must match the QEMU machine, firmware and
UUID configured in `runtime.py`; copying only the disk is insufficient.

Place the prepared disk at `seed/course-seed.qcow2`, UEFI variables at
`seed/vars.fd`, and TPM files in `seed/tpm/`. All backing disks referenced by
the qcow2 must exist at their image paths; alternatively flatten the prepared
disk with `qemu-img convert -O qcow2`. Build in the inner Docker daemon:

```sh
docker build -t aisecedu/windows-runtime:1 workspace/services/windows-desktop
```

The Dockerfile uses the installed evaluation/tooling base image. This host's
reproducible seed context is retained under
`/data/runtime-profiles-20260911/windows-build` in the outer Dojo container;
the sealed source and earlier image tags are retained for rollback.
`windows-exec --ready` waits for guest boot, file transfer and service readiness.
After deploying profile support, run `ops/migrate-runtime-profiles.py` in the
CTFd Python environment to preview old image-labelled Windows courses, then
use `--apply` to add their missing runtime metadata without replacing images
or deleting courses.

## Desktop display

QEMU exposes a fixed-size framebuffer. The Windows noVNC page must use `scale`,
with viewport clipping disabled, so the whole desktop remains visible inside
the course iframe. The Linux desktop retains its remote resizing behavior.

`install-display.py` adds an early UTF-8 declaration, explicitly encodes the
course result script, and applies mandatory noVNC settings before `UI.start`.
This also overrides stale `resize=remote` links and saved browser preferences.
The installer is idempotent and can update a running workspace without
restarting Windows.

Build from an installed Windows runtime image inside the outer Dojo container:

```sh
docker build --build-arg BASE_IMAGE=aisecedu/windows-course-runtime:20260911-v2 \
  -f workspace/services/windows-desktop/Dockerfile.display-fix \
  -t aisecedu/windows-course-runtime:20260911-v2-display \
  workspace/services/windows-desktop
```

On 2026-09-11, the display layer was applied to the running Windows workspace
and both deployed v1/v2 image tags. Previous images remain under the
`-before-display` tags. Browser verification showed the full 1280×800 desktop
at 1050×710 and 700×500 viewport sizes, preserving its 1.6 aspect ratio, with
the taskbar visible and the result button displaying `获取检查结果` correctly.
An existing browser page needs a refresh to load the updated HTML; the VM
session itself does not need restarting.
