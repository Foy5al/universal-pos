# ADR-0010: Receipt printing abstraction

## Status
Accepted

## Date
2026-10-17

## Context
Receipt output must work across environments: Windows Chrome/Edge desktop with a USB/LAN
thermal printer, A4/general printers, PDF and digital receipts. Printer integrations vary
and fail unpredictably, and a print failure must never invalidate an accepted sale.

## Decision
- Abstract printing behind two interfaces in `packages/print`: a `ReceiptRenderer`
  (React + print CSS) that produces the receipt document, and a `PrintProvider` that
  sends it to a target.
- Default provider uses browser `window.print()`, covering OS-installed printers, PDF
  and general printing with the user dialog. Initial targets are Chrome/Edge on desktop
  with 58 mm and 80 mm thermal printers installed in the OS.
- Silent ESC/POS, cash-drawer kick and Bluetooth printers are optional adapters that
  require a trusted local print bridge or desktop wrapper.
- Printing is never a dependency of sale commit: print requests are best-effort local
  jobs, and printer errors never roll back an accepted sale.
- Receipt content includes shop/contact/tax metadata, invoice IDs, items, quantity/unit,
  discounts, VAT/tax, payments, change, return terms and a QR link; it must not reveal
  patient/controlled-medicine or customer private data beyond legally required fields.
- Offline, the receipt renders with the provisional identifier; after sync it shows the
  canonical ID and can be reprinted.

## Alternatives Considered

### Direct ESC/POS from the browser (WebUSB/WebSerial)
- Pros: no bridge, silent printing.
- Cons: browser/permission limitations, printer-specific quirks, poor cross-platform
  reliability.
- Rejected as default; retained as an optional adapter.

### Desktop wrapper (Electron/Tauri) as the only path
- Pros: native, silent printing and drawer control.
- Cons: install/update burden, contradicts the PWA-first goal.
- Deferred: possible future packaging of the print bridge.

### Server-side PDF generation for all receipts
- Pros: uniform, archival output.
- Cons: unavailable offline and adds latency/load; printing still needs local delivery.
- Rejected as the primary path; PDF is one supported output, not the mechanism.

## Consequences
- A4 owns `packages/print`; adapters are discovered behind `PrintProvider`, so new
  hardware is added without touching checkout or the API.
- Offline printing uses the same renderer as online, only the identifier differs.
- The acceptance suite includes "disconnect printer → sale still succeeds; reconnect →
  manual reprint without duplicate sale" and a real 58/80 mm print check.
