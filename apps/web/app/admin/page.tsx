'use client';

import { CounterPanel } from './components/CounterPanel';
import { StaffPanel } from './components/StaffPanel';
import { useAdmin } from './useAdmin';

export default function AdminPage() {
  const admin = useAdmin();

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-5 p-4 lg:p-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
          Universal POS
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Team and counters</h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
          Set up the checkout counters, invite managers and cashiers, and adjust what each person is
          allowed to do.
        </p>
      </header>

      {admin.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {admin.error}
        </p>
      )}

      {admin.loading ? (
        <p role="status" className="surface p-8 text-center text-sm text-[var(--color-muted)]">
          Loading counters and team...
        </p>
      ) : (
        <div className="space-y-5">
          {admin.canReadCounters ? (
            <CounterPanel
              registers={admin.registers}
              stores={admin.stores}
              canManage={admin.canManageCounters}
              onAdd={admin.addCounter}
            />
          ) : (
            <section className="surface p-5" aria-labelledby="counters-heading">
              <h2 id="counters-heading" className="text-lg font-semibold">
                Counters
              </h2>
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                Your role cannot view checkout counters.
              </p>
            </section>
          )}

          <StaffPanel
            staff={admin.staff}
            stores={admin.stores}
            canRead={admin.canReadStaff}
            canManage={admin.canManageStaff}
            currentUserId={admin.session?.userId ?? null}
            onAdd={admin.addStaffMember}
            onSavePermissions={async (userId, permissions) => {
              await admin.updatePermissions(userId, permissions);
            }}
          />
        </div>
      )}
    </main>
  );
}
