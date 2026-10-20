import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { goodsReceipts, purchaseOrderLines, purchaseOrders } from '../../schema/purchasing';
import type { CatalogListOptions } from '../catalog/types';
import { recordMovementWithin } from '../inventory/ledger.core';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import {
  nextOrderStatus,
  ReceiveConflictError,
  type CreatePurchaseOrderInput,
  type GoodsReceiptRecord,
  type PurchaseOrderLineRecord,
  type PurchaseOrderRecord,
  type PurchaseOrderRepository,
  type ReceivePurchaseOrderInput,
  type ReceiveResult,
} from './order';

type OrderRow = typeof purchaseOrders.$inferSelect;
type LineRow = typeof purchaseOrderLines.$inferSelect;

function toLineRecord(row: LineRow): PurchaseOrderLineRecord {
  return {
    id: row.id,
    productId: row.productId,
    quantity: formatScaledQuantity(parseScaledQuantity(row.quantity)),
    receivedQuantity: formatScaledQuantity(parseScaledQuantity(row.receivedQuantity)),
    unitCostMinor: row.unitCostMinor,
    lineTotalMinor: row.lineTotalMinor,
  };
}

function toOrderRecord(row: OrderRow, lines: readonly LineRow[]): PurchaseOrderRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    supplierId: row.supplierId,
    locationId: row.locationId,
    status: row.status,
    notes: row.notes,
    totalMinor: row.totalMinor,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: lines.map(toLineRecord),
  };
}

function toReceiptRecord(row: typeof goodsReceipts.$inferSelect): GoodsReceiptRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    purchaseOrderId: row.purchaseOrderId,
    locationId: row.locationId,
    receivedAt: row.receivedAt.toISOString(),
  };
}

async function loadLines(
  db: Database,
  orderIds: readonly string[],
): Promise<Map<string, LineRow[]>> {
  const grouped = new Map<string, LineRow[]>();
  if (orderIds.length === 0) {
    return grouped;
  }
  const rows = await db
    .select()
    .from(purchaseOrderLines)
    .where(inArray(purchaseOrderLines.purchaseOrderId, [...orderIds]))
    .orderBy(purchaseOrderLines.id);
  for (const row of rows) {
    const bucket = grouped.get(row.purchaseOrderId) ?? [];
    bucket.push(row);
    grouped.set(row.purchaseOrderId, bucket);
  }
  return grouped;
}

export function createDrizzlePurchaseOrderRepository(db: Database): PurchaseOrderRepository {
  return {
    async list(organizationId, filters, options: CatalogListOptions) {
      if (filters.locationIds && filters.locationIds.length === 0) {
        return { items: [], total: 0 };
      }
      const conditions = [eq(purchaseOrders.organizationId, organizationId)];
      if (filters.supplierId) conditions.push(eq(purchaseOrders.supplierId, filters.supplierId));
      if (filters.status) conditions.push(eq(purchaseOrders.status, filters.status));
      if (filters.locationIds) {
        conditions.push(inArray(purchaseOrders.locationId, [...filters.locationIds]));
      }
      const where = and(...conditions);
      const rows = await db
        .select()
        .from(purchaseOrders)
        .where(where)
        .orderBy(desc(purchaseOrders.createdAt), desc(purchaseOrders.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(purchaseOrders)
        .where(where);
      const lines = await loadLines(
        db,
        rows.map((row) => row.id),
      );
      return {
        items: rows.map((row) => toOrderRecord(row, lines.get(row.id) ?? [])),
        total: countRows[0]?.count ?? 0,
      };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.organizationId, organizationId), eq(purchaseOrders.id, id)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        return null;
      }
      const lineRows = await db
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, id))
        .orderBy(purchaseOrderLines.id);
      return toOrderRecord(row, lineRows);
    },
    async create(input: CreatePurchaseOrderInput) {
      return db.transaction(async (tx) => {
        const orderRows = await tx
          .insert(purchaseOrders)
          .values({
            organizationId: input.organizationId,
            supplierId: input.supplierId,
            locationId: input.locationId,
            status: 'draft',
            notes: input.notes ?? null,
            totalMinor: input.lines.reduce((total, line) => total + line.lineTotalMinor, 0),
          })
          .returning();
        const order = orderRows[0];
        if (!order) {
          throw new Error('Failed to insert purchase order');
        }
        const lineRows = await tx
          .insert(purchaseOrderLines)
          .values(
            input.lines.map((line) => ({
              organizationId: input.organizationId,
              purchaseOrderId: order.id,
              productId: line.productId,
              quantity: formatScaledQuantity(parseScaledQuantity(line.quantity)),
              receivedQuantity: '0',
              unitCostMinor: line.unitCostMinor,
              lineTotalMinor: line.lineTotalMinor,
            })),
          )
          .returning();
        return toOrderRecord(order, lineRows);
      });
    },
    async updateStatus(organizationId, id, status) {
      const rows = await db
        .update(purchaseOrders)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(purchaseOrders.organizationId, organizationId), eq(purchaseOrders.id, id)))
        .returning();
      const order = rows[0];
      if (!order) {
        return null;
      }
      const lineRows = await db
        .select()
        .from(purchaseOrderLines)
        .where(eq(purchaseOrderLines.purchaseOrderId, id))
        .orderBy(purchaseOrderLines.id);
      return toOrderRecord(order, lineRows);
    },
    async receive(input: ReceivePurchaseOrderInput): Promise<ReceiveResult | null> {
      return db.transaction(async (tx) => {
        const orderRows = await tx
          .select()
          .from(purchaseOrders)
          .where(
            and(
              eq(purchaseOrders.organizationId, input.organizationId),
              eq(purchaseOrders.id, input.purchaseOrderId),
            ),
          )
          .limit(1)
          .for('update');
        const order = orderRows[0];
        if (!order) {
          return null;
        }
        if (order.status !== 'ordered' && order.status !== 'partially_received') {
          throw new ReceiveConflictError('Purchase order is not open for receiving');
        }

        const lineRows = await tx
          .select()
          .from(purchaseOrderLines)
          .where(eq(purchaseOrderLines.purchaseOrderId, order.id));
        const pending = lineRows.map((row) => ({ ...row }));
        const applied: Array<{ row: LineRow; received: bigint }> = [];
        for (const received of input.lines) {
          const row = pending.find((candidate) => candidate.id === received.purchaseOrderLineId);
          if (!row) {
            throw new ReceiveConflictError('Purchase order line does not belong to this order');
          }
          const quantity = parseScaledQuantity(received.quantity);
          const nextReceived = parseScaledQuantity(row.receivedQuantity) + quantity;
          if (nextReceived > parseScaledQuantity(row.quantity)) {
            throw new ReceiveConflictError('Received quantity exceeds the ordered quantity');
          }
          row.receivedQuantity = formatScaledQuantity(nextReceived);
          applied.push({ row, received: quantity });
        }

        const receiptRows = await tx
          .insert(goodsReceipts)
          .values({
            organizationId: input.organizationId,
            purchaseOrderId: order.id,
            locationId: order.locationId,
            notes: input.notes ?? null,
          })
          .returning();
        const receipt = receiptRows[0];
        if (!receipt) {
          throw new Error('Failed to insert goods receipt');
        }

        for (const { row, received } of applied) {
          await tx
            .update(purchaseOrderLines)
            .set({ receivedQuantity: row.receivedQuantity })
            .where(eq(purchaseOrderLines.id, row.id));
          await recordMovementWithin(tx, {
            organizationId: input.organizationId,
            locationId: order.locationId,
            productId: row.productId,
            movementType: 'receipt',
            quantityDelta: received,
            reason: `Purchase receipt ${receipt.id}`,
            unitCostMinor: row.unitCostMinor,
          });
        }

        const status = nextOrderStatus(pending.map(toLineRecord));
        const updatedRows = await tx
          .update(purchaseOrders)
          .set({ status, updatedAt: new Date() })
          .where(eq(purchaseOrders.id, order.id))
          .returning();
        const updated = updatedRows[0] ?? order;
        return {
          purchaseOrder: toOrderRecord(updated, pending),
          receipt: toReceiptRecord(receipt),
        };
      });
    },
  };
}
