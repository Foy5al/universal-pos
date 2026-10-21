'use client';

import Link from 'next/link';

import { useLowStock } from '../useLowStock';
import { LowStockAlerts } from './LowStockAlerts';

interface LowStockPanelProps {
  locationId: string;
  locationName: string | null;
}

export function LowStockPanel({ locationId, locationName }: LowStockPanelProps) {
  const lowStock = useLowStock(locationId);
  const count = lowStock.overview?.items.length ?? 0;

  return (
    <section className="surface space-y-4 p-4" aria-labelledby="low-stock-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="low-stock-heading" className="text-lg font-semibold">
            Low stock notifications
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Product rules take priority; the global fallback is set in System settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={
              count > 0
                ? 'rounded-full bg-[var(--color-accent)]/15 px-3 py-1 text-sm font-semibold text-[var(--color-accent)]'
                : 'rounded-full bg-[var(--color-border)] px-3 py-1 text-sm font-semibold text-[var(--color-muted)]'
            }
            aria-live="polite"
          >
            {lowStock.loading && !lowStock.overview
              ? 'Checking...'
              : `${count} low stock ${count === 1 ? 'item' : 'items'}`}
          </span>
          <Link href="/settings#inventory-alerts" className="btn text-sm">
            Alert settings
          </Link>
        </div>
      </div>

      {lowStock.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {lowStock.error}
        </p>
      )}

      <LowStockAlerts
        overview={lowStock.overview}
        loading={lowStock.loading}
        locationName={locationName}
      />
    </section>
  );
}
