'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { LossForm } from './components/LossForm';
import { LossLog } from './components/LossLog';
import { LowStockPanel } from './components/LowStockPanel';
import { StockReport } from './components/StockReport';
import { useStock } from './useStock';

export default function InventoryPage() {
  const [locationId, setLocationId] = useState('');
  const stock = useStock(locationId);

  useEffect(() => {
    if (!locationId && stock.locations.length > 0) {
      setLocationId(stock.locations[0]?.id ?? '');
    }
  }, [locationId, stock.locations]);

  const stockByProduct = useMemo(
    () => new Map(stock.balances.map((balance) => [balance.productId, balance.quantity])),
    [stock.balances],
  );
  const locationName = stock.locations.find((location) => location.id === locationId)?.name ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Stock control</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Record waste, damage and expiry; review stock and loss value by location.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2" aria-label="Stock pages">
          <Link href="/pos" className="btn text-sm">
            POS
          </Link>
          <Link href="/catalog" className="btn text-sm">
            Catalog
          </Link>
          <Link href="/purchasing" className="btn text-sm">
            Purchasing
          </Link>
          <Link href="/reports" className="btn text-sm">
            Reports
          </Link>
          <Link href="/settings" className="btn text-sm">
            Settings
          </Link>
        </nav>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 text-[var(--color-muted)]">Stock location</span>
          <select
            className="field inline-block w-auto min-w-44"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={stock.loading || stock.locations.length === 0}
          >
            {stock.locations.length === 0 && <option value="">No locations</option>}
            {stock.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--color-muted)]">
          Losses post a stock ledger movement and cannot be edited.
        </p>
      </div>

      {stock.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {stock.error}
        </p>
      )}

      {stock.loading ? (
        <p role="status" className="surface p-6 text-center text-sm text-[var(--color-muted)]">
          Loading stock data...
        </p>
      ) : stock.locations.length === 0 ? (
        <p className="surface p-6 text-center text-sm text-[var(--color-muted)]">
          No stock locations exist yet. Create one before recording stock movements.
        </p>
      ) : (
        <>
          <LowStockPanel locationId={locationId} locationName={locationName} />
          <div className="grid items-start gap-4 lg:grid-cols-[380px_1fr]">
            <LossForm
              locationId={locationId}
              products={stock.products}
              stockByProduct={stockByProduct}
              canAdjust={stock.canAdjust}
              busy={stock.busy}
              onSubmit={stock.recordLoss}
            />
            <LossLog losses={stock.losses} products={stock.products} locationName={locationName} />
          </div>
          <StockReport
            products={stock.products}
            balances={stock.balances}
            losses={stock.losses}
            locationName={locationName}
          />
        </>
      )}
    </main>
  );
}
