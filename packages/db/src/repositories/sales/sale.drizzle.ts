import { randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { registerShifts } from '../../schema/registers';
import { saleLines, salePayments, sales } from '../../schema/sales';
import { isUniqueViolation } from '../catalog/errors';
import { RegisterShiftNotOpenError } from '../registers/shift';
import type { CatalogListOptions } from '../catalog/types';
import { recordMovementWithin } from '../inventory/ledger.core';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import {
  buildSaleNumber,
  InsufficientStockError,
  type CreateSaleInput,
  type SaleLineRecord,
  type SalePaymentRecord,
  type SaleRecord,
  type SaleRepository,
} from './sale';

type SaleRow = typeof sales.$inferSelect;
type LineRow = typeof saleLines.$inferSelect;
type PaymentRow = typeof salePayments.$inferSelect;
type Reader = Pick<Database, 'select'>;

function toLineRecord(row: LineRow): SaleLineRecord {
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

function toPaymentRecord(row: PaymentRow): SalePaymentRecord {
  return { id: row.id, method: row.method, amountMinor: row.amountMinor };
}

function toSaleRecord(
  row: SaleRow,
  lines: readonly LineRow[],
  payments: readonly PaymentRow[],
): SaleRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    saleNumber: row.saleNumber,
    operationId: row.operationId,
    registerShiftId: row.registerShiftId,
    status: row.status,
    customerName: row.customerName,
    currency: row.currency,
    subtotalMinor: row.subtotalMinor,
    discountMinor: row.discountMinor,
    taxMinor: row.taxMinor,
    totalMinor: row.totalMinor,
    paidMinor: row.paidMinor,
    changeMinor: row.changeMinor,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    lines: lines.map(toLineRecord),
    payments: payments.map(toPaymentRecord),
  };
}

async function loadSale(
  reader: Reader,
  organizationId: string,
  id: string,
): Promise<SaleRecord | null> {
  const rows = await reader
    .select()
    .from(sales)
    .where(and(eq(sales.organizationId, organizationId), eq(sales.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return null;
  }
  const [lineRows, paymentRows] = await Promise.all([
    reader.select().from(saleLines).where(eq(saleLines.saleId, id)).orderBy(saleLines.id),
    reader.select().from(salePayments).where(eq(salePayments.saleId, id)).orderBy(salePayments.id),
  ]);
  return toSaleRecord(row, lineRows, paymentRows);
}

async function loadRelated(
  reader: Reader,
  saleIds: readonly string[],
): Promise<{ lines: Map<string, LineRow[]>; payments: Map<string, PaymentRow[]> }> {
  const lines = new Map<string, LineRow[]>();
  const payments = new Map<string, PaymentRow[]>();
  if (saleIds.length === 0) {
    return { lines, payments };
  }
  const [lineRows, paymentRows] = await Promise.all([
    reader
      .select()
      .from(saleLines)
      .where(inArray(saleLines.saleId, [...saleIds]))
      .orderBy(saleLines.id),
    reader
      .select()
      .from(salePayments)
      .where(inArray(salePayments.saleId, [...saleIds]))
      .orderBy(salePayments.id),
  ]);
  for (const row of lineRows) {
    const bucket = lines.get(row.saleId) ?? [];
    bucket.push(row);
    lines.set(row.saleId, bucket);
  }
  for (const row of paymentRows) {
    const bucket = payments.get(row.saleId) ?? [];
    bucket.push(row);
    payments.set(row.saleId, bucket);
  }
  return { lines, payments };
}

export function createDrizzleSaleRepository(db: Database): SaleRepository {
  const findByOperationId = async (
    organizationId: string,
    operationId: string,
  ): Promise<SaleRecord | null> => {
    const rows = await db
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.organizationId, organizationId), eq(sales.operationId, operationId)))
      .limit(1);
    const row = rows[0];
    return row ? loadSale(db, organizationId, row.id) : null;
  };

  return {
    async list(organizationId, filters, options: CatalogListOptions) {
      const conditions = [eq(sales.organizationId, organizationId)];
      if (filters.locationId) conditions.push(eq(sales.locationId, filters.locationId));
      const where = and(...conditions);
      const rows = await db
        .select()
        .from(sales)
        .where(where)
        .orderBy(desc(sales.createdAt), desc(sales.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sales)
        .where(where);
      const related = await loadRelated(
        db,
        rows.map((row) => row.id),
      );
      return {
        items: rows.map((row) =>
          toSaleRecord(row, related.lines.get(row.id) ?? [], related.payments.get(row.id) ?? []),
        ),
        total: countRows[0]?.count ?? 0,
      };
    },
    findById: (organizationId, id) => loadSale(db, organizationId, id),
    findByOperationId,
    async sumCashByShift(organizationId, registerShiftId) {
      const rows = await db
        .select({ total: sql<string>`coalesce(sum(${sales.totalMinor}), 0)` })
        .from(sales)
        .where(
          and(
            eq(sales.organizationId, organizationId),
            eq(sales.registerShiftId, registerShiftId),
            eq(sales.status, 'completed'),
          ),
        );
      return Number(rows[0]?.total ?? 0);
    },
    async create(input: CreateSaleInput) {
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
          const id = randomUUID();
          const saleRows = await tx
            .insert(sales)
            .values({
              id,
              organizationId: input.organizationId,
              locationId: input.locationId,
              saleNumber: buildSaleNumber(id),
              operationId: input.operationId,
              registerShiftId: input.registerShiftId,
              status: 'completed',
              customerName: input.customerName ?? null,
              currency: input.currency,
              subtotalMinor: input.subtotalMinor,
              totalMinor: input.totalMinor,
              paidMinor: input.paidMinor,
              changeMinor: input.changeMinor,
              createdBy: input.createdBy,
            })
            .returning();
          const sale = saleRows[0];
          if (!sale) {
            throw new Error('Failed to insert sale');
          }
          const lineRows = await tx
            .insert(saleLines)
            .values(
              input.lines.map((line) => ({
                organizationId: input.organizationId,
                saleId: sale.id,
                productId: line.productId,
                sku: line.sku,
                name: line.name,
                quantity: formatScaledQuantity(parseScaledQuantity(line.quantity)),
                unitPriceMinor: line.unitPriceMinor,
                lineTotalMinor: line.lineTotalMinor,
              })),
            )
            .returning();
          const paymentRows = await tx
            .insert(salePayments)
            .values(
              input.payments.map((payment) => ({
                organizationId: input.organizationId,
                saleId: sale.id,
                method: payment.method,
                amountMinor: payment.amountMinor,
              })),
            )
            .returning();

          for (const line of lineRows) {
            const { balance } = await recordMovementWithin(tx, {
              organizationId: input.organizationId,
              locationId: input.locationId,
              productId: line.productId,
              movementType: 'issue',
              quantityDelta: -parseScaledQuantity(line.quantity),
              reason: `Sale ${sale.saleNumber}`,
            });
            if (parseScaledQuantity(balance.quantity) < 0n) {
              throw new InsufficientStockError(line.productId);
            }
          }

          return toSaleRecord(sale, lineRows, paymentRows);
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          const raced = await findByOperationId(input.organizationId, input.operationId);
          if (raced) {
            return raced;
          }
        }
        throw error;
      }
    },
  };
}


