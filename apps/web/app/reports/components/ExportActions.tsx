'use client';

import type { ReportExportKind } from '@pos/contracts';

import { useReportExport } from '../useReportExport';

const REPORTS: ReadonlyArray<{ kind: ReportExportKind; label: string }> = [
  { kind: 'sales-summary', label: 'Sales summary' },
  { kind: 'store-activity', label: 'Store activity' },
];

export function ExportActions({ from, to }: { from: string; to: string }) {
  const exporter = useReportExport(from, to);
  if (!exporter.canExport) return null;

  return (
    <section className="surface space-y-2 px-4 py-3" aria-label="Export reports">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        Export {from} to {to}
      </p>
      <div className="flex flex-wrap gap-2">
        {REPORTS.map((report) =>
          (['csv', 'xlsx'] as const).map((format) => {
            const key = `${report.kind}:${format}`;
            return (
              <button
                key={key}
                type="button"
                className="btn text-sm"
                disabled={exporter.busy !== null}
                onClick={() => void exporter.run(report.kind, format)}
              >
                {exporter.busy === key ? 'Preparing...' : `${report.label} ${format.toUpperCase()}`}
              </button>
            );
          }),
        )}
      </div>
      {exporter.lastFile && (
        <p role="status" className="text-xs text-[var(--color-muted)]">
          Downloaded {exporter.lastFile}
        </p>
      )}
      {exporter.error && (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {exporter.error}
        </p>
      )}
    </section>
  );
}
