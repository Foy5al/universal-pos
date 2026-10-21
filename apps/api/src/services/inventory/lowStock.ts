import type {
  LowStockOverview,
  LowStockQuery,
  LowStockSettings,
  Principal,
  SetProductLowStockThresholdResult,
} from '@pos/contracts';
import {
  formatScaledQuantity,
  parseScaledQuantity,
  type LowStockSettingsRepository,
  type ProductRepository,
  type StockLedgerRepository,
  type StockLocationRepository,
} from '@pos/db';

import { notFound } from '../../core/errors';
import { hasStoreScope } from '../../core/principal';

export interface LowStockResolution {
  threshold: bigint;
  source: 'product' | 'global';
}

/**
 * A product-level threshold is the source of truth; the organization-wide value
 * is only a fallback for products that do not define their own.
 */
export function resolveLowStockThreshold(
  productThreshold: bigint | null,
  globalThreshold: bigint | null,
): LowStockResolution | null {
  if (productThreshold !== null) {
    return { threshold: productThreshold, source: 'product' };
  }
  if (globalThreshold !== null) {
    return { threshold: globalThreshold, source: 'global' };
  }
  return null;
}

function normalizeThreshold(value: string | null): string | null {
  return value === null ? null : formatScaledQuantity(parseScaledQuantity(value));
}

function parseOptional(value: string | null): bigint | null {
  return value === null ? null : parseScaledQuantity(value);
}

export interface LowStockService {
  getSettings(organizationId: string): Promise<LowStockSettings>;
  updateSettings(organizationId: string, globalThreshold: string | null): Promise<LowStockSettings>;
  setProductThreshold(
    organizationId: string,
    productId: string,
    threshold: string | null,
  ): Promise<SetProductLowStockThresholdResult>;
  list(principal: Principal, query: LowStockQuery): Promise<LowStockOverview>;
}

export function createLowStockService(
  settingsRepository: LowStockSettingsRepository,
  products: ProductRepository,
  ledger: StockLedgerRepository,
  locations: StockLocationRepository,
): LowStockService {
  async function getSettings(organizationId: string): Promise<LowStockSettings> {
    const settings = await settingsRepository.get(organizationId);
    return {
      organizationId,
      globalThreshold: settings?.globalThreshold ?? null,
      updatedAt: settings?.updatedAt ?? null,
    };
  }

  return {
    getSettings,
    async updateSettings(organizationId, globalThreshold) {
      const saved = await settingsRepository.upsert(
        organizationId,
        normalizeThreshold(globalThreshold),
      );
      return {
        organizationId: saved.organizationId,
        globalThreshold: saved.globalThreshold,
        updatedAt: saved.updatedAt,
      };
    },
    async setProductThreshold(organizationId, productId, threshold) {
      const product = await products.findById(organizationId, productId);
      if (!product) {
        throw notFound('Product not found');
      }
      const saved = await products.setLowStockThreshold(
        organizationId,
        productId,
        normalizeThreshold(threshold),
      );
      if (!saved) {
        throw notFound('Product not found');
      }
      return { productId, threshold: saved.lowStockThreshold ?? null };
    },
    async list(principal, query) {
      const organizationId = principal.organizationId;
      let locationIds: string[] | undefined;
      if (query.locationId) {
        const location = await locations.findById(organizationId, query.locationId);
        const scoped =
          location !== null &&
          (location.storeId === null
            ? principal.storeIds.length === 0
            : hasStoreScope(principal, location.storeId));
        if (!scoped) {
          throw notFound('Stock location not found');
        }
      } else if (principal.storeIds.length > 0) {
        const allowed = await locations.listByStoreIds(organizationId, principal.storeIds);
        locationIds = allowed.map((location) => location.id);
      }

      const [settings, activeProducts, balanceRows] = await Promise.all([
        settingsRepository.get(organizationId),
        products.listActive(organizationId),
        ledger.sumOnHandByProduct(organizationId, {
          locationId: query.locationId,
          locationIds,
        }),
      ]);
      // A store-scoped user with no visible location must not see every product
      // reported as zero stock.
      const visibleLocations = locationIds === undefined || locationIds.length > 0;

      const globalThreshold = settings?.globalThreshold ?? null;
      const globalScaled = parseOptional(globalThreshold);
      const onHand = new Map(
        balanceRows.map((row) => [row.productId, parseScaledQuantity(row.quantity)]),
      );

      const items: LowStockOverview['items'] = [];
      const productThresholds: LowStockOverview['productThresholds'] = [];
      const shortfalls = new Map<string, bigint>();

      for (const product of activeProducts) {
        const productScaled = parseOptional(product.lowStockThreshold ?? null);
        if (productScaled !== null) {
          productThresholds.push({
            productId: product.id,
            threshold: formatScaledQuantity(productScaled),
          });
        }
        const resolution = resolveLowStockThreshold(productScaled, globalScaled);
        if (!resolution) continue;

        const quantity = onHand.get(product.id) ?? 0n;
        if (!visibleLocations || quantity >= resolution.threshold) continue;

        shortfalls.set(product.id, resolution.threshold - quantity);
        items.push({
          productId: product.id,
          name: product.name,
          sku: product.sku,
          onHand: formatScaledQuantity(quantity),
          threshold: formatScaledQuantity(resolution.threshold),
          source: resolution.source,
        });
      }

      items.sort((left, right) => {
        const leftShortfall = shortfalls.get(left.productId) ?? 0n;
        const rightShortfall = shortfalls.get(right.productId) ?? 0n;
        if (leftShortfall !== rightShortfall) {
          return leftShortfall > rightShortfall ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

      return {
        locationId: query.locationId ?? null,
        globalThreshold,
        items,
        productThresholds,
      };
    },
  };
}
