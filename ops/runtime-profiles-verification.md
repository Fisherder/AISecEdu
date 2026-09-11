# Runtime profiles deployment verification — 2026-09-11

The desktop repair was verified in a browser against a live 1280×800 Windows
framebuffer at 1050×710 and 700×500 viewport sizes. Both showed the complete
desktop and taskbar at the original 1.6 aspect ratio. The result button's
Chinese text rendered correctly. The existing learner workspace stayed running.

The course outline can be collapsed to a 44 px rail and expanded again, with
the desktop preference retained after reload. Content gained 226 px in the
verified desktop layout. Mobile navigation and keyboard focus restoration
passed independently. Plain Markdown tables now inherit theme text colors;
all 16 checked cells passed in each of four themes, with contrast ratios from
15.46 to 15.93 instead of the previous 1.20. The readability check passed all
12 stylesheets and 442 font-size declarations.

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

After deployment, the authenticated manual authoring page returned HTTP 200
with both runtime choices, and the production workspace API started a fresh
Windows workspace. Native compilation, checking and all three workspace routes
passed again. The hidden account's repeated Flag submissions correctly returned
`already_solved`; the first-run incorrect/correct results remain in the evidence.

The configured model endpoint recovered from the earlier HTTP 402 failure.
Account authorization errors now stop automatic retry and report the required
account action; a detached queue-record bug that masked the original failure
was also corrected. The later model-driven Windows run
`solve_4d2a1a36f8ba4bd8ae1b11ad0642e3b3` completed with `VERIFIED`: it read the
public C source, compiled it with the installed Tiny C Compiler, ran the native
EXE and obtained the Flag through the Windows checker. The platform verified
the Flag's account and challenge binding and matched the teacher steps to the
execution trace. All three model commands were allowed, with zero rejections.

Five additional recovery tests cover HTTP 401/402/403 and detached queue records
on retryable and permanent failures. All five passed alongside the 23 profile
tests; the surrounding 171-test Python regression selection passed again.

Runtime profiles expose the installed compiler, writable directory and platform
checker to the teacher assistant and solution agent. The Windows profile provides
`C:\tcc\tcc.exe` and `C:\CourseWork`; Linux provides `gcc` and `/home/hacker`.
Two integration cases verify that both model contexts receive the same facts.
The authoring context explains that the platform supplies the checker and
starts declared services from protected, readable source files. Generated
Windows packages must not replace the platform's `check.cmd` with a placeholder.
The updated Python regression selection passed 183 tests, the focused agent
suite passed 43 tests, and the production Next.js build completed successfully.
The deployment preserved the running learner container's ID and start time.

The configured model accepted an explicit 32,768-token output budget in a live
probe. Truncated JSON retries now grow from the previous request's budget up
to that bound; they preserve larger caller-specified budgets. Five regression
cases cover repeated truncation, malformed JSON, retaining an increased budget
and avoiding a decrease of an explicit larger limit. Existing account-error
and total-deadline regressions remain passing.

Real teacher conversations `thread_ede81847c5bb493cb260bce7868a10b5` and
`thread_2a58a8ac9ec84c0e8fca1a09a8d88b12` requested ordinary C compilation
exercises on Windows and Linux. Both produced three selectable plans, retaining
the selected environment in all six rewritten prompts and in the tool
constraints. The Windows plans used the installed compiler's absolute path
and writable output directory; the Linux plans used gcc.

Both selected plans produced drafts through the normal authoring API. Initial
runs exposed checker-entry conflicts and truncated model output. Those runs
were canceled with their drafts and logs retained, the fixes were deployed,
and the same drafts resumed through the normal validation API. Both finished
with `PASS` and were published to the private acceptance course:

| Runtime | Generated exercise | Published challenge | Model solution run |
| --- | --- | --- | --- |
| Windows | `windows-native-calc-runtime` | 1466 | `solve_1445890abc4f4cccada099a978f2cc2c` |
| Linux | `linux-windows-0-1-linux-c-flag` | 1465 | `solve_7eb502b073cb4c5cb436b77e016bd7dc` |

Both model runs finished `VERIFIED`, compiling and running the supplied C
program with the selected operating system's compiler. Each verified the
account-bound and challenge-bound Flag, with four allowed model commands and
zero policy rejections. The teacher steps matched the execution traces.

The hidden acceptance account then started each generated exercise through the
production workspace API. Initial incomplete states were rejected. Native
compilation and execution produced the expected result, the platform checker
returned a dynamic Flag, and the normal submission API rejected an incorrect
Flag and accepted the correct one. Windows Desktop, Code and Terminal each
returned HTTP 200, and the desktop result matched the native checker. The
disposable acceptance workspace was stopped after verification; the exercises,
evidence and all three original courses were retained. The original learner's
Windows container ID and start time remained unchanged.

Host-side acceptance evidence is retained at
`/srv/aisecedu-dojo/data/agent-runtime/runtime-profiles-20260911`.
Build and regression source snapshots are retained at
`/srv/aisecedu-dojo/data/runtime-profiles-20260911`.
Evaluation disks, TPM state, credentials and deployment environment backups
are excluded from repository commits. Existing courses and their image tags
are preserved.
