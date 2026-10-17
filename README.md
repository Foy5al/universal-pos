# Universal POS

Multi-tenant, multi-branch, offline-first retail POS and operations platform for
electronics, pharmacies, supermarkets, groceries and general retail.

This repository is at **P1 — Foundation**. Architecture decisions are frozen in
`docs/adr/`; the API/offline/finance slices follow in later increments. See
`plan.md` for the full roadmap and `AGENTS.md` for engineering rules.

## Requirements

- Node.js 22+ (developed on Node 24)
- pnpm via Corepack (`corepack enable`)
- Docker (local PostgreSQL)

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env          # then fill DATABASE_URL, SESSION_SECRET
docker compose -f infra/docker-compose.yml up -d
pnpm --filter @pos/db db:generate   # once schema is complete
pnpm dev
```

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Run all apps in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | ESLint across the workspace |
| `pnpm typecheck` | TypeScript project check |
| `pnpm test` | Unit/integration tests (Vitest) |
| `pnpm format` | Prettier write |

## Workspace layout

```text
apps/
  web/        Next.js App Router UI + offline PWA host
  api/        Express REST API (host-agnostic; exports app, never listen on import)
packages/
  contracts/  Zod DTOs, API envelopes, permission keys (shared contract)
  domain/     Money (integer minor units) and exact quantity helpers
  db/         Drizzle models and migrations (PostgreSQL)
infra/        Docker compose and hosting examples
docs/adr/     Architecture Decision Records (P0 output)
```

## Dependency direction

`UI -> contracts/API -> service/domain -> repository/DB`. No DB access from web
components, no business logic in route controllers. See ADR-0008.

## Status and known limitations

- Auth is Postgres-backed: Argon2id password hashing, opaque revocable sessions
  stored hashed (`/v1/auth/login`, `/v1/auth/logout`, `/v1/auth/session`) per
  ADR-0009. The full login → session → scoped-read path is integration-tested
  against real Postgres (CI provisions a `postgres:16` service).
- First migration lives in `packages/db/migrations`. Run `pnpm --filter @pos/db
  db:migrate` and `db:seed` (seeds permission keys) against a running Postgres.
- The stores resource is the first tenant/RBAC-scoped slice; catalog, inventory
  and sales follow.
- Pending owner decisions: ADR-0013 (inventory costing) and ADR-0014 (offline
  oversell policy) block P2 valuation and P4 offline acceptance.

## Quality bar

Every change must pass lint, typecheck, tests and build. Files stay at or below
300 physical lines (≤200 preferred). Finance, stock, tenancy, permission and sync
changes require invariant-focused tests, not just snapshots.
# universal-pos
