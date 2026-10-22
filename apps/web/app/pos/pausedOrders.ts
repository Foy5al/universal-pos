import type { Product } from '@pos/contracts';

import type { CartLine } from './types';

const PAUSED_KEY = 'pos.pausedOrders.v1';
export const MAX_PAUSED_ORDERS = 20;

export interface PausedOrder {
  id: string;
  locationId: string;
  createdAt: string;
  lines: CartLine[];
}

function isProduct(value: unknown): value is Product {
  if (!value || typeof value !== 'object') return false;
  const product = value as Record<string, unknown>;
  return (
    typeof product.id === 'string' &&
    typeof product.sku === 'string' &&
    typeof product.name === 'string' &&
    typeof product.priceMinor === 'number' &&
    Number.isSafeInteger(product.priceMinor) &&
    product.priceMinor >= 0
  );
}

function isLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  return isProduct(line.product) && typeof line.quantity === 'string';
}

function isPausedOrder(value: unknown): value is PausedOrder {
  if (!value || typeof value !== 'object') return false;
  const order = value as Record<string, unknown>;
  if (
    typeof order.id !== 'string' ||
    typeof order.locationId !== 'string' ||
    typeof order.createdAt !== 'string' ||
    !Array.isArray(order.lines) ||
    order.lines.length === 0
  ) {
    return false;
  }
  const ids = new Set<string>();
  for (const line of order.lines) {
    if (!isLine(line)) return false;
    if (ids.has(line.product.id)) return false;
    ids.add(line.product.id);
  }
  return true;
}

export function readPausedOrders(): PausedOrder[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(PAUSED_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPausedOrder).slice(0, MAX_PAUSED_ORDERS);
  } catch {
    return [];
  }
}

export function writePausedOrders(orders: readonly PausedOrder[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PAUSED_KEY, JSON.stringify(orders.slice(0, MAX_PAUSED_ORDERS)));
  } catch {
    // A full quota must not stop the till; the in-memory copy still works.
  }
}

export function clearPausedOrders(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(PAUSED_KEY);
}

export function createPausedOrder(locationId: string, lines: readonly CartLine[]): PausedOrder {
  return {
    id: crypto.randomUUID(),
    locationId,
    createdAt: new Date().toISOString(),
    lines: lines.map((line) => ({ product: { ...line.product }, quantity: line.quantity })),
  };
}
