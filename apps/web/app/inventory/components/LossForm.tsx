'use client';

import type { CreateStockLossRequest, Product, StockLossReason } from '@pos/contracts';
import { useState } from 'react';

import { formatMinor, parseQuantity } from '../../lib/money';
import { LOSS_REASON_OPTIONS } from '../lossLabels';

interface LossFormProps {
  locationId: string;
  products: readonly Product[];
  stockByProduct: ReadonlyMap<string, string>;
  canAdjust: boolean;
  busy: boolean;
  onSubmit: (input: CreateStockLossRequest) => Promise<unknown>;
}

export function LossForm({
  locationId,
  products,
  stockByProduct,
  canAdjust,
  busy,
  onSubmit,
}: LossFormProps) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState<StockLossReason>('damaged');
  const [note, setNote] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeProducts = products.filter((product) => product.isActive);
  const product = activeProducts.find((item) => item.id === productId) ?? null;
  const stock = product ? (stockByProduct.get(product.id) ?? '0') : '0';
  const stockNumber = Number(stock);
  const scaledQuantity = parseQuantity(quantity);
  const estimatedMinor =
    product?.costMinor !== null && product?.costMinor !== undefined && scaledQuantity !== null
      ? Math.round((product.costMinor * scaledQuantity) / 10_000)
      : null;
  const blockedByStock =
    product !== null && scaledQuantity !== null && scaledQuantity / 10_000 > stockNumber;

  async function submit() {
    setError(null);
    setSuccess(null);
    if (!locationId || !product) {
      setError('Choose a stock location and product.');
      return;
    }
    if (scaledQuantity === null) {
      setError('Enter a quantity greater than zero with up to four decimals.');
      return;
    }
    if (blockedByStock) {
      setError(`Only ${stock} ${product.name} in stock at this location.`);
      return;
    }
    if (reason === 'expired' && !expiresOn) {
      setError('Choose the date this stock expired.');
      return;
    }

    try {
      await onSubmit({
        locationId,
        productId: product.id,
        quantity: quantity.trim(),
        reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(expiresOn ? { expiresOn } : {}),
      });
      setSuccess(`${quantity.trim()} ${product.name} removed from stock.`);
      setQuantity('1');
      setNote('');
      setExpiresOn('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record this loss.');
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="loss-form-heading">
      <h2 id="loss-form-heading" className="text-base font-semibold">
        Record waste or damage
      </h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        The quantity leaves stock immediately. Value is shown at the product cost, when set.
      </p>

      {!canAdjust ? (
        <p className="mt-4 rounded-lg border border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
          Your role can view stock but cannot record losses.
        </p>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Product</span>
            <select
              className="field"
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value);
                setSuccess(null);
              }}
              disabled={busy || activeProducts.length === 0}
            >
              <option value="">Choose a product</option>
              {activeProducts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({stockByProduct.get(item.id) ?? '0'} in stock)
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Quantity</span>
              <input
                className="field"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => {
                  setQuantity(event.target.value);
                  setSuccess(null);
                }}
                disabled={busy}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Reason</span>
              <select
                className="field"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value as StockLossReason);
                  setSuccess(null);
                }}
                disabled={busy}
              >
                {LOSS_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {reason === 'expired' && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Expired on</span>
              <input
                type="date"
                className="field"
                value={expiresOn}
                onChange={(event) => {
                  setExpiresOn(event.target.value);
                  setSuccess(null);
                }}
                disabled={busy}
                required
              />
            </label>
          )}

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Note <span className="font-normal text-[var(--color-muted)]">(optional)</span>
            </span>
            <textarea
              className="field min-h-20 resize-y"
              value={note}
              maxLength={500}
              onChange={(event) => {
                setNote(event.target.value);
                setSuccess(null);
              }}
              placeholder="What happened, or who approved it"
              disabled={busy}
            />
          </label>

          {product && (
            <dl className="grid grid-cols-2 gap-2 rounded-lg bg-[var(--color-surface-2)] p-3 text-sm">
              <div>
                <dt className="text-xs text-[var(--color-muted)]">On hand</dt>
                <dd className="mt-0.5 font-medium tabular-nums">{stock}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--color-muted)]">Estimated value</dt>
                <dd className="mt-0.5 font-medium tabular-nums">
                  {estimatedMinor === null ? 'Cost not set' : formatMinor(estimatedMinor)}
                </dd>
              </div>
            </dl>
          )}

          {blockedByStock && (
            <p className="text-xs text-[var(--color-destructive)]">
              This is more than the stock on hand.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          {success && (
            <p
              role="status"
              className="rounded-lg border border-[var(--color-accent)]/50 p-2 text-sm text-[var(--color-accent)]"
            >
              {success}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-accent w-full"
            disabled={busy || !product || blockedByStock}
          >
            {busy ? 'Recording...' : 'Remove from stock'}
          </button>
        </form>
      )}
    </section>
  );
}
