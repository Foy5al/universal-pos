# ADR-0006: Database and ORM

## Status
Accepted

## Date
2026-10-17

## Context
The domain is strongly relational (organizations, stores, products, stock ledger,
sales, tenders, journals) and demands ACID transactions, foreign keys and check
constraints for financial correctness. Schema changes must be reviewable and applied
through controlled migrations, never mutated at request time or on cold start.

## Decision
- Use PostgreSQL as the primary database and Drizzle ORM with versioned SQL migrations
  in `packages/db`.
- Model identity/tenancy, catalog, retail specializations, stock, purchasing, sales,
  cash/accounting and sync/audit as migration groups (see `plan.md` §7).
- Enforce integrity with foreign keys, unique scoped constraints (tenant-scoped SKUs,
  device operation IDs, server invoice numbers) and check constraints; soft-archive
  only where justified.
- Posted financial records are append-only; corrections use linked reversals/credit
  notes. Audit events never silently mutate history.
- Store normalized snapshots of names, unit prices, tax amounts and discounts on sale
  lines so later catalog changes cannot alter historical receipts.
- No schema mutation from requests or cold starts; migrations run in controlled
  deployment steps.
- Index `organization_id` on every tenant-owned table and the relevant `store_id`.

## Alternatives Considered

### Prisma
- Pros: polished DX, strong tooling.
- Cons: heavier client/runtime, less direct control over SQL and partial indexes, and
  migrations are less transparent for complex financial schemas.
- Rejected in favor of Drizzle's SQL transparency and lighter footprint.

### Raw SQL with a query builder
- Pros: total control.
- Cons: no type-safe schema modeling, higher drift risk, more boilerplate.
- Rejected.

### Document store (MongoDB)
- Pros: flexible schema.
- Cons: relationships, transactions across collections and reporting joins are the
  core of this domain.
- Rejected: inherently relational.

## Consequences
- A2 owns `packages/db`; schema/constraint changes require A0 review and migration notes.
- Tests assert transaction rollback, unique/idempotency constraints and lock behavior.
- Development uses Neon free PostgreSQL; production moves to a Docker/self-hosted
  PostgreSQL with verified backups and restore drills.
- Inventory costing (ADR-0013) determines which valuation columns/materialized views
  the stock ledger needs.
