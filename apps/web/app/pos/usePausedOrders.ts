'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  createPausedOrder,
  MAX_PAUSED_ORDERS,
  readPausedOrders,
  writePausedOrders,
  type PausedOrder,
} from './pausedOrders';
import type { CartLine } from './types';

interface PauseResult {
  ok: boolean;
  message?: string;
}

interface ResumeResult {
  order: PausedOrder | null;
  message?: string;
}

export function usePausedOrders(locationId: string) {
  const [orders, setOrders] = useState<PausedOrder[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOrders(readPausedOrders());
  }, []);

  const persist = useCallback((next: PausedOrder[]) => {
    setOrders(next);
    writePausedOrders(next);
  }, []);

  const pause = useCallback(
    (lines: CartLine[]): PauseResult => {
      if (lines.length === 0) return { ok: false, message: 'The sale has no items to pause.' };
      if (orders.length >= MAX_PAUSED_ORDERS) {
        return {
          ok: false,
          message: `Only ${MAX_PAUSED_ORDERS} sales can be paused. Resume or discard one first.`,
        };
      }
      persist([createPausedOrder(locationId, lines), ...orders]);
      return { ok: true };
    },
    [locationId, orders, persist],
  );

  const resume = useCallback(
    (id: string, currentLines: CartLine[]): ResumeResult => {
      const target = orders.find((order) => order.id === id && order.locationId === locationId);
      if (!target) return { order: null, message: 'That paused sale is no longer available.' };

      let next = orders;
      if (currentLines.length > 0) {
        if (orders.length >= MAX_PAUSED_ORDERS) {
          return {
            order: null,
            message: `Only ${MAX_PAUSED_ORDERS} sales can be paused. Discard one before switching.`,
          };
        }
        next = [createPausedOrder(locationId, currentLines), ...orders];
      }
      persist(next.filter((order) => order.id !== id));
      return { order: target };
    },
    [locationId, orders, persist],
  );

  const discard = useCallback(
    (id: string) => {
      persist(orders.filter((order) => order.id !== id));
    },
    [orders, persist],
  );

  const clear = useCallback(() => {
    persist([]);
  }, [persist]);

  return {
    orders: orders.filter((order) => order.locationId === locationId),
    open,
    setOpen,
    pause,
    resume,
    discard,
    clear,
  };
}
