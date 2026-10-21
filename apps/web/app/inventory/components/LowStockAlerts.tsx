'use client';

import type { LowStockOverview } from '@pos/contracts';

interface LowStockAlertsProps {
  overview: LowStockOverview | null;
  loading: boolean;
  locationName: string | null;
}

function SourceBadge({ source }: { source: 'product' | 'global' }) {
  const product = source === 'product';
  return (
    <span
      className={
        product
          ? 'rounded-full bg-[var(--color-accent)]/15 px-2 py-0.5 text-xs font-medium text-[var(--color-accent)]'
          : 'rounded-full bg-[var(--color-border)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted)]'
      }
    >
      {product ? 'Product rule' : 'Global rule'}
    </span>
  );
}

export function LowStockAlerts({ overview, loading, locationName }: LowStockAlertsProps) {
  const items = overview?.items ?? [];
  const configured =
    overview !== null &&
    (overview.globalThreshold !== null || overview.productThresholds.length > 0);

  return (
    <section aria-labelledby="low-stock-alerts-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="low-stock-alerts-heading" className="text-base font-semibold">
          Products below threshold
        </h3>
        <span className="text-xs text-[var(--color-muted)]">
          {locationName ? `${locationName} · ` : 'All locations · '}
          notifies when on-hand is below the threshold
        </span>
      </div>

      {loading && !overview ? (
        <p
          role="status"
          className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]"
        >
          Checking stock levels...
        </p>
      ) : !configured ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
          No low stock rule is configured. Add a global threshold or a product threshold to start
          receiving alerts.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
          No products are below their threshold right now.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Products below their low stock threshold</caption>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 text-right font-medium">On hand</th>
                <th className="px-2 py-2 text-right font-medium">Notify below</th>
                <th className="px-2 py-2 font-medium">Rule</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.productId}
                  className="border-b border-[var(--color-border)]/60 last:border-0"
                >
                  <td className="px-2 py-2.5">
                    <p className="font-medium leading-snug">{item.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{item.sku}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right font-medium tabular-nums">{item.onHand}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{item.threshold}</td>
                  <td className="px-2 py-2.5">
                    <SourceBadge source={item.source} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
