# ADR-0012: Reporting and exports

## Status
Accepted

## Date
2026-10-17

## Context
Operators need sales, product, inventory, purchase, finance and operations reports with
date/store/cashier/supplier filters, and downloadable CSV/XLSX. Reports combine sensitive
financial data across tenants, can be large, and can be abused via formula injection or
cross-tenant leakage. Exports must reflect server-accepted records and be auditable.

## Decision
- Produce CSV and `.xlsx` (ExcelJS) exports with formatted headers, totals, applied
  filters, generation time, authorized user and reconciliation status.
- Financial reports default to server-accepted (reconciled) records; provisionally
  flagged offline sales are shown separately, never silently merged.
- Enforce organization/store scope and permissions on every report and export endpoint,
  exactly as for transactional APIs (ADR-0001, ADR-0002).
- Protect against CSV/Excel formula injection by neutralizing leading `= + - @` and
  tab/CR characters in exported string cells.
- Generate small exports in short synchronous requests; large exports run through an
  external worker/queue after moving off serverless, with bounded memory (streaming).
- Log every sensitive export (actor, scope, filters, row count, timestamp).

## Alternatives Considered

### Reporting directly against transactional tables
- Pros: no extra pipeline, always current.
- Cons: heavy queries can contend with checkout; complex marginal/inventory reports
  need precomputation.
- Partially adopted: start direct with keyset pagination and indexes; introduce
  read models/materialized views when profiling justifies it.

### Dedicated analytics warehouse
- Pros: scalable, isolated from OLTP.
- Cons: infrastructure, ETL and ops cost far beyond early needs.
- Deferred: an adapter-style boundary keeps the option open.

### Everything as queued/async exports
- Pros: uniform, isolates load.
- Cons: worse UX for small exports; adds queue dependency early.
- Rejected: small exports stay synchronous; only large ones queue.

## Consequences
- A7 owns reporting/export endpoints and `.xlsx` generation.
- Tests compare exported totals against ledger fixtures after returns, taxes, discounts,
  split tenders and offline reconciliation (`plan.md` §15).
- Export jobs are tenant-scoped, permission-checked and retained per a data policy.
