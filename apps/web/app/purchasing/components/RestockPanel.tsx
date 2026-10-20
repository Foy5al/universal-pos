'use client';

import type { Product, RestockRequest, RestockRequestStatus, StockLocation } from '@pos/contracts';
import { useEffect, useMemo, useState } from 'react';

interface RestockPanelProps {
  requests: readonly RestockRequest[];
  products: readonly Product[];
  locations: readonly StockLocation[];
  busy: boolean;
  canManage: boolean;
  onCreateOrder: (requests: RestockRequest[]) => void;
  onDismiss: (id: string) => Promise<void>;
}

const STATUS_LABELS: Record<RestockRequestStatus, string> = {
  pending: 'Pending review',
  scheduled: 'Purchase order raised',
  fulfilled: 'Received',
  dismissed: 'Dismissed',
};

type Filter = 'pending' | 'scheduled' | 'fulfilled' | 'all';

export function RestockPanel({
  requests,
  products,
  locations,
  busy,
  canManage,
  onCreateOrder,
  onDismiss,
}: RestockPanelProps) {
  const [filter, setFilter] = useState<Filter>('pending');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );

  useEffect(() => {
    setSelected((current) => {
      const next = new Set(
        [...current].filter(
          (id) => requests.find((request) => request.id === id)?.status === 'pending',
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [requests]);

  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const visible = requests.filter((request) => {
    if (filter === 'all') return true;
    return request.status === filter;
  });
  const selectedRequests = requests.filter((request) => selected.has(request.id));
  const selectedLocationIds = new Set(selectedRequests.map((request) => request.locationId));
  const selectionReady = canManage && selectedRequests.length > 0 && selectedLocationIds.size === 1;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function dismiss(request: RestockRequest) {
    if (
      !window.confirm(
        `Dismiss the restock request for ${productById.get(request.productId)?.name ?? 'this product'}?`,
      )
    ) {
      return;
    }
    setError(null);
    try {
      await onDismiss(request.id);
      setSelected((current) => {
        const next = new Set(current);
        next.delete(request.id);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not dismiss the request.');
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="restock-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="restock-heading" className="text-base font-semibold">
            Restock requests
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            Raised by the till when a product is out of stock. Select pending requests from one
            location to raise a purchase order, then receive the GRN when goods arrive.
          </p>
        </div>
        <label className="text-xs text-[var(--color-muted)]">
          Show
          <select
            className="field ml-2 inline-block w-auto py-1.5"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            <option value="pending">Pending ({pendingCount})</option>
            <option value="scheduled">With purchase order</option>
            <option value="fulfilled">Received</option>
            <option value="all">All requests</option>
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
          {filter === 'pending'
            ? 'No pending restock requests. Cashiers can raise one from an out-of-stock tile at the till.'
            : 'No requests match this filter.'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Restock requests">
          {visible.map((request) => {
            const product = productById.get(request.productId);
            const isPending = request.status === 'pending';
            return (
              <li key={request.id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {canManage && isPending && (
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={selected.has(request.id)}
                        onChange={() => toggle(request.id)}
                        aria-label={`Select restock request for ${product?.name ?? request.productId}`}
                      />
                    )}
                    <div>
                      <p className="text-sm font-semibold">
                        {product?.name ?? request.productId}
                        <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                          {product?.sku ?? ''}
                        </span>
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {request.requestedQuantity} requested ·{' '}
                        {locationById.get(request.locationId) ?? 'Unknown location'} ·{' '}
                        {request.requestedByName} · {new Date(request.createdAt).toLocaleString()}
                      </p>
                      {request.note && (
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                          Note: {request.note}
                        </p>
                      )}
                      {request.purchaseOrderId && (
                        <p className="mt-1 text-xs text-[var(--color-muted)]">
                          Purchase order {request.purchaseOrderId.slice(0, 8)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{STATUS_LABELS[request.status]}</span>
                    {canManage && isPending && (
                      <button
                        type="button"
                        className="btn px-2 py-1 text-xs text-[var(--color-destructive)]"
                        onClick={() => {
                          void dismiss(request);
                        }}
                        disabled={busy}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3">
          <span className="text-xs text-[var(--color-muted)]">
            {selectedRequests.length} selected
            {selectedLocationIds.size > 1 ? ' - select requests from one location' : ''}
          </span>
          <button
            type="button"
            className="btn btn-accent px-3 py-1.5 text-xs"
            onClick={() => onCreateOrder(selectedRequests)}
            disabled={busy || !selectionReady}
          >
            Create purchase order
          </button>
        </div>
      )}
    </section>
  );
}
