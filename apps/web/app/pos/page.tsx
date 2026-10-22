'use client';

import type { Product } from '@pos/contracts';
import { useEffect, useMemo, useState } from 'react';

import { CheckoutResult } from './components/CheckoutResult';
import { HeldSaleDialogs } from './components/HeldSaleDialogs';
import { PosHeader } from './components/PosHeader';
import { PosNotices } from './components/PosNotices';
import { PosShortcutLayer } from './components/PosShortcutLayer';
import { PosToolbar } from './components/PosToolbar';
import { RestockRequestDialog } from './components/RestockRequestDialog';
import { SaleWorkspace } from './components/SaleWorkspace';
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
import { useHeldSales } from './useHeldSales';
import { useOfflineCheckout } from './useOfflineCheckout';
import { usePosControls } from './usePosControls';
import { usePosData } from './usePosData';
import { usePosReceipt } from './usePosReceipt';
import { useProductPicker } from './useProductPicker';
import { useRegisterShift } from './useRegisterShift';

export default function PosPage() {
  const [locationId, setLocationId] = useState(() => readPosBootstrap()?.locationId ?? '');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [tendered, setTendered] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockNotice, setRestockNotice] = useState<string | null>(null);

  const data = usePosData(locationId);
  const { products, locations, registers, balances, loading, error, setError, online } = data;
  const posSettings = usePosControls(data.user?.organizationId ?? null);
  const offline = useOfflineCheckout({ online });
  const { receipt, setReceipt, showReceipt, refreshReceipt } = usePosReceipt(offline.sync);
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

  function resetCheckoutUi() {
    setReceipt(null);
    setTendered('');
    setSearch('');
    setError(null);
  }

  function resetSale() {
    setCart([]);
    resetCheckoutUi();
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

  const held = useHeldSales({
    locationId,
    settings: posSettings,
    cart,
    setCart,
    setError,
    resetCheckoutUi,
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
        onMoveHighlight={picker.moveHighlight}
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

      <PosNotices error={error} restockNotice={restockNotice} />

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
        <SaleWorkspace
          products={picker.filteredProducts}
          stockByProduct={stockByProduct}
          onAdd={picker.addProduct}
          onRequestRestock={canRequestRestock ? setRestockProduct : undefined}
          highlightedProductId={picker.highlightedProductId}
          lines={cart}
          onChangeQuantity={(productId, quantity) => {
            setError(null);
            setCart((current) =>
              current.map((line) => (line.product.id === productId ? { ...line, quantity } : line)),
            );
          }}
          onRemove={held.removeLine}
          onClear={held.clearSale}
          onPause={held.pauseSale}
          onOpenPaused={() => held.setOpen(true)}
          pausedCount={held.orders.length}
          tendered={tendered}
          onTenderedChange={setTendered}
          onSubmit={submitSale}
          submitting={submitting}
          canCheckout={canCheckout}
        />
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

      <HeldSaleDialogs
        pausedOpen={held.open}
        orders={held.orders}
        onResume={held.resumeSale}
        onDiscard={held.discardOrder}
        onClosePaused={() => held.setOpen(false)}
        guard={held.guard}
      />

      <PosShortcutLayer
        disabled={Boolean(receipt) || held.open || Boolean(held.guard.pending)}
        canPause={cart.length > 0 && !submitting}
        canCharge={canCheckout && !submitting}
        hasCart={cart.length > 0}
        hasPaused={held.orders.length > 0}
        onPause={held.pauseSale}
        onOpenPaused={() => held.setOpen(true)}
        onCharge={() => {
          void submitSale();
        }}
        onRemoveLast={held.removeLastItem}
        onAdjustLast={held.adjustLastQuantity}
      />
    </main>
  );
}
