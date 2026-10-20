'use client';

import type { Product, Sale } from '@pos/contracts';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { createSale } from '../lib/api';
import { CartPanel } from './components/CartPanel';
import { ProductGrid } from './components/ProductGrid';
import { ReceiptView } from './components/ReceiptView';
import { ShiftPanel } from './components/ShiftPanel';
import {
  cartTotalMinor,
  isValidQuantity,
  lineQuantityIssue,
  nextQuantity,
  parseTenderMinor,
  type CartLine,
} from './types';
import { usePosData } from './usePosData';
import { useRegisterShift } from './useRegisterShift';

export default function PosPage() {
  const [locationId, setLocationId] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tendered, setTendered] = useState('');
  const [sale, setSale] = useState<Sale | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const data = usePosData(locationId);
  const { products, locations, registers, balances, loading, error, setError, online } = data;

  useEffect(() => {
    if (!locationId && locations.length > 0) {
      setLocationId(locations[0]?.id ?? '');
    }
  }, [locationId, locations]);

  const storeId = locations.find((location) => location.id === locationId)?.storeId ?? null;
  const shiftState = useRegisterShift(registers, storeId);
  const { shift, registerId, availableRegisters } = shiftState;

  function resetSale() {
    setCart([]);
    setSale(null);
    setTendered('');
    setError(null);
  }

  function changeLocation(next: string) {
    setLocationId(next);
    resetSale();
  }

  function changeRegister(next: string) {
    shiftState.setRegisterId(next);
    resetSale();
  }

  const stockByProduct = useMemo(
    () => new Map(balances.map((balance) => [balance.productId, balance.quantity])),
    [balances],
  );

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term) ||
        (product.barcode ?? '').toLowerCase() === term,
    );
  }, [products, search]);

  function addProduct(product: Product) {
    setSale(null);
    const existing = cart.find((line) => line.product.id === product.id);
    const quantity =
      existing && isValidQuantity(existing.quantity) ? nextQuantity(existing.quantity) : '1';
    const issue = lineQuantityIssue(quantity, stockByProduct.get(product.id), product.name);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setCart((current) =>
      existing
        ? current.map((line) => (line.product.id === product.id ? { ...line, quantity } : line))
        : [...current, { product, quantity }],
    );
  }

  function handleScan() {
    const term = search.trim().toLowerCase();
    if (!term) return;
    const match =
      products.find((product) => (product.barcode ?? '').toLowerCase() === term) ??
      products.find((product) => product.sku.toLowerCase() === term) ??
      (filteredProducts.length === 1 ? filteredProducts[0] : undefined);
    if (match) {
      addProduct(match);
      setSearch('');
    }
  }

  const totalMinor = cartTotalMinor(cart);
  const quantitiesValid = cart.every(
    (line) =>
      isValidQuantity(line.quantity) &&
      lineQuantityIssue(line.quantity, stockByProduct.get(line.product.id), line.product.name) ===
        null,
  );
  const tenderMinor = tendered.trim() ? parseTenderMinor(tendered) : totalMinor;
  const tenderValid = tenderMinor !== null && tenderMinor >= totalMinor;
  const canCheckout =
    online && shift?.status === 'open' && quantitiesValid && tenderValid && totalMinor > 0;

  async function submitSale() {
    if (!canCheckout || !locationId || tenderMinor === null || !shift) {
      setError('Open a register shift and check the cart before charging.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await createSale({
        operationId: crypto.randomUUID(),
        locationId,
        registerShiftId: shift.id,
        lines: cart.map((line) => ({
          productId: line.product.id,
          quantity: line.quantity,
        })),
        payments: [{ method: 'cash', tenderedMinor: tenderMinor }],
      });
      setSale(created);
      setCart([]);
      setTendered('');
      await data.refreshBalances();
      shiftState.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete the sale');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Universal POS</h1>
          <p className="text-xs text-[var(--color-muted)]">
            {data.user
              ? `${data.user.displayName} - ${data.user.organizationId.slice(0, 8)}`
              : 'Loading...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            role="status"
            className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs font-semibold"
          >
            <span
              aria-hidden="true"
              className={`mr-2 inline-block h-2 w-2 rounded-full ${online ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-destructive)]'}`}
            />
            {online ? 'Online' : 'Offline - checkout paused'}
          </span>
          <Link href="/catalog" className="btn text-sm">
            Catalog
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
          <button type="button" className="btn text-sm" onClick={data.signOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">
          <span className="mr-2 text-[var(--color-muted)]">Selling from</span>
          <select
            className="field inline-block w-auto min-w-44"
            value={locationId}
            onChange={(event) => changeLocation(event.target.value)}
            disabled={loading}
          >
            {locations.length === 0 && <option value="">No locations</option>}
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mr-2 text-[var(--color-muted)]">Register</span>
          <select
            className="field inline-block w-auto min-w-40"
            value={registerId}
            onChange={(event) => changeRegister(event.target.value)}
            disabled={loading || availableRegisters.length === 0}
          >
            {availableRegisters.length === 0 && <option value="">No register</option>}
            {availableRegisters.map((register) => (
              <option key={register.id} value={register.id}>
                {register.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-64 flex-1 items-center gap-2 text-sm">
          <span className="sr-only">Scan barcode or search products</span>
          <input
            className="field"
            placeholder="Scan barcode or search name / SKU"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleScan();
              }
            }}
            autoFocus
          />
        </label>
      </div>

      <ShiftPanel
        shift={shift}
        registerSelected={Boolean(registerId)}
        busy={shiftState.busy}
        error={shiftState.error}
        onOpen={shiftState.openShift}
        onCashMovement={shiftState.addCashMovement}
        onClose={shiftState.closeShift}
      />

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-[var(--color-muted)]">Loading catalog...</p>
      ) : sale ? (
        <ReceiptView
          sale={sale}
          shiftId={shift?.status === 'open' ? shift.id : undefined}
          onNewSale={() => setSale(null)}
          onRefunded={async () => {
            await data.refreshBalances();
            shiftState.refresh();
          }}
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
          <section aria-label="Products" className="min-h-0">
            <ProductGrid
              products={filteredProducts}
              stockByProduct={stockByProduct}
              onAdd={addProduct}
              disabled={!online}
            />
          </section>
          <CartPanel
            lines={cart}
            stockByProduct={stockByProduct}
            onChangeQuantity={(productId, quantity) => {
              setError(null);
              setCart((current) =>
                current.map((line) =>
                  line.product.id === productId ? { ...line, quantity } : line,
                ),
              );
            }}
            onRemove={(productId) =>
              setCart((current) => current.filter((line) => line.product.id !== productId))
            }
            onClear={() => setCart([])}
            tendered={tendered}
            onTenderedChange={setTendered}
            onSubmit={submitSale}
            submitting={submitting}
            canCheckout={canCheckout}
            error={null}
          />
        </div>
      )}
    </main>
  );
}
