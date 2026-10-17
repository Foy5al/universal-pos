# ADR-0014: Offline oversell policy

## Status
Proposed — awaiting product-owner sign-off (`plan.md` §16)

## Date
2026-10-17

## Context
Offline stock is an estimate. Two disconnected terminals can sell the same unit, and
there is no way to know until sync. The platform must define what happens then. Silently
overwriting stock or a sale would destroy trust in the ledger, so the policy has to be
explicit and per-branch (`plan.md` §5, §16).

## Decision (recommended)
Make the policy **configurable per branch**, defaulting to "allow with warning and
reconcile":

- **Allow with warning + reconcile (default):** offline checkout permits overselling;
  after sync the server posts the real stock effect, marks the resulting negative/
  shortfall balance, and raises a reconciliation/review case if the branch stock went
  negative or a configured threshold was crossed.
- **Offline quotas (opt-in):** a branch may preallocate a limited offline sellable
  quantity per SKU; the client refuses to exceed its quota while offline.
- In all cases the server is authoritative: it records the true movement, never applies
  last-write-wins to financial records, and surfaces conflicts for human review with
  linked compensating adjustments/refunds as needed.
- Cashier and manager dashboards show unsynced, rejected and needs-review counts.

## Alternatives Considered

### Hard block on any potential oversell while offline
- Pros: never oversells.
- Cons: requires reliable preallocated quotas and blocks sales whenever estimates are
  stale, which is hostile at the till; can lose legitimate revenue.
- Rejected as default; retained as the opt-in "offline quotas" mode.

### Silent last-write-wins reconciliation
- Pros: nothing for staff to do.
- Cons: hides real conflicts, corrupts stock/value reporting and violates the plan's
  explicit prohibition.
- Rejected outright.

### Disable selling a SKU once its cached stock hits zero offline
- Pros: bounds oversell per terminal.
- Cons: underestimates stock when other terminals have already sold, and still oversells
  on the same item across devices.
- Considered as a client-side guard only; not a complete policy.

## Consequences
- Per-branch configuration and review-case handling are required before P4 offline
  acceptance; A6 owns stock reconciliation, A5 owns client behavior.
- Acceptance tests cover two-device same-SKU offline sales triggering the configured
  handling without silent data loss (`plan.md` §15).
- **Blocking:** P4 offline acceptance cannot be signed off until this ADR moves to
  `Accepted` with the owner's chosen default and quota thresholds.
