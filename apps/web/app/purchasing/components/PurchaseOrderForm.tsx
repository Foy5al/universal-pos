'use client';

import type { CreatePurchaseOrderRequest, Product, PurchaseOrder, StockLocation, Supplier } from '@pos/contracts';
import { useEffect, useMemo, useState, type FormEvent } from 'react';

import { formatMinor, lineTotalMinor, parseQuantity } from '../../lib/money';
import { parseMoneyMinor } from '../../pos/types';

interface PurchaseOrderFormProps {
  suppliers: readonly Supplier[];
  locations: readonly StockLocation[];
  products: readonly Product[];
  busy: boolean;
  onCreate: (input: CreatePurchaseOrderRequest) => Promise<PurchaseOrder>;
}

interface DraftLine {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

function emptyLine(): DraftLine {
  return { id: crypto.randomUUID(), productId: '', quantity: '1', unitCost: '' };
}

export function PurchaseOrderForm({
  suppliers,
  locations,
  products,
  busy,
  onCreate,
}: PurchaseOrderFormProps) {
  const [supplierId, setSupplierId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  useEffect(() => {
    if (!supplierId && suppliers.length > 0) setSupplierId(suppliers[0]?.id ?? '');
  }, [supplierId, suppliers]);

  useEffect(() => {
    if (!locationId && locations.length > 0) setLocationId(locations[0]?.id ?? '');
  }, [locationId, locations]);

  function updateLine(id: string, change: Partial<DraftLine>) {
    setLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...change } : line)),
    );
  }

  function changeProduct(line: DraftLine, productId: string) {
    const costMinor = productById.get(productId)?.costMinor;
    updateLine(line.id, {
      productId,
      ...(line.unitCost === '' && costMinor != null
        ? { unitCost: (costMinor / 100).toFixed(2) }
        : {}),
    });
  }

  const totals = lines.map((line) => {
    const quantity = parseQuantity(line.quantity);
    const unitCost = parseMoneyMinor(line.unitCost);
    return quantity !== null && unitCost !== null ? lineTotalMinor(unitCost, quantity) : null;
  });
  const totalMinor = totals.reduce<number>((total, value) => total + (value ?? 0), 0);
  const valid =
    supplierId !== '' &&
    locationId !== '' &&
    lines.length > 0 &&
    lines.every((line) => line.productId !== '') &&
    totals.every((value) => value !== null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError('Choose a supplier, location, product and valid quantity/cost for every line.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const order = await onCreate({
        supplierId,
        locationId,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        lines: lines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitCostMinor: parseMoneyMinor(line.unitCost) ?? 0,
        })),
      });
      setLines([emptyLine()]);
      setNotes('');
      setSuccess(
        `Draft ${order.id.slice(0, 8)} created. Mark it ordered before receiving stock.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the purchase order.');
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="new-order-heading">
      <h2 id="new-order-heading" className="text-base font-semibold">
        New purchase order
      </h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Create a draft, mark it ordered, then record goods received.
      </p>

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

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-muted)]">Receive into</span>
          <select
            className="field"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={busy || locations.length === 0}
          >
            {locations.length === 0 && <option value="">No stock locations</option>}
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--color-muted)]">Order lines</span>
            <button
              type="button"
              className="btn px-2 py-1 text-xs"
              onClick={() => setLines((current) => [...current, emptyLine()])}
              disabled={busy}
            >
              Add line
            </button>
          </div>
          {lines.map((line, index) => (
            <div
              key={line.id}
              className="space-y-2 rounded-lg border border-[var(--color-border)] p-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[var(--color-muted)]">
                  Line {index + 1}
                </span>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--color-destructive)] disabled:opacity-40"
                  onClick={() =>
                    setLines((current) => current.filter((candidate) => candidate.id !== line.id))
                  }
                  disabled={busy || lines.length === 1}
                >
                  Remove
                </button>
              </div>
              <label className="block text-xs text-[var(--color-muted)]">
                Product
                <select
                  className="field mt-1"
                  value={line.productId}
                  onChange={(event) => changeProduct(line, event.target.value)}
                  disabled={busy}
                >
                  <option value="">Choose product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} ({product.sku})
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-[var(--color-muted)]">
                  Quantity
                  <input
                    className="field mt-1 text-right"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
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
                    onChange={(event) => updateLine(line.id, { unitCost: event.target.value })}
                    disabled={busy}
                  />
                </label>
              </div>
              <p className="text-right text-xs text-[var(--color-muted)]">
                Line total {totals[index] === null ? '—' : formatMinor(totals[index] ?? 0)}
              </p>
            </div>
          ))}
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-[var(--color-muted)]">Notes (optional)</span>
          <input
            className="field"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={400}
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
        {success && (
          <p role="status" className="text-sm text-[var(--color-accent)]">
            {success}
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
