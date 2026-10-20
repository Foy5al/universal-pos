'use client';

import type { SyncSummary } from '@pos/offline';

interface SyncStatusBarProps {
  online: boolean;
  syncing: boolean;
  summary: SyncSummary;
  lastSyncedAt: string | null;
  error: string | null;
  onRetry: () => void;
}

function formatTime(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleTimeString();
}

export function SyncStatusBar({
  online,
  syncing,
  summary,
  lastSyncedAt,
  error,
  onRetry,
}: SyncStatusBarProps) {
  const queued = summary.pending + summary.retryable;

  return (
    <div className="surface flex flex-wrap items-center gap-3 px-3 py-2 text-xs">
      <span role="status" className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${
            online ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-destructive)]'
          }`}
        />
        {online ? (syncing ? 'Syncing...' : 'Online') : 'Offline - sales are saved locally'}
      </span>
      {queued > 0 && <span>{queued} queued</span>}
      {summary.needsReview > 0 && (
        <span className="text-[var(--color-destructive)]">{summary.needsReview} need review</span>
      )}
      {summary.rejected > 0 && (
        <span className="text-[var(--color-destructive)]">{summary.rejected} rejected</span>
      )}
      <span className="text-[var(--color-muted)]">Last sync: {formatTime(lastSyncedAt)}</span>
      <button
        type="button"
        className="btn ml-auto text-xs"
        onClick={onRetry}
        disabled={!online || syncing}
      >
        Retry sync
      </button>
      {error && (
        <span role="alert" className="w-full text-[var(--color-destructive)]">
          {error}
        </span>
      )}
    </div>
  );
}
