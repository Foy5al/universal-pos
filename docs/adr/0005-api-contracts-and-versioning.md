# ADR-0005: API contracts and versioning

## Status
Accepted

## Date
2026-10-17

## Context
The web app, POS client, offline sync engine and future integrations all consume the
same backend. Hand-written request/response types drift from the server, and glue that
binds business logic to a host framework blocks the move from Vercel to Docker. A
typed, versioned contract is required.

## Decision
- Expose a versioned REST API under base path `/v1` with a consistent success/error
  envelope and validated request DTOs.
- Define all DTOs, enums and permission keys once as Zod schemas in
  `packages/contracts`; derive static TypeScript types from them. The web/POS clients
  import these types only — never server internals.
- Generate and publish OpenAPI documentation from the same Zod schemas.
- Express request flow is uniform:
  `route -> auth/authorization -> schema validation -> service -> transaction/repository -> domain event`.
- No direct DB reads from Next.js components and no raw SQL inside route controllers;
  async work sits behind interfaces.
- Use cursor/keyset pagination for large ledgers, bounded date filters and structured,
  machine-readable errors; publish an explicit API compatibility policy.

## Alternatives Considered

### GraphQL
- Pros: flexible client queries, single endpoint.
- Cons: added complexity, harder caching/rate limiting, overkill for a resource API
  defined by a fixed set of operations.
- Rejected.

### tRPC
- Pros: excellent end-to-end type safety with minimal ceremony.
- Cons: couples client and server to a shared runtime/TS project, complicating a
  standalone Express API and non-TS integrations.
- Rejected: conflicts with the host-agnostic, contracted-API goal.

### Hand-written shared types
- Pros: no generator.
- Cons: no runtime validation at trust boundaries; silent drift.
- Rejected: Zod gives validation and typing from one source.

## Consequences
- Changing `packages/contracts` is a shared-contract change requiring A0 review and a
  backward-compatibility check.
- Breaking changes require a new API version or an additive, deprecation-managed path.
- Offline event envelopes (ADR-0004) are versioned via `payloadVersion` under the same
  contract package.
- Contract tests assert clients and server agree on schemas before integration.
