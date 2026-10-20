import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Database } from '../../client';
import { restockRequests } from '../../schema/purchasing';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import { toRecord, type RestockRequestRepository } from './restock';

export function createDrizzleRestockRequestRepository(db: Database): RestockRequestRepository {
  return {
    async list(organizationId, filters, options) {
      if (filters.locationIds && filters.locationIds.length === 0) {
        return { items: [], total: 0 };
      }
      const conditions = [eq(restockRequests.organizationId, organizationId)];
      if (filters.status) conditions.push(eq(restockRequests.status, filters.status));
      if (filters.locationIds) {
        conditions.push(inArray(restockRequests.locationId, [...filters.locationIds]));
      }
      if (filters.requestedByUserId) {
        conditions.push(eq(restockRequests.requestedByUserId, filters.requestedByUserId));
      }
      const where = and(...conditions);
      const rows = await db
        .select()
        .from(restockRequests)
        .where(where)
        .orderBy(desc(restockRequests.createdAt), desc(restockRequests.id))
        .limit(options.limit)
        .offset(options.offset);
      const countRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(restockRequests)
        .where(where);
      return { items: rows.map(toRecord), total: countRows[0]?.count ?? 0 };
    },
    async findById(organizationId, id) {
      const rows = await db
        .select()
        .from(restockRequests)
        .where(
          and(
            eq(restockRequests.organizationId, organizationId),
            eq(restockRequests.id, id),
          ),
        )
        .limit(1);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async create(input) {
      const rows = await db
        .insert(restockRequests)
        .values({
          organizationId: input.organizationId,
          locationId: input.locationId,
          productId: input.productId,
          requestedByUserId: input.requestedByUserId,
          requestedByName: input.requestedByName,
          requestedQuantity: formatScaledQuantity(
            parseScaledQuantity(input.requestedQuantity),
          ),
          note: input.note ?? null,
        })
        .returning();
      const row = rows[0];
      if (!row) throw new Error('Failed to create restock request');
      return toRecord(row);
    },
    async dismiss(organizationId, id) {
      const rows = await db
        .update(restockRequests)
        .set({ status: 'dismissed', updatedAt: new Date() })
        .where(
          and(
            eq(restockRequests.organizationId, organizationId),
            eq(restockRequests.id, id),
            eq(restockRequests.status, 'pending'),
          ),
        )
        .returning();
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async schedule(input) {
      return db.transaction(async (tx) => {
        let changed = 0;
        for (const id of input.requestIds) {
          const rows = await tx
            .select()
            .from(restockRequests)
            .where(
              and(
                eq(restockRequests.organizationId, input.organizationId),
                eq(restockRequests.id, id),
              ),
            )
            .limit(1)
            .for('update');
          const request = rows[0];
          if (
            !request ||
            request.status !== 'pending' ||
            request.locationId !== input.locationId
          ) {
            continue;
          }
          const line = input.lines.find(
            (candidate) => candidate.productId === request.productId,
          );
          if (!line) continue;
          await tx
            .update(restockRequests)
            .set({
              status: 'scheduled',
              purchaseOrderId: input.purchaseOrderId,
              purchaseOrderLineId: line.id,
              updatedAt: new Date(),
            })
            .where(eq(restockRequests.id, request.id));
          changed += 1;
        }
        return changed;
      });
    },
    async fulfillByOrder(organizationId, purchaseOrderId) {
      const rows = await db
        .update(restockRequests)
        .set({ status: 'fulfilled', updatedAt: new Date() })
        .where(
          and(
            eq(restockRequests.organizationId, organizationId),
            eq(restockRequests.purchaseOrderId, purchaseOrderId),
            eq(restockRequests.status, 'scheduled'),
          ),
        )
        .returning({ id: restockRequests.id });
      return rows.length;
    },
    async releaseByOrder(organizationId, purchaseOrderId) {
      const rows = await db
        .update(restockRequests)
        .set({
          status: 'pending',
          purchaseOrderId: null,
          purchaseOrderLineId: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(restockRequests.organizationId, organizationId),
            eq(restockRequests.purchaseOrderId, purchaseOrderId),
            eq(restockRequests.status, 'scheduled'),
          ),
        )
        .returning({ id: restockRequests.id });
      return rows.length;
    },
  };
}
