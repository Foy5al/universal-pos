'use client';

import Link from 'next/link';

import { GlobalThresholdForm } from './components/GlobalThresholdForm';
import { useLowStockSettings } from './useLowStockSettings';

const relatedConfiguration = [
  {
    href: '/catalog',
    title: 'Catalog and products',
    description: 'Product prices, units and per-product low stock alerts.',
  },
  {
    href: '/inventory',
    title: 'Stock locations',
    description: 'Locations that stock balances and alerts are measured against.',
  },
  {
    href: '/sync',
    title: 'Devices and offline sync',
    description: 'Enrolled terminals, offline sales and conflict review.',
  },
];

const navigation = [
  { href: '/pos', label: 'POS' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/inventory', label: 'Stock' },
  { href: '/reports', label: 'Reports' },
  { href: '/', label: 'Dashboard' },
];

export default function SettingsPage() {
  const lowStock = useLowStockSettings();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 lg:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold">System settings</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Organization-wide defaults live here. Product and store details stay with their own
            records.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Settings navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="btn text-sm">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      {lowStock.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {lowStock.error}
        </p>
      )}

      {lowStock.loading ? (
        <p role="status" className="surface p-8 text-center text-sm text-[var(--color-muted)]">
          Loading system settings...
        </p>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[210px_1fr]">
          <nav
            aria-label="Settings sections"
            className="surface flex gap-1 overflow-x-auto p-2 text-sm lg:sticky lg:top-5 lg:flex-col"
          >
            <a
              href="#inventory-alerts"
              className="rounded-md px-3 py-2 hover:bg-[var(--color-border)]/40"
            >
              Inventory alerts
            </a>
            <a
              href="#configuration"
              className="rounded-md px-3 py-2 hover:bg-[var(--color-border)]/40"
            >
              Related configuration
            </a>
          </nav>

          <div className="space-y-5">
            <section
              id="inventory-alerts"
              className="surface space-y-4 p-5"
              aria-labelledby="inventory-alerts-heading"
            >
              <div>
                <h2 id="inventory-alerts-heading" className="text-lg font-semibold">
                  Inventory alerts
                </h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Set the fallback rule for products that do not have their own threshold. A
                  product-level rule always takes priority over this value.
                </p>
              </div>

              <GlobalThresholdForm
                globalThreshold={lowStock.settings?.globalThreshold ?? null}
                canManage={lowStock.canManage}
                busy={lowStock.busy}
                onSave={lowStock.save}
              />

              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <h3 className="text-sm font-semibold">Per-product thresholds</h3>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Product-level alerts are configured when adding or editing a product, so the
                  threshold stays next to the product it belongs to.
                </p>
                <Link href="/catalog" className="btn mt-3 inline-flex text-sm">
                  Manage products
                </Link>
              </div>
            </section>

            <section
              id="configuration"
              className="surface space-y-4 p-5"
              aria-labelledby="configuration-heading"
            >
              <div>
                <h2 id="configuration-heading" className="text-lg font-semibold">
                  Related configuration
                </h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  These areas hold their own record-level settings rather than organization-wide
                  defaults.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {relatedConfiguration.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-lg border border-[var(--color-border)] p-4 transition hover:border-[var(--color-focus)]"
                  >
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">{item.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
