# 玄甲 global-agent runtime provenance

This directory is the deployable, internal capability runtime of the 玄甲 global agent. It is not a second product and cannot run as an independent user-facing application in 玄甲 deployments.

The rendering and interactive-classroom implementation was derived from the OpenMAIC project under the MIT license. Supply-chain identifiers such as `@openmaic/dsl`, `@openmaic/renderer`, and the upstream copyright/license files are intentionally preserved.

- Source checkout at import: `/mnt/HDD1/LLM/ccr/OpenMAIC`
- Source branch at import: `feat/cybersec-mvp`
- Source HEAD at import: `3cd6fd3dbbb7c655bb96c40c9bfecb0f31e0f0db`
- Snapshot date: `2026-08-17`
- Upstream version: `0.3.1`
- License: MIT; see `LICENSE`

玄甲 integration adds the `/agent-runtime` base path, a single-use scoped capability exchange, service-authenticated generation and classroom endpoints, 玄甲-backed storage adapters, usage reporting, restricted embedded pages, sandboxing, and integration tests.

玄甲 owns identity, authorization, courses, modules, challenges, conversations, durable jobs, quotas, validation, publishing, files, grades, and learning evidence. The runtime may render and execute only the scope supplied by those platform facts. In production it must not provide standalone accounts, a root application, an independent course list, or authoritative file-backed lesson storage. When `AISECEDU_INTEGRATED` is false, middleware permits only the health endpoint and returns 404 for every other page and API.

## Updating the vendored engine

Refresh upstream into a staging tree, preserve the license and package identifiers, reapply 玄甲 integration changes, then run type checks, focused tests, a production build, authenticated browser E2E, and data-isolation checks. Production builds only from `services/agent-runtime`; never add a second source snapshot or fallback Compose service. Do not copy `.env.local`, nested Git metadata, dependency caches, build output, local databases, or runtime data into this directory.
