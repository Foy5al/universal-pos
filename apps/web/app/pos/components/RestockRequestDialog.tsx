'use client';

import type { Product } from '@pos/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { createRestockRequest } from '../../lib/api';
import { parseQuantity } from '../../lib/money';

interface RestockRequestDialogProps {
  product: Product;
  locationId: string;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}

export function RestockRequestDialog({
  product,
  locationId,
  onClose,
  onSubmitted,
}: RestockRequestDialogProps) {
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = parseQuantity(quantity) !== null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) {
      setError('Enter a quantity greater than zero with up to four decimal places.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createRestockRequest({
        locationId,
        productId: product.id,
        quantity,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onSubmitted(`Restock request sent for ${product.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the restock request.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="restock-heading"
        className="surface w-full max-w-sm p-5"
      >
        <h2 id="restock-heading" className="text-base font-semibold">
          Request restock
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {product.name} ({product.sku}) is out of stock. A manager will review the request and
          raise a purchase order.
        </p>

        <form className="mt-3 space-y-3" onSubmit={submit}>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Quantity needed</span>
            <input
              className="field text-right"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              autoFocus
              disabled={busy}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Note (optional)</span>
            <input
              className="field"
              value={note}
              maxLength={400}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. shelf is empty before the weekend"
              disabled={busy}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="button" className="btn flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-accent flex-1" disabled={busy || !valid}>
              {busy ? 'Sending...' : 'Send request'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
