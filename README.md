# Universal POS

Multi-tenant, multi-branch, offline-first retail POS and operations platform for
electronics, pharmacies, supermarkets, groceries and general retail.

This repository is at **P1 — Foundation**. Architecture decisions are frozen in
`docs/adr/`; the API/offline/finance slices follow in later increments. See
`plan.md` for the full roadmap and `AGENTS.md` for engineering rules.

## Requirements

- Node.js 22+ (developed on Node 24)
- pnpm via Corepack (`corepack enable`)
- Docker (local PostgreSQL + MinIO object storage)

## Quick start

One command bootstraps everything: starts Postgres + MinIO in Docker, installs
dependencies, applies migrations, seeds permissions and starts the dev servers.

```bash
./scripts/dev.sh          # bash (macOS/Linux/Git Bash)
```

```powershell
pwsh scripts/dev.ps1      # Windows PowerShell
```

Other actions: `down` stops the services, `reset` also wipes their volumes, and
`app` builds and runs the whole stack (migrate, api, web) in containers.

Prefer to run the steps yourself:

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm infra:up
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Commands

| Command                        | Description                          |
| ------------------------------ | ------------------------------------ |
| `pnpm dev`                     | Run all apps in watch mode           |
| `pnpm build`                   | Build all packages and apps          |
| `pnpm lint`                    | ESLint across the workspace          |
| `pnpm typecheck`               | TypeScript project check             |
| `pnpm test`                    | Unit/integration tests (Vitest)      |
| `pnpm format`                  | Prettier write                       |
| `pnpm infra:up` / `infra:down` | Start/stop Postgres + MinIO          |
| `pnpm stack:up` / `stack:down` | Build/run the full stack in Docker   |
| `pnpm db:migrate` / `db:seed`  | Apply migrations / seed permissions  |

## Workspace layout

```text
apps/
  web/        Next.js App Router UI + offline PWA host
  api/        Express REST API (host-agnostic; exports app, never listen on import)
packages/
  contracts/  Zod DTOs, API envelopes, permission keys (shared contract)
  domain/     Money (integer minor units) and exact quantity helpers
  db/         Drizzle models and migrations (PostgreSQL)
infra/        Docker compose, Dockerfiles for api/web, hosting examples
scripts/      dev.sh / dev.ps1 one-command developer bootstrap
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
- Migrations live in `packages/db/migrations` (0000 identity/tenancy, 0001
  catalog, 0002 inventory). Run `pnpm --filter @pos/db db:migrate` and `db:seed`
  (seeds permission keys) against a running Postgres.
- Tenant/RBAC-scoped slices: stores, then catalog (`/v1/catalog/categories`,
  `/catalog/brands`, `/catalog/units`, `/catalog/products`) and inventory
  (`/v1/inventory/locations`, `/inventory/balances`, `/inventory/movements`,
  `/inventory/adjustments`). Reads require `catalog:read` / `inventory:read`;
  writes require `catalog:manage` / `inventory:manage` / `inventory:adjust`.
  Product and location references are validated inside the caller organization.
  Purchasing and sales follow.
- Pending owner decisions: ADR-0013 (inventory costing) and ADR-0014 (offline
  oversell policy) block P2 valuation and P4 offline acceptance.

## Quality bar

Every change must pass lint, typecheck, tests and build. Files stay at or below
300 physical lines (≤200 preferred). Finance, stock, tenancy, permission and sync
changes require invariant-focused tests, not just snapshots.
