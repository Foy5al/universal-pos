'use client';

import type { Brand, Category, Unit } from '@pos/contracts';
import { useState } from 'react';

import { parseThresholdInput } from '../../inventory/thresholdInput';
import { parseMoneyMinor } from '../../pos/types';
import type { AddProductResult, NewProductInput } from '../types';

interface AddProductFormProps {
  categories: readonly Category[];
  brands: readonly Brand[];
  units: readonly Unit[];
  locationName: string | null;
  busy: boolean;
  onCreate: (input: NewProductInput) => Promise<AddProductResult>;
}

const emptyFields = {
  name: '',
  sku: '',
  barcode: '',
  price: '',
  cost: '',
  quantity: '',
  lowStock: '',
};

export function AddProductForm({
  categories,
  brands,
  units,
  locationName,
  busy,
  onCreate,
}: AddProductFormProps) {
  const [fields, setFields] = useState(emptyFields);
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function setField(key: keyof typeof emptyFields, value: string): void {
    setFields((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWarning(null);
    setMessage(null);

    const priceMinor = parseMoneyMinor(fields.price);
    if (priceMinor === null) {
      setError('Enter a valid selling price, for example 120.00.');
      return;
    }
    const costMinor = fields.cost.trim() ? parseMoneyMinor(fields.cost) : undefined;
    if (costMinor === null) {
      setError('Enter a valid cost, or leave it blank.');
      return;
    }
    const quantity = fields.quantity.trim();
    if (quantity && (!/^\d{1,12}(\.\d{1,4})?$/.test(quantity) || Number(quantity) <= 0)) {
      setError('Opening stock must be a positive quantity with up to four decimals.');
      return;
    }
    const lowStockThreshold = parseThresholdInput(fields.lowStock);
    if (lowStockThreshold === undefined) {
      setError('Low stock alert must be a non-negative number with up to four decimals.');
      return;
    }

    try {
      const result = await onCreate({
        name: fields.name.trim(),
        sku: fields.sku.trim(),
        barcode: fields.barcode.trim() || undefined,
        priceMinor,
        costMinor,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        unitId: unitId || undefined,
        openingQuantity: quantity || undefined,
        lowStockThreshold: lowStockThreshold ?? undefined,
      });
      setFields(emptyFields);
      setMessage(`Added ${result.product.name} (${result.product.sku}).`);
      setWarning(result.stockWarning);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the product.');
    }
  }

  return (
    <section className="surface p-4">
      <h2 className="text-base font-semibold">Add product</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        New products appear on the till immediately. Opening stock is optional.
      </p>

      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="block text-xs">
          <span className="mb-1 block text-[var(--color-muted)]">Product name</span>
          <input
            className="field"
            value={fields.name}
            onChange={(event) => setField('name', event.target.value)}
            maxLength={160}
            required
            autoFocus
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--color-muted)]">SKU</span>
            <input
              className="field"
              value={fields.sku}
              onChange={(event) => setField('sku', event.target.value)}
              placeholder="ELE-SWITCH-1G"
              maxLength={64}
              required
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--color-muted)]">Barcode</span>
            <input
              className="field"
              value={fields.barcode}
              onChange={(event) => setField('barcode', event.target.value)}
              placeholder="Optional"
              maxLength={64}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--color-muted)]">Selling price</span>
            <input
              className="field text-right"
              inputMode="decimal"
              value={fields.price}
              onChange={(event) => setField('price', event.target.value)}
              placeholder="0.00"
              required
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--color-muted)]">Cost</span>
            <input
              className="field text-right"
              inputMode="decimal"
              value={fields.cost}
              onChange={(event) => setField('cost', event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <label className="block text-xs">
          <span className="mb-1 block text-[var(--color-muted)]">Category</span>
          <select
            className="field"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">Uncategorized</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--color-muted)]">Brand</span>
            <select
              className="field"
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
            >
              <option value="">No brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-[var(--color-muted)]">Unit</span>
            <select
              className="field"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              <option value="">No unit</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name} ({unit.abbreviation})
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block text-xs">
          <span className="mb-1 block text-[var(--color-muted)]">Low stock alert below</span>
          <input
            className="field text-right"
            inputMode="decimal"
            value={fields.lowStock}
            onChange={(event) => setField('lowStock', event.target.value)}
            placeholder="Optional · uses global default"
          />
          <span className="mt-1 block text-[0.7rem] text-[var(--color-muted)]">
            This product-level threshold overrides the global threshold in System settings.
          </span>
        </label>

        <label className="block text-xs">
          <span className="mb-1 block text-[var(--color-muted)]">Opening stock</span>
          <input
            className="field text-right"
            inputMode="decimal"
            value={fields.quantity}
            onChange={(event) => setField('quantity', event.target.value)}
            placeholder="Optional"
            disabled={!locationName}
          />
          <span className="mt-1 block text-[0.7rem] text-[var(--color-muted)]">
            {locationName
              ? `Records an opening adjustment at ${locationName}.`
              : 'Opening stock needs inventory permission and a stock location.'}
          </span>
        </label>

        {error && (
          <p role="alert" className="text-xs text-[var(--color-destructive)]">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-xs text-[var(--color-accent)]">
            {message}
          </p>
        )}
        {warning && (
          <p role="alert" className="text-xs text-[#f59e0b]">
            {warning}
          </p>
        )}

        <button type="submit" className="btn btn-accent w-full" disabled={busy}>
          {busy ? 'Adding product...' : 'Add product'}
        </button>
      </form>
    </section>
  );
}
