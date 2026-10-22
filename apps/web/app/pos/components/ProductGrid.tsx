'use client';

import type { Product } from '@pos/contracts';
import { useEffect, useRef } from 'react';

import { formatMinor } from '../../lib/money';

interface ProductGridProps {
  products: readonly Product[];
  stockByProduct: ReadonlyMap<string, string>;
  onAdd: (product: Product) => void;
  onRequestRestock?: ((product: Product) => void) | undefined;
  disabled?: boolean;
  highlightedProductId?: string | null;
}

export function ProductGrid({
  products,
  stockByProduct,
  onAdd,
  onRequestRestock,
  disabled,
  highlightedProductId,
}: ProductGridProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!highlightedProductId) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlightedProductId]);

  if (products.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">
        No products match this search. Clear the filter or add products in the catalog.
      </p>
    );
  }

  return (
    <ul ref={listRef} className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4" role="list">
      {products.map((product) => {
        const stock = stockByProduct.get(product.id) ?? '0';
        const soldOut = Number(stock) <= 0;
        const canRequestRestock = soldOut && onRequestRestock !== undefined;
        const highlighted = product.id === highlightedProductId;
        return (
          <li key={product.id}>
            <button
              type="button"
              className={`surface flex h-full w-full min-h-24 flex-col items-start gap-1 p-3 text-left transition hover:border-[var(--color-focus)] disabled:cursor-not-allowed disabled:opacity-50 ${
                highlighted ? 'border-[var(--color-focus)] ring-2 ring-[var(--color-focus)]' : ''
              }`}
              data-highlighted={highlighted ? 'true' : undefined}
              onClick={() =>
                soldOut && onRequestRestock ? onRequestRestock(product) : onAdd(product)
              }
              disabled={disabled || (soldOut && !canRequestRestock)}
              aria-label={
                canRequestRestock
                  ? `Request restock for ${product.name}, out of stock`
                  : `Add ${product.name}, ${formatMinor(product.priceMinor)}${soldOut ? ', out of stock' : ''}`
              }
            >
              <span className="text-sm font-semibold leading-snug">{product.name}</span>
              <span className="text-xs text-[var(--color-muted)]">{product.sku}</span>
              <span className="mt-auto text-base font-semibold text-[var(--color-accent)]">
                {formatMinor(product.priceMinor)}
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                {soldOut
                  ? canRequestRestock
                    ? 'Out of stock - request restock'
                    : 'Out of stock'
                  : `${stock} in stock`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
