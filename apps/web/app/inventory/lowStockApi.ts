import type {
  LowStockOverview,
  LowStockSettings,
  SetProductLowStockThresholdResult,
} from '@pos/contracts';

import { apiFetch } from '../lib/api';

export function fetchLowStockSettings(): Promise<LowStockSettings> {
  return apiFetch('/inventory/low-stock/settings');
}

export function fetchLowStock(locationId?: string): Promise<LowStockOverview> {
  const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : '';
  return apiFetch(`/inventory/low-stock${query}`);
}

export function saveGlobalLowStockThreshold(
  globalThreshold: string | null,
): Promise<LowStockSettings> {
  return apiFetch('/inventory/low-stock/settings', {
    method: 'PUT',
    body: { globalThreshold },
  });
}

export function saveProductLowStockThreshold(
  productId: string,
  threshold: string | null,
): Promise<SetProductLowStockThresholdResult> {
  return apiFetch(`/inventory/low-stock/products/${encodeURIComponent(productId)}`, {
    method: 'PUT',
    body: { threshold },
  });
}
