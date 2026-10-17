# ADR-0003: Money and quantity representation

## Status
Accepted

## Date
2026-10-17

## Context
Retail POS handles prices, taxes, discounts, split tenders and change, where monetary
correctness is non-negotiable. Binary floating-point arithmetic introduces rounding
drift that corrupts receipts, ledgers and reconciliation. Quantities may be fractional
(weighted goods) and require exact decimal handling.

## Decision
- Money is represented as integer minor units. For BDT the base unit is poisha
  (1 BDT = 100 poisha). All persisted and computed monetary values are integers.
- Currency metadata (code, minor-unit exponent, display symbol) lives in configuration,
  not in ad-hoc constants.
- Quantities are exact decimals (PostgreSQL `numeric`, e.g. `numeric(18,4)`), never
  floats, with per-unit precision and unit conversions defined in the catalog.
- Tax, line discounts and order rounding have an explicit, organization-configurable
  rounding policy; every rounding step is deterministic and applied in a fixed order
  (line → order → tender/change).
- Intermediate calculations may use a decimal library, but only integer minor units
  are persisted and returned.
- No `float`/`double`/`number` type may hold a monetary value anywhere in the stack.

## Alternatives Considered

### IEEE-754 floating point
- Pros: simplest arithmetic.
- Cons: `0.1 + 0.2 !== 0.3`; accumulations drift; unacceptable for finance.
- Rejected outright.

### Decimal strings / numeric everywhere in the domain
- Pros: human-readable, exact.
- Cons: string math is error-prone in TS, and DB decimal arithmetic still needs a
  policy for rounding; heavier than needed for currency.
- Partially adopted for quantity only; money uses integer minor units.

### Floating point with rounding at the end
- Pros: convenient.
- Cons: pre-rounding drift is invisible until reconciliation fails; violates the plan's
  explicit "never binary floating-point for finances".
- Rejected outright.

## Consequences
- Shared `packages/domain` provides money/decimal helpers and the rounding policy;
  all modules use them rather than raw arithmetic.
- Sale, payment, refund and journal snapshots store integer money plus the rounding
  method applied, so historical amounts are reproducible.
- Tests cover rounding edges, mixed tenders, split payments and quantity precision.
- Reports and exports format minor units for display only at the boundary.
