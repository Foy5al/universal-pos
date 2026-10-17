# ADR-0004: Offline-first architecture and sync protocol

## Status
Accepted

## Date
2026-10-17

## Context
Stores lose connectivity; checkout must keep working. A POS that blocks on the network
is unusable and, worse, a POS that *claims* success without durable local persistence
loses money. Offline and online terminals can also act on stale prices and stock, so
reconciliation must be explicit and idempotent — never last-write-wins.

## Decision
- The POS is a PWA backed by IndexedDB via Dexie with a versioned local schema and a
  versioned service worker that precaches the install shell and POS assets (safe GETs
  and assets only — never authenticated POST responses).
- Each checkout atomically writes sale + line items + tender records + inventory intent
  + outbox event in a single IndexedDB transaction **before** success is shown.
- Identifiers (`saleId`, `operationId`, `deviceId`) are client-generated UUIDv7; each
  event envelope carries `operationId`, `entityId`, `entityType`, `eventType`,
  `tenantId`, `branchId`, `registerId`, `deviceId`, `clientSequence`, `occurredAt`,
  `payloadVersion`, `payload`.
- Sync API: `POST /v1/sync/push` with bounded batches and per-event idempotency keys;
  `GET /v1/sync/pull?cursor=...` for authorized incremental deltas.
- Outbox states: `pending -> sending -> acknowledged`, with `retryable_error` and
  `needs_review`; retries use exponential backoff plus jitter.
- The server deduplicates on `(tenantId, operationId)` inside one PostgreSQL
  transaction that locks affected inventory rows and posts stock/payment/sale effects;
  repeated pushes return the same canonical result (no duplicate invoices or debits).
- Conflicts resolve to a review case with compensating adjustments/refunds; sales are
  flagged `local_pending`, `server_accepted`, `requires_review` or `rejected`, and
  reports distinguish provisional from reconciled totals.
- Receipt numbers are provisional offline (`OFF-{register}-{localSequence}`); the
  immutable server fiscal number is assigned only on acceptance.
- Sync is triggered on app open, focus, network return, manual Retry and optionally
  Background Sync — never only when `navigator.onLine` flips.

## Alternatives Considered

### Online-only POS
- Pros: far simpler, one source of truth.
- Cons: unusable when connectivity drops; contradicts the product requirement.
- Rejected.

### Local desktop service with SQLite as primary store
- Pros: stronger durability than browser storage.
- Cons: install/update burden, OS-specific support, slower to ship.
- Deferred as an optional durability layer for high-stakes stores (see `plan.md` §5).

### CRDT-based replication
- Pros: automatic convergence without conflict UI.
- Cons: overkill for append-only sales; hides financial conflicts that must be reviewed.
- Rejected: POS events are idempotent operations, not editable shared state.

## Consequences
- Offline durability and idempotency are validated from P0 onward, not deferred.
- A5 owns the outbox/sync engine; A1 owns the idempotent push/pull endpoints.
- Acceptance suite includes browser kill/relaunch, network cut, duplicate push (×10),
  server crash between commit and response, two-terminal oversell and stale-catalog tests.
