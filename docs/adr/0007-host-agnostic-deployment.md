# ADR-0007: Host-agnostic deployment

## Status
Accepted

## Date
2026-10-17

## Context
Vercel is convenient for non-commercial development but is a temporary target and not
a compliant host for real store operations. Business logic must not depend on any
provider's runtime, and the API must run both as a serverless function and as a plain
Node process behind a reverse proxy.

## Decision
- `apps/api` builds a framework-agnostic Express `app` and never calls `listen()` at
  import time. A thin local/Docker entrypoint imports `app` and calls `listen()`; the
  Vercel function entrypoint exports `app` as the handler.
- Configure all environments through variables (`NEXT_PUBLIC_API_BASE_URL`,
  `DATABASE_URL`, `STORAGE_*`, `SESSION_*`, `PWA_*`); never hardcode provider URLs.
- Production runs as Docker images (web, API, PostgreSQL, optional worker/Redis) behind
  a reverse proxy, with no provider-specific business code.
- Do not rely on function memory, process lifetime or local filesystem for cron daemons,
  durable queues, websockets or persistent workers; queued work uses an explicit worker.
- Provide `/health` and `/ready`, structured logs, external error tracking and
  periodic backups with restore verification.
- Migrations run in controlled deployment steps, not on cold start.

## Alternatives Considered

### Vercel-only architecture
- Pros: minimal ops, fast iteration.
- Cons: violates commercial terms for real stores, and couples to a provider's limits
  (execution time, no durable processes, ephemeral filesystem).
- Rejected as the production target; retained for development only.

### Provider-specific serverless primitives (queues, cron, KV)
- Pros: less infrastructure to run.
- Cons: lock-in; blocks the Docker migration path.
- Rejected: infra choices stay behind adapters.

## Consequences
- The same API artifact runs locally, in Docker and on Vercel with no branching logic.
- Production cutover means pointing domains at Docker-hosted web/API, restoring or
  migrating PostgreSQL, redirecting the storage endpoint, rotating secrets and
  smoke-testing sync.
- Deployment uses versioned images, separate staging/production, documented rollbacks
  and feature-flagged schema upgrades.
