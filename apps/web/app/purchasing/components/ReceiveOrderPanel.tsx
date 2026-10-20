'use client';

import type {
  Product,
  PurchaseOrder,
  PurchaseReceiveResult,
  ReceivePurchaseOrderRequest,
} from '@pos/contracts';
import { useMemo, useState, type FormEvent } from 'react';

import { parseQuantity } from '../../lib/money';

interface ReceiveOrderPanelProps {
  order: PurchaseOrder;
  products: readonly Product[];
  busy: boolean;
  onReceive: (input: ReceivePurchaseOrderRequest) => Promise<PurchaseReceiveResult>;
  onClose: () => void;
}

interface ReceiveLine {
  lineId: string;
  productName: string;
  ordered: string;
  received: string;
  remainingScaled: number;
  quantity: string;
}

function formatScaled(value: number): string {
  return (value / 10_000).toFixed(4).replace(/\.?0+$/, '');
}

export function ReceiveOrderPanel({
  order,
  products,
  busy,
  onReceive,
  onClose,
}: ReceiveOrderPanelProps) {
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const [lines, setLines] = useState<ReceiveLine[]>(() =>
    order.lines
      .map((line) => {
        const ordered = parseQuantity(line.quantity) ?? 0;
        const received = parseQuantity(line.receivedQuantity) ?? 0;
        const remainingScaled = Math.max(0, ordered - received);
        return {
          lineId: line.id,
          productName: productById.get(line.productId)?.name ?? line.productId,
          ordered: line.quantity,
          received: line.receivedQuantity,
          remainingScaled,
          quantity: formatScaled(remainingScaled),
        };
      })
      .filter((line) => line.remainingScaled > 0),
  );
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selected = lines
      .map((line) => ({ line, scaled: parseQuantity(line.quantity) }))
      .filter((entry) => entry.scaled !== null && entry.scaled > 0);
    if (selected.length === 0) {
      setError('Enter a quantity for at least one line.');
      return;
    }
    if (selected.some((entry) => (entry.scaled ?? 0) > entry.line.remainingScaled)) {
      setError('A received quantity is greater than the outstanding quantity.');
      return;
    }
    setError(null);
    try {
      await onReceive({
        lines: selected.map((entry) => ({
          purchaseOrderLineId: entry.line.lineId,
          quantity: entry.line.quantity,
        })),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not receive this order.');
    }
  }

  return (
    <section className="surface border-[var(--color-focus)] p-4" aria-labelledby="receive-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="receive-heading" className="text-base font-semibold">
            Receive goods — PO {order.id.slice(0, 8)}
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            This posts stock movements. Reduce a quantity before posting if goods are missing or
            damaged.
          </p>
        </div>
        <button type="button" className="btn px-3 py-1.5 text-xs" onClick={onClose}>
          Close
        </button>
      </div>

      <form className="mt-3 space-y-3" onSubmit={submit}>
        {lines.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">Nothing outstanding on this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">Receive purchase order lines</caption>
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 text-right font-medium">Ordered</th>
                  <th className="px-2 py-2 text-right font-medium">Already received</th>
                  <th className="px-2 py-2 text-right font-medium">Receive now</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={line.lineId} className="border-b border-[var(--color-border)]/60">
                    <td className="px-2 py-2">{line.productName}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{line.ordered}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{line.received}</td>
                    <td className="px-2 py-2">
                      <label className="block text-right">
                        <span className="sr-only">
                          Receive quantity for {line.productName}, line {index + 1}
                        </span>
                        <input
                          className="field w-28 py-1.5 text-right"
                          inputMode="decimal"
                          value={line.quantity}
                          onChange={(event) =>
                            setLines((current) =>
                              current.map((candidate) =>
                                candidate.lineId === line.lineId
                                  ? { ...candidate, quantity: event.target.value }
                                  : candidate,
                              ),
                            )
                          }
                          disabled={busy}
                        />
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-muted)]">Receipt notes (optional)</span>
          <input
            className="field"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={400}
            disabled={busy}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className="btn btn-accent px-4 py-2 text-sm"
            disabled={busy || lines.length === 0}
          >
            {busy ? 'Posting receipt...' : 'Post goods receipt'}
          </button>
          <button type="button" className="btn px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
