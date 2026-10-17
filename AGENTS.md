# AGENTS.md — Universal POS Engineering Rules

Read `plan.md`, relevant `docs/adr/*` and package README before editing. This file applies to every coding agent, human contributor and AI assistant in this repository.

## 1. Mission and technical invariants
- Build a secure, reusable, multi-tenant, offline-first retail POS system for multiple business categories.
- Prioritize financial correctness, tenant isolation, recoverability and cashier usability above cosmetic features.
- Use TypeScript, Next.js, Express.js, PostgreSQL/Drizzle, Dexie/IndexedDB, Tailwind and shadcn/ui.
- Keep business rules host-agnostic; Vercel is a temporary non-commercial development target, not an architectural dependency.
- Respect dependency direction: UI -> contracts/API -> service/domain -> repository/DB; avoid import cycles.

## 2. Code-size and organization contract
- **Maximum 300 physical lines per hand-written source file, including blank lines and comments.**
- Prefer <=200 lines where practical. Split route, service, hooks, components and repository modules by responsibility.
- Hooks are **not automatically exempt**; exceptions above 300 lines require an ADR/PR explanation and orchestrator approval.
- Exceptions may be approved only for generated code, vendor output, unavoidable external schema snapshots or migration artifacts; never for convenience.
- `plan.md` and other hand-written repository files should also stay within 300 lines where practical.
- No giant files: one feature per module, small functions, single-responsibility services and composed components.
- Follow DRY, SOLID where helpful, straightforward naming and explicit types. Avoid speculative abstraction and duplicated logic.
- Avoid unnecessary comments, decorative JSDoc, `any`, `@ts-ignore`, empty catch blocks and dead code.
- Comments are allowed only to document non-obvious business invariants, security decisions, hardware quirks and edge cases.
- Avoid creating nearly identical CRUD pages: reuse schema-driven forms, tables, dialogs, breadcrumbs and permissions.

## 3. Frontend rules
- Reuse shadcn/ui primitives/components from `packages/ui`; avoid building lookalike controls from scratch.
- Compose feature components: view, form, table, dialog and hooks separately; keep pages lean.
- Use server rendering where safe and appropriate, but the offline checkout path must work from cached client-side assets.
- Use TanStack Query for network state and Zustand only for small local UI/session state; no parallel conflicting caches.
- Use typed API clients from `packages/contracts`; validate forms and payloads with shared Zod schemas.
- Design for barcode-scanner keyboard input, receipt printer dimensions, touch targets and accessible keyboard workflows.
- Any new UX state includes empty/loading/error/unauthorized/offline and recovery behaviors.
- Do not add media libraries, state managers or UI kits without an architecture decision.

## 4. Backend and database rules
- Express handlers stay thin; put transaction boundaries and domain validations in services.
- Every query, update and export must enforce `organizationId` and store/register scope on the server.
- Use Drizzle migrations and PostgreSQL constraints; no schema mutation from requests or cold starts.
- No floating-point currency, unsafe implicit timezones or naive stock balance mutation without a ledger entry.
- Immutable posted sales/refunds/accounting: make corrections with linked reversal/compensation events.
- Payment gateways and printer integrations use replaceable adapters; never store raw card details.
- Keep API endpoints versioned and validate inputs/outputs at trust boundaries.
- Reject cross-tenant IDs even if a caller has the correct role name.

## 5. Offline and sync correctness rules
- Never declare a sale successful before local IndexedDB transaction completes or server transaction commits.
- Offline operations need immutable identifiers, bounded versioned payloads and local outbox records.
- All sync pushes must be idempotent on the server and safe after network/server crashes.
- Never automatically delete unsynced sales, silently pick last-write-wins or replace invoice totals from a newer product price.
- Background Sync is an optimization, not the only sync mechanism; app-open and manual retries are mandatory.
- Offline payments: mark cash locally; electronic/credit payment cannot be declared settled without provider confirmation.
- Show unsynced, rejected and needs-review counts to cashier and manager; retain conflict diagnostics without leaking sensitive data.
- Include tests for reconnect, force-close, multi-tab, two terminals, stale catalogs, timezone boundaries and printer failure.

## 6. Security and compliance rules
- Never bypass RBAC in UI, API, report/export endpoints or device sync.
- Never commit secrets; use `.env.example` with placeholders and server-side secret handling.
- Log security-relevant events without passwords, credentials, full payment details or sensitive medical/patient data.
- Require explicit approval for pharmacy controlled-item flows and region-specific fiscal rules; do not imply compliance by default.
- Make destructive actions permission-checked, audited and recoverable where possible.

## 7. Multi-agent collaboration rules
- A0 is orchestrator: approves shared contracts, schema migrations, ADRs and integration PR order.
- Agents work in separate git branches/worktrees and own the folders listed in `plan.md`.
- Before coding, post a mini-plan: goal, files expected to change, dependencies, tests and contract changes.
- Do not edit another agent's owned files without agreement; submit an interface/contract request instead.
- Shared packages (`contracts`, `db`, `domain`, `ui`) require contract-first coordination and backward compatibility review.
- Do not silently rebase, force-push, drop another agent's changes or resolve merge conflicts by discarding work.
- Prefer small PRs with one functional concern each and explicit acceptance criteria.
- Document limitations, implementation tradeoffs and unfinished acceptance criteria in PR descriptions.

## 8. Required quality gates
- Every PR: formatter, ESLint, TypeScript checks, appropriate unit/integration tests and successful build.
- Finance, stock, tenancy, permissions and sync changes require invariant-focused tests, not only snapshots.
- Test data should include different tenants, stores, permission scopes, price/quantity rounding and mixed tender cases.
- Run Playwright for checkout, failed print, offline restart/reconnect, manager override, export and role navigation.
- Add integration tests covering database transaction rollback, idempotency, locks and partial failure.
- No approval without demonstrable acceptance criteria, database migration notes (if any) and user-facing fallback states.

## 9. Standard agent handoff template
```text
Task ID / Agent:
Scope and changed files:
Contract/schema implications:
Implemented behavior:
Test commands and results:
Offline/security/tenant implications:
Known limitations:
Next dependency / PR link:
```

## 10. Agent execution prompt
```text
You are a coding agent contributing to Universal POS. Read AGENTS.md and plan.md.
Choose only your assigned module from Section 14. Propose a short mini-plan.
Respect all architecture, 300-line file, DRY and shadcn/ui rules.
Use the shared contracts and request approval before changing them.
Implement the smallest complete vertical slice with robust errors and tests.
Never weaken tenant isolation, financial transactions, offline durability or RBAC.
Run required checks, give a file list, tests and a concise handoff.
Do not claim completion without acceptance-test evidence.
```
