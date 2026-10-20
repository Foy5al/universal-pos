# ADR-0017: Basic cash refunds

## Status

Accepted

## Date

2026-10-20

## Context

P3 requires refund basics on top of immutable online sales (ADR-0015) and
register cash reconciliation (ADR-0016). A refund returns cash from the drawer
and must also return the sold stock without editing the original sale.

## Decision

- A refund is a new linked document (`refunds` + `refund_lines`) for one
  completed sale. The original sale, lines and payments are never updated.
- The first increment supports **full-sale cash refunds only**. The amount is
  the sale's `totalMinor`; partial line/quantity refunds and exchanges need a
  separate policy and are rejected by the full-sale unique constraint.
- A sale may be refunded at most once, enforced by a unique index on
  `(organization_id, sale_id)`.
- Refund creation requires `refunds:approve`, an open shift in the same store as
  the sale location, and a client `operationId`. Repeating the same
  `operationId` returns the same refund; a new operation for a refunded sale
  returns `409`.
- The refund transaction locks the shift row, then the sale row. It inserts the
  refund and snapshot lines and records positive stock movements with type
  `return` in the same transaction. A failure rolls everything back.
- Refunds are attributed to the shift that paid out the cash. Expected drawer
  cash becomes
  `opening float + cash sales + cash in - cash out - cash refunds`; the shift
  record exposes `cashRefundsMinor` separately for reporting.
- Refund and receipt output keep snapshots of sku, name, quantity, unit price
  and line total so catalog edits cannot rewrite history.

## Alternatives Considered

### Mark the sale `voided` and delete/return lines

Pros: one record. Cons: mutates immutable financial history and loses the
original receipt and tender trail. Rejected; status `voided` remains for a
future void flow with its own rules.

### Model refunds as negative sales

Pros: reuses sale totals. Cons: confuses sale numbering, lines, tenders and
reporting, and makes "sales count" ambiguous. Rejected in favour of explicit
refund documents.

### Record the refund only as a cash-out movement

Pros: no schema change. Cons: loses line-level stock return evidence and refund
reporting. The shift subtraction is derived from linked refunds instead.

## Consequences

- The till receipt offers a full refund with a required reason; the shift panel
  shows cash refunds and reduces expected cash.
- Refunds are online-only and cash-only until payment adapters and offline
  policy exist. The refunded sale remains visible as completed.
- Partial refunds, exchanges, void approvals, refund reason codes and receipt
  lookup remain follow-up increments. Basic X/Z reports are covered by
  ADR-0018.
