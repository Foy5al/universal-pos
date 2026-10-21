import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
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
import { organizations, stores } from './tenancy';

export const stockMovementType = pgEnum('stock_movement_type', [
  'adjustment',
  'receipt',
  'issue',
  'return',
]);

export const stockLossReason = pgEnum('stock_loss_reason', [
  'damaged',
  'defective',
  'expired',
  'lost',
  'other',
]);

/**
 * Organization-wide low-stock fallback. A product's own threshold always wins;
 * this value only applies to products without one.
 */
export const lowStockSettings = pgTable(
  'low_stock_settings',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    globalThreshold: numeric('global_threshold', { precision: 18, scale: 4 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'low_stock_settings_global_threshold_non_negative',
      sql`${table.globalThreshold} is null or ${table.globalThreshold} >= 0`,
    ),
  ],
);

export const stockLocations = pgTable(
  'stock_locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('stock_locations_org_name_uq').on(table.organizationId, table.name)],
);

export const stockBalances = pgTable(
  'stock_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull().default('0'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('stock_balances_org_location_product_uq').on(
      table.organizationId,
      table.locationId,
      table.productId,
    ),
  ],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'restrict' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    movementType: stockMovementType('movement_type').notNull(),
    quantityDelta: numeric('quantity_delta', { precision: 18, scale: 4 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 18, scale: 4 }).notNull(),
    reason: text('reason'),
    lossReason: stockLossReason('loss_reason'),
    expiresOn: date('expires_on'),
    unitCostMinor: integer('unit_cost_minor'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('stock_movements_org_location_product_idx').on(
      table.organizationId,
      table.locationId,
      table.productId,
      table.createdAt,
    ),
    index('stock_movements_org_loss_reason_idx').on(
      table.organizationId,
      table.lossReason,
      table.occurredAt,
    ),
  ],
);
