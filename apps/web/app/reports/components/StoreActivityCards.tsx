import type { StoreActivity } from '@pos/contracts';

import { formatMinor } from '../../lib/money';

function missingCostNote(count: number): string | null {
  return count === 0 ? null : `${count} entries have no recorded cost.`;
}

export function StoreActivityCards({ activity }: { activity: StoreActivity }) {
  const lossNote = missingCostNote(activity.losses.missingCostCount);
  const receiptNote = missingCostNote(activity.receiving.missingCostCount);

  return (
    <section aria-label="Store activity" className="grid gap-3 sm:grid-cols-2">
      <div className="surface p-4">
        <p className="text-xs text-[var(--color-muted)]">Stock losses at recorded cost</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatMinor(activity.losses.costValueMinor)}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {activity.losses.units} units | {activity.losses.count} entries
        </p>
        {lossNote && <p className="mt-1 text-xs text-[var(--color-muted)]">{lossNote}</p>}
      </div>
      <div className="surface p-4">
        <p className="text-xs text-[var(--color-muted)]">Goods received at purchase cost</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {formatMinor(activity.receiving.costValueMinor)}
        </p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {activity.receiving.units} units | {activity.receiving.count} entries
        </p>
        {receiptNote && <p className="mt-1 text-xs text-[var(--color-muted)]">{receiptNote}</p>}
      </div>
      <p className="text-xs text-[var(--color-muted)] sm:col-span-2">
        Operational summary using recorded cost snapshots. It is not a double-entry ledger and does
        not include expenses, tax or statutory accounting.
      </p>
    </section>
  );
}
