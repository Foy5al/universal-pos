# ADR-0015: Online sale posting and idempotency

## Status

Accepted

## Date

2026-10-20

## Context

The P3 online POS slice must commit a cash sale, its payment and the stock issue
without partial state, and must be safe to retry after a network or server crash.
ADR-0003 fixes money as integer minor units and quantities as exact decimals;
ADR-0013 (costing) and ADR-0014 (offline oversell) are still pending, so posting
must not depend on cost valuation or offline assumptions.

## Decision

- A sale is created by `POST /v1/sales` with a client-generated `operationId`.
  `(organizationId, operationId)` is unique. A repeated request returns the
  original sale instead of creating a second invoice or stock issue.
- Sale header, line snapshots (SKU, name, unit price), cash payments and the
  negative stock movements commit in **one PostgreSQL transaction**. Any failure,
  including insufficient stock, rolls back every part.
- Online checkout rejects insufficient stock with `409 Conflict`. Allowing
  negative stock is an offline policy decision deferred to ADR-0014.
- Unit price is the current catalog price at posting time. Line totals round
  half-up to minor units; the header stores subtotal, total, tendered and change.
  Discounts and tax stay at zero until their pricing rules are specified.
- Only `cash` is an accepted online tender. Electronic tenders require provider
  confirmation and adapter contracts, so they are rejected rather than marked
  settled optimistically.
- Posted sales are immutable. Voids/refunds will be linked reversing records, not
  in-place edits.
- Invoice numbers are `INV-{yyyyMMdd}-{first 8 hex of sale UUID}`, unique per
  organization and stable across retries.

## Alternatives Considered

### Server-generated operation key

Pros: simpler client. Cons: a client retry cannot prove it is repeating the same
intent, so crash-after-commit retries could duplicate sales. Rejected.

### Insert sale first, post stock asynchronously

Pros: shorter request. Cons: a sale could exist without a stock effect, breaking
the atomic sale/payment/stock invariant. Rejected.

### Last-write-wins stock updates

Pros: none for financial correctness. Cons: lost updates and silent oversell.
Rejected; balances lock with `FOR UPDATE` inside the transaction.

## Consequences

- Cashiers get a safe retry path; API tests cover duplicate submission and stock
  is issued once.
- Insufficient stock is a hard failure online until ADR-0014 defines offline
  behaviour and reconciliation review cases.
- Register sessions, discounts, tax, refunds and offline outbox are separate
  increments. Margin reporting and cost snapshots remain blocked by ADR-0013.
