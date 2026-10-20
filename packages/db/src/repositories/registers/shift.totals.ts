import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { refunds } from '../../schema/refunds';
import { cashMovements } from '../../schema/registers';
import { sales } from '../../schema/sales';

type Reader = Pick<Database, 'select'>;

export interface ShiftTotals {
  cashSales: Map<string, number>;
  cashRefunds: Map<string, number>;
  cashIn: Map<string, number>;
  cashOut: Map<string, number>;
}

/** Sums immutable sale, refund and movement rows for the requested shifts. */
export async function readShiftTotals(
  reader: Reader,
  organizationId: string,
  shiftIds: readonly string[],
): Promise<ShiftTotals> {
  const totals: ShiftTotals = {
    cashSales: new Map(),
    cashRefunds: new Map(),
    cashIn: new Map(),
    cashOut: new Map(),
  };
  if (shiftIds.length === 0) return totals;

  const [salesRows, refundRows, movementRows] = await Promise.all([
    reader
      .select({
        shiftId: sales.registerShiftId,
        total: sql<string>`coalesce(sum(${sales.totalMinor}), 0)`,
      })
      .from(sales)
      .where(
        and(
          eq(sales.organizationId, organizationId),
          eq(sales.status, 'completed'),
          inArray(sales.registerShiftId, [...shiftIds]),
        ),
      )
      .groupBy(sales.registerShiftId),
    reader
      .select({
        shiftId: refunds.registerShiftId,
        total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)`,
      })
      .from(refunds)
      .where(
        and(
          eq(refunds.organizationId, organizationId),
          inArray(refunds.registerShiftId, [...shiftIds]),
        ),
      )
      .groupBy(refunds.registerShiftId),
    reader
      .select({
        shiftId: cashMovements.shiftId,
        type: cashMovements.type,
        total: sql<string>`coalesce(sum(${cashMovements.amountMinor}), 0)`,
      })
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.organizationId, organizationId),
          inArray(cashMovements.shiftId, [...shiftIds]),
        ),
      )
      .groupBy(cashMovements.shiftId, cashMovements.type),
  ]);

  for (const row of salesRows) {
    if (row.shiftId) totals.cashSales.set(row.shiftId, Number(row.total));
  }
  for (const row of refundRows) {
    totals.cashRefunds.set(row.shiftId, Number(row.total));
  }
  for (const row of movementRows) {
    const bucket = row.type === 'in' ? totals.cashIn : totals.cashOut;
    bucket.set(row.shiftId, Number(row.total));
  }
  return totals;
}
