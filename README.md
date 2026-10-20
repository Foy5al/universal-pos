# Universal POS

Multi-tenant, multi-branch, offline-first retail POS and operations platform for
electronics, pharmacies, supermarkets, groceries and general retail.

This repository is at **P4 - Offline POS MVP** (cash checkout is durable in
IndexedDB and syncs through an idempotent outbox; the PWA shell precache and
conflict-review screen still follow). Architecture decisions live in
`docs/adr/`; exports and finance slices follow. See `plan.md` for the full
roadmap and `AGENTS.md` for engineering rules.

## Requirements

- Node.js 22+ (developed on Node 24)
- pnpm via Corepack (`corepack enable`)
- Docker (local PostgreSQL + MinIO object storage)

## Quick start

One command bootstraps everything: starts Postgres + MinIO in Docker, installs
dependencies, applies migrations, seeds permissions and demo data, then starts
the dev servers. Sign in at http://localhost:3000/login with
`owner@demo.pos` / `password123` (override with `DEMO_EMAIL` / `DEMO_PASSWORD`);
the till is at http://localhost:3000/pos and the catalog at
http://localhost:3000/catalog. Open a register shift before the first cash sale,
then count and close it at the end of the session. The demo seed includes
grocery items and electrical products (switches, sockets, switch board, LED
bulbs, wire, breaker and fan regulator) with opening stock.

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
pnpm db:seed:demo
pnpm dev
```

## Commands

| Command                        | Description                         |
| ------------------------------ | ----------------------------------- |
| `pnpm dev`                     | Run all apps in watch mode          |
| `pnpm build`                   | Build all packages and apps         |
| `pnpm lint`                    | ESLint across the workspace         |
| `pnpm typecheck`               | TypeScript project check            |
| `pnpm test`                    | Unit/integration tests (Vitest)     |
| `pnpm format`                  | Prettier write                      |
| `pnpm infra:up` / `infra:down` | Start/stop Postgres + MinIO         |
| `pnpm stack:up` / `stack:down` | Build/run the full stack in Docker  |
| `pnpm db:migrate` / `db:seed`  | Apply migrations / seed permissions |
| `pnpm db:seed:demo`            | Seed demo owner, register, products |

## Workspace layout

```text
apps/
  web/        Next.js App Router UI + offline PWA host
  api/        Express REST API (host-agnostic; exports app, never listen on import)
packages/
  contracts/  Zod DTOs, API envelopes, permission keys (shared contract)
  domain/     Money (integer minor units) and exact quantity helpers
  db/         Drizzle models and migrations (PostgreSQL)
  offline/    Dexie store, atomic local checkout, outbox and sync engine
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
  catalog, 0002 inventory, 0003 purchasing, 0004 sales, 0005 register shifts,
  0006 refunds, 0007 stock losses, 0008 restock requests, 0009 sync
  operations/conflicts). Run
  `pnpm --filter @pos/db db:migrate` and `db:seed` (seeds permission keys)
  against a running Postgres.
- Tenant/RBAC-scoped slices: stores, then catalog (`/v1/catalog/categories`,
  `/catalog/brands`, `/catalog/units`, `/catalog/products`), inventory
  (`/v1/inventory/locations`, `/inventory/balances`, `/inventory/movements`,
  `/inventory/adjustments`) and purchasing (`/v1/purchases/suppliers`,
  `/purchases/orders`, `/purchases/orders/:id/status`,
  `/purchases/orders/:id/receipts`). Reads require `catalog:read` /
  `inventory:read` / `purchases:read`; writes require `catalog:manage` /
  `inventory:manage` / `inventory:adjust` / `purchases:manage`. Product,
  supplier and location references are validated inside the caller
  organization. Goods receipts update PO line quantities, order status and the
  stock ledger in one transaction; purchase orders are limited to the stores in
  the caller's scope.
- Restock requests: an out-of-stock POS tile raises `POST /v1/restock-requests`
  with location, product, quantity and an optional note (`restock:request`); the
  list is readable with `purchases:read` too. A manager reviews pending
  requests in `/purchasing`, dismisses duplicates (`PATCH
/v1/restock-requests/:id`) or selects pending requests from one location to
  create a purchase order with `restockRequestIds`. Matching requests become
  `scheduled`; partial GRNs keep them scheduled, and a fully received order
  marks them `fulfilled`. Cancelling the order releases them back to pending.
  Converting needs `purchases:manage` and the same tenant/store scope as the
  order (ADR-0020).
- Stock losses: `GET/POST /v1/inventory/losses` records damaged, defective,
  expired, lost or other stock with an optional note and expiry date. The loss
  writes an `issue` ledger movement, rejects quantities above stock on hand,
  and stores the catalog cost snapshot for reporting. Expired losses require
  the expiry date. Reads need `inventory:read`; recording needs
  `inventory:adjust`.
- Online POS MVP: `POST /v1/sales` posts an immutable cash sale (price/sku/name
  snapshots, integer minor units), its payment and the stock issue in one
  PostgreSQL transaction. `operationId` makes retries idempotent; insufficient
  stock returns `409` and rolls the whole sale back. A sale requires an open
  register shift for the same store. Reads require `sales:read`, writes
  `sales:create`.
- Register shifts: `GET /v1/registers`, `GET/POST /v1/register-shifts`,
  `GET /v1/register-shifts/current`, `POST /v1/register-shifts/:id/cash-movements`
  and `POST /v1/register-shifts/:id/close`. Opening, cash in/out and closing need
  `registers:manage`; one shift per register may be open. Closing computes
  `float + cash sales + cash in - cash out - cash refunds`, stores the counted
  amount and variance, and blocks further sales on that shift (ADR-0016).
- Offline POS: every checkout first commits the sale, lines, cash tender and an
  outbox event to IndexedDB (`@pos/offline`) and only then shows a receipt, so
  a forced browser close cannot lose a queued sale. `POST /v1/sync/push`
  enrolls the terminal on first use, keeps the terminal's captured unit prices
  (half-up integer rounding) and deduplicates on `(organizationId,
operationId)`, returning the same `INV-` sale on retries. Insufficient stock
  or other posting conflicts are stored as `sync_conflicts` and returned as
  `needs_review` instead of dropping the sale; deterministic validation
  failures return `rejected`. `GET /v1/sync/pull` is device-scoped with a
  sequence cursor for canonical receipts, and `GET /v1/sync/conflicts` lists
  review cases. Devices are listed with `devices:read`, enrolled/revoked with
  `devices:manage`; push needs `sync:push`, pull `sync:pull`, review
  `sync:review` (ADR-0019).
- Refunds: `POST /v1/sales/:id/refunds` issues one full-sale cash refund with a
  required `operationId` and reason (ADR-0017). It returns stock with `return`
  movements, keeps the sale immutable and subtracts from the shift's expected
  cash. Requires `refunds:approve`; a second refund of the sale returns `409`.
- Reports: `GET /v1/reports/sales-summary` returns UTC daily totals for a
  range (default seven days, maximum 366), including gross sales, refunds, net
  sales, average sale and units. `GET /v1/reports/store-activity` adds stock
  losses and received goods at their recorded cost snapshots for the same
  range. `GET /v1/reports/shifts/:id` returns an X report for an open shift or
  a Z report after close. All require `reports:read`; store-scoped principals
  only see their locations (ADR-0018).
- The web till at `/pos` scans barcodes, selects a register, opens a shift,
  takes cash, shows change, prints an 80 mm receipt and can refund the current
  receipt. Cart quantities are checked against current location stock before
  charging, with inline messages and disabled checkout when a line exceeds
  stock. The `/catalog` page lists products, creates catalog entries with
  category/brand/unit references, records optional opening stock and creates
  brands to filter the product list. `/purchasing` covers suppliers, restock
  review, draft orders and goods receipts (GRN); out-of-stock till tiles open a
  restock request dialog for cashiers with `restock:request`. `/inventory`
  records waste/damage/expiry and shows
  stock and loss value by location. The `/reports` dashboard shows range and
  daily totals, stock-loss and receiving activity, and X/Z shift reports; its
  cost figures are operational snapshots, not double-entry accounting.
  The till shows ONLINE/OFFLINE/SYNCING state, queued and needs-review counts,
  the last sync time and a retry control, prints provisional `OFF-` receipts
  before sync and swaps to the canonical invoice once accepted. It restores
  cached catalog, stock, session, register and shift state on an offline
  reload. Discounts, tax, void, product editing, cashier/register report
  filters, exports, the service-worker app-shell precache and a manager
  conflict-review screen are not implemented yet.
- Pending owner decisions: ADR-0013 (inventory costing) and ADR-0014 (offline
  oversell policy) block P2 valuation, margin reporting and P4 offline
  acceptance. Sales currently record quantity movements without cost snapshots,
  and an offline sale that would oversell is held for review rather than
  silently accepted or deleted.

## Quality bar

Every change must pass lint, typecheck, tests and build. Files stay at or below
300 physical lines (≤200 preferred). Finance, stock, tenancy, permission and sync
changes require invariant-focused tests, not just snapshots.
