import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from './catalog';
import { users } from './identity';
import { registerShifts } from './registers';
import { sales } from './sales';
import { organizations } from './tenancy';

/**
 * Full-sale cash refund linked to the original sale. Sales stay immutable; the
 * refund and its stock return are the compensating event (ADR-0017).
 */
export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'restrict' }),
    registerShiftId: uuid('register_shift_id')
      .notNull()
      .references(() => registerShifts.id, { onDelete: 'restrict' }),
    refundNumber: text('refund_number').notNull(),
    operationId: uuid('operation_id').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('refunds_org_operation_uq').on(table.organizationId, table.operationId),
    uniqueIndex('refunds_org_number_uq').on(table.organizationId, table.refundNumber),
    uniqueIndex('refunds_org_sale_uq').on(table.organizationId, table.saleId),
    index('refunds_org_shift_idx').on(table.organizationId, table.registerShiftId),
  ],
);

/** Sale line snapshots so a refund document stays stable after catalog edits. */
export const refundLines = pgTable(
  'refund_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    refundId: uuid('refund_id')
      .notNull()
      .references(() => refunds.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),
  },
  (table) => [index('refund_lines_refund_idx').on(table.refundId)],
);
