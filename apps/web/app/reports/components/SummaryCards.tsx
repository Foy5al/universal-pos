import type { SalesSummary } from '@pos/contracts';

import { formatMinor } from '../../lib/money';

const cards = [
  { key: 'grossSalesMinor', label: 'Gross sales' },
  { key: 'refundsMinor', label: 'Refunds' },
  { key: 'netSalesMinor', label: 'Net sales' },
  { key: 'averageSaleMinor', label: 'Average sale' },
] as const;

export function SummaryCards({ summary }: { summary: SalesSummary }) {
  return (
    <section aria-label="Sales totals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.key} className="surface p-4">
          <p className="text-xs text-[var(--color-muted)]">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {formatMinor(summary[card.key])}
          </p>
        </div>
      ))}
      <p className="text-xs text-[var(--color-muted)] sm:col-span-2 lg:col-span-4">
        {summary.saleCount} completed sales · {summary.refundCount} refunds · {summary.unitsSold}{' '}
        units · {summary.from.slice(0, 10)} to {summary.to.slice(0, 10)}
      </p>
    </section>
  );
}
