import type { UnsyncedSaleCounts } from '@pos/offline';
import Link from 'next/link';

function describeCounts(counts: UnsyncedSaleCounts): string {
  const parts: string[] = [];
  if (counts.pending > 0) parts.push(`${counts.pending} waiting to sync`);
  if (counts.retryable > 0) parts.push(`${counts.retryable} retrying`);
  if (counts.needsReview > 0) {
    parts.push(counts.needsReview === 1 ? '1 needs review' : `${counts.needsReview} need review`);
  }
  if (counts.rejected > 0) parts.push(`${counts.rejected} rejected`);
  return parts.join(' · ');
}

export function SyncBadge({ counts }: { counts: UnsyncedSaleCounts }) {
  if (counts.total === 0) return null;

  const label = `${counts.total} unsynced sale${counts.total === 1 ? '' : 's'} — ${describeCounts(
    counts,
  )}`;

  return (
    <Link
      href="/sync"
      className={`sync-badge${counts.needsAttention > 0 ? ' sync-badge-alert' : ''}`}
      aria-label={`${label}. Open sync review.`}
      title={label}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 16.5a4 4 0 0 1-.6-7.9A5.5 5.5 0 0 1 17 9.2a3.9 3.9 0 0 1 .5 7.3H7Z" />
        <path d="M12 20v-7m0 0-2.5 2.5M12 13l2.5 2.5" />
      </svg>
      <span aria-hidden="true" className="tabular-nums">
        {counts.total > 99 ? '99+' : counts.total}
      </span>
    </Link>
  );
}
