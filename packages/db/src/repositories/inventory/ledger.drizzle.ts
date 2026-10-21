import { and, asc, desc, eq, gte, inArray, isNotNull, lte, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../client';
import { stockBalances, stockMovements } from '../../schema/inventory';
import {
  toStockBalanceRecord,
  toStockMovementRecord,
  type StockFilters,
  type StockLedgerRepository,
} from './ledger';
import { recordMovementWithin } from './ledger.core';
import { formatScaledQuantity, parseScaledQuantity } from './quantity';

function buildMovementFilters(organizationId: string, filters: StockFilters): SQL | undefined {
  const conditions = [eq(stockMovements.organizationId, organizationId)];
  if (filters.locationId) conditions.push(eq(stockMovements.locationId, filters.locationId));
  if (filters.locationIds) {
    if (filters.locationIds.length === 0) return sql`false`;
    conditions.push(inArray(stockMovements.locationId, [...filters.locationIds]));
  }
  if (filters.productId) conditions.push(eq(stockMovements.productId, filters.productId));
  if (filters.movementType) {
    conditions.push(eq(stockMovements.movementType, filters.movementType));
  }
  if (filters.lossReason) conditions.push(eq(stockMovements.lossReason, filters.lossReason));
  if (filters.onlyLosses) conditions.push(isNotNull(stockMovements.lossReason));
  if (filters.from) conditions.push(gte(stockMovements.occurredAt, new Date(filters.from)));
  if (filters.to) conditions.push(lte(stockMovements.occurredAt, new Date(filters.to)));
  return and(...conditions);
}

/**
 * Postgres stock ledger. The balance mutation and its movement row are written
 * in one transaction that row-locks an existing balance before updating it, so
 * concurrent adjustments to the same location/product cannot interleave into a
 * lost update (ADR-0003).
 */
export function createDrizzleStockLedgerRepository(db: Database): StockLedgerRepository {
  return {
    async listBalances(organizationId, filters, options) {
      const conditions = [eq(stockBalances.organizationId, organizationId)];
      if (filters.locationId) conditions.push(eq(stockBalances.locationId, filters.locationId));
      if (filters.locationIds) {
        if (filters.locationIds.length === 0) return { items: [], total: 0 };
        conditions.push(inArray(stockBalances.locationId, [...filters.locationIds]));
      }
      if (filters.productId) conditions.push(eq(stockBalances.productId, filters.productId));
      const where = and(...conditions);
      const rows = await db
        .select()
        .from(stockBalances)
        .where(where)
        .orderBy(asc(stockBalances.locationId), asc(stockBalances.productId))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(stockBalances)
        .where(where);
      return { items: rows.map(toStockBalanceRecord), total: countRows[0]?.count ?? 0 };
    },
    async listMovements(organizationId, filters, options) {
      const where = buildMovementFilters(organizationId, filters);
      const rows = await db
        .select()
        .from(stockMovements)
        .where(where)
        .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(stockMovements)
        .where(where);
      return { items: rows.map(toStockMovementRecord), total: countRows[0]?.count ?? 0 };
    },
    async summarizeMovements(organizationId, filters) {
      const where = buildMovementFilters(organizationId, filters);
      const rows = await db
        .select({
          count: sql<number>`count(*)::int`,
          units: sql<string>`coalesce(sum(abs(${stockMovements.quantityDelta})), 0)::text`,
          costValueMinor: sql<number>`coalesce(sum(round(abs(${stockMovements.quantityDelta}) * coalesce(${stockMovements.unitCostMinor}, 0))), 0)::bigint`,
          missingCostCount: sql<number>`(count(*) filter (where ${stockMovements.unitCostMinor} is null))::int`,
        })
        .from(stockMovements)
        .where(where);
      const summary = rows[0];
      return {
        count: summary?.count ?? 0,
        units: formatScaledQuantity(parseScaledQuantity(summary?.units ?? '0')),
        costValueMinor: Number(summary?.costValueMinor ?? 0),
        missingCostCount: summary?.missingCostCount ?? 0,
      };
    },
    async sumOnHandByProduct(organizationId, filters) {
      const conditions = [eq(stockBalances.organizationId, organizationId)];
      if (filters.locationId) conditions.push(eq(stockBalances.locationId, filters.locationId));
      if (filters.locationIds) {
        if (filters.locationIds.length === 0) return [];
        conditions.push(inArray(stockBalances.locationId, [...filters.locationIds]));
      }
      if (filters.productId) conditions.push(eq(stockBalances.productId, filters.productId));
      const rows = await db
        .select({
          productId: stockBalances.productId,
          quantity: sql<string>`coalesce(sum(${stockBalances.quantity}), 0)::text`,
        })
        .from(stockBalances)
        .where(and(...conditions))
        .groupBy(stockBalances.productId)
        .orderBy(asc(stockBalances.productId));
      return rows.map((row) => ({
        productId: row.productId,
        quantity: formatScaledQuantity(parseScaledQuantity(row.quantity)),
      }));
    },
    async recordMovement(input) {
      return db.transaction((tx) => recordMovementWithin(tx, input));
    },
  };
}
