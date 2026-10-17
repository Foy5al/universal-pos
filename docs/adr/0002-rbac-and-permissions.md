# ADR-0002: RBAC and permission model

## Status
Accepted

## Date
2026-10-17

## Context
The platform defines many operational roles (owner, manager, cashier, pharmacist,
accountant, auditor, and more). Fixed role names are insufficient because each
organization needs scoped, customizable access, and because sensitive actions
(refunds, discounts, stock adjustments, exports) require approval and audit.

## Decision
Model authorization as permission-based RBAC with resource scoping:

- Permission keys follow `resource:action` (e.g. `sales:create`, `refunds:approve`,
  `inventory:adjust`, `reports:export`).
- Roles aggregate permissions (`roles`, `role_permissions`); users receive roles via
  `user_role_assignments` scoped to organization, and optionally store/register.
- Enforcement happens server-side in API middleware and again in service/repository
  methods; UI hides unavailable actions but is never the control.
- Sensitive actions require an explicit permission plus, where configured, an
  approval policy, reason code and immutable audit event (manager override / step-up).
- Offline checkout is limited to a short-lived, previously authorized subset of
  checkout permissions; new grants, overrides and non-cash settlement require online
  validation.
- Navigation and dashboards render from the caller's effective abilities; unauthorized
  routes render 403 and the API returns 403.

## Alternatives Considered

### Fixed role enum on the user record
- Pros: trivial to implement.
- Cons: cannot express per-branch scope or custom roles; forces code changes for new
  roles.
- Rejected: does not meet the multi-role, customizable requirement.

### Client-side route gating only
- Pros: less server code.
- Cons: trivially bypassed; violates the non-negotiable "never only hide UI buttons".
- Rejected outright.

### External authorization service (e.g. OPA/Cedar)
- Pros: centralized policy engine.
- Cons: added infrastructure, latency and operational burden for a small team on a
  free tier.
- Rejected for now; permission keys keep the option open later.

## Consequences
- Permission keys are a shared contract (`packages/contracts`) and versioned with the
  API; changes require A0 review.
- Every protected endpoint declares required permission(s) and scope explicitly.
- Tests must prove revoked/missing permissions are rejected on the server for each
  resource group.
- Audit events record actor, role source, scope, reason and outcome for sensitive acts.
