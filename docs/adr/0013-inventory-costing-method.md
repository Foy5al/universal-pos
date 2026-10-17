# ADR-0013: Inventory costing method

## Status
Proposed — awaiting product-owner sign-off (`plan.md` §16)

## Date
2026-10-17

## Context
Gross margin, inventory valuation and accounting postings require a defined cost basis.
The two common choices are weighted-average cost (WAC) and FIFO. The choice affects the
`stock_movements`/valuation model, reporting, and how returns/corrections are costed, so
it must be decided before P2 valuation and accounting implementation (`plan.md` §7).

## Decision (recommended)
Adopt **weighted-average cost** as the default per organization, computed on receipt and
consumed on issue, with the following rules:

- On receipt, recompute average cost from `(existing qty × avg cost + received qty ×
  receipt cost) / (existing qty + received qty)` in minor units with a defined rounding
  step, persisted on the movement.
- On sale/issue/transfer/adjustment, consume at the current average cost, snapshotting
  the applied unit cost on the line so history is reproducible.
- Allow a future per-tenant option for FIFO without changing the ledger interface; the
  costing strategy sits behind a `CostingStrategy` boundary in `packages/domain`.
- Corrections are linked reversal/compensation movements, never in-place rewrites.

## Alternatives Considered

### FIFO (first-in, first-out)
- Pros: closer to physical flow for serialized/perishable goods; common in some
  jurisdictions.
- Cons: requires lot/layer tracking and per-issue layer consumption; heavier to
  implement and reconcile, especially offline.
- Deferred: kept as a selectable strategy for tenants that need it (notably pharmacy
  batch tracking), not the default.

### Standard cost
- Pros: simple, stable margins.
- Cons: needs periodic variance accounting; poorly suited to volatile purchase prices
  in general retail.
- Rejected as default.

## Consequences
- WAC is simpler to reconcile across offline terminals and requires no layered lot state
  for the default path.
- Margin/valuation reports depend on persisted movement costs, not recomputation from
  current prices.
- **Blocking:** P2 valuation and A7 margin reports may not be finalized until this ADR
  moves to `Accepted`. Product owner must confirm the default and whether FIFO is
  required at launch (e.g. for pharmacies).
