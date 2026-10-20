import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { products } from './catalog';
import { users } from './identity';
import { stockLocations } from './inventory';
import { registerShifts } from './registers';
import { organizations } from './tenancy';

export const saleStatus = pgEnum('sale_status', ['completed', 'voided']);

export const salePaymentMethod = pgEnum('sale_payment_method', ['cash']);

/**
 * Immutable sale header. Financial records are append-only; corrections use
 * linked reversals rather than in-place updates (AGENTS.md section 4).
 */
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'restrict' }),
    saleNumber: text('sale_number').notNull(),
    operationId: uuid('operation_id').notNull(),
    registerShiftId: uuid('register_shift_id').references(() => registerShifts.id, {
      onDelete: 'restrict',
    }),
    status: saleStatus('status').notNull().default('completed'),
    customerName: text('customer_name'),
    currency: text('currency').notNull().default('BDT'),
    subtotalMinor: integer('subtotal_minor').notNull(),
    discountMinor: integer('discount_minor').notNull().default(0),
    taxMinor: integer('tax_minor').notNull().default(0),
    totalMinor: integer('total_minor').notNull(),
    paidMinor: integer('paid_minor').notNull(),
    changeMinor: integer('change_minor').notNull().default(0),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sales_org_operation_uq').on(table.organizationId, table.operationId),
    uniqueIndex('sales_org_number_uq').on(table.organizationId, table.saleNumber),
    index('sales_org_created_idx').on(table.organizationId, table.createdAt),
    index('sales_org_location_idx').on(table.organizationId, table.locationId),
    index('sales_org_shift_idx').on(table.organizationId, table.registerShiftId),
  ],
);

/** Catalog snapshots keep historical receipts stable after product edits. */
export const saleLines = pgTable(
  'sale_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    sku: text('sku').notNull(),
    name: text('name').notNull(),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitPriceMinor: integer('unit_price_minor').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),
  },
  (table) => [index('sale_lines_sale_idx').on(table.saleId)],
);

export const salePayments = pgTable(
  'sale_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    method: salePaymentMethod('method').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sale_payments_sale_idx').on(table.saleId)],
);

