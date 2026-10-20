'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { DailySalesTable } from './components/DailySalesTable';
import { ShiftReportPanel } from './components/ShiftReportPanel';
import { StoreActivityCards } from './components/StoreActivityCards';
import { SummaryCards } from './components/SummaryCards';
import { useSalesSummary } from './useSalesSummary';
import { useShiftReport } from './useShiftReport';
import { useStoreActivity } from './useStoreActivity';

export default function ReportsPage() {
  const range = useSalesSummary();
  const activity = useStoreActivity(range.applied.from, range.applied.to, range.reloadKey);
  const [shiftId, setShiftId] = useState<string | null>(null);
  const shift = useShiftReport(shiftId);

  useEffect(() => {
    setShiftId(new URLSearchParams(window.location.search).get('shiftId'));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Store reports</h1>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn text-sm" onClick={range.refresh}>
            Refresh
          </button>
          <Link href="/pos" className="btn text-sm">
            Back to POS
          </Link>
          <Link href="/inventory" className="btn text-sm">
            Stock
          </Link>
        </div>
      </header>

      <form
        className="surface flex flex-wrap items-end gap-3 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          range.applyRange();
        }}
      >
        <label className="text-xs">
          <span className="mb-1 block text-[var(--color-muted)]">From</span>
          <input
            type="date"
            className="field w-44"
            value={range.from}
            max={range.to}
            onChange={(event) => range.setFrom(event.target.value)}
            required
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-[var(--color-muted)]">To</span>
          <input
            type="date"
            className="field w-44"
            value={range.to}
            min={range.from}
            onChange={(event) => range.setTo(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="btn btn-accent text-sm">
          Apply range
        </button>
        <p className="text-xs text-[var(--color-muted)]">
          Daily totals use UTC dates; the range may span up to 366 days.
        </p>
      </form>

      {range.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {range.error}{' '}
          {range.error.includes('session') && (
            <Link href="/login" className="underline">
              Sign in
            </Link>
          )}
        </p>
      )}

      {range.loading && !range.summary ? (
        <p className="p-8 text-center text-sm text-[var(--color-muted)]">Loading sales...</p>
      ) : range.summary ? (
        <>
          <SummaryCards summary={range.summary} />
          {range.loading && (
            <p className="text-xs text-[var(--color-muted)]" role="status">
              Refreshing...
            </p>
          )}
          {activity.error && (
            <p
              role="alert"
              className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
            >
              {activity.error}
            </p>
          )}
          {activity.activity && <StoreActivityCards activity={activity.activity} />}
          <DailySalesTable days={range.summary.days} />
        </>
      ) : null}

      {shiftId && (
        <ShiftReportPanel report={shift.report} loading={shift.loading} error={shift.error} />
      )}

      <p className="text-xs text-[var(--color-muted)]">
        Gross sales are completed sales before refunds. Refunds reduce net sales but not the
        original sale record.
      </p>
    </main>
  );
}
