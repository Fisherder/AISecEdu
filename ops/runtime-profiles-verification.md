# Runtime profiles deployment verification — 2026-09-11

The desktop repair was verified in a browser against a live 1280×800 Windows
framebuffer at 1050×710 and 700×500 viewport sizes. Both showed the complete
desktop and taskbar at the original 1.6 aspect ratio. The result button's
Chinese text rendered correctly. The existing learner workspace stayed running.

The private course `runtime-profile-check-20260911~c0d82cd9` contains ordinary
C compilation exercises used for runtime acceptance. The Linux and Windows
manual drafts passed the platform's normal validation and publication checks.
For each environment, a hidden acceptance account compiled and ran the program,
received rejection for an incorrect answer, obtained a dynamic Flag for the
correct answer, and submitted it through the normal challenge attempt API.
Incorrect Flag submissions were rejected; correct submissions were accepted.
Windows Desktop, Code and Terminal routes returned HTTP 200, and the desktop
result matched the checker's Flag. Evidence stores Flag hashes only.

The Windows workspace used image
`sha256:0bf5c26c4fedf21d8a27ef720fd7646e18ead7970af5da309a1923c15a2c694e`,
6 GiB container memory and an unprivileged container. The Linux control used
4 GiB and the existing Linux image. Guest provisioning tested chunked UTF-8
file transfer, native C compilation, nonzero exit status and Windows localhost
service responses. The fixture programs perform arithmetic and file output.

A separate `windows-live-gate` integration fixture exercised the generated
package's declarative service checker end to end. Its initial state was
rejected. Compiling and running the C program updated the Windows file consumed
by the native PowerShell service; checking that live state returned a Flag and
the normal submission API accepted it. This fixture tests runtime transport;
it is separate from the two drafts tested through the publication workflow.

The Python selection/package and surrounding regressions passed 171 tests.
The agent runtime and existing model/teacher regressions passed 314 tests;
two additional integration cases then verified Windows/Linux selection across
all three generation choices (9 cases passed in that focused file).
The production Next.js build completed with TypeScript validation.

Host-side acceptance evidence is retained at
`/srv/aisecedu-dojo/data/agent-runtime/runtime-profiles-20260911`.
Build and regression source snapshots are retained at
`/srv/aisecedu-dojo/data/runtime-profiles-20260911`.
Evaluation disks, TPM state, credentials and deployment environment backups
are excluded from repository commits. Existing courses and their image tags
are preserved.
