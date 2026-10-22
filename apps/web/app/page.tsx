import Link from 'next/link';

interface ModuleLink {
  href: string;
  title: string;
  description: string;
}

const quickActions: Array<ModuleLink & { index: string; cta: string }> = [
  {
    index: '01',
    href: '/pos',
    title: 'Start selling',
    description: 'Open the till, scan products and take payment.',
    cta: 'Open POS',
  },
  {
    index: '02',
    href: '/catalog',
    title: 'Products and prices',
    description: 'Add products, set prices and keep the catalog tidy.',
    cta: 'Open catalog',
  },
  {
    index: '03',
    href: '/inventory',
    title: 'Stock on hand',
    description: 'Receive stock, record losses and review low stock alerts.',
    cta: 'Review stock',
  },
  {
    index: '04',
    href: '/admin',
    title: 'Counters and people',
    description: 'Add checkout counters, managers and cashiers.',
    cta: 'Manage team',
  },
];

const setupSteps: Array<ModuleLink & { step: string }> = [
  {
    step: '1',
    href: '/admin',
    title: 'Add a counter and your team',
    description: 'Every checkout needs a counter and a signed-in operator.',
  },
  {
    step: '2',
    href: '/catalog',
    title: 'Load products and opening stock',
    description: 'Prices and stock make the till ready for the first sale.',
  },
  {
    step: '3',
    href: '/pos',
    title: 'Open a shift and sell',
    description: 'Cash, stock and receipts post together at checkout.',
  },
];

const moduleGroups: Array<{ title: string; summary: string; items: ModuleLink[] }> = [
  {
    title: 'Sell',
    summary: 'The counter experience',
    items: [
      {
        href: '/pos',
        title: 'Point of sale',
        description: 'Scan, take cash, print receipts and keep selling offline.',
      },
    ],
  },
  {
    title: 'Operate',
    summary: 'Products, stock and suppliers',
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
    summary: 'People, counters and defaults',
    items: [
      {
        href: '/admin',
        title: 'Team and counters',
        description: 'Checkout counters, manager accounts and per-user permissions.',
      },
      {
        href: '/settings',
        title: 'System settings',
        description: 'Low stock fallback thresholds and organization defaults.',
      },
    ],
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-4 py-8 lg:px-6 lg:py-10">
      <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8 lg:p-10">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full opacity-20 blur-3xl"
          style={{ backgroundColor: 'var(--color-accent)' }}
        />
        <div className="relative grid items-start gap-8 lg:grid-cols-[1.45fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-medium text-[var(--color-muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
              Store command center
            </p>
            <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Run the counter. Keep the books straight.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-muted)]">
              Sell online or offline, keep stock accurate and see the day&apos;s numbers in one
              place. Start at the till, or set up the store first.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Link href="/pos" className="btn btn-accent text-sm">
                Open the POS
                <span aria-hidden="true">→</span>
              </Link>
              <Link href="/admin" className="btn text-sm">
                Add counter or team
              </Link>
              <Link href="/reports" className="btn text-sm">
                View reports
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--color-muted)]">
              Checkout keeps working when the connection drops; sales queue safely and sync when you
              are back online.
            </p>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">First-time setup</h2>
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                3 steps
              </span>
            </div>
            <ol className="mt-3 space-y-3">
              {setupSteps.map((step) => (
                <li key={step.step}>
                  <Link
                    href={step.href}
                    className="group flex gap-3 rounded-lg p-1.5 transition hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] text-xs font-semibold text-[var(--color-accent)]">
                      {step.step}
                    </span>
                    <span>
                      <span className="block text-sm font-medium group-hover:underline">
                        {step.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--color-muted)]">
                        {step.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="quick-actions-heading" className="text-lg font-semibold">
            Jump back in
          </h2>
          <p className="text-xs text-[var(--color-muted)]">The four places you will use most.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="group surface flex min-h-40 flex-col p-5 transition hover:-translate-y-0.5 hover:border-[var(--color-focus)]"
            >
              <span className="text-xs font-semibold tracking-[0.18em] text-[var(--color-muted)]">
                {action.index}
              </span>
              <span className="mt-2 text-base font-semibold">{action.title}</span>
              <span className="mt-1 text-sm leading-5 text-[var(--color-muted)]">
                {action.description}
              </span>
              <span className="mt-auto pt-4 text-xs font-semibold text-[var(--color-accent)]">
                {action.cta}
                <span
                  aria-hidden="true"
                  className="ml-1 inline-block transition group-hover:translate-x-0.5"
                >
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="modules-heading" className="space-y-4">
        <div>
          <h2 id="modules-heading" className="text-lg font-semibold">
            All modules
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Every part of the store operation, grouped by what you are trying to do.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {moduleGroups.map((group) => (
            <div key={group.title} className="surface p-5">
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="text-xs text-[var(--color-muted)]">{group.summary}</p>
              </div>
              <div className="mt-3 divide-y divide-[var(--color-border)]">
                {group.items.map((item) => (
                  <Link
                    key={`${group.title}-${item.href}`}
                    href={item.href}
                    className="group flex items-center justify-between gap-3 py-3"
                  >
                    <span>
                      <span className="block text-sm font-medium group-hover:underline">
                        {item.title}
                      </span>
                      <span className="mt-0.5 block text-xs leading-5 text-[var(--color-muted)]">
                        {item.description}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="text-[var(--color-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--color-accent)]"
                    >
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
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
