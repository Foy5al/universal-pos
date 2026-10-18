import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../client';
import { stockBalances, stockMovements } from '../../schema/inventory';
import {
  toStockBalanceRecord,
  toStockMovementRecord,
  type StockFilters,
  type StockLedgerRepository,
} from './ledger';
import { formatScaledQuantity, parseScaledQuantity } from './quantity';

function buildMovementFilters(organizationId: string, filters: StockFilters): SQL | undefined {
  const conditions = [eq(stockMovements.organizationId, organizationId)];
  if (filters.locationId) conditions.push(eq(stockMovements.locationId, filters.locationId));
  if (filters.productId) conditions.push(eq(stockMovements.productId, filters.productId));
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
    async recordMovement(input) {
      return db.transaction(async (tx) => {
        const where = and(
          eq(stockBalances.organizationId, input.organizationId),
          eq(stockBalances.locationId, input.locationId),
          eq(stockBalances.productId, input.productId),
        );
        const existingRows = await tx
          .select()
          .from(stockBalances)
          .where(where)
          .limit(1)
          .for('update');
        const existing = existingRows[0];
        const next = (existing ? parseScaledQuantity(existing.quantity) : 0n) + input.quantityDelta;
        const now = new Date();

        const balanceRow = existing
          ? (
              await tx
                .update(stockBalances)
                .set({ quantity: formatScaledQuantity(next), updatedAt: now })
                .where(eq(stockBalances.id, existing.id))
                .returning()
            )[0]
          : (
              await tx
                .insert(stockBalances)
                .values({
                  organizationId: input.organizationId,
                  locationId: input.locationId,
                  productId: input.productId,
                  quantity: formatScaledQuantity(next),
                  updatedAt: now,
                })
                .returning()
            )[0];

        const movementRow = (
          await tx
            .insert(stockMovements)
            .values({
              organizationId: input.organizationId,
              locationId: input.locationId,
              productId: input.productId,
              movementType: input.movementType,
              quantityDelta: formatScaledQuantity(input.quantityDelta),
              balanceAfter: formatScaledQuantity(next),
              reason: input.reason ?? null,
              occurredAt: input.occurredAt ?? now,
            })
            .returning()
        )[0];

        if (!balanceRow || !movementRow) {
          throw new Error('Failed to record stock movement');
        }
        return {
          movement: toStockMovementRecord(movementRow),
          balance: toStockBalanceRecord(balanceRow),
        };
      });
    },
  };
}
