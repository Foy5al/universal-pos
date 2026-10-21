'use client';

import type { Product } from '@pos/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { parseThresholdInput } from '../../inventory/thresholdInput';

interface ProductThresholdDialogProps {
  product: Product;
  threshold: string | null;
  globalThreshold: string | null;
  onSave: (productId: string, threshold: string | null) => Promise<unknown>;
  onClose: () => void;
}

export function ProductThresholdDialog({
  product,
  threshold,
  globalThreshold,
  onSave,
  onClose,
}: ProductThresholdDialogProps) {
  const [value, setValue] = useState(threshold ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValue(threshold ?? '');
  }, [threshold]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function persist(next: string | null) {
    setBusy(true);
    setError(null);
    try {
      await onSave(product.id, next);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the low stock alert.');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseThresholdInput(value);
    if (parsed === undefined) {
      setError('Enter a non-negative number with up to four decimal places.');
      return;
    }
    await persist(parsed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-threshold-heading"
        className="surface w-full max-w-sm p-5"
      >
        <h2 id="product-threshold-heading" className="text-base font-semibold">
          Low stock alert
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {product.name} ({product.sku}) ·{' '}
          {globalThreshold === null
            ? 'No global threshold is configured.'
            : `Global fallback: notify below ${globalThreshold}.`}
        </p>

        <form className="mt-3 space-y-3" onSubmit={submit}>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Notify when stock is below</span>
            <input
              className="field text-right"
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="Uses global threshold"
              autoFocus
              disabled={busy}
            />
            <span className="mt-1 block text-xs text-[var(--color-muted)]">
              A product threshold always takes priority over the global default.
            </span>
          </label>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn flex-1" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            {threshold !== null && (
              <button
                type="button"
                className="btn flex-1"
                disabled={busy}
                onClick={() => {
                  setValue('');
                  void persist(null);
                }}
              >
                Use global
              </button>
            )}
            <button type="submit" className="btn btn-accent flex-1" disabled={busy}>
              {busy ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
