'use client';

import type {
  Product,
  PurchaseOrder,
  PurchaseOrderStatus,
  StockLocation,
  Supplier,
} from '@pos/contracts';
import { useMemo, useState } from 'react';

import { formatMinor, parseQuantity } from '../../lib/money';

interface PurchaseOrdersPanelProps {
  orders: readonly PurchaseOrder[];
  products: readonly Product[];
  suppliers: readonly Supplier[];
  locations: readonly StockLocation[];
  busy: boolean;
  canManage: boolean;
  selectedOrderId: string | null;
  onStatus: (orderId: string, status: 'ordered' | 'cancelled') => Promise<PurchaseOrder>;
  onReceive: (order: PurchaseOrder) => void;
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  ordered: 'Ordered',
  partially_received: 'Partly received',
  received: 'Received',
  cancelled: 'Cancelled',
};

function statusClass(status: PurchaseOrderStatus): string {
  if (status === 'received') return 'text-[var(--color-accent)]';
  if (status === 'cancelled') return 'text-[var(--color-destructive)]';
  if (status === 'ordered' || status === 'partially_received') {
    return 'text-[var(--color-foreground)]';
  }
  return 'text-[var(--color-muted)]';
}

function remainingQuantity(orderLine: PurchaseOrder['lines'][number]): number {
  const ordered = parseQuantity(orderLine.quantity) ?? 0;
  const received = parseQuantity(orderLine.receivedQuantity) ?? 0;
  return Math.max(0, (ordered - received) / 10_000);
}

export function PurchaseOrdersPanel({
  orders,
  products,
  suppliers,
  locations,
  busy,
  canManage,
  selectedOrderId,
  onStatus,
  onReceive,
}: PurchaseOrdersPanelProps) {
  const [filter, setFilter] = useState<'all' | 'open' | 'received'>('all');
  const [error, setError] = useState<string | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const supplierById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );
  const visible = orders.filter((order) => {
    if (filter === 'open') {
      return (
        order.status === 'draft' ||
        order.status === 'ordered' ||
        order.status === 'partially_received'
      );
    }
    if (filter === 'received') return order.status === 'received';
    return true;
  });

  async function changeStatus(orderId: string, status: 'ordered' | 'cancelled') {
    if (status === 'cancelled' && !window.confirm('Cancel this purchase order?')) return;
    setError(null);
    try {
      await onStatus(orderId, status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update the order.');
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="orders-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="orders-heading" className="text-base font-semibold">
            Purchase orders
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Receive goods here; stock is posted immediately.
          </p>
        </div>
        <label className="text-xs text-[var(--color-muted)]">
          Show
          <select
            className="field ml-2 inline-block w-auto py-1.5"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">All orders</option>
            <option value="open">Open orders</option>
            <option value="received">Received</option>
          </select>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {visible.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          {orders.length === 0
            ? 'No purchase orders yet. Create the first draft on the left.'
            : 'No orders match this filter.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-3" aria-label="Purchase orders">
          {visible.map((order) => {
            const open =
              order.status === 'ordered' || order.status === 'partially_received';
            return (
              <li
                key={order.id}
                className={`rounded-lg border p-3 ${
                  order.id === selectedOrderId
                    ? 'border-[var(--color-focus)]'
                    : 'border-[var(--color-border)]'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      PO {order.id.slice(0, 8)}{' '}
                      <span className={`text-xs font-medium ${statusClass(order.status)}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {supplierById.get(order.supplierId) ?? 'Unknown supplier'} ·{' '}
                      {locationById.get(order.locationId) ?? 'Unknown location'} ·{' '}
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="font-semibold">{formatMinor(order.totalMinor)}</span>
                </div>

                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-[var(--color-muted)]">
                    {order.lines.length} line{order.lines.length === 1 ? '' : 's'}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {order.lines.map((line) => {
                      const product = productById.get(line.productId);
                      return (
                        <li key={line.id} className="flex justify-between gap-3 text-xs">
                          <span>
                            {product?.name ?? line.productId}
                            <span className="text-[var(--color-muted)]">
                              {' '}
                              {line.receivedQuantity}/{line.quantity} received
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {formatMinor(line.unitCostMinor)} × {line.quantity}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>

                {canManage && (open || order.status === 'draft') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {order.status === 'draft' && (
                      <button
                        type="button"
                        className="btn px-3 py-1.5 text-xs"
                        onClick={() => changeStatus(order.id, 'ordered')}
                        disabled={busy}
                      >
                        Mark ordered
                      </button>
                    )}
                    {open && (
                      <button
                        type="button"
                        className="btn btn-accent px-3 py-1.5 text-xs"
                        onClick={() => onReceive(order)}
                        disabled={busy}
                      >
                        Receive GRN
                      </button>
                    )}
                    {(order.status === 'draft' || order.status === 'ordered') && (
                      <button
                        type="button"
                        className="btn px-3 py-1.5 text-xs text-[var(--color-destructive)]"
                        onClick={() => changeStatus(order.id, 'cancelled')}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}

                {open && (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">
                    Outstanding:{' '}
                    {order.lines
                      .map((line) => remainingQuantity(line))
                      .reduce((total, quantity) => total + quantity, 0)}{' '}
                    units
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
