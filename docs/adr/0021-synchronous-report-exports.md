# ADR-0021: Synchronous CSV and XLSX report exports

## Status

Accepted

## Date

2026-10-21

## Context

ADR-0012 sets the export policy but leaves the first implementation open: which
reports export first, how money is represented in a file an accountant opens,
what exactly guards spreadsheet formula injection, and how an export is
recorded as a sensitive action. The sales summary and store activity reports
already exist as read endpoints, so the first export slice should reuse them
rather than introduce a second query path.

## Decision

- Export the existing sales summary and store activity reports through
  `GET /v1/reports/:kind/export?format=csv|xlsx&from&to&locationId`, reusing the
  same service methods, filters, 366-day range limit and store-scope checks as
  the read endpoints. No export query is written against tables directly.
- Require `reports:export` (separate from `reports:read`) on the server and hide
  the buttons in the UI for roles without it. Both checks are advisory to each
  other; the API is authoritative.
- Amounts stay in integer minor units and are labelled `(minor)` in the header.
  Converting to major units in an export would reintroduce the rounding risk
  ADR-0003 removes, and totals must match the ledger exactly.
- CSV output carries a `#` metadata preamble (organization, locations, UTC
  range, author, unit note) followed by an RFC 4180 table and a totals row.
  XLSX puts the same metadata above a frozen header row and bolds the totals.
- Formula injection is neutralized centrally in `sanitizeCell`: string cells
  starting with `= + - @`, tab or CR get a leading apostrophe, numbers are
  written as numbers, and quoting handles delimiters and newlines. The XLSX
  writer routes the same strings through that guard.
- Exports run synchronously with a bounded range (at most 366 days of daily
  rows or one activity row set), so memory stays small. Queued exports stay a
  follow-up for the larger ledger and line-level reports.
- Every export writes one structured server log line with event name, report,
  format, organization id, user id, row count and the requested range. Row
  contents and customer data are never logged.

## Alternatives Considered

### Export at the database layer with COPY or a generated query

Pros: fastest for large tables. Cons: duplicates scoping and filter logic,
bypasses the service layer and its store-scope checks. Rejected for this slice.

### Convert money to major units in the file

Pros: friendlier for spreadsheet users. Cons: needs a currency-scale decision per
tenant and risks totals that do not tie to the ledger. Rejected; amounts stay in
minor units with an explicit header.

### Persist export records in an audit table now

Pros: auditable history, retention policy. Cons: no audit/event table exists yet
and adding one is its own schema and retention decision. Deferred: the structured
log is the interim record and must be replaced by a durable audit trail before
commercial rollout.

## Consequences

- Exported totals are directly comparable with the read endpoints and with
  ledger aggregates; the test suite asserts CSV, XLSX and API totals agree.
- Files carry enough provenance (tenant, range, author, generation time) to be
  reconciled by an accountant, but they are not yet retained by the server.
- Large or line-level exports (inventory valuation, tenders, journals) must
  arrive with streaming or a queued export job plus a durable audit record.
