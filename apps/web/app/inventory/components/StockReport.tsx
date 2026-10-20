'use client';

import type { Product, StockBalance, StockMovement } from '@pos/contracts';
import { useMemo, useState } from 'react';

import { formatMinor, parseQuantity } from '../../lib/money';
import { lossValueMinor, removedQuantity } from '../lossLabels';

interface StockReportProps {
  products: readonly Product[];
  balances: readonly StockBalance[];
  losses: readonly StockMovement[];
  locationName: string | null;
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="surface p-4">
      <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p>
    </div>
  );
}

export function StockReport({ products, balances, losses, locationName }: StockReportProps) {
  const [search, setSearch] = useState('');
  const stockByProduct = useMemo(
    () => new Map(balances.map((balance) => [balance.productId, balance.quantity])),
    [balances],
  );
  const rows = useMemo(() => {
    const productById = new Map(products.map((product) => [product.id, product]));
    return balances
      .map((balance) => ({
        balance,
        product: productById.get(balance.productId),
      }))
      .filter(
        (row): row is { balance: StockBalance; product: Product } => row.product !== undefined,
      )
      .sort((left, right) => left.product.name.localeCompare(right.product.name));
  }, [balances, products]);

  const term = search.trim().toLowerCase();
  const filtered = term
    ? rows.filter(
        ({ product }) =>
          product.name.toLowerCase().includes(term) || product.sku.toLowerCase().includes(term),
      )
    : rows;

  const units = rows.reduce((sum, row) => sum + Number(row.balance.quantity), 0);
  const productsOnHand = rows.filter((row) => Number(row.balance.quantity) > 0).length;
  const outOfStock = products.filter(
    (product) => product.isActive && Number(stockByProduct.get(product.id) ?? '0') <= 0,
  ).length;
  const lossUnits = losses.reduce((sum, loss) => sum + Number(removedQuantity(loss)), 0);
  const knownLossValue = losses.reduce((sum, loss) => sum + (lossValueMinor(loss) ?? 0), 0);
  const unknownLossValue = losses.some((loss) => lossValueMinor(loss) === null);

  return (
    <section className="space-y-4" aria-labelledby="stock-report-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="stock-report-heading" className="text-lg font-semibold">
            Location stock report
          </h2>
          <p className="text-xs text-[var(--color-muted)]">
            {locationName ?? 'No location'} · quantities and values update from the stock ledger.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Products on hand"
          value={String(productsOnHand)}
          hint={`${products.length} products in the catalog`}
        />
        <SummaryCard
          label="Units on hand"
          value={units.toLocaleString('en-BD', { maximumFractionDigits: 4 })}
          hint="Across this location"
        />
        <SummaryCard
          label="Out of stock"
          value={String(outOfStock)}
          hint="Active products with zero or less"
        />
        <SummaryCard
          label="Loss cost"
          value={formatMinor(knownLossValue)}
          hint={`${lossUnits.toLocaleString('en-BD', { maximumFractionDigits: 4 })} units${
            unknownLossValue ? ' · some costs missing' : ''
          }`}
        />
      </div>

      <div className="surface min-w-0 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Stock on hand</h3>
            <p className="text-xs text-[var(--color-muted)]">
              Cost value is purchase cost, not retail selling value.
            </p>
          </div>
          <label className="min-w-56 flex-1 sm:max-w-72">
            <span className="sr-only">Search stock</span>
            <input
              type="search"
              className="field"
              placeholder="Search name or SKU"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
            {rows.length === 0
              ? 'No stock has been received at this location yet.'
              : 'No stock matches this search.'}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Stock on hand at this location</caption>
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 text-right font-medium">On hand</th>
                  <th className="px-2 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-2 py-2 text-right font-medium">Cost value</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ product, balance }) => {
                  const scaled = parseQuantity(balance.quantity);
                  const value =
                    product.costMinor !== null && scaled !== null
                      ? Math.round((product.costMinor * scaled) / 10_000)
                      : null;
                  return (
                    <tr
                      key={product.id}
                      className="border-b border-[var(--color-border)]/60 last:border-0"
                    >
                      <td className="px-2 py-2.5">
                        <p className="font-medium leading-snug">{product.name}</p>
                        <p className="text-xs text-[var(--color-muted)]">{product.sku}</p>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{balance.quantity}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {product.costMinor === null ? (
                          <span className="text-xs text-[var(--color-muted)]">Not set</span>
                        ) : (
                          formatMinor(product.costMinor)
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">
                        {value === null ? (
                          <span className="text-xs text-[var(--color-muted)]">Not set</span>
                        ) : (
                          formatMinor(value)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
