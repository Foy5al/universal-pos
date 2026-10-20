import type { Product, StockBalance } from '@pos/contracts';

import { scaledQuantity } from './checkout';
import type { PosOfflineDatabase } from './db';

const QUANTITY_FACTOR = 10_000n;

function formatScaled(value: bigint): string {
  const whole = value / QUANTITY_FACTOR;
  const fraction = (value % QUANTITY_FACTOR).toString().padStart(4, '0').replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

export async function cacheProducts(
  db: PosOfflineDatabase,
  products: readonly Product[],
): Promise<void> {
  const cachedAt = new Date().toISOString();
  await db.transaction('rw', db.products, async () => {
    await db.products.clear();
    await db.products.bulkPut(products.map((product) => ({ ...product, cachedAt })));
  });
}

export async function readCachedProducts(db: PosOfflineDatabase): Promise<Product[]> {
  return db.products.toArray();
}

export async function cacheBalances(
  db: PosOfflineDatabase,
  locationId: string,
  balances: readonly Pick<StockBalance, 'productId' | 'quantity'>[],
): Promise<void> {
  const cachedAt = new Date().toISOString();
  await db.transaction('rw', db.balances, async () => {
    const existing = await db.balances.where('locationId').equals(locationId).primaryKeys();
    await db.balances.bulkDelete(existing);
    await db.balances.bulkPut(
      balances.map((balance) => ({
        id: `${locationId}:${balance.productId}`,
        locationId,
        productId: balance.productId,
        quantity: balance.quantity,
        cachedAt,
      })),
    );
  });
}

/**
 * Cached stock minus local sales still awaiting the server. The result is an
 * estimate only; the server remains authoritative after sync (ADR-0014).
 */
export async function readCachedBalances(
  db: PosOfflineDatabase,
  locationId: string,
): Promise<Array<{ productId: string; quantity: string }>> {
  const [balances, sales] = await Promise.all([
    db.balances.where('locationId').equals(locationId).toArray(),
    db.localSales.where('status').anyOf('local_pending', 'requires_review').toArray(),
  ]);

  const pending = new Map<string, bigint>();
  for (const sale of sales) {
    if (sale.locationId !== locationId) continue;
    for (const line of sale.lines) {
      const current = pending.get(line.productId) ?? 0n;
      pending.set(line.productId, current + scaledQuantity(line.quantity));
    }
  }

  return balances.map((balance) => {
    const sold = pending.get(balance.productId) ?? 0n;
    const remaining = scaledQuantity(balance.quantity) - sold;
    return {
      productId: balance.productId,
      quantity: formatScaled(remaining > 0n ? remaining : 0n),
    };
  });
}
