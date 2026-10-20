import {
  boolean,
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
import { stockLocations } from './inventory';
import { organizations } from './tenancy';

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
    address: text('address'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('suppliers_org_name_uq').on(table.organizationId, table.name)],
);

export const supplierProducts = pgTable(
  'supplier_products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    supplierSku: text('supplier_sku'),
    unitCostMinor: integer('unit_cost_minor').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('supplier_products_supplier_product_uq').on(table.supplierId, table.productId),
    index('supplier_products_org_supplier_idx').on(table.organizationId, table.supplierId),
  ],
);

export const purchaseOrderStatus = pgEnum('purchase_order_status', [
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
]);

export const purchaseOrders = pgTable(
  'purchase_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'restrict' }),
    status: purchaseOrderStatus('status').notNull().default('draft'),
    notes: text('notes'),
    totalMinor: integer('total_minor').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('purchase_orders_org_status_idx').on(table.organizationId, table.status),
    index('purchase_orders_org_supplier_idx').on(table.organizationId, table.supplierId),
  ],
);

export const purchaseOrderLines = pgTable(
  'purchase_order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    receivedQuantity: numeric('received_quantity', { precision: 18, scale: 4 })
      .notNull()
      .default('0'),
    unitCostMinor: integer('unit_cost_minor').notNull(),
    lineTotalMinor: integer('line_total_minor').notNull(),
  },
  (table) => [index('purchase_order_lines_order_idx').on(table.purchaseOrderId)],
);

export const restockRequestStatus = pgEnum('restock_request_status', [
  'pending',
  'scheduled',
  'fulfilled',
  'dismissed',
]);

export const restockRequests = pgTable(
  'restock_requests',
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
    requestedByUserId: uuid('requested_by_user_id').notNull(),
    requestedByName: text('requested_by_name').notNull(),
    requestedQuantity: numeric('requested_quantity', { precision: 18, scale: 4 }).notNull(),
    note: text('note'),
    status: restockRequestStatus('status').notNull().default('pending'),
    purchaseOrderId: uuid('purchase_order_id').references(() => purchaseOrders.id, {
      onDelete: 'set null',
    }),
    purchaseOrderLineId: uuid('purchase_order_line_id').references(
      () => purchaseOrderLines.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('restock_requests_org_status_idx').on(table.organizationId, table.status),
    index('restock_requests_org_location_idx').on(table.organizationId, table.locationId),
    index('restock_requests_org_order_idx').on(table.organizationId, table.purchaseOrderId),
  ],
);

export const goodsReceipts = pgTable(
  'goods_receipts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => stockLocations.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('goods_receipts_org_order_idx').on(table.organizationId, table.purchaseOrderId),
  ],
);
