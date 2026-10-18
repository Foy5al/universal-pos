import { randomUUID } from 'node:crypto';

import { stockBalances, stockMovements } from '../../schema/inventory';
import type { CatalogListOptions, CatalogListResult } from '../catalog/types';
import { formatScaledQuantity } from './quantity';

export type StockMovementType = 'adjustment' | 'receipt' | 'issue';

export interface StockBalanceRecord {
  locationId: string;
  productId: string;
  quantity: string;
  updatedAt: string;
}

export interface StockMovementRecord {
  id: string;
  organizationId: string;
  locationId: string;
  productId: string;
  movementType: StockMovementType;
  quantityDelta: string;
  balanceAfter: string;
  reason: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface StockFilters {
  locationId?: string | undefined;
  productId?: string | undefined;
}

export interface RecordMovementInput {
  organizationId: string;
  locationId: string;
  productId: string;
  movementType: StockMovementType;
  /** Signed quantity in scaled units (1 unit = 10^4). */
  quantityDelta: bigint;
  reason?: string | undefined;
  occurredAt?: Date | undefined;
}

export interface RecordMovementResult {
  movement: StockMovementRecord;
  balance: StockBalanceRecord;
}

export interface StockLedgerRepository {
  listBalances(
    organizationId: string,
    filters: StockFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<StockBalanceRecord>>;
  listMovements(
    organizationId: string,
    filters: StockFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<StockMovementRecord>>;
  recordMovement(input: RecordMovementInput): Promise<RecordMovementResult>;
}

export function toStockBalanceRecord(row: typeof stockBalances.$inferSelect): StockBalanceRecord {
  return {
    locationId: row.locationId,
    productId: row.productId,
    quantity: row.quantity,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toStockMovementRecord(
  row: typeof stockMovements.$inferSelect,
): StockMovementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    productId: row.productId,
    movementType: row.movementType,
    quantityDelta: row.quantityDelta,
    balanceAfter: row.balanceAfter,
    reason: row.reason,
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

interface InMemoryBalance {
  organizationId: string;
  locationId: string;
  productId: string;
  quantity: bigint;
  updatedAt: Date;
}

function balanceKey(locationId: string, productId: string): string {
  return `${locationId}:${productId}`;
}

function matchesFilters(
  record: { locationId: string; productId: string },
  filters: StockFilters,
): boolean {
  if (filters.locationId && record.locationId !== filters.locationId) return false;
  if (filters.productId && record.productId !== filters.productId) return false;
  return true;
}

export class InMemoryStockLedgerRepository implements StockLedgerRepository {
  private readonly balances = new Map<string, InMemoryBalance>();
  private readonly movements: StockMovementRecord[] = [];

  async listBalances(
    organizationId: string,
    filters: StockFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<StockBalanceRecord>> {
    const scoped = [...this.balances.values()]
      .filter((balance) => balance.organizationId === organizationId)
      .filter((balance) => matchesFilters(balance, filters))
      .sort(
        (a, b) =>
          a.locationId.localeCompare(b.locationId) || a.productId.localeCompare(b.productId),
      );
    return {
      items: scoped.slice(options.offset, options.offset + options.limit).map((balance) => ({
        locationId: balance.locationId,
        productId: balance.productId,
        quantity: formatScaledQuantity(balance.quantity),
        updatedAt: balance.updatedAt.toISOString(),
      })),
      total: scoped.length,
    };
  }

  async listMovements(
    organizationId: string,
    filters: StockFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<StockMovementRecord>> {
    const scoped = this.movements
      .filter((movement) => movement.organizationId === organizationId)
      .filter((movement) => matchesFilters(movement, filters))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async recordMovement(input: RecordMovementInput): Promise<RecordMovementResult> {
    const key = balanceKey(input.locationId, input.productId);
    const existing = this.balances.get(key);
    const next = (existing?.quantity ?? 0n) + input.quantityDelta;
    const now = new Date();
    this.balances.set(key, {
      organizationId: input.organizationId,
      locationId: input.locationId,
      productId: input.productId,
      quantity: next,
      updatedAt: now,
    });

    const movement: StockMovementRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      locationId: input.locationId,
      productId: input.productId,
      movementType: input.movementType,
      quantityDelta: formatScaledQuantity(input.quantityDelta),
      balanceAfter: formatScaledQuantity(next),
      reason: input.reason ?? null,
      occurredAt: (input.occurredAt ?? now).toISOString(),
      createdAt: now.toISOString(),
    };
    this.movements.push(movement);

    return {
      movement,
      balance: {
        locationId: input.locationId,
        productId: input.productId,
        quantity: formatScaledQuantity(next),
        updatedAt: now.toISOString(),
      },
    };
  }
}
