import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 p-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
          Universal POS
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">
          One till, every retail format.
        </h1>
        <p className="mt-3 max-w-xl text-[var(--color-muted)]">
          Catalog, stock control, purchasing and cash checkout are live. Sales and stock losses post
          a ledger movement, and cash sales post a receipt in the same transaction.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/pos"
          className="surface block p-5 transition hover:border-[var(--color-focus)]"
        >
          <h2 className="text-lg font-semibold">Open the POS</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Scan products, take cash and print a receipt.
          </p>
        </Link>
        <Link
          href="/catalog"
          className="surface block p-5 transition hover:border-[var(--color-focus)]"
        >
          <h2 className="text-lg font-semibold">Manage the catalog</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Add products, prices and opening stock.
          </p>
        </Link>
        <Link
          href="/purchasing"
          className="surface block p-5 transition hover:border-[var(--color-focus)]"
        >
          <h2 className="text-lg font-semibold">Buy and receive stock</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Suppliers, purchase orders and goods receipts.
          </p>
        </Link>
        <Link
          href="/inventory"
          className="surface block p-5 transition hover:border-[var(--color-focus)]"
        >
          <h2 className="text-lg font-semibold">Control stock</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Record waste, damage and expiry, and review stock by location.
          </p>
        </Link>
        <Link
          href="/reports"
          className="surface block p-5 transition hover:border-[var(--color-focus)]"
        >
          <h2 className="text-lg font-semibold">View sales reports</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Daily totals, refunds and shift X/Z reports.
          </p>
        </Link>
        <Link
          href="/login"
          className="surface block p-5 transition hover:border-[var(--color-focus)]"
        >
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Cashier and manager sessions are issued by the API.
          </p>
        </Link>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        API health: <code>http://localhost:4000/health</code>
      </p>
    </main>
  );
}
