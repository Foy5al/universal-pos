# ADR-0020: Restock request to purchase order to GRN

## Status

Accepted

## Date

2026-10-20

## Context

Cashiers see sold-out products at the till before anyone in the back office does.
The restock path must let them raise a request without granting purchasing or
stock-write access, then let a manager decide, buy the goods and have a store
operator record what actually arrived. The workflow touches money, supplier
commitments and stock, so the transitions must be explicit and server-enforced.

## Decision

- A cashier with `restock:request` raises a request from an out-of-stock POS tile
  with location, product, requested quantity and an optional note
  (`POST /v1/restock-requests`). Listing is allowed with `restock:request` or
  `purchases:read`.
- Requests move through `pending -> scheduled -> fulfilled`, or
  `pending -> dismissed`. A dismissed or already scheduled request cannot be
  re-scheduled, and dismissal requires `purchases:manage`.
- A manager reviews pending requests in the purchasing page and either dismisses
  them or selects pending requests from one location to create a purchase order.
  The order form pre-fills requested quantities and product cost, and sends
  `restockRequestIds` with the order lines.
- The server verifies every referenced request is pending, belongs to the same
  location as the order and has a matching order line before the order is
  created. Matching requests become `scheduled` and store the order/line link.
- A store operator records a goods receipt (GRN) against an `ordered` or
  `partially_received` order. Stock posts per receipt. Restock requests stay
  `scheduled` during partial receipts and become `fulfilled` only when the whole
  order reaches `received`.
- Cancelling a purchase order releases its scheduled requests back to `pending`
  so they can be re-ordered. Posted receipts and stock movements stay immutable;
  mistakes are corrected with adjustments, never by editing a GRN.
- All operations are tenant- and store-scope checked on the server; a manager
  scoped to one store cannot see or convert another store's requests.

## Alternatives Considered

### Let cashiers create purchase orders directly

Pros: fewer steps. Cons: grants commercial commitment authority to the till and
removes the review the owner asked for. Rejected.

### Fulfil requests per received line

Pros: closer to partial delivery reality. Cons: ambiguous when a supplier ships
part of a request; the order-level rule keeps the state machine deterministic.
Deferred until partial-line fulfilment is specified.

### Editable GRN records

Pros: easy corrections. Cons: rewrites stock history and undermines auditability.
Rejected; use stock adjustments with reasons.

## Consequences

- Duplicate pending requests for the same product/location are allowed for now;
  managers can dismiss duplicates. Deduplication or merging is a follow-up.
- Restock fulfillment waits for the entire order, including any non-restock
  lines on the same order. Splitting such orders is the operator's option.
- The GRN step reuses `purchases:manage`; a dedicated warehouse permission can be
  introduced with the role editor without changing request transitions.
