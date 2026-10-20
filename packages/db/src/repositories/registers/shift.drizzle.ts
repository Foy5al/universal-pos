import { randomUUID } from 'node:crypto';

import { and, desc, eq, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../../client';
import { cashMovements, registerShifts } from '../../schema/registers';
import { isUniqueViolation } from '../catalog/errors';
import type { CatalogListOptions } from '../catalog/types';
import {
  RegisterShiftConflictError,
  RegisterShiftNotOpenError,
  RegisterShiftNotFoundError,
  type CashMovementRecord,
  type RegisterShiftRecord,
  type RegisterShiftRepository,
} from './shift';
import { readShiftTotals, type ShiftTotals } from './shift.totals';

type ShiftRow = typeof registerShifts.$inferSelect;
type MovementRow = typeof cashMovements.$inferSelect;

function toRecord(
  row: ShiftRow,
  cashSalesMinor: number,
  cashRefundsMinor: number,
  cashInMinor: number,
  cashOutMinor: number,
): RegisterShiftRecord {
  const expectedCashMinor =
    row.status === 'closed' && row.expectedCashMinor !== null
      ? row.expectedCashMinor
      : row.openingFloatMinor + cashSalesMinor + cashInMinor - cashOutMinor - cashRefundsMinor;
  const countedCashMinor = row.status === 'closed' ? row.countedCashMinor : null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    registerId: row.registerId,
    status: row.status,
    openingFloatMinor: row.openingFloatMinor,
    cashSalesMinor,
    cashRefundsMinor,
    cashInMinor,
    cashOutMinor,
    expectedCashMinor,
    countedCashMinor,
    varianceMinor: countedCashMinor === null ? null : countedCashMinor - expectedCashMinor,
    openedBy: row.openedBy,
    closedBy: row.closedBy,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    notes: row.notes,
  };
}

function toMovementRecord(row: MovementRow): CashMovementRecord {
  return {
    id: row.id,
    shiftId: row.shiftId,
    type: row.type,
    amountMinor: row.amountMinor,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function recordFor(row: ShiftRow, totals: ShiftTotals): RegisterShiftRecord {
  return toRecord(
    row,
    totals.cashSales.get(row.id) ?? 0,
    totals.cashRefunds.get(row.id) ?? 0,
    totals.cashIn.get(row.id) ?? 0,
    totals.cashOut.get(row.id) ?? 0,
  );
}

export function createDrizzleRegisterShiftRepository(db: Database): RegisterShiftRepository {
  const lockedShift = async (
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    organizationId: string,
    shiftId: string,
  ): Promise<ShiftRow> => {
    const rows = await tx
      .select()
      .from(registerShifts)
      .where(and(eq(registerShifts.organizationId, organizationId), eq(registerShifts.id, shiftId)))
      .for('update');
    const row = rows[0];
    if (!row) throw new RegisterShiftNotFoundError();
    return row;
  };

  return {
    async list(organizationId, filters, options: CatalogListOptions) {
      const conditions: SQL[] = [eq(registerShifts.organizationId, organizationId)];
      if (filters.registerId) conditions.push(eq(registerShifts.registerId, filters.registerId));
      if (filters.status) conditions.push(eq(registerShifts.status, filters.status));
      const where = and(...conditions);
      const rows = await db
        .select()
        .from(registerShifts)
        .where(where)
        .orderBy(desc(registerShifts.openedAt), desc(registerShifts.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(registerShifts)
        .where(where);
      const totals = await readShiftTotals(
        db,
        organizationId,
        rows.map((row) => row.id),
      );
      return {
        items: rows.map((row) => recordFor(row, totals)),
        total: countRows[0]?.count ?? 0,
      };
    },

    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(registerShifts)
        .where(and(eq(registerShifts.organizationId, organizationId), eq(registerShifts.id, id)))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const totals = await readShiftTotals(db, organizationId, [row.id]);
      return recordFor(row, totals);
    },

    async findOpenByRegister(organizationId, registerId) {
      const rows = await db
        .select()
        .from(registerShifts)
        .where(
          and(
            eq(registerShifts.organizationId, organizationId),
            eq(registerShifts.registerId, registerId),
            eq(registerShifts.status, 'open'),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const totals = await readShiftTotals(db, organizationId, [row.id]);
      return recordFor(row, totals);
    },

    async open(input) {
      try {
        const rows = await db
          .insert(registerShifts)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            storeId: input.storeId,
            registerId: input.registerId,
            openingFloatMinor: input.openingFloatMinor,
            openedBy: input.openedBy,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Failed to open register shift');
        return toRecord(row, 0, 0, 0, 0);
      } catch (error) {
        if (isUniqueViolation(error)) throw new RegisterShiftConflictError();
        throw error;
      }
    },

    async addCashMovement(input) {
      return db.transaction(async (tx) => {
        const shift = await lockedShift(tx, input.organizationId, input.shiftId);
        if (shift.status !== 'open') throw new RegisterShiftNotOpenError();
        const rows = await tx
          .insert(cashMovements)
          .values({
            id: randomUUID(),
            organizationId: input.organizationId,
            shiftId: input.shiftId,
            type: input.type,
            amountMinor: input.amountMinor,
            reason: input.reason,
            createdBy: input.createdBy,
          })
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Failed to record cash movement');
        return toMovementRecord(row);
      });
    },

    async close(input) {
      return db.transaction(async (tx) => {
        const shift = await lockedShift(tx, input.organizationId, input.shiftId);
        if (shift.status !== 'open') throw new RegisterShiftNotOpenError();
        const totals = await readShiftTotals(tx, input.organizationId, [shift.id]);
        const cashSales = totals.cashSales.get(shift.id) ?? 0;
        const cashRefunds = totals.cashRefunds.get(shift.id) ?? 0;
        const cashIn = totals.cashIn.get(shift.id) ?? 0;
        const cashOut = totals.cashOut.get(shift.id) ?? 0;
        const expected = shift.openingFloatMinor + cashSales + cashIn - cashOut - cashRefunds;
        const rows = await tx
          .update(registerShifts)
          .set({
            status: 'closed',
            expectedCashMinor: expected,
            countedCashMinor: input.countedCashMinor,
            varianceMinor: input.countedCashMinor - expected,
            closedBy: input.closedBy,
            closedAt: new Date(),
            notes: input.notes ?? null,
          })
          .where(eq(registerShifts.id, shift.id))
          .returning();
        const row = rows[0];
        if (!row) throw new Error('Failed to close register shift');
        return toRecord(row, cashSales, cashRefunds, cashIn, cashOut);
      });
    },
  };
}
