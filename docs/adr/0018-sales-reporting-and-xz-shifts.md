# ADR-0018: Sales reporting and X/Z shift reports

## Status

Accepted

## Date

2026-10-20

## Context

P3 requires a dashboard on top of immutable sales (ADR-0015), register cash
reconciliation (ADR-0016) and cash refunds (ADR-0017). Operators need daily
sales totals, refund visibility and a printable view of an open or closed shift
without mutating financial records.

## Decision

- Add `GET /v1/reports/sales-summary` and `GET /v1/reports/shifts/:id`, both
  requiring `reports:read`.
- Day buckets and API range boundaries use UTC. The UI labels this explicitly.
  A range defaults to the last seven UTC days, must be ordered, and is capped at
  366 days.
- Gross sales are completed sale totals. Refunds are attributed to the date the
  refund was recorded, not back to the original sale date. Net sales are
  `gross - refunds`; average sale is gross divided by completed sale count.
  Units sold count gross sale quantities, so a refund does not rewrite the
  original sale day.
- A shift report is derived from its shift ID. It is an X report while the shift
  is open and a Z report after close. It reports gross sales, refunds, net
  sales, units, transaction counts and the shift's expected cash. Reports are
  computed from immutable records rather than stored snapshots.
- A principal with a non-empty `storeIds` scope is limited to stock locations
  in those stores. An explicit out-of-scope location or shift returns `404` to
  avoid confirming existence. Organization-wide principals may filter by one
  location.
- Cost, margin, tax, discount, cashier and register breakdowns are excluded
  until ADR-0013 and the owner tax/discount policies are settled.

## Alternatives Considered

### Restate refunds against the original sale date

Pros: one day shows the economic result of that day's sales. Cons: does not
match cash paid out of the drawer on the refund date and complicates shift
reconciliation. Rejected; refunds stay on their creation date.

### Store each Z report as an immutable snapshot

Pros: later policy or catalog changes cannot alter a historical report. Cons:
adds a reporting table, numbering and approval workflow before the business
needs it. Current inputs are already immutable and the report is stable after
close, so a derived report is sufficient for P3.

### Show net sales only

Pros: shorter dashboard. Cons: hides refund volume and makes drawer
reconciliation harder. Gross, refunds and net are all shown.

## Consequences

- The dashboard at `/reports` shows range totals and daily rows. The POS shift
  panel links to the current X report and to the Z report after closing.
- Reports are read-only and never adjust sales, refunds or stock. They do not
  replace accounting exports or end-of-day financial close.
- P5 can add store/register/cashier filters, exports, day comparisons and
  cost-based margin once valuation and tax policies are approved.
