Windows 2000 lab03 binary editor repair (2026-11-03)

Scope: course 3839952, challenge 1526 / lab03-shellcode.
UltraEdit's expired evaluation copy cannot provide the required binary editor.
HxD 1.7.7.0 Chinese portable is the vendor's Windows 2000 compatible release.
The original HxD archive, all four archive members and its license are retained
unchanged. No UltraEdit activation state, binary or system clock is changed.

Source: https://mh-nexus.de/downloads/HxDchs.zip
Compatibility: https://mh-nexus.de/en/hxd/
The archive's SHA-512 was checked against the vendor's download page.
See manifest.json for archive and installation-media hashes.

build-media.py ORIGINAL_EDITOR_ISO creates tools.iso using genisoimage/isoinfo.
The input is the original Notepad++ editor.iso from the frozen deployed image
aisecedu/windows2000-stack-lab:2. The original editor.zip and manifest are
copied unchanged into the combined CD. This reuses the existing CD device;
adding a second device causes a Windows 2000 new-hardware wizard.

integrate.py LAB03_PACKAGE --backup BACKUP_TAR_GZ applies the reviewed startup
hook and tool instructions. The backup is mandatory. Run the actual course's
practice / lab03-shellcode authoring-standards resolver before maintenance.
The helper never changes the lab's EXE, grader, student payload or grades.

The initializer copies the tool directory and combined media into the runtime.
provision.py runs after guest boot, verifies archive and installed-file hashes,
preserves existing HxD settings, and adds the HxD desktop shortcut,
edit-payload.cmd and the UTF-16 editing guide in the existing lab03 workspace.
Installation is rechecked on every startup, including existing persistent disks.
HxD's initial portable configuration is created only when no HxD.ini exists.

For a running lab03 container, copy hex-editor into
/usr/local/lib/windows-lab/hex-editor and run provision.py --live. This borrows
the existing, idle installation CD and restores it in a finally block; the
guest, debugger and student programs are not restarted. A busy CD is rejected.
Installation evidence is /var/lib/windows-lab/hex-editor.json; the guest copy
is C:\Lab\Environment\hxd-install.json. READY requires verified installation
and an unchanged payload hash. The binary GUI save/reopen acceptance was run
only in isolated QA guests, never against student files.

Deployment backup: data/maintenance/hxd-20261103/lab03-before.tar.gz.
Rollback restores the three backed-up source files. Existing student disks
and work files must be retained; tool shortcuts may remain usable after rollback.
