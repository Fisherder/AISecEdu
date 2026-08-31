# CTF production and validation workflow

## Design package

For every challenge define:

- competency and prerequisites;
- category, difficulty driver, and expected solve time;
- starting interface and authorized boundary;
- intended solve path and decisive evidence;
- per-instance entropy and dynamic flag release condition;
- private reference solve and success indicators;
- hint ladder, reset behavior, resource limits, and offline dependencies.

The learner package contains only what is needed to investigate. The private package owns the reference solve, exact gate assertions, hidden tests, and protected state.

## Privilege and mutable state

- Treat the generated challenge service and learner terminal as the same nonprivileged user. Never design an exploit that depends on the service reading `/flag`, `/flag.txt`, or `/challenge/flag` while the learner cannot; the platform-private checker alone mints the dynamic flag after observing the target state.
- Every learner starter file is integrity protected. Neither normal service execution nor the intended solve may write, append, delete, rename, or replace a starter file.
- Create mutable state after startup in process memory or under `/tmp`. Expose only the minimum read-only state endpoint needed by the private checker, and bind it to a concrete expected value.
- Validate the exact runtime user, filesystem permissions, clean-start behavior, and state reset path instead of inferring them from the source code.

## Validation matrix

Run from a clean instance:

1. Baseline: the untouched environment does not release a flag.
2. Intended solve: the reference path succeeds and obtains the current instance's flag.
3. Instance isolation: a flag from another instance or user is rejected.
4. Negative variants: near-miss input and incomplete state do not pass.
5. Leakage: learner files, logs, images, environment variables, and APIs do not expose the flag or private answer.
6. Bypass: direct endpoint access, self-asserted fields, trivial file reads, path tricks, stale artifacts, and obvious unintended routes fail.
7. Reset: a reset removes solve state and the full solve works again.
8. Reliability: repeated builds and checks have deterministic outcomes within time and resource limits.

A model review never replaces execution. Every repair is followed by a fresh clean-instance solve and the complete relevant negative suite.
