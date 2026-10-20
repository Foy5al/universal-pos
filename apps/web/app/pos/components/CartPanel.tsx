'use client';

import { formatMinor } from '../../lib/money';
import {
  cartTotalMinor,
  lineQuantityIssue,
  parseQuantityScaled,
  parseTenderMinor,
  quickTenderAmounts,
  type CartLine,
} from '../types';

interface CartPanelProps {
  lines: readonly CartLine[];
  stockByProduct: ReadonlyMap<string, string>;
  onChangeQuantity: (productId: string, quantity: string) => void;
  onRemove: (productId: string) => void;
  onClear: () => void;
  tendered: string;
  onTenderedChange: (value: string) => void;
  onSubmit: () => void;
  submitting: boolean;
  canCheckout: boolean;
  error: string | null;
}

export function CartPanel({
  lines,
  stockByProduct,
  onChangeQuantity,
  onRemove,
  onClear,
  tendered,
  onTenderedChange,
  onSubmit,
  submitting,
  canCheckout,
  error,
}: CartPanelProps) {
  const totalMinor = cartTotalMinor(lines);
  const tenderedMinor = parseTenderMinor(tendered);
  const changeMinor =
    tenderedMinor !== null && tenderedMinor >= totalMinor ? tenderedMinor - totalMinor : null;
  const shortMinor =
    tenderedMinor !== null && tenderedMinor < totalMinor ? totalMinor - tenderedMinor : null;
  const quickAmounts = quickTenderAmounts(totalMinor);
  const hasQuantityIssue = lines.some(
    (line) =>
      lineQuantityIssue(line.quantity, stockByProduct.get(line.product.id), line.product.name) !==
      null,
  );

  return (
    <section className="surface flex min-h-0 flex-col" aria-label="Current sale">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-base font-semibold">Current sale</h2>
        <button
          type="button"
          className="text-xs font-semibold text-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-40"
          onClick={onClear}
          disabled={lines.length === 0 || submitting}
        >
          Clear
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--color-muted)]">
            Scan a barcode or tap a product to start the sale.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="Sale lines">
            {lines.map((line) => {
              const quantityIssue = lineQuantityIssue(
                line.quantity,
                stockByProduct.get(line.product.id),
                line.product.name,
              );
              const scaled = parseQuantityScaled(line.quantity) ?? 0;
              return (
                <li key={line.product.id} className="border-b border-[var(--color-border)] pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{line.product.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {formatMinor(line.product.priceMinor)} each ·{' '}
                        {stockByProduct.get(line.product.id) ?? '0'} in stock
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--color-destructive)]"
                      onClick={() => onRemove(line.product.id)}
                      aria-label={`Remove ${line.product.name}`}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
                      Qty
                      <input
                        className={`field w-24 py-1.5 text-right ${
                          quantityIssue ? 'border-[var(--color-destructive)]' : ''
                        }`}
                        inputMode="decimal"
                        value={line.quantity}
                        onChange={(event) => onChangeQuantity(line.product.id, event.target.value)}
                        aria-label={`Quantity for ${line.product.name}`}
                        aria-invalid={Boolean(quantityIssue)}
                        aria-describedby={`qty-issue-${line.product.id}`}
                      />
                    </label>
                    <span className="text-sm font-semibold">
                      {formatMinor(Math.round((line.product.priceMinor * scaled) / 10_000))}
                    </span>
                  </div>
                  {quantityIssue && (
                    <p
                      id={`qty-issue-${line.product.id}`}
                      role="alert"
                      className="mt-1 text-xs text-[var(--color-destructive)]"
                    >
                      {quantityIssue}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center justify-between text-sm text-[var(--color-muted)]">
          <span>Subtotal</span>
          <span className="text-lg font-semibold text-[var(--color-foreground)]">
            {formatMinor(totalMinor)}
          </span>
        </div>

        <div>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Customer pays</span>
            <input
              className="field text-right text-lg font-semibold"
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="done"
              placeholder={(totalMinor / 100).toFixed(2)}
              value={tendered}
              onChange={(event) => onTenderedChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canCheckout && !submitting) {
                  event.preventDefault();
                  onSubmit();
                }
              }}
              aria-describedby="tender-help"
            />
            <span id="tender-help" className="mt-1 block text-xs text-[var(--color-muted)]">
              Leave blank for exact cash. Press Enter to charge.
            </span>
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Quick cash amounts">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                type="button"
                className={`btn justify-center py-1.5 text-xs ${
                  tenderedMinor === amount ? 'border-[var(--color-focus)]' : ''
                }`}
                onClick={() => onTenderedChange((amount / 100).toFixed(2))}
                disabled={submitting}
              >
                {amount === totalMinor ? 'Exact ' : ''}
                {formatMinor(amount)}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-between rounded-lg bg-[var(--color-surface-2)] px-3 py-2 text-sm"
          aria-live="polite"
        >
          <span className="text-[var(--color-muted)]">
            {shortMinor === null ? 'Return to customer' : 'Still due'}
          </span>
          <span
            className={`text-lg font-semibold ${
              shortMinor === null ? 'text-[var(--color-accent)]' : 'text-[var(--color-destructive)]'
            }`}
          >
            {shortMinor !== null
              ? formatMinor(shortMinor)
              : changeMinor !== null
                ? formatMinor(changeMinor)
                : '—'}
          </span>
        </div>

        {hasQuantityIssue && (
          <p className="text-xs text-[var(--color-destructive)]">
            Fix the highlighted quantities before charging.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-[var(--color-destructive)]">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn btn-accent w-full text-base"
          onClick={onSubmit}
          disabled={!canCheckout || submitting || lines.length === 0}
        >
          {submitting ? 'Posting sale…' : `Charge ${formatMinor(totalMinor)}`}
        </button>
      </div>
    </section>
  );
}
