# ADR-0019: Offline sale capture, device enrollment and sync

## Status

Accepted

## Date

2026-10-20

## Context

ADR-0004 fixes the offline protocol (IndexedDB, outbox, durable local commit,
idempotent push), but the P4 slice still needs concrete choices: how a terminal
is enrolled, which prices a synced sale keeps, what happens when the server
rejects it, and how a terminal learns the canonical invoice number. ADR-0014
(offline oversell policy) is still awaiting product-owner sign-off, so this
slice must not silently choose an oversell policy.

## Decision

- A browser terminal generates its own UUID device id and stores it in
  IndexedDB. The first `POST /v1/sync/push` enrolls the device in the caller's
  organization; the store comes from the selling location in the first event.
  Enrollment therefore requires an authenticated online session, while revoked
  devices (`POST /v1/devices/:id/revoke`, `devices:manage`) are rejected with
  `403` on every later push.
- Checkout always writes the sale, lines, cash tender and outbox event in one
  Dexie transaction before the cashier sees a receipt. Online and offline
  checkouts share this path; an online till simply pushes immediately.
- Push payloads carry the unit price captured at the till. The server validates
  the product, tenant and quantity, recomputes line totals with half-up integer
  math, and never replaces the captured price with the current catalog price.
  Provisional numbers `OFF-{registerCode}-{localSequence}` are for the local
  receipt only; the canonical `INV-...` number is returned on acceptance.
- Offline cash only: the payment contract still allows `cash` alone, so
  electronic tenders are impossible to capture offline by construction.
- Server deduplication uses `sync_operations (organization_id, operation_id)`
  and the existing unique sale operation key. Repeating a push returns the same
  sale with `duplicate` status and issues stock once.
- A rejected online posting is never dropped. `insufficient_stock` and other
  posting conflicts become `needs_review`: the operation and a `sync_conflicts`
  row (including the captured payload) are stored, the response carries the
  reason, and the local sale stays in IndexedDB flagged `requires_review`.
  Deterministic validation failures are stored as `rejected`. There is no
  last-write-wins reconciliation; a reviewer either retries the captured sale
  (keeping the original cashier as `createdBy`) or dismisses it with a
  settlement note.
- `GET /v1/sync/pull` is device-scoped with a monotonically increasing
  operation sequence cursor. It returns the canonical sale for acknowledged
  operations so the terminal can replace its provisional receipt.
- The client subtracts locally pending sale quantities from cached stock for
  its in-store guard. That guard is advisory; the server remains authoritative
  and ADR-0014 still governs whether overselling is accepted, warned about or
  quota-limited.

## Alternatives Considered

### Device enrollment via a separate admin page only

Pros: tighter control over terminal provisioning. Cons: blocks a cashier from
opening a till before an administrator is available. Rejected; enrollment stays
authenticated and revocable instead.

### Recalculate synced sales at current catalog prices

Pros: one pricing path. Cons: rewrites a legally relevant receipt after the
fact and hides price drift. Rejected by plan §5 and ADR-0003.

### Reject and delete oversold offline sales

Pros: simple server state. Cons: loses a sale the cashier already handed over;
no audit trail. Rejected; conflicts stay for human review.

### Client-side last-write-wins stock correction

Pros: no manual work. Cons: corrupts stock and financial reporting. Rejected.

## Consequences

- Offline checkout is durable across browser restarts. A versioned service
  worker precaches route HTML plus the build assets referenced by each shell
  route, caches hashed `/_next/static/` responses, and falls back to the cached
  POS shell for offline navigations. The web manifest allows installation.
  Service workers require HTTPS or localhost, and the first visit must complete
  online so the shell is stored.
- Conflict review is available at `/sync` for holders of `sync:review`.
  Reviewers can retry a stored terminal payload after stock is replenished or
  dismiss it with a settlement note; both paths keep the original operation and
  audit fields instead of editing financial records. Conflicts recorded before
  payload storage can only be dismissed manually.
- Register shifts still require an online open/close in this slice. Cached
  shift state lets an already-open till keep selling, but shift cash totals are
  reconciled by the server when the shift closes.
- ADR-0014 remains blocking for P4 acceptance. This slice deliberately keeps
  the conservative server behaviour (a sale that would oversell goes to review)
  and does not implement quotas.
- Two tabs can read the same outbox, but the server's operation deduplication
  prevents duplicate sales/stock issues; client-side tab coordination and a
  multi-tab acceptance test are still pending.
