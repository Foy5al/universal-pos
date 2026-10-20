import { randomUUID } from 'node:crypto';

import type { StockLossReason, StockMovementType } from '@pos/contracts';

import { stockBalances, stockMovements } from '../../schema/inventory';
import type { CatalogListOptions, CatalogListResult } from '../catalog/types';
import { formatScaledQuantity, parseScaledQuantity } from './quantity';

/** PostgreSQL returns `numeric` as a scale-padded string; normalise to the canonical form. */
function formatNumeric(value: string): string {
  return formatScaledQuantity(parseScaledQuantity(value));
}

export class InsufficientLedgerStockError extends Error {
  constructor() {
    super('Insufficient stock for this operation');
    this.name = 'InsufficientLedgerStockError';
  }
}

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
  lossReason: StockLossReason | null;
  expiresOn: string | null;
  unitCostMinor: number | null;
  occurredAt: string;
  createdAt: string;
}

export interface StockFilters {
  locationId?: string | undefined;
  locationIds?: readonly string[] | undefined;
  productId?: string | undefined;
  movementType?: StockMovementType | undefined;
  lossReason?: StockLossReason | undefined;
  onlyLosses?: boolean | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

export interface StockMovementSummary {
  count: number;
  units: string;
  costValueMinor: number;
  missingCostCount: number;
}

export function movementCostValue(quantityDelta: string, unitCostMinor: number | null): number {
  if (unitCostMinor === null) return 0;
  const scaled = parseScaledQuantity(quantityDelta);
  const absolute = scaled < 0n ? -scaled : scaled;
  const minor = (absolute * BigInt(unitCostMinor) + 5000n) / 10000n;
  return Number(minor);
}

export interface RecordMovementInput {
  organizationId: string;
  locationId: string;
  productId: string;
  movementType: StockMovementType;
  /** Signed quantity in scaled units (1 unit = 10^4). */
  quantityDelta: bigint;
  reason?: string | undefined;
  lossReason?: StockLossReason | undefined;
  expiresOn?: string | undefined;
  unitCostMinor?: number | null | undefined;
  enforceNonNegative?: boolean | undefined;
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
  summarizeMovements(organizationId: string, filters: StockFilters): Promise<StockMovementSummary>;
  recordMovement(input: RecordMovementInput): Promise<RecordMovementResult>;
}

export function toStockBalanceRecord(row: typeof stockBalances.$inferSelect): StockBalanceRecord {
  return {
    locationId: row.locationId,
    productId: row.productId,
    quantity: formatNumeric(row.quantity),
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
    quantityDelta: formatNumeric(row.quantityDelta),
    balanceAfter: formatNumeric(row.balanceAfter),
    reason: row.reason,
    lossReason: row.lossReason,
    expiresOn: row.expiresOn,
    unitCostMinor: row.unitCostMinor,
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
  if (filters.locationIds && !filters.locationIds.includes(record.locationId)) return false;
  if (filters.productId && record.productId !== filters.productId) return false;
  return true;
}

function matchesMovementFilters(movement: StockMovementRecord, filters: StockFilters): boolean {
  if (!matchesFilters(movement, filters)) return false;
  if (filters.movementType && movement.movementType !== filters.movementType) return false;
  if (filters.lossReason && movement.lossReason !== filters.lossReason) return false;
  if (filters.onlyLosses && movement.lossReason === null) return false;
  if (filters.from && movement.occurredAt < filters.from) return false;
  if (filters.to && movement.occurredAt > filters.to) return false;
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
      .filter((movement) => matchesMovementFilters(movement, filters))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async summarizeMovements(
    organizationId: string,
    filters: StockFilters,
  ): Promise<StockMovementSummary> {
    const scoped = this.movements
      .filter((movement) => movement.organizationId === organizationId)
      .filter((movement) => matchesMovementFilters(movement, filters));
    let absolute = 0n;
    let costValueMinor = 0;
    let missingCostCount = 0;
    for (const movement of scoped) {
      const scaled = parseScaledQuantity(movement.quantityDelta);
      absolute += scaled < 0n ? -scaled : scaled;
      costValueMinor += movementCostValue(movement.quantityDelta, movement.unitCostMinor);
      if (movement.unitCostMinor === null) missingCostCount += 1;
    }
    return {
      count: scoped.length,
      units: formatScaledQuantity(absolute),
      costValueMinor,
      missingCostCount,
    };
  }

  async recordMovement(input: RecordMovementInput): Promise<RecordMovementResult> {
    const key = balanceKey(input.locationId, input.productId);
    const existing = this.balances.get(key);
    const next = (existing?.quantity ?? 0n) + input.quantityDelta;
    if (input.enforceNonNegative && next < 0n) {
      throw new InsufficientLedgerStockError();
    }
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
      lossReason: input.lossReason ?? null,
      expiresOn: input.expiresOn ?? null,
      unitCostMinor: input.unitCostMinor ?? null,
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
