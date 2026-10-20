import type { Brand, Product } from '@pos/contracts';
import { useMemo } from 'react';

import { formatMinor } from '../../lib/money';

interface ProductTableProps {
  products: readonly Product[];
  brands: readonly Brand[];
  stockByProduct: ReadonlyMap<string, string>;
  search: string;
  onSearch: (value: string) => void;
  brandFilterId: string | null;
  loading: boolean;
  error: string | null;
}

export function ProductTable({
  products,
  brands,
  stockByProduct,
  search,
  onSearch,
  brandFilterId,
  loading,
  error,
}: ProductTableProps) {
  const brandById = useMemo(() => new Map(brands.map((brand) => [brand.id, brand.name])), [brands]);
  const term = search.trim().toLowerCase();
  const scoped = brandFilterId
    ? products.filter((product) => product.brandId === brandFilterId)
    : products;
  const filtered = term
    ? scoped.filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          (product.barcode ?? '').toLowerCase().includes(term),
      )
    : scoped;
  const brandName = brandFilterId ? brandById.get(brandFilterId) : null;

  return (
    <section className="surface min-w-0 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">
            {brandName ? `${brandName} products` : 'Products'}
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            {filtered.length} of {products.length} products in this organization
          </p>
        </div>
        <label className="min-w-56 flex-1 sm:max-w-72">
          <span className="sr-only">Search products</span>
          <input
            className="field"
            type="search"
            placeholder="Search name, SKU or barcode"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-sm text-[var(--color-destructive)]">
          {error}
        </p>
      )}

      {loading ? (
        <p role="status" className="p-6 text-center text-sm text-[var(--color-muted)]">
          Loading products...
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          {products.length === 0
            ? 'No products yet. Add the first product on the left.'
            : brandFilterId
              ? 'No products match this brand and search.'
              : 'No products match this search.'}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Product catalog</caption>
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="px-2 py-2 font-medium">Product</th>
                <th className="px-2 py-2 font-medium">Brand</th>
                <th className="px-2 py-2 text-right font-medium">Price</th>
                <th className="px-2 py-2 text-right font-medium">Cost</th>
                <th className="px-2 py-2 text-right font-medium">Stock</th>
                <th className="px-2 py-2 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const stock = stockByProduct.get(product.id);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-[var(--color-border)]/60 last:border-0"
                  >
                    <td className="px-2 py-2.5">
                      <p className="font-medium leading-snug">{product.name}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {product.sku}
                        {product.barcode ? ` · ${product.barcode}` : ''}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-[var(--color-muted)]">
                      {product.brandId ? (brandById.get(product.brandId) ?? 'Unknown') : '—'}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {formatMinor(product.priceMinor)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {product.costMinor === null ? '—' : formatMinor(product.costMinor)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{stock ?? '—'}</td>
                    <td className="px-2 py-2.5 text-right">
                      <span
                        className={
                          product.isActive
                            ? 'text-xs text-[var(--color-accent)]'
                            : 'text-xs text-[var(--color-muted)]'
                        }
                      >
                        {product.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
