'use client';

import type { Brand, Product } from '@pos/contracts';
import { useMemo, useState, type FormEvent } from 'react';

interface BrandManagerProps {
  brands: readonly Brand[];
  products: readonly Product[];
  selectedBrandId: string | null;
  canManage: boolean;
  busy: boolean;
  onSelect: (brandId: string | null) => void;
  onCreate: (name: string) => Promise<Brand>;
}

export function BrandManager({
  brands,
  products,
  selectedBrandId,
  canManage,
  busy,
  onSelect,
  onCreate,
}: BrandManagerProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const product of products) {
      if (product.brandId) {
        result.set(product.brandId, (result.get(product.brandId) ?? 0) + 1);
      }
    }
    return result;
  }, [products]);
  const sortedBrands = useMemo(
    () => [...brands].sort((left, right) => left.name.localeCompare(right.name)),
    [brands],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError('Enter a brand name.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const brand = await onCreate(value);
      setName('');
      setSuccess(`${brand.name} added.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the brand.');
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="brands-heading">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 id="brands-heading" className="text-base font-semibold">
            Brands
          </h2>
          <p className="text-xs text-[var(--color-muted)]">Filter products by brand.</p>
        </div>
        <button
          type="button"
          className={`btn px-3 py-1.5 text-xs ${
            selectedBrandId === null ? 'border-[var(--color-focus)]' : ''
          }`}
          onClick={() => onSelect(null)}
          aria-pressed={selectedBrandId === null}
        >
          All ({products.length})
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {sortedBrands.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">No brands yet.</p>
        ) : (
          sortedBrands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              className={`btn px-3 py-1.5 text-xs ${
                selectedBrandId === brand.id ? 'border-[var(--color-focus)]' : ''
              }`}
              onClick={() => onSelect(brand.id)}
              aria-pressed={selectedBrandId === brand.id}
            >
              {brand.name} ({counts.get(brand.id) ?? 0})
            </button>
          ))
        )}
      </div>

      {canManage && (
        <form className="mt-4 border-t border-[var(--color-border)] pt-4" onSubmit={submit}>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">New brand</span>
            <input
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Philips"
              maxLength={160}
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="mt-2 text-sm text-[var(--color-accent)]">
              {success}
            </p>
          )}
          <button type="submit" className="btn mt-3 w-full justify-center" disabled={busy}>
            {busy ? 'Adding brand...' : 'Add brand'}
          </button>
        </form>
      )}
    </section>
  );
}
