'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getToken } from './lib/api';

interface ModuleLink {
  href: string;
  title: string;
  description: string;
}

const moduleGroups: Array<{ title: string; summary: string; items: ModuleLink[] }> = [
  {
    title: 'Sell',
    summary: 'The counter experience',
    items: [
      {
        href: '/pos',
        title: 'Point of sale',
        description: 'Scan, take cash, print receipts and work offline.',
      },
    ],
  },
  {
    title: 'Operate',
    summary: 'Products and stock',
    items: [
      {
        href: '/catalog',
        title: 'Catalog',
        description: 'Products, prices, units and per-product low stock alerts.',
      },
      {
        href: '/inventory',
        title: 'Stock control',
        description: 'Stock on hand, losses and live low stock notifications.',
      },
      {
        href: '/purchasing',
        title: 'Purchasing',
        description: 'Suppliers, purchase orders, restock requests and receipts.',
      },
    ],
  },
  {
    title: 'Review',
    summary: 'What happened and what needs attention',
    items: [
      {
        href: '/reports',
        title: 'Reports',
        description: 'Daily sales, refunds, stock activity and shift X/Z reports.',
      },
      {
        href: '/sync',
        title: 'Offline sync',
        description: 'Queued sales, conflicts and enrolled terminals.',
      },
    ],
  },
  {
    title: 'Configure',
    summary: 'Organization-wide defaults',
    items: [
      {
        href: '/settings',
        title: 'System settings',
        description: 'Low stock fallback thresholds and organization defaults.',
      },
    ],
  },
];

const quickLinks = [
  { href: '/pos', label: 'POS' },
  { href: '/catalog', label: 'Catalog' },
  { href: '/inventory', label: 'Stock' },
  { href: '/reports', label: 'Reports' },
  { href: '/settings', label: 'Settings' },
];

export default function HomePage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(getToken()));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 p-4 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Store dashboard</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Every part of the store operation, grouped by what you are trying to do.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-2" aria-label="Dashboard navigation">
            {quickLinks.map((item) => (
              <Link key={item.href} href={item.href} className="btn text-sm">
                {item.label}
              </Link>
            ))}
          </nav>
          {signedIn === false && (
            <Link href="/login" className="btn btn-accent text-sm">
              Sign in
            </Link>
          )}
        </div>
      </header>

      <section className="surface p-6 lg:p-8" aria-labelledby="dashboard-hero-heading">
        <div className="grid items-center gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Start here
            </p>
            <h2 id="dashboard-hero-heading" className="mt-2 text-2xl font-semibold">
              Open the till, or set the store up first.
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[var(--color-muted)]">
              New stores usually start with the catalog, then stock locations and products. Once
              prices and opening stock exist, the POS is ready for a shift.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/pos" className="btn btn-accent text-sm">
                Open the POS
              </Link>
              <Link href="/settings" className="btn text-sm">
                Review system settings
              </Link>
            </div>
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              {signedIn === null
                ? 'Checking your session...'
                : signedIn
                  ? 'You are signed in on this device.'
                  : 'You will be asked to sign in when you open the POS.'}
            </p>
          </div>

          <ol className="space-y-3 rounded-xl border border-[var(--color-border)] p-4 text-sm">
            <li className="flex gap-3">
              <span className="font-semibold text-[var(--color-accent)]">1</span>
              <span>
                <span className="font-medium">Set up the catalog</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  Products, prices and low stock alerts.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-[var(--color-accent)]">2</span>
              <span>
                <span className="font-medium">Receive opening stock</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  Stock locations keep balances and alerts accurate.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-semibold text-[var(--color-accent)]">3</span>
              <span>
                <span className="font-medium">Open a shift and sell</span>
                <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                  Stock, cash and receipts post together.
                </span>
              </span>
            </li>
          </ol>
        </div>
      </section>

      <section className="space-y-6" aria-labelledby="modules-heading">
        <div>
          <h2 id="modules-heading" className="text-xl font-semibold">
            Modules
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Jump straight to the area you need. Organization-wide defaults live under Configure.
          </p>
        </div>

        {moduleGroups.map((group) => (
          <div key={group.title} className="space-y-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                {group.title}
              </h3>
              <p className="text-xs text-[var(--color-muted)]">{group.summary}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="surface group flex flex-col p-5 transition hover:border-[var(--color-focus)]"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-base font-semibold">{item.title}</span>
                    <span
                      aria-hidden="true"
                      className="text-[var(--color-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                    >
                      →
                    </span>
                  </span>
                  <span className="mt-1 text-sm text-[var(--color-muted)]">{item.description}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </section>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4 text-xs text-[var(--color-muted)]">
        <span>Universal POS · offline-first retail operations</span>
        <a
          className="underline"
          href="http://localhost:4000/health"
          target="_blank"
          rel="noreferrer"
        >
          API health
        </a>
      </footer>
    </main>
  );
}
