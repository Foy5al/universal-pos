# Universal POS — Agent Implementation Plan

**Status:** Architecture proposal for review; implementation not started  
**Version:** 1.0 | **Updated:** 2026-10-17  
**Goal:** One multi-tenant, multi-branch, offline-first POS and retail operations platform for electronics, pharmacies, supermarkets, groceries, and general retail.

## 1. Non-negotiable decisions
- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui; installable Progressive Web App (PWA).
- API: standalone Node.js + Express.js + TypeScript REST API with OpenAPI contracts; avoid coupling business logic to Next.js or any host.
- Primary database: PostgreSQL, Drizzle ORM and versioned SQL migrations; Neon free database for development/testing.
- Offline store: IndexedDB via Dexie, versioned local schema, service-worker precache, transactional sales outbox.
- Serverless deployment: Next.js and Express as separate Vercel projects for non-commercial development only; Express exported as a function entrypoint.
- Production deployment: Docker images for web, API, PostgreSQL and optional worker/Redis behind reverse proxy; no provider-specific business code.
- Media: Cloudflare R2 via an S3-compatible storage adapter; allow migration to S3, MinIO, or another compatible service.
- Reports: ExcelJS (.xlsx) and CSV, strict tenant/store authorization, streaming or queued export for large datasets.
- Authentication: online-issued, revocable sessions; scoped, expiring offline device authorization for checkout only.
- Money: integer minor units (for BDT, poisha); quantity/weight as exact decimal, never binary floating-point arithmetic for finances.
- Product/domain behavior: shared core + per-tenant/per-category optional features, not separate pharmacy/electronics codebases.

## 2. Product scope and configuration
- Tenancy: SaaS organizations, subscription/plan entitlements (future), isolated users, stores, warehouses, brands, registers, and devices.
- Business profiles: electronics, pharmacy, supermarket, groceries, fashion, hardware, general retail; configurable capabilities per tenant.
- Localization: initial Bangladesh defaults (BDT, Asia/Dhaka, Bengali/English, A4/80 mm/58 mm receipts); configurable taxes and regional rules.
- Organization configuration: logo, legal name, VAT/tax identifiers, address, bill footer, policies, numbering, language, currency, rounding.
- Store setup: location, pricing zone, stock location, opening hours, registers, assigned devices, receipt series and employees.
- Catalog basics: SKUs, barcodes, PLUs, category tree, brand, variations, units, unit conversions, bundles/kits, images, status.
- Catalog extensions: serial/IMEI and warranty (electronics); batch/expiry/manufacturer/FEFO (pharmacy); weighted goods/scale barcodes (supermarket).
- Sales channels: in-store POS first; extensible API/order sources for online orders, pickup, and delivery later.

## 3. Role-based panels and permissions
- **System Super Admin:** platform tenants, platform settings, support access (explicitly approved, audited), usage, plans, incidents.
- **Organization Owner:** all organization configuration, branches, managers, billing policies, sensitive reporting.
- **Organization Admin:** employee onboarding, role assignments, catalog, operational settings, branch administration.
- **Branch Manager:** branch KPIs, stock approvals, register oversight, returns approvals, team scheduling.
- **Operations Manager:** opening/closing workflows, daily operations, transfers, fulfillment, escalations.
- **Store/Warehouse Manager:** stock takes, adjustments, receipts, transfers, min/max reorder and inventory reports.
- **Purchase/Procurement Officer:** suppliers, purchase requests/orders, receiving and supplier returns.
- **Sales Supervisor:** cashier overrides, approved discounts, price overrides, refunds, shift reconciliation.
- **Cashier/Salesperson:** POS checkout, hold/resume, own sales, shift open/close, approved payment types, receipts.
- **Accounts/Finance Manager:** payment reconciliation, expenses, tax records, ledger, receivables, payables, exports.
- **Accountant:** journal review, accounting reports, reconciliation, customer/vendor settlement; no unrestricted operational editing.
- **Product/Catalog Manager:** product/price list management, bulk import, promotions; no access to confidential accounts by default.
- **Inventory Clerk:** limited receiving, counts and movement requests; no unapproved write-offs.
- **Returns/Customer Service:** view eligible receipts, initiate exchanges/refunds within configured approval threshold.
- **Pharmacist/Compliance Officer:** medicine batch/expiry checks, restricted-item approvals when applicable, controlled audit views.
- **Auditor/Read-only Analyst:** permitted reports and immutable logs; no transactional modification.
- **IT/Device Administrator:** register enrollment, printer profiles, terminal health, offline device revocation.
- **Custom Role:** owner/admin creates scoped roles from permissions; assignments constrained to org/branch/register as appropriate.
- **Permission design:** `resource:action` scopes (e.g., `sales:create`, `refunds:approve`, `inventory:adjust`, `reports:export`).
- Enforce RBAC + tenant and branch scoping in API middleware AND service/repository methods, never only hide UI buttons.
- Sensitive actions require approval policies, reason codes and immutable audit events; include manager override PIN/step-up online.
- Navigation and dashboard cards are driven by abilities; unauthorized paths render 403 and API returns 403.

## 4. Required screens and modules
### Platform and organization administration
- Tenant onboarding, store/warehouse/register provisioning, subscription flags, staff directory, role editor and permission matrix.
- Store settings, payment methods, currencies/tax rules, receipt templates, localized numbering, backups and integration settings.
- Activity/audit explorer, device management, health/status, import/export activity, configuration and retention policies.
### Master data and inventory
- Products, variants, categories, brands, price books, customer groups, suppliers, buyers and loyalty profiles.
- Bulk import/export with validation preview; supplier purchases, purchase orders, receiving/GRN and purchase returns.
- Stock ledger, on-hand/reserved/available, adjustments, transfers, branch replenishment, reorder thresholds, cycle counts.
- Serial/IMEI tracking, batch/expiry/FEFO, warranty claims, units/weight conversions and inventory valuation (defined costing method).
### Finance and operations
- Register sessions, cash float, cash in/out, daily close, shift differences, expenses and manager sign-off.
- Discounts, campaigns, bundles, loyalty, gift cards/store credit (phased), price changes and approval history.
- Customer accounts, credit sales (online approval), receivables, supplier payables and reconciliation.
- Accounting journal integration with auditable double-entry postings; chart of accounts and period close in later release.
### POS checkout screen
- Full-screen keyboard-friendly UI; barcode scanner (keyboard wedge), search, category/quick tiles, variants, quantity/weight.
- Cart, quantity edits, hold/resume, line/order discounts with RBAC, promotions, tax, rounding, customer selection.
- Split payments and tendered cash/change; initially cash and explicitly authorized offline tenders only.
- Payment types: cash, card, wallet, bank, store credit, mixed; online verification required before marking electronic payments settled.
- Receipt preview, 58/80 mm printer format, normal A4 printer, downloadable PDF or browser-viewable digital receipt.
- Returns, exchange, refund, void, reprint, delayed print queue, receipt lookup, opening/closing shift and cash count.
- Clear ONLINE / OFFLINE / SYNCING / ERROR status, pending sales count, local provisional receipt badge and last-sync time.
- Accessible touch targets, loading/error states, scan focus, keyboard shortcuts, tablet layout and cashier quick actions.

## 5. Offline-first design — safety-critical
- First enrollment requires internet, device authorization, approved cashier and initial product/price/tax/stock sync.
- Cache install shell and POS assets with versioned service worker; cache only safe GETs and assets, not authenticated POST responses.
- IndexedDB tables: `products`, `prices`, `taxRules`, `stockSnapshots`, `registerSessions`, `carts`, `localSales`, `outbox`, `syncCursors`, `deviceConfig`.
- Browser data may be purged or lost; request persistent storage where supported, alert on low quota, prohibit cache-clearing before reconciliation.
- Document that browser-only PWA storage is not a guaranteed durable ledger; for high-stakes stores offer optional desktop local service/SQLite later.
- Each checkout atomically writes sale + line items + tender record + inventory intent + outbox event to IndexedDB **before** showing success.
- Client generates UUIDv7 or UUID identifiers for `saleId`, `operationId`, `deviceId`; include tenant, branch, register, cashier, local sequence and schema version.
- Receipt numbers: provisional unique `OFF-{register}-{localSequence}` offline; immutable server fiscal/invoice number assigned upon acceptance.
- Sync API: `POST /v1/sync/push` with bounded batches and per-event idempotency keys; `GET /v1/sync/pull?cursor=...` for authorized incremental updates.
- Event envelope: `operationId`, `entityId`, `entityType`, `eventType`, `tenantId`, `branchId`, `registerId`, `deviceId`, `clientSequence`, `occurredAt`, `payloadVersion`, `payload`.
- Outbox states: `pending -> sending -> acknowledged` or `retryable_error` / `needs_review`; retries use exponential backoff + jitter.
- On reconnect, send in causal order, reconcile accepted events, then pull server deltas and display any conflicts explicitly.
- Never rely only on `navigator.onLine`; test a health endpoint and retry on app open, focus, network return and optional Background Sync.
- Background Sync has uneven browser support; sync must work from an open POS page with a manual Retry control.
- Server verifies signature/session/device entitlement, tenant/branch scope, operation IDs, price policy, tender rules and stock policies.
- In one PostgreSQL transaction: lock affected inventory rows, accept/reject operation, post stock/payment/sale journal, persist idempotency result.
- Server deduplicates `(tenantId, operationId)` and returns the same canonical sale result on repeated pushes; no duplicate invoices or stock debits.
- Offline stock is estimated; simultaneous disconnected terminals can oversell. Define per-branch policy: allow with warning and reconcile, or offline quotas.
- Never silently overwrite financial transactions (no last-write-wins); conflicts become a review case with compensating adjustments/refunds.
- Handle changed prices/taxes, deleted items, expired stock, suspended employees, revoked devices and stale entitlements with deterministic policies.
- Offline permissions limited to short-lived, previously authorized checkout roles; new permission grants/overrides and noncash settlement require online validation.
- Sales are flagged `local_pending`, `server_accepted`, `requires_review`, or `rejected`; reports distinguish provisional vs reconciled totals.
- Device clock is untrusted for accounting finality; store device timestamp plus server acceptance timestamp and store business date.
- Offline encryption can reduce exposure, but browser access on shared POS terminals is a security risk; mandate OS accounts, auto-lock and logout.
- Never erase acknowledged or unacknowledged outbox data until reconciliation and verified recovery policy are satisfied.

## 6. Printing and receipts
- Implement `ReceiptRenderer` (React + print CSS) and `PrintProvider` abstraction; never make printing a dependency of sale commit.
- Default: browser `window.print()` supports connected Windows/system printers, PDF and general printing with user dialog.
- Supported initial targets: Chrome/Edge on desktop with USB/LAN thermal printer installed in OS; verify 58/80 mm receipt dimensions.
- Silent direct ESC/POS, cash-drawer kick and Bluetooth printer support are **optional adapters**, usually requiring a trusted local print bridge or desktop wrapper.
- Receipt output: shop/contact/tax metadata, invoice IDs, sale items, quantity/unit, discounts, VAT/tax, payments, change, return terms, QR link.
- Store print requests as best-effort local jobs; offer Retry/Reprint and digital share/download; printer errors never roll back an accepted sale.
- If device is offline, digital receipt renders locally using provisional identifier; after sync show canonical ID and reprint if desired.
- Printing must never automatically reveal patient/controlled medicine/customer private details beyond necessary legally compliant receipt fields.

## 7. PostgreSQL data model (initial migration groups)
- **Identity/tenancy:** `organizations`, `stores`, `warehouses`, `registers`, `devices`, `users`, `memberships`, `roles`, `permissions`, `role_permissions`, `user_role_assignments`, `sessions`.
- **Catalog:** `products`, `product_variants`, `product_barcodes`, `categories`, `brands`, `units`, `unit_conversions`, `price_books`, `product_prices`, `media_assets`.
- **Retail specializations:** `product_serials`, `batches`, `expiries`, `warranties`, `product_attributes`, `product_bundles`.
- **Stock:** `stock_locations`, `stock_balances`, `stock_movements`, `stock_counts`, `stock_adjustments`, `stock_transfers`, `reservations`.
- **Purchasing:** `suppliers`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `supplier_returns`.
- **Sales:** `customers`, `sales`, `sale_lines`, `sale_payments`, `receipts`, `returns`, `return_lines`, `refunds`, `discounts`, `tax_rules`, `promotions`.
- **Cash/accounting:** `register_shifts`, `cash_movements`, `expenses`, `accounts`, `journal_entries`, `journal_lines`, `settlements`.
- **Sync/audit:** `sync_operations`, `device_cursors`, `sync_conflicts`, `audit_events`, `approval_requests`, `export_jobs`, `outbox_events`.
- Every tenant-owned table has indexed `organization_id` and appropriate `store_id`; write cross-tenant isolation integration tests.
- Enforce unique scoped SKUs, device operation IDs and server invoice numbers; foreign keys, check constraints, soft archive where justified.
- Financial records are append-only after posting, with reversals/credit notes; audit events never silently mutate.
- Store normalized sale snapshots of names, unit prices, tax amounts and discounts so later catalog changes cannot modify historical receipts.
- Establish inventory costing (weighted average or FIFO) as a formal design decision before valuation/accounting implementation.

## 8. API contracts and engineering boundaries
- Base version `/v1`, consistent response/error envelope, validated request DTOs and generated OpenAPI docs.
- Resource groups: `/auth`, `/organizations`, `/stores`, `/staff`, `/roles`, `/catalog`, `/inventory`, `/purchases`, `/sales`.
- Other groups: `/returns`, `/registers`, `/payments`, `/customers`, `/suppliers`, `/reports`, `/exports`, `/media`, `/devices`, `/sync`, `/audit`.
- Use Zod schemas in shared `packages/contracts` and compile-time request/response typing; no import of server internals into web.
- Express boundaries: `route -> auth/authorization -> schema validation -> service -> transaction/repository -> domain event`.
- No direct DB reads from Next.js components and no DB SQL inside route controllers; async tasks behind interfaces.
- Use cursor/keyset pagination for large ledgers, bounded time/date filters, structured errors and an explicit API compatibility policy.
- Tests must confirm revoked users/devices, impossible stock state, unauthorized returns and repeated sync messages cannot bypass rules.

## 9. Reports and Excel exports
- Sales: daily/weekly/monthly, custom dates, store/register/cashier, revenue, returns, discounts, tax, net sales, units, tenders.
- Product: best sellers, category/brand trends, gross margin with validated cost basis, slow/fast moving items and inventory turnover.
- Inventory: valuation, stock in/out, store-wise availability, low stock, aging, expiry/batches, damage, adjustment and transfer history.
- Purchase: supplier spend, receiving, outstanding orders, purchase returns, supplier performance and payables.
- Finance: tender reconciliation, expenses, cash close differences, receipts, tax summary, receivables/payables and accounting summaries.
- Operations: cashier shifts, void/refund reasons, discount overrides, audit and device sync status/conflicts.
- Filters: organization, branch, period, timezone, product/category, cashier, supplier, payment type and sale status.
- Dashboard has date comparisons and downloadable detail views; financial reports use server-accepted records by default.
- Export CSV and `.xlsx` with formatted headers, totals, applied filters, generation time, authorized user and reconciliation status.
- Protect against CSV/Excel formula injection, large export memory issues and cross-tenant leakage; log every sensitive export.
- Generate small exports in short synchronous API requests; large exports use external worker/queue after moving off serverless.

## 10. Repository structure
```text
universal-pos/
  apps/
    web/                         # Next.js UI + offline PWA + POS
    api/                         # Express REST API (host-agnostic)
    worker/                      # Optional later: queued exports/reconciliation
  packages/
    ui/                          # shadcn wrappers, layout, forms, tables
    contracts/                   # Zod/OpenAPI DTOs, permission keys
    db/                          # Drizzle models, migrations, seeders
    domain/                      # Money, tax, pricing, inventory rules
    offline/                     # Dexie schemas, outbox, sync engine
    print/                       # Receipt renderer, print adapters
    storage/                     # S3-compatible and mock storage adapter
    config/                      # ESLint, TypeScript, runtime config
  infra/                         # Dockerfiles, compose, proxy, hosting examples
  docs/                          # ADRs, API contracts, decisions, runbooks
  .github/workflows/             # CI: lint, typecheck, test, security, build
  AGENTS.md                      # Universal agent guardrails
  plan.md                        # This file
```

## 11. Deployment strategy and free-tier constraints
- `apps/web`: deploy Next.js to Vercel for non-commercial testing; `apps/api`: separately deploy Vercel-compatible Express entrypoint.
- `apps/api` exports `app` without calling `listen()` in import path; local/docker server imports `app` and calls `listen()`.
- Connect API to Neon pooled PostgreSQL through environment variables; use migrations in controlled deployment, not runtime cold start.
- R2 stores product media via presigned URLs; serve public images through controlled CDN paths; private objects use signed access.
- Do not use Vercel Function memory/process lifetime for cron daemons, durable queues, local files, websockets or persistent workers.
- Configure domains via `NEXT_PUBLIC_API_BASE_URL`, `DATABASE_URL`, `STORAGE_*`, `SESSION_*`, `PWA_*`; never hardcode Vercel URLs.
- Add `/health`, `/ready`, external error tracking, structured logs, periodic backups and restore verification.
- Production switch: point domains at Docker-hosted web/API, restore or migrate PostgreSQL, redirect storage endpoint, rotate secrets, smoke-test sync.
- Deploy with image versions, separate staging/production environments, documented rollbacks and feature-flagged schema upgrades.
- Vercel Hobby is not an acceptable commercial hosting plan; obtain a compliant paid/commercial host before real store onboarding.
- No free service guarantees uptime, retention or recovery; regularly export DB backups to a different location even in development.

## 12. Security, privacy, operational policy
- HTTPS/TLS everywhere, cookie/session CSRF protection where relevant, secure headers, strict CORS, rate limits, brute-force prevention.
- Enforce Argon2id password hashing, MFA for privileged roles, bounded sessions, revocation and audited support impersonation.
- Define PII retention, export permissions, user/device deprovisioning and client-side cache wipe on logout/device revocation when online.
- Avoid storing card PAN/CVV or unencrypted payment credentials; use regulated payment gateway tokenization later.
- Prescription and controlled-medication workflows require jurisdiction-specific legal review before enabling sales; keep compliance configurable.
- Implement VAT/tax rules as configurable data reviewed by accountant/legal expert; do not assume legal compliance from generic defaults.
- Monitor failed syncs, rejected sales, disk quota, backup failure, report export failure and inventory discrepancies.

## 13. Delivery phases and dependency gates
- **P0 — Contracts/architecture:** ADRs, tenant boundaries, RBAC matrix, data flow, offline invariants, business policies and API schemas. Gate: reviewed docs + test cases.
- **P1 — Foundation:** pnpm/Turborepo setup, Next.js/Express, shared packages, lint/CI, local Docker Postgres, Drizzle, tenant/auth/RBAC. Gate: auth isolation tests pass.
- **P2 — Catalog and inventory:** stores/registers, product master, pricing/tax, stock ledger, purchase/receiving, CSV import. Gate: stock movement reconciliation tests.
- **P3 — Online POS MVP:** cart, cash checkout, register sessions, receipt preview/print, refund basics and dashboard. Gate: atomic sale/payment/stock invariant tests.
- **P4 — Offline POS MVP:** precaching, Dexie, local atomic checkout, outbox, idempotent push/pull, conflict screen and device management. Gate: unplugged cashier acceptance suite.
- **P5 — Reporting + finance:** sales/inventory reports, CSV/XLSX, register reconciliation, cost and tax policies. Gate: exported totals match DB fixtures.
- **P6 — Sector capabilities:** pharmacy batch/expiry, electronics serial/warranty, supermarket weight/PLU, returns/exchanges, promotions. Gate: sector workflows tested.
- **P7 — Hardening/production:** performance, security/accessibility, restore drills, printer matrix, Docker deployment, observability and operations docs.
- Do not defer offline guarantees to a purely online-first architecture; validate offline data structures from P0 onward.

## 14. Parallel agent assignments (worktree or branch per agent)
| Agent | Ownership | Deliverable | Dependencies |
|---|---|---|---|
| A0 Orchestrator | ADRs, PR queue, shared schema/contract changes, release gates | approved contracts, integration plan | none |
| A1 Platform/API | `apps/api`, auth, RBAC, tenancy and API wiring | secure Express endpoints + tests | P0 contracts |
| A2 Database | `packages/db`, data relationships, migrations, seeds | normalized schema + integrity tests | P0 contracts |
| A3 Admin/UI | `apps/web` administration + `packages/ui` | responsive RBAC-based admin panels | contracts/UI kit |
| A4 POS/UI | POS routes, cart, receipts, print adapters | touch/keyboard POS + fallback receipt | contracts/domain |
| A5 Offline/Sync | `packages/offline`, service worker, sync UI | durable local queue + recovery suite | sync contract/API |
| A6 Inventory/Sectors | inventory/purchase business services, specialized rules | product/stock + sector workflows | schema/domain |
| A7 Finance/Reports | ledger and reporting APIs, `.xlsx` exports | reconciled reports, controlled exports | sales schema |
| A8 QA/DevOps | CI, Playwright, Docker, fixtures, monitoring, threat model | test pipeline + deployment runbooks | shared contracts |
- Agent ownership is logical, not permission to overwrite other agents' work; shared file changes require A0 approval.
- Parallelize P1 UI shell, DB, auth and CI only after contracts are frozen; P4 sync can progress with mocked P3 APIs.
- Merge via small PRs, required CI, codeowner review and integration tests; one agent owns final conflict resolution.

## 15. Definition of done — mandatory release tests
- Two organizations cannot view/edit each other's products, sales, user data, media or reports by guessing IDs.
- Cashier with permission only in branch A cannot access branch B; sensitive endpoints reject missing and revoked permission.
- Checkout online commits sale, payment and stock atomically, with safe retry and correct money rounding.
- After offline sale, kill browser/relaunch and verify sale remains queued; reconnect and verify exactly one server invoice/stock posting.
- Sync same operation 10 times and confirm one sale; test server crash between transaction and response, then retry.
- Offline same-SKU sales from two devices trigger configured oversell/conflict handling without silent data loss.
- Old cached price, revoked terminal, expired drug batch and unauthorized discount follow documented policy.
- Disconnect printer: digital receipt works and sale succeeds; reconnect printer: manual reprint succeeds without duplicate sale.
- Compare sales report and Excel totals against ledger after returns, taxes, discounts, split tenders and offline reconciliation.
- Mobile/tablet/desktop POS checks, keyboard scanner and real 58/80 mm test print; accessibility and performance gates pass.
- Run DB restore drill and VPS Docker smoke test before any commercial rollout.

## 16. Issues the product owner must settle before P2/P3
- Allow negative/oversold stock while offline, or require preallocated device stock quotas?
- Which stock valuation method and refund approval limits apply per shop/branch?
- Is the first deployment one tenant with branches, or multi-tenant SaaS from day one? (Recommended: design multi-tenant immediately.)
- Required legal invoice template, taxes, medicine restrictions and electronic payment providers for launch region?
- Initial hardware target: Windows Chrome/Edge + USB 80 mm receipt printer + keyboard barcode scanner (recommended).
- Is offline browser storage sufficient for pilot, or does a regulated/high-volume store require a local installed durability layer?

## 17. First actions for coding agents
1. Read `AGENTS.md` and this plan; write brief architecture decision records in `docs/adr/` before creating business logic.
2. A0 freezes API and event schemas for authentication, product, stock, sale, payment, receipt, and sync.
3. A2 creates PostgreSQL/Drizzle migration foundations and seed data; A1 implements scoped auth/RBAC with isolation tests.
4. A3 and A4 implement shadcn-based admin/POS route shells against typed mock API clients; A8 establishes CI/test harness.
5. A5 prototypes the offline event/outbox model with a hard browser restart test and network cut; validate before full POS implementation.
6. Review gates and only then advance P2 through P7; attach test evidence and changed file list to every PR.

## 18. Reference links (verify pricing and terms before use)
- Vercel Hobby terms: https://vercel.com/legal/terms
- Vercel Express guide: https://vercel.com/docs/frameworks/backend/express
- Neon free plan: https://neon.com/blog/neon-free-plan-1-gb-per-project
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudinary plans: https://cloudinary.com/documentation/billing_and_plans
- Browser Background Sync support: https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API
- IndexedDB transactions: https://dexie.org/docs/Dexie/Dexie.transaction%28%29
