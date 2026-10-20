import { and, eq } from 'drizzle-orm';

import type { Database } from '../../client';
import { stockBalances, stockMovements } from '../../schema/inventory';
import {
  InsufficientLedgerStockError,
  toStockBalanceRecord,
  toStockMovementRecord,
  type RecordMovementInput,
  type RecordMovementResult,
} from './ledger';
import { formatScaledQuantity, parseScaledQuantity } from './quantity';

/**
 * Minimal executor covering both a pooled database and a transaction, so the
 * ledger write can be composed inside a larger transaction such as goods
 * receipt without duplicating the balance/movement invariants.
 */
export type MovementExecutor = Pick<Database, 'select' | 'insert' | 'update'>;

/**
 * Row-locks the location/product balance, applies the signed delta and appends
 * the immutable movement row. Callers own the transaction boundary: concurrent
 * writes to the same balance serialise on the `FOR UPDATE` lock (ADR-0003).
 */
export async function recordMovementWithin(
  executor: MovementExecutor,
  input: RecordMovementInput,
): Promise<RecordMovementResult> {
  const where = and(
    eq(stockBalances.organizationId, input.organizationId),
    eq(stockBalances.locationId, input.locationId),
    eq(stockBalances.productId, input.productId),
  );
  const existingRows = await executor
    .select()
    .from(stockBalances)
    .where(where)
    .limit(1)
    .for('update');
  const existing = existingRows[0];
  const next = (existing ? parseScaledQuantity(existing.quantity) : 0n) + input.quantityDelta;
  if (input.enforceNonNegative && next < 0n) {
    throw new InsufficientLedgerStockError();
  }
  const now = new Date();

  const balanceRow = existing
    ? (
        await executor
          .update(stockBalances)
          .set({ quantity: formatScaledQuantity(next), updatedAt: now })
          .where(eq(stockBalances.id, existing.id))
          .returning()
      )[0]
    : (
        await executor
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
    await executor
      .insert(stockMovements)
      .values({
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
}
