# ADR-0022: Low stock thresholds and alerts

## Status

Accepted

## Date

2026-10-21

## Context

Managers need an early warning before a product sells out, without configuring
every catalog item by hand. A single organization-wide threshold (for example
"notify below 10") covers most products, but fast-moving or high-value items
need a tighter or looser rule (for example "notify below 5"). Two competing
thresholds must resolve deterministically, especially when both are set.

Stock is held per location, while the rule is a catalog/organization setting.
Alerting must never leak another tenant's stock, and the threshold rounding must
match quantity representation, not binary floating point.

## Decision

- Store one optional organization-wide fallback in `low_stock_settings`
  (`global_threshold numeric(18,4)`, one row per organization).
- Store one optional override on the product row
  (`products.low_stock_threshold numeric(18,4)`). **A product threshold is the
  source of truth whenever it is present; the global threshold is only the
  fallback.** Both columns allow `NULL`, meaning "not configured", and both have
  non-negative check constraints.
- Alert when on-hand quantity is **strictly below** the resolved threshold.
  A threshold of `0` therefore only reports negative (oversold) stock; setting
  no threshold at all reports nothing.
- On-hand is summed from `stock_balances` for the selected location, or across
  all organization locations when no location is supplied. Inactive products
  are excluded. Thresholds and quantities are decimal strings with up to four
  fractional digits; comparisons use the scaled BigInt quantity helpers.
- `GET /v1/inventory/low-stock` returns the alerts plus the configured product
  overrides, so the manager UI can remove overrides even when stock is healthy.
  Reads require `inventory:read`; changing the global threshold or a product
  override requires `inventory:manage`.
- Every lookup, aggregation and update is scoped by `organizationId` in the
  repository; a location or product id from another organization returns `404`.
- Alerts are an in-app surface on `/inventory`. The organization-wide default
  is managed on `/settings`, while a product override is set while adding or
  editing that product in `/catalog`, keeping the rule next to its record.
  Alerts are derived from current stock, so they clear automatically when stock
  rises; no notification log or delivery channel is introduced in this slice.

## Alternatives Considered

### Only a global threshold

Pros: one setting, simple UI. Cons: cannot express per-product reorder points;
managers would set the global value to the most sensitive product and get noisy
alerts for everything else. Rejected.

### Per-product threshold always required

Pros: explicit. Cons: forces managers to edit every product before any alert
works, and new products silently have no rule. Rejected; global fallback plus
optional override is the smallest complete rule set.

### Alert when on-hand is at or below the threshold

Pros: intuitive "10 or fewer" reading. Cons: the requested examples are
"below 10" and "below 5", and at-threshold alerts would keep firing at exactly
the configured value. Rejected; the comparison is strict.

### Store the rule per store

Pros: branch-specific reorder points. Cons: the request is organization-wide
with optional product overrides; per-store policy needs a larger settings model.
Deferred.

## Consequences

- `low-stock_settings` cascades with its organization; product overrides cascade
  with their product. Deleting a product removes its override.
- Changing a threshold re-evaluates alerts immediately on the next request; no
  background job is needed for the in-app view.
- Threshold changes are not written to a durable audit table because no audit
  schema exists yet. When audit events land, these writes should emit one.
- A future email/SMS/push notification worker can reuse the same resolution
  query; it must still treat the product override as authoritative.
- Product thresholds are not editable through the generic catalog PATCH
  endpoint; they have a dedicated inventory endpoint so the permission stays
  `inventory:manage` and clearing the override is explicit. The catalog calls
  that endpoint for the add-product form and the per-product edit dialog.
- `/settings` is the home for organization-wide defaults, so new global
  policies should be added there rather than inside operational pages.
