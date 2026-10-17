# ADR-0009: Authentication and session model

## Status
Accepted

## Date
2026-10-17

## Context
Privileged roles manage money, stock and sensitive data; cashiers operate shared
terminals that may go offline. Authentication must be revocable, resistant to stuffing
and brute force, and must not let a stolen/offline client keep privileged access.

## Decision
- Passwords are hashed with Argon2id; login is rate-limited with brute-force protection.
- Sessions are online-issued and revocable, with bounded lifetime, secure cookie
  attributes and CSRF protection where relevant.
- Privileged roles require MFA.
- Offline checkout uses a scoped, expiring device authorization: a device is enrolled
  online, and its offline capability is limited to a short-lived, previously authorized
  subset of checkout permissions. New grants, overrides and non-cash settlement require
  online validation.
- Sensitive actions support step-up (re-auth / manager PIN) and are audited.
- Support impersonation is explicitly approved and fully audited.
- Logout/device revocation triggers client cache wipe when online; device revocation is
  honored by the sync server immediately.

## Alternatives Considered

### Long-lived JWT bearer tokens with no server session
- Pros: stateless, simple.
- Cons: hard to revoke promptly; unsafe for shared POS terminals.
- Rejected: revocation is a requirement.

### Third-party identity provider (Auth0/Clerk/Cognito)
- Pros: less auth code, built-in MFA.
- Cons: cost, dependency and data-residency concerns; harder to model tenant-scoped
  device authorization for offline checkout.
- Deferred: an OIDC adapter could be added later behind the same session model.

### Client-stored offline credentials for full access
- Pros: simplest offline login.
- Cons: a stolen terminal yields lasting privileged access.
- Rejected: offline access is deliberately narrow and time-boxed.

## Consequences
- A1 owns auth, session and device-authorization endpoints plus isolation tests.
- Sessions and device authorizations are tenant/store/register scoped and auditable.
- The sync server rejects pushes from revoked or expired devices even if a request is
  otherwise well-formed (see ADR-0004).
