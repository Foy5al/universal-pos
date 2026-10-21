import type { OfflineSalePayload } from '@pos/contracts';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { devices, organizations } from './tenancy';
import { sales } from './sales';

export const syncOperationStatus = pgEnum('sync_operation_status', [
  'accepted',
  'duplicate',
  'needs_review',
  'rejected',
]);

/**
 * Server-side log of offline operations. `(organization_id, operation_id)` is
 * unique so repeated pushes cannot post the same sale twice (ADR-0004, ADR-0015).
 */
export const syncOperations = pgTable(
  'sync_operations',
  {
    sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    operationId: uuid('operation_id').notNull(),
    entityId: uuid('entity_id').notNull(),
    entityType: text('entity_type').notNull().default('sale'),
    eventType: text('event_type').notNull(),
    clientSequence: integer('client_sequence').notNull(),
    status: syncOperationStatus('status').notNull(),
    saleId: uuid('sale_id').references(() => sales.id, { onDelete: 'set null' }),
    conflictReason: text('conflict_reason'),
    message: text('message'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sync_operations_org_operation_uq').on(table.organizationId, table.operationId),
    index('sync_operations_org_device_sequence_idx').on(
      table.organizationId,
      table.deviceId,
      table.sequence,
    ),
  ],
);

/**
 * Unresolved offline conflicts. Rows are kept so a manager can review or
 * compensate a sale; they are never used to overwrite a financial record.
 */
export const syncConflicts = pgTable(
  'sync_conflicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'restrict' }),
    operationId: uuid('operation_id').notNull(),
    entityId: uuid('entity_id').notNull(),
    cashierId: uuid('cashier_id').references(() => users.id, { onDelete: 'set null' }),
    reason: text('reason').notNull(),
    details: text('details'),
    payload: jsonb('payload').$type<OfflineSalePayload>(),
    status: text('status').notNull().default('open'),
    resolution: text('resolution'),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sync_conflicts_org_operation_uq').on(table.organizationId, table.operationId),
    index('sync_conflicts_org_created_idx').on(table.organizationId, table.createdAt),
    index('sync_conflicts_org_status_created_idx').on(
      table.organizationId,
      table.status,
      table.createdAt,
    ),
  ],
);
