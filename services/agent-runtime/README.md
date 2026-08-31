# 玄甲 global-agent runtime

This directory contains the private capability runtime used by the 玄甲 global teacher agent. It renders and edits teaching artifacts, prepares classroom experiences, and executes the model-facing planning and generation stages requested through `/teacher`.

It is not a second product:

- it has no supported standalone UI, account system, or course authority;
- integrated requests require a short-lived 玄甲 session or an internal service credential;
- non-integrated mode exposes only `/api/health`;
- the public `/agent-runtime` root and all legacy `/openmaic` paths return teachers to `/teacher`;
- authoritative courses, permissions, jobs, approvals, files, learner evidence, and publication state remain in 玄甲.

Operational instructions are in [`../../docs/global-agent-operations.md`](../../docs/global-agent-operations.md), and the trust boundary is documented in [`../../docs/global-agent-architecture.md`](../../docs/global-agent-architecture.md).

## Upstream provenance

The renderer and classroom implementation are derived from the MIT-licensed OpenMAIC project. Package names such as `@openmaic/dsl` are retained where required for compatibility and attribution. The original upstream README is preserved as [`UPSTREAM-README.md`](UPSTREAM-README.md), and the exact integration policy is recorded in [`XUANJIA-INTEGRATION.md`](XUANJIA-INTEGRATION.md).
