'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { AddProductForm } from './components/AddProductForm';
import { BrandManager } from './components/BrandManager';
import { ProductTable } from './components/ProductTable';
import { useCatalog } from './useCatalog';

export default function CatalogPage() {
  const [locationId, setLocationId] = useState('');
  const [search, setSearch] = useState('');
  const [brandFilterId, setBrandFilterId] = useState<string | null>(null);
  const catalog = useCatalog(locationId);

  useEffect(() => {
    if (!locationId && catalog.locations.length > 0) {
      setLocationId(catalog.locations[0]?.id ?? '');
    }
  }, [catalog.locations, locationId]);

  const stockByProduct = useMemo(
    () => new Map(catalog.balances.map((balance) => [balance.productId, balance.quantity])),
    [catalog.balances],
  );
  const locationName =
    catalog.locations.find((location) => location.id === locationId)?.name ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Catalog</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/pos" className="btn text-sm">
            Back to POS
          </Link>
          <Link href="/purchasing" className="btn text-sm">
            Purchasing
          </Link>
          <Link href="/inventory" className="btn text-sm">
            Stock
          </Link>
          <Link href="/reports" className="btn text-sm">
            Reports
          </Link>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 text-[var(--color-muted)]">Stock location</span>
          <select
            className="field inline-block w-auto min-w-44"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
            disabled={catalog.loading || catalog.locations.length === 0}
          >
            {catalog.locations.length === 0 && <option value="">No locations</option>}
            {catalog.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--color-muted)]">
          Stock shown and opening quantities apply to this location.
        </p>
      </div>

      {catalog.error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {catalog.error}
        </p>
      )}

      <div className="grid min-h-0 flex-1 items-start gap-4 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          {catalog.canManage ? (
            <AddProductForm
              categories={catalog.categories}
              brands={catalog.brands}
              units={catalog.units}
              locationName={catalog.canAdjust ? locationName : null}
              busy={catalog.busy}
              onCreate={catalog.addProduct}
            />
          ) : (
            <section className="surface p-4 text-sm text-[var(--color-muted)]">
              Your role can view the catalog but cannot add products.
            </section>
          )}
          <BrandManager
            brands={catalog.brands}
            products={catalog.products}
            selectedBrandId={brandFilterId}
            canManage={catalog.canManage}
            busy={catalog.brandBusy}
            onSelect={setBrandFilterId}
            onCreate={catalog.addBrand}
          />
        </div>
        <ProductTable
          products={catalog.products}
          brands={catalog.brands}
          stockByProduct={stockByProduct}
          search={search}
          onSearch={setSearch}
          brandFilterId={brandFilterId}
          loading={catalog.loading}
          error={null}
        />
      </div>
    </main>
  );
}
