'use client';

import Link from 'next/link';

interface PosHeaderProps {
  userLabel: string;
  onSignOut: () => void;
}

export function PosHeader({ userLabel, onSignOut }: PosHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">Universal POS</h1>
        <p className="text-xs text-[var(--color-muted)]">{userLabel}</p>
      </div>
      <nav className="flex flex-wrap items-center gap-3" aria-label="Sections">
        <Link href="/catalog" className="btn text-sm">
          Catalog
        </Link>
        <Link href="/purchasing" className="btn text-sm">
          Purchasing
        </Link>
        <Link href="/inventory" className="btn text-sm">
          Stock
        </Link>
        <Link href="/reports" className="btn text-sm">
          Reports
        </Link>
        <button type="button" className="btn text-sm" onClick={onSignOut}>
          Sign out
        </button>
      </nav>
    </header>
  );
}
