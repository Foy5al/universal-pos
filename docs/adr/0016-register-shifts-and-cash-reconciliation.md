# ADR-0016: Register shifts and cash reconciliation

## Status

Accepted

## Date

2026-10-20

## Context

Cash sales must be attributable to one cashier's drawer session so a store can
count the drawer and explain differences. ADR-0015 already made online sales
atomic and idempotent, but those sales were not tied to a register or shift.

## Decision

- A register may have **at most one open shift**, enforced by a partial unique
  index on `register_id` where `status = 'open'`.
- Opening a shift records the register, store, opening cash float and cashier.
  Opening requires `registers:manage`; reading requires `registers:read`.
- Every new online cash sale carries a required `registerShiftId`. The shift must
  belong to the same organization and store as the selling location and must
  still be open.
- Sale posting locks the shift row inside its transaction. Closing a shift locks
  the same row, so a sale either commits before close and is counted, or is
  rejected after close. There is no window where a sale silently misses the
  drawer.
- Expected drawer cash at close is derived, not maintained incrementally:
  `opening float + completed cash sales tied to the shift + cash in - cash out`.
  Sale totals are used, not tendered amounts, because change leaves the drawer.
- Manual cash in/out requires a reason, the acting user and `registers:manage`.
- Closing snapshots expected cash, counted cash and the variance, and records the
  closing user and time. Closed shifts reject further sales and cash movements;
  corrections are future compensating records, not edits.
- A register is scoped to one store; the POS only offers registers for the
  selected selling location's store.

## Alternatives Considered

### Maintain an `expected_cash_minor` running balance on every movement

Pros: constant-time reads. Cons: any missed or duplicated movement silently
corrupts reconciliation. Summing immutable records at read/close is auditable.
Rejected.

### Allow sales without a shift

Pros: fewer steps for small shops. Cons: cash cannot be reconciled per cashier
and closing totals are incomplete. Rejected for the online POS; offline shift
handling will be specified with ADR-0014.

### Count tendered cash instead of sale totals

Pros: matches the payment row. Cons: change is returned from the drawer, so it
would overstate expected cash. Rejected; sale totals are counted.

## Consequences

- The till requires an open shift before checkout and shows expected cash while
  selling. Closing accepts a counted amount and shows the variance.
- Cash refunds subtract from expected cash via linked refund records (ADR-0017).
  Voids, shifts history and X/Z reports remain follow-up increments. Electronic
  tenders are excluded until provider confirmation exists; only cash is counted.
- Historical sales with a null shift remain readable; new sales require one.
