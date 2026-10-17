# ADR-0001: Multi-tenant isolation model

## Status
Accepted

## Date
2026-10-17

## Context
Universal POS is a SaaS platform serving many independent organizations, each with
one or more stores/warehouses, registers and users. Data from one organization must
never be visible to, or writable by, another. Isolation must hold at the API, service
and repository layers, because hiding UI buttons is not a security control. The
development target (Neon free tier, Vercel) discourages one-database-per-tenant
operations.

## Decision
Use a shared PostgreSQL database with a strict row-level tenant scope:

- Every tenant-owned table carries an indexed `organization_id`, plus `store_id`
  (or `warehouse_id`/`register_id`) where the entity is branch-scoped.
- The authenticated request context resolves `organizationId` from the session and
  the server derives scope from it — never from a client-supplied body/query value.
- Scope is enforced in API middleware **and** in every service/repository query,
  update and export. Defense in depth, not a single choke point.
- Cross-tenant identifiers are rejected even when the caller holds a valid role name;
  lookups are always keyed by `(organization_id, id)`.
- Write integration tests that attempt cross-org and cross-branch access by guessing
  IDs for every resource group (see `plan.md` §15).

## Alternatives Considered

### Database per tenant
- Pros: strongest physical isolation, simple blast radius reasoning.
- Cons: connection/migration/backup overhead per tenant; impractical on the free
  development tier and for small shops.
- Rejected for now; kept as a future option for regulated/high-value tenants.

### Schema (namespace) per tenant
- Pros: logical isolation within one database.
- Cons: migration fan-out across schemas, dynamic Drizzle table definitions, complex
  connection/search_path handling.
- Rejected: complexity outweighs benefit at current scale.

### PostgreSQL Row-Level Security as the only control
- Pros: centralized enforcement close to the data.
- Cons: requires correct session variable plumbing, complicates pooled connections,
  easy to misconfigure silently.
- Rejected as the primary control; may be added later as defense in depth.

## Consequences
- All queries must include tenant scope; code review and tests treat a missing
  `organization_id` filter as a defect.
- A shared `tenantContext` is threaded from auth middleware into services/repos.
- Reporting/export paths carry the same obligation as transactional paths.
- Deleting or archiving an organization must cascade within scope only.
