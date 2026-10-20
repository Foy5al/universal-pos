'use client';

import type {
  CreatePurchaseOrderRequest,
  Product,
  PurchaseOrder,
  RestockRequest,
  StockLocation,
  Supplier,
} from '@pos/contracts';
import { useState, type FormEvent } from 'react';

import { formatMinor, lineTotalMinor, parseQuantity } from '../../lib/money';
import { parseMoneyMinor } from '../../pos/types';

interface RestockOrderFormProps {
  requests: readonly RestockRequest[];
  products: readonly Product[];
  suppliers: readonly Supplier[];
  locations: readonly StockLocation[];
  busy: boolean;
  onCreate: (input: CreatePurchaseOrderRequest) => Promise<PurchaseOrder>;
  onCancel: () => void;
}

interface DraftLine {
  requestId: string;
  productId: string;
  name: string;
  sku: string;
  quantity: string;
  unitCost: string;
}

function buildLines(
  requests: readonly RestockRequest[],
  productById: ReadonlyMap<string, Product>,
): DraftLine[] {
  return requests.map((request) => {
    const product = productById.get(request.productId);
    return {
      requestId: request.id,
      productId: request.productId,
      name: product?.name ?? request.productId,
      sku: product?.sku ?? '',
      quantity: request.requestedQuantity,
      unitCost: product?.costMinor != null ? (product.costMinor / 100).toFixed(2) : '',
    };
  });
}

export function RestockOrderForm({
  requests,
  products,
  suppliers,
  locations,
  busy,
  onCreate,
  onCancel,
}: RestockOrderFormProps) {
  const productById = new Map(products.map((product) => [product.id, product]));
  const locationId = requests[0]?.locationId ?? '';
  const locationName =
    locations.find((location) => location.id === locationId)?.name ?? 'Selected location';
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>(() => buildLines(requests, productById));
  const [error, setError] = useState<string | null>(null);

  const totals = lines.map((line) => {
    const quantity = parseQuantity(line.quantity);
    const unitCost = parseMoneyMinor(line.unitCost);
    return quantity !== null && unitCost !== null ? lineTotalMinor(unitCost, quantity) : null;
  });
  const totalMinor = totals.reduce<number>((total, value) => total + (value ?? 0), 0);
  const valid =
    supplierId !== '' &&
    requests.length > 0 &&
    lines.length > 0 &&
    totals.every((value) => value !== null);

  function updateLine(requestId: string, change: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.requestId === requestId ? { ...line, ...change } : line)),
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError('Choose a supplier and enter a valid quantity and unit cost for every line.');
      return;
    }
    setError(null);
    try {
      await onCreate({
        supplierId,
        locationId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        restockRequestIds: requests.map((request) => request.id),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitCostMinor: parseMoneyMinor(line.unitCost) ?? 0,
        })),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the purchase order.');
    }
  }

  return (
    <section
      className="surface border-[var(--color-focus)] p-4"
      aria-labelledby="restock-order-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="restock-order-heading" className="text-base font-semibold">
            Purchase order from restock requests
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            {requests.length} request{requests.length === 1 ? '' : 's'} for {locationName}.
            Quantities and costs from the request and product cost are pre-filled.
          </p>
        </div>
        <button
          type="button"
          className="btn px-3 py-1.5 text-xs"
          onClick={onCancel}
          disabled={busy}
        >
          Back
        </button>
      </div>

      <form className="mt-3 space-y-3" onSubmit={submit}>
        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-muted)]">Supplier</span>
          <select
            className="field"
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            disabled={busy || suppliers.length === 0}
          >
            {suppliers.length === 0 && <option value="">Add a supplier first</option>}
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          {lines.map((line, index) => (
            <div
              key={line.requestId}
              className="rounded-lg border border-[var(--color-border)] p-2"
            >
              <p className="text-sm font-semibold">
                {line.name}
                <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                  {line.sku}
                </span>
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="block text-xs text-[var(--color-muted)]">
                  Quantity
                  <input
                    className="field mt-1 text-right"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.requestId, { quantity: event.target.value })
                    }
                    disabled={busy}
                  />
                </label>
                <label className="block text-xs text-[var(--color-muted)]">
                  Unit cost
                  <input
                    className="field mt-1 text-right"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.unitCost}
                    onChange={(event) =>
                      updateLine(line.requestId, { unitCost: event.target.value })
                    }
                    disabled={busy}
                  />
                </label>
              </div>
              <p className="mt-1 text-right text-xs text-[var(--color-muted)]">
                Line {index + 1} total{' '}
                {totals[index] === null ? '—' : formatMinor(totals[index] ?? 0)}
              </p>
            </div>
          ))}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-muted)]">Notes (optional)</span>
          <input
            className="field"
            value={notes}
            maxLength={400}
            onChange={(event) => setNotes(event.target.value)}
            disabled={busy}
          />
        </label>

        <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
          <span className="text-sm text-[var(--color-muted)]">Order total</span>
          <span className="text-lg font-semibold">{formatMinor(totalMinor)}</span>
        </div>

        {error && (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-accent w-full justify-center"
          disabled={busy || !valid}
        >
          {busy ? 'Creating...' : 'Create draft purchase order'}
        </button>
      </form>
    </section>
  );
}
