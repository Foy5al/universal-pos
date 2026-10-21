'use client';

import type { Device, ResolveSyncConflictRequest, SyncConflict } from '@pos/contracts';
import { useMemo, useState } from 'react';

import { formatMinor, lineTotalMinor, parseQuantity } from '../../lib/money';

interface ConflictReviewPanelProps {
  conflicts: readonly SyncConflict[];
  devices: readonly Device[];
  busy: boolean;
  canReview: boolean;
  onResolve: (id: string, input: ResolveSyncConflictRequest) => Promise<void>;
}

type Filter = 'open' | 'resolved' | 'all';

const REASON_LABELS: Record<string, string> = {
  insufficient_stock: 'Insufficient stock',
  rejected_operation: 'Rejected operation',
};

function payloadTotal(conflict: SyncConflict): number | null {
  if (!conflict.payload) return null;
  return conflict.payload.lines.reduce((total, line) => {
    const scaled = parseQuantity(line.quantity);
    return scaled === null ? total : total + lineTotalMinor(line.unitPriceMinor, scaled);
  }, 0);
}

function ConflictCard({
  conflict,
  deviceName,
  busy,
  canReview,
  onResolve,
}: {
  conflict: SyncConflict;
  deviceName: string;
  busy: boolean;
  canReview: boolean;
  onResolve: ConflictReviewPanelProps['onResolve'];
}) {
  const [note, setNote] = useState('');
  const open = conflict.status === 'open';
  const total = payloadTotal(conflict);

  async function resolve(action: 'retry' | 'dismiss') {
    if (action === 'dismiss') {
      if (note.trim().length < 3) return;
      if (!window.confirm('Dismiss this sale? The cashier already took payment.')) return;
      await onResolve(conflict.id, { action, note: note.trim() });
      return;
    }
    await onResolve(conflict.id, { action, note: note.trim() || undefined });
  }

  return (
    <li className="rounded-lg border border-[var(--color-border)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">
            {REASON_LABELS[conflict.reason] ?? conflict.reason}
            <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">{deviceName}</span>
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {new Date(conflict.createdAt).toLocaleString()} · operation{' '}
            {conflict.operationId.slice(0, 8)}
          </p>
        </div>
        <span
          className={`text-xs font-semibold ${
            open ? 'text-[var(--color-destructive)]' : 'text-[var(--color-accent)]'
          }`}
        >
          {open ? 'Needs review' : `Resolved · ${conflict.resolution}`}
        </span>
      </div>

      {conflict.details && <p className="mt-2 text-xs">{conflict.details}</p>}

      {conflict.payload ? (
        <div className="mt-2 rounded-md bg-[var(--color-surface-2)] p-2 text-xs">
          <p className="text-[var(--color-muted)]">
            Provisional {conflict.payload.provisionalNumber} · location{' '}
            {conflict.payload.locationId.slice(0, 8)}
            {total !== null ? ` · ${formatMinor(total)}` : ''}
          </p>
          <ul className="mt-1 space-y-1">
            {conflict.payload.lines.map((line) => (
              <li key={line.productId} className="flex justify-between gap-3">
                <span className="truncate">{line.productId.slice(0, 8)}</span>
                <span>
                  {line.quantity} × {formatMinor(line.unitPriceMinor)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          No stored sale payload; dismiss manually after reconciling the cash.
        </p>
      )}

      {open && canReview ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-2">
          <input
            className="field min-w-48 flex-1 py-1.5 text-xs"
            value={note}
            maxLength={500}
            placeholder="Review note (required to dismiss)"
            onChange={(event) => setNote(event.target.value)}
            aria-label="Review note"
          />
          <button
            type="button"
            className="btn btn-accent px-2 py-1 text-xs"
            disabled={busy || !conflict.payload}
            title={conflict.payload ? 'Post the captured sale now' : 'No stored payload to repost'}
            onClick={() => {
              void resolve('retry');
            }}
          >
            Retry posting
          </button>
          <button
            type="button"
            className="btn px-2 py-1 text-xs text-[var(--color-destructive)]"
            disabled={busy || note.trim().length < 3}
            onClick={() => {
              void resolve('dismiss');
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {!open && (
        <p className="mt-2 border-t border-[var(--color-border)] pt-2 text-xs text-[var(--color-muted)]">
          {conflict.resolutionNote ?? 'No review note recorded'}
          {conflict.resolvedAt ? ` · ${new Date(conflict.resolvedAt).toLocaleString()}` : ''}
        </p>
      )}
    </li>
  );
}

export function ConflictReviewPanel({
  conflicts,
  devices,
  busy,
  canReview,
  onResolve,
}: ConflictReviewPanelProps) {
  const [filter, setFilter] = useState<Filter>('open');
  const deviceNames = useMemo(
    () => new Map(devices.map((device) => [device.id, device.name])),
    [devices],
  );
  const openCount = conflicts.filter((conflict) => conflict.status === 'open').length;
  const visible = conflicts.filter((conflict) => {
    if (filter === 'all') return true;
    return conflict.status === filter;
  });

  return (
    <section className="surface p-4" aria-labelledby="conflict-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="conflict-heading" className="text-base font-semibold">
            Offline sale conflicts
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Sales the server could not post. Retry after restocking, or record how the cash was
            settled. Resolving never rewrites the original till operation.
          </p>
        </div>
        <label className="text-xs text-[var(--color-muted)]">
          Show
          <select
            className="field ml-2 inline-block w-auto py-1.5"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            <option value="open">Open ({openCount})</option>
            <option value="resolved">Resolved</option>
            <option value="all">All cases</option>
          </select>
        </label>
      </div>

      {!canReview ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          Your role can view sync status but not review conflicts.
        </p>
      ) : visible.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          {filter === 'open' ? 'No offline sales need review.' : 'No conflicts match this filter.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Offline sale conflicts">
          {visible.map((conflict) => (
            <ConflictCard
              key={conflict.id}
              conflict={conflict}
              deviceName={deviceNames.get(conflict.deviceId) ?? 'Unknown device'}
              busy={busy}
              canReview={canReview}
              onResolve={onResolve}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
