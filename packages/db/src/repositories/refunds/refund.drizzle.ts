import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { refundLines, refunds } from '../../schema/refunds';
import { registerShifts } from '../../schema/registers';
import { sales } from '../../schema/sales';
import { isUniqueViolation } from '../catalog/errors';
import { recordMovementWithin } from '../inventory/ledger.core';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import { RegisterShiftNotOpenError } from '../registers/shift';
import {
  buildRefundNumber,
  SaleAlreadyRefundedError,
  SaleNotRefundableError,
  type RefundLineRecord,
  type RefundRecord,
  type RefundRepository,
} from './refund';

type RefundRow = typeof refunds.$inferSelect;
type LineRow = typeof refundLines.$inferSelect;
type Reader = Pick<Database, 'select'>;

function toLineRecord(row: LineRow): RefundLineRecord {
  return {
    id: row.id,
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    quantity: formatScaledQuantity(parseScaledQuantity(row.quantity)),
    unitPriceMinor: row.unitPriceMinor,
    lineTotalMinor: row.lineTotalMinor,
  };
}

function toRefundRecord(row: RefundRow, lines: readonly LineRow[]): RefundRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    saleId: row.saleId,
    registerShiftId: row.registerShiftId,
    refundNumber: row.refundNumber,
    operationId: row.operationId,
    amountMinor: row.amountMinor,
    reason: row.reason,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lines: lines.map(toLineRecord),
  };
}

async function loadRefund(
  reader: Reader,
  organizationId: string,
  id: string,
): Promise<RefundRecord | null> {
  const rows = await reader
    .select()
    .from(refunds)
    .where(and(eq(refunds.organizationId, organizationId), eq(refunds.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const lineRows = await reader
    .select()
    .from(refundLines)
    .where(eq(refundLines.refundId, id))
    .orderBy(refundLines.id);
  return toRefundRecord(row, lineRows);
}

export function createDrizzleRefundRepository(db: Database): RefundRepository {
  const findByOperationId = async (
    organizationId: string,
    operationId: string,
  ): Promise<RefundRecord | null> => {
    const rows = await db
      .select({ id: refunds.id })
      .from(refunds)
      .where(and(eq(refunds.organizationId, organizationId), eq(refunds.operationId, operationId)))
      .limit(1);
    const row = rows[0];
    return row ? loadRefund(db, organizationId, row.id) : null;
  };

  const findBySaleId = async (
    organizationId: string,
    saleId: string,
  ): Promise<RefundRecord | null> => {
    const rows = await db
      .select({ id: refunds.id })
      .from(refunds)
      .where(and(eq(refunds.organizationId, organizationId), eq(refunds.saleId, saleId)))
      .limit(1);
    const row = rows[0];
    return row ? loadRefund(db, organizationId, row.id) : null;
  };

  return {
    findByOperationId,
    findBySaleId,
    async sumByShift(organizationId, registerShiftId) {
      const rows = await db
        .select({ total: sql<string>`coalesce(sum(${refunds.amountMinor}), 0)` })
        .from(refunds)
        .where(
          and(
            eq(refunds.organizationId, organizationId),
            eq(refunds.registerShiftId, registerShiftId),
          ),
        );
      return Number(rows[0]?.total ?? 0);
    },
    async create(input) {
      const existing = await findByOperationId(input.organizationId, input.operationId);
      if (existing) {
        return existing;
      }

      try {
        return await db.transaction(async (tx) => {
          const shiftRows = await tx
            .select()
            .from(registerShifts)
            .where(
              and(
                eq(registerShifts.organizationId, input.organizationId),
                eq(registerShifts.id, input.registerShiftId),
              ),
            )
            .for('update');
          if (!shiftRows[0] || shiftRows[0].status !== 'open') {
            throw new RegisterShiftNotOpenError();
          }

          const saleRows = await tx
            .select()
            .from(sales)
            .where(and(eq(sales.organizationId, input.organizationId), eq(sales.id, input.saleId)))
            .for('update');
          const sale = saleRows[0];
          if (!sale) {
            throw new SaleNotRefundableError();
          }
          if (sale.status !== 'completed') {
            throw new SaleNotRefundableError();
          }
          const priorRows = await tx
            .select({ id: refunds.id })
            .from(refunds)
            .where(
              and(
                eq(refunds.organizationId, input.organizationId),
                eq(refunds.saleId, input.saleId),
              ),
            )
            .limit(1);
          if (priorRows[0]) {
            throw new SaleAlreadyRefundedError();
          }

          const id = randomUUID();
          const refundRows = await tx
            .insert(refunds)
            .values({
              id,
              organizationId: input.organizationId,
              saleId: input.saleId,
              registerShiftId: input.registerShiftId,
              refundNumber: buildRefundNumber(id),
              operationId: input.operationId,
              amountMinor: input.amountMinor,
              reason: input.reason,
              createdBy: input.createdBy,
            })
            .returning();
          const refund = refundRows[0];
          if (!refund) {
            throw new Error('Failed to insert refund');
          }
          const lineRows = await tx
            .insert(refundLines)
            .values(
              input.lines.map((line) => ({
                organizationId: input.organizationId,
                refundId: refund.id,
                productId: line.productId,
                sku: line.sku,
                name: line.name,
                quantity: formatScaledQuantity(parseScaledQuantity(line.quantity)),
                unitPriceMinor: line.unitPriceMinor,
                lineTotalMinor: line.lineTotalMinor,
              })),
            )
            .returning();

          for (const line of lineRows) {
            await recordMovementWithin(tx, {
              organizationId: input.organizationId,
              locationId: input.locationId,
              productId: line.productId,
              movementType: 'return',
              quantityDelta: parseScaledQuantity(line.quantity),
              reason: `Refund ${refund.refundNumber}`,
            });
          }

          return toRefundRecord(refund, lineRows);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const raced = await findByOperationId(input.organizationId, input.operationId);
          if (raced) {
            return raced;
          }
          if (await findBySaleId(input.organizationId, input.saleId)) {
            throw new SaleAlreadyRefundedError();
          }
        }
        throw error;
      }
    },
  };
}
