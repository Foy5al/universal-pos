import type { Product, StockMovement } from '@pos/contracts';

import { formatMinor } from '../../lib/money';
import { LOSS_REASON_LABELS, lossValueMinor, removedQuantity } from '../lossLabels';

interface LossLogProps {
  losses: readonly StockMovement[];
  products: readonly Product[];
  locationName: string | null;
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function LossLog({ losses, products, locationName }: LossLogProps) {
  const productById = new Map(products.map((product) => [product.id, product]));

  return (
    <section className="surface min-w-0 p-4" aria-labelledby="loss-log-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="loss-log-heading" className="text-base font-semibold">
            Loss log
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            {locationName ?? 'This location'} · {losses.length} recent
            {losses.length === 1 ? ' entry' : ' entries'}
          </p>
        </div>
      </div>

      {losses.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          No waste, damage or expiry has been recorded here yet.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <caption className="sr-only">Recorded stock losses</caption>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="px-2 py-2 font-medium">When</th>
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium">Reason</th>
                <th className="px-2 py-2 text-right font-medium">Removed</th>
                <th className="px-2 py-2 text-right font-medium">Cost value</th>
                <th className="px-2 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {losses.map((loss) => {
                const product = productById.get(loss.productId);
                const value = lossValueMinor(loss);
                return (
                  <tr
                    key={loss.id}
                    className="border-b border-[var(--color-border)]/60 last:border-0"
                  >
                    <td className="whitespace-nowrap px-2 py-2.5 text-xs text-[var(--color-muted)]">
                      {formatWhen(loss.occurredAt)}
                    </td>
                    <td className="px-2 py-2.5">
                      <p className="font-medium leading-snug">
                        {product?.name ?? 'Unknown product'}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {product?.sku ?? loss.productId}
                      </p>
                    </td>
                    <td className="px-2 py-2.5">
                      <span className="inline-flex rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs">
                        {loss.lossReason ? LOSS_REASON_LABELS[loss.lossReason] : 'Stock loss'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{removedQuantity(loss)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {value === null ? (
                        <span className="text-xs text-[var(--color-muted)]">Cost not set</span>
                      ) : (
                        formatMinor(value)
                      )}
                    </td>
                    <td className="max-w-64 px-2 py-2.5 text-xs text-[var(--color-muted)]">
                      {loss.reason && <p>{loss.reason}</p>}
                      {loss.expiresOn && <p>Expired {loss.expiresOn}</p>}
                      {!loss.reason && !loss.expiresOn && '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
