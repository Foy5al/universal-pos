import type { ShiftReport } from '@pos/contracts';

import { formatMinor } from '../../lib/money';

interface ShiftReportPanelProps {
  report: ShiftReport | null;
  loading: boolean;
  error: string | null;
}

export function ShiftReportPanel({ report, loading, error }: ShiftReportPanelProps) {
  if (loading) {
    return <p className="surface p-4 text-sm text-[var(--color-muted)]">Loading shift report...</p>;
  }
  if (error) {
    return (
      <p role="alert" className="surface p-4 text-sm text-[var(--color-destructive)]">
        {error}
      </p>
    );
  }
  if (!report) return null;

  const { shift } = report;
  return (
    <section aria-label="Shift report" className="surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          {report.type === 'x' ? 'X report' : 'Z report'} · shift {shift.id.slice(0, 8)}
        </h2>
        <span className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
          {shift.status} · opened {shift.openedAt.slice(0, 16).replace('T', ' ')}
        </span>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Gross sales</dt>
          <dd className="font-semibold tabular-nums">{formatMinor(report.grossSalesMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Refunds</dt>
          <dd className="font-semibold tabular-nums">{formatMinor(report.refundsMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Net sales</dt>
          <dd className="font-semibold tabular-nums">{formatMinor(report.netSalesMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Expected cash</dt>
          <dd className="font-semibold tabular-nums">{formatMinor(shift.expectedCashMinor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Transactions</dt>
          <dd className="font-semibold tabular-nums">
            {report.saleCount} sales / {report.refundCount} refunds
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--color-muted)]">Units sold</dt>
          <dd className="font-semibold tabular-nums">{report.unitsSold}</dd>
        </div>
      </dl>
      {shift.status === 'closed' && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Counted {formatMinor(shift.countedCashMinor ?? 0)} · variance{' '}
          {formatMinor(shift.varianceMinor ?? 0)}
        </p>
      )}
    </section>
  );
}
