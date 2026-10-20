import type { SalesDaySummary } from '@pos/contracts';

import { formatMinor } from '../../lib/money';

export function DailySalesTable({ days }: { days: readonly SalesDaySummary[] }) {
  if (days.length === 0) {
    return (
      <p className="surface p-6 text-center text-sm text-[var(--color-muted)]">
        No completed sales in this range.
      </p>
    );
  }

  return (
    <div className="surface overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">Daily sales summary</caption>
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 text-right font-medium">Sales</th>
            <th className="px-4 py-3 text-right font-medium">Refunds</th>
            <th className="px-4 py-3 text-right font-medium">Gross</th>
            <th className="px-4 py-3 text-right font-medium">Refunded</th>
            <th className="px-4 py-3 text-right font-medium">Net</th>
            <th className="px-4 py-3 text-right font-medium">Units</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <tr key={day.date} className="border-b border-[var(--color-border)]/60 last:border-0">
              <td className="px-4 py-3 tabular-nums">{day.date}</td>
              <td className="px-4 py-3 text-right tabular-nums">{day.saleCount}</td>
              <td className="px-4 py-3 text-right tabular-nums">{day.refundCount}</td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatMinor(day.grossSalesMinor)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatMinor(day.refundsMinor)}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">
                {formatMinor(day.netSalesMinor)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{day.unitsSold}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
