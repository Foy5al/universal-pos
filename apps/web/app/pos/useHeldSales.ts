'use client';

import type { PosSettings } from '@pos/contracts';
import type { Dispatch, SetStateAction } from 'react';

import { usePausedOrders } from './usePausedOrders';
import { useRemovalGuard } from './useRemovalGuard';
import { nextQuantity, previousQuantity, type CartLine } from './types';

interface HeldSalesOptions {
  locationId: string;
  settings: PosSettings | null;
  cart: CartLine[];
  setCart: Dispatch<SetStateAction<CartLine[]>>;
  setError: (message: string | null) => void;
  resetCheckoutUi: () => void;
}

export function useHeldSales({
  locationId,
  settings,
  cart,
  setCart,
  setError,
  resetCheckoutUi,
}: HeldSalesOptions) {
  const paused = usePausedOrders(locationId);
  const guard = useRemovalGuard(settings);

  function pauseSale(): void {
    const result = paused.pause(cart);
    if (!result.ok) {
      setError(result.message ?? 'Could not pause this sale.');
      return;
    }
    setCart([]);
    resetCheckoutUi();
  }

  function resumeSale(id: string): void {
    const result = paused.resume(id, cart);
    if (!result.order) {
      setError(result.message ?? 'Could not resume that sale.');
      return;
    }
    setCart(result.order.lines);
    resetCheckoutUi();
    paused.setOpen(false);
  }

  function discardOrder(id: string): void {
    const blocked = guard.request({
      description: 'discard this paused sale',
      run: () => paused.discard(id),
    });
    if (blocked) setError(blocked);
  }

  function removeLine(productId: string): void {
    const name = cart.find((line) => line.product.id === productId)?.product.name ?? 'this item';
    const blocked = guard.request({
      description: `remove ${name}`,
      run: () => setCart((current) => current.filter((line) => line.product.id !== productId)),
    });
    if (blocked) setError(blocked);
  }

  function clearSale(): void {
    const blocked = guard.request({
      description: 'clear this sale',
      run: () => {
        setCart([]);
        resetCheckoutUi();
      },
    });
    if (blocked) setError(blocked);
  }

  function adjustLastQuantity(delta: 1 | -1): void {
    const last = cart[cart.length - 1];
    if (!last) return;
    const quantity = delta > 0 ? nextQuantity(last.quantity) : previousQuantity(last.quantity);
    setError(null);
    setCart((current) =>
      current.map((line) => (line.product.id === last.product.id ? { ...line, quantity } : line)),
    );
  }

  function removeLastItem(): void {
    const last = cart[cart.length - 1];
    if (last) removeLine(last.product.id);
  }

  return {
    orders: paused.orders,
    open: paused.open,
    setOpen: paused.setOpen,
    pauseSale,
    resumeSale,
    discardOrder,
    removeLine,
    clearSale,
    adjustLastQuantity,
    removeLastItem,
    guard,
  };
}
