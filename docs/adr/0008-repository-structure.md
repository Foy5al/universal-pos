# ADR-0008: Monorepo structure and dependency direction

## Status
Accepted

## Date
2026-10-17

## Context
Multiple apps (web, API, future worker) and shared packages (ui, contracts, db, domain,
offline, print, storage, config) must evolve together, share contracts and avoid import
cycles. Parallel agents work in separate branches, so folder ownership must be explicit.

## Decision
- Use a pnpm workspace with Turborepo for task orchestration, matching `plan.md` §10:

```text
apps/    web, api, (worker later)
packages/ ui, contracts, db, domain, offline, print, storage, config
infra/   Dockerfiles, compose, proxy, hosting examples
docs/    ADRs, API contracts, decisions, runbooks
```

- Enforce dependency direction `UI -> contracts/API -> service/domain -> repository/DB`;
  importing server internals into the web app or DB code into UI components is a defect.
- Keep business rules host-agnostic; no provider SDKs inside `domain`.
- Keep every hand-written source file at or below **300 physical lines** (≤200 preferred);
  split by responsibility rather than growing files. Exceptions need an ADR/PR rationale
  and A0 approval (generated/vendor/migration artifacts only).
- Folder ownership follows `plan.md` §14 (A1 api, A2 db, A3/A4 web+ui, A5 offline,
  A6 inventory, A7 finance/reports, A8 qa/devops); cross-owner edits need agreement.

## Alternatives Considered

### Polyrepo
- Pros: hard boundaries, independent releases.
- Cons: contract duplication, version-skew, painful atomic changes across packages.
- Rejected: the shared contracts and offline engine favor a monorepo.

### Single flat package
- Pros: simplest setup.
- Cons: no enforced boundaries, import cycles, untestable layering.
- Rejected.

### Nx instead of Turborepo
- Pros: powerful generators and graph tooling.
- Cons: heavier, more opinionated; more than this project needs.
- Rejected: Turborepo + pnpm is sufficient and lighter.

## Consequences
- `packages/contracts`, `db`, `domain`, `ui` are shared-contract areas requiring A0
  coordination and backward-compatibility review.
- CI enforces lint, typecheck, tests, build and the 300-line limit per package.
- Dependencies are versioned centrally; adding media/state/UI libraries requires a
  decision record.
