'use client';

import type { Product, Sale } from '@pos/contracts';
import type { LocalSale } from '@pos/offline';
import { useEffect, useMemo, useState } from 'react';

import { getSale } from '../lib/api';
import { offlineDatabase } from '../lib/offlineSync';
import { CartPanel } from './components/CartPanel';
import { CheckoutResult } from './components/CheckoutResult';
import { PosHeader } from './components/PosHeader';
import { PosToolbar } from './components/PosToolbar';
import { ProductGrid } from './components/ProductGrid';
import { RestockRequestDialog } from './components/RestockRequestDialog';
import { ShiftPanel } from './components/ShiftPanel';
import { SyncStatusBar } from './components/SyncStatusBar';
import { readPosBootstrap, savePosBootstrap } from './posBootstrap';
import {
  cartTotalMinor,
  isValidQuantity,
  lineQuantityIssue,
  parseTenderMinor,
  type CartLine,
} from './types';
import { useOfflineCheckout } from './useOfflineCheckout';
import { usePosData } from './usePosData';
import { useProductPicker } from './useProductPicker';
import { useRegisterShift } from './useRegisterShift';

type Receipt = { kind: 'server'; sale: Sale } | { kind: 'local'; sale: LocalSale };

export default function PosPage() {
  const [locationId, setLocationId] = useState(() => readPosBootstrap()?.locationId ?? '');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tendered, setTendered] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockNotice, setRestockNotice] = useState<string | null>(null);

  const data = usePosData(locationId);
  const { products, locations, registers, balances, loading, error, setError, online } = data;
  const offline = useOfflineCheckout({ online });
  const canRequestRestock = online && (data.user?.permissions.includes('restock:request') ?? false);

  useEffect(() => {
    if (locations.length === 0) return;
    if (!locations.some((location) => location.id === locationId)) {
      setLocationId(locations[0]?.id ?? '');
    }
  }, [locationId, locations]);

  useEffect(() => {
    if (locationId) savePosBootstrap({ locationId });
  }, [locationId]);

  const storeId = locations.find((location) => location.id === locationId)?.storeId ?? null;
  const shiftState = useRegisterShift(registers, storeId);
  const { shift, registerId, availableRegisters } = shiftState;

  function resetSale() {
    setCart([]);
    setReceipt(null);
    setTendered('');
    setError(null);
  }

  function changeLocation(next: string) {
    setLocationId(next);
    setRestockNotice(null);
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

  const picker = useProductPicker({
    products,
    cart,
    setCart,
    setError,
    search,
    setSearch,
    stockByProduct,
    onAdd: () => setReceipt(null),
  });

  const totalMinor = cartTotalMinor(cart);
  const quantitiesValid = cart.every(
    (line) =>
      isValidQuantity(line.quantity) &&
      lineQuantityIssue(line.quantity, stockByProduct.get(line.product.id), line.product.name) ===
        null,
  );
  const tenderMinor = tendered.trim() ? parseTenderMinor(tendered) : totalMinor;
  const tenderValid = tenderMinor !== null && tenderMinor >= totalMinor;
  const canCheckout = shift?.status === 'open' && quantitiesValid && tenderValid && totalMinor > 0;

  async function showReceipt(local: LocalSale): Promise<void> {
    if (local.serverSaleId) {
      try {
        const server = await getSale(local.serverSaleId);
        setReceipt({ kind: 'server', sale: server });
        return;
      } catch {
        // Keep the local receipt when the canonical sale is not reachable yet.
      }
    }
    setReceipt({ kind: 'local', sale: local });
  }

  async function submitSale() {
    if (!canCheckout || !shift || !locationId || tenderMinor === null) {
      setError('Open a register shift and check the cart before charging.');
      return;
    }
    const register = registers.find((candidate) => candidate.id === shift.registerId);
    setSubmitting(true);
    setError(null);
    try {
      const local = await offline.checkout({
        locationId,
        registerId: shift.registerId,
        registerCode: register?.code ?? 'REG',
        registerShiftId: shift.id,
        lines: cart.map((line) => ({ product: line.product, quantity: line.quantity })),
        tenderedMinor: tenderMinor,
      });
      await showReceipt(local);
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

  async function refreshReceipt() {
    if (receipt?.kind !== 'local') return;
    await offline.sync();
    const updated = await offlineDatabase().localSales.get(receipt.sale.id);
    if (updated) await showReceipt(updated);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-4 p-4 lg:p-6">
      <PosHeader
        userLabel={
          data.user
            ? `${data.user.displayName} - ${data.user.organizationId.slice(0, 8)}`
            : 'Loading...'
        }
        onSignOut={() => {
          void data.signOut();
        }}
      />

      <SyncStatusBar
        online={online}
        syncing={offline.syncing}
        summary={offline.summary}
        lastSyncedAt={offline.lastSyncedAt}
        error={offline.syncError}
        onRetry={() => {
          void offline.sync();
        }}
      />

      <PosToolbar
        locations={locations}
        locationId={locationId}
        onLocationChange={changeLocation}
        registers={availableRegisters}
        registerId={registerId}
        onRegisterChange={changeRegister}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        onScan={picker.handleScan}
      />

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

      {restockNotice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-accent)]/50 p-3 text-sm text-[var(--color-accent)]"
        >
          {restockNotice}
        </p>
      )}

      {loading ? (
        <p className="p-8 text-center text-sm text-[var(--color-muted)]">Loading catalog...</p>
      ) : receipt ? (
        <CheckoutResult
          serverSale={receipt.kind === 'server' ? receipt.sale : null}
          localSale={receipt.kind === 'local' ? receipt.sale : null}
          shiftId={shift?.status === 'open' ? shift.id : undefined}
          syncing={offline.syncing}
          onNewSale={() => setReceipt(null)}
          onRefunded={async () => {
            await data.refreshBalances();
            shiftState.refresh();
          }}
          onRefreshLocal={() => {
            void refreshReceipt();
          }}
        />
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_380px]">
          <section aria-label="Products" className="min-h-0">
            <ProductGrid
              products={picker.filteredProducts}
              stockByProduct={stockByProduct}
              onAdd={picker.addProduct}
              onRequestRestock={canRequestRestock ? setRestockProduct : undefined}
              disabled={false}
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

      {restockProduct && locationId && (
        <RestockRequestDialog
          product={restockProduct}
          locationId={locationId}
          onClose={() => setRestockProduct(null)}
          onSubmitted={(message) => {
            setRestockProduct(null);
            setRestockNotice(message);
          }}
        />
      )}
    </main>
  );
}
