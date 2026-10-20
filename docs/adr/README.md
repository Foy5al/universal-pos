# Architecture Decision Records (ADR)

P0 output for Universal POS. Each ADR records one significant, expensive-to-reverse
decision with its context, alternatives and consequences. ADRs are never deleted;
a changed decision is recorded as a new ADR that supersedes the old one.

## Conventions

- Location: `docs/adr/`, one file per decision.
- Format: `NNNN-short-title.md`, heading `# ADR-NNNN: Title`.
- Sections: Status, Date, Context, Decision, Alternatives Considered, Consequences.
- Status values: `Proposed`, `Accepted`, `Superseded by ADR-NNNN`, `Deprecated`.
- Ownership: A0 (orchestrator) approves; product-owner decisions stay `Proposed`
  until signed off (see ADR-0013, ADR-0014).

## Index

| ADR                                                     | Title                                        | Status   |
| ------------------------------------------------------- | -------------------------------------------- | -------- |
| [0001](0001-multi-tenant-isolation.md)                  | Multi-tenant isolation model                 | Accepted |
| [0002](0002-rbac-and-permissions.md)                    | RBAC and permission model                    | Accepted |
| [0003](0003-money-and-quantities.md)                    | Money and quantity representation            | Accepted |
| [0004](0004-offline-first-and-sync.md)                  | Offline-first architecture and sync protocol | Accepted |
| [0005](0005-api-contracts-and-versioning.md)            | API contracts and versioning                 | Accepted |
| [0006](0006-database-and-orm.md)                        | Database and ORM                             | Accepted |
| [0007](0007-host-agnostic-deployment.md)                | Host-agnostic deployment                     | Accepted |
| [0008](0008-repository-structure.md)                    | Monorepo structure and dependency direction  | Accepted |
| [0009](0009-auth-and-sessions.md)                       | Authentication and session model             | Accepted |
| [0010](0010-receipt-printing.md)                        | Receipt printing abstraction                 | Accepted |
| [0011](0011-object-storage-adapter.md)                  | Object storage adapter                       | Accepted |
| [0012](0012-reporting-and-exports.md)                   | Reporting and exports                        | Accepted |
| [0013](0013-inventory-costing-method.md)                | Inventory costing method                     | Proposed |
| [0014](0014-offline-oversell-policy.md)                 | Offline oversell policy                      | Proposed |
| [0015](0015-sales-posting-and-idempotency.md)           | Online sale posting and idempotency          | Accepted |
| [0016](0016-register-shifts-and-cash-reconciliation.md) | Register shifts and cash reconciliation      | Accepted |
| [0017](0017-basic-cash-refunds.md)                      | Basic cash refunds                           | Accepted |
| [0018](0018-sales-reporting-and-xz-shifts.md)           | Sales reporting and X/Z shift reports        | Accepted |
| [0019](0019-offline-sync-and-device-enrollment.md)      | Offline sync, devices and conflict handling  | Accepted |
| [0020](0020-restock-request-to-grn-workflow.md)         | Restock request to purchase order to GRN     | Accepted |

## Open owner decisions

ADR-0013 (costing) and ADR-0014 (oversell) block P2/P3 valuation and P4 offline
acceptance. Both are recorded as `Proposed` with a recommended default pending
product-owner sign-off, matching `plan.md` §16.
