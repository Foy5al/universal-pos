'use client';

import Link from 'next/link';

import { ConflictReviewPanel } from './components/ConflictReviewPanel';
import { DevicePanel } from './components/DevicePanel';
import { useSyncAdmin } from './useSyncAdmin';

export default function SyncAdminPage() {
  const data = useSyncAdmin();

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Sync review</h1>
          <p className="text-xs text-[var(--color-muted)]">
            Reconcile offline sales that need a manager decision and manage enrolled terminals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn text-sm"
            onClick={() => {
              void data.refresh();
            }}
            disabled={data.loading}
          >
            Refresh
          </button>
          <Link href="/pos" className="btn text-sm">
            POS
          </Link>
          <Link href="/reports" className="btn text-sm">
            Reports
          </Link>
          <Link href="/settings" className="btn text-sm">
            Settings
          </Link>
          <Link href="/" className="btn text-sm">
            Home
          </Link>
        </div>
      </header>

      {data.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {data.error}
        </p>
      )}
      {data.notice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-accent)]/50 p-3 text-sm text-[var(--color-accent)]"
        >
          {data.notice}
        </p>
      )}

      {data.loading ? (
        <p className="p-8 text-center text-sm text-[var(--color-muted)]">
          Loading offline sales and terminals...
        </p>
      ) : (
        <>
          <ConflictReviewPanel
            conflicts={data.conflicts}
            devices={data.devices}
            busy={data.busy}
            canReview={data.canReview}
            onResolve={data.resolve}
          />
          {data.canReadDevices && (
            <DevicePanel
              devices={data.devices}
              busy={data.busy}
              canManage={data.canManageDevices}
              onRevoke={data.revoke}
            />
          )}
        </>
      )}

      <p className="text-xs text-[var(--color-muted)]">
        Retrying reposts the terminal&apos;s captured prices and deduplicates by operation id, so a
        successful retry cannot charge or debit stock twice. Dismissing records a rejected
        operation; settle the cash outside this screen.
      </p>
    </main>
  );
}
