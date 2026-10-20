import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './identity';
import { organizations, registers, stores } from './tenancy';

export const registerShiftStatus = pgEnum('register_shift_status', ['open', 'closed']);

export const cashMovementType = pgEnum('cash_movement_type', ['in', 'out']);

/**
 * One cash drawer session per register. Expected cash is derived from the float,
 * cash sales tied to the shift and manual in/out movements at close time.
 */
export const registerShifts = pgTable(
  'register_shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'restrict' }),
    registerId: uuid('register_id')
      .notNull()
      .references(() => registers.id, { onDelete: 'restrict' }),
    status: registerShiftStatus('status').notNull().default('open'),
    openingFloatMinor: integer('opening_float_minor').notNull().default(0),
    expectedCashMinor: integer('expected_cash_minor'),
    countedCashMinor: integer('counted_cash_minor'),
    varianceMinor: integer('variance_minor'),
    openedBy: uuid('opened_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    closedBy: uuid('closed_by').references(() => users.id, { onDelete: 'restrict' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    notes: text('notes'),
  },
  (table) => [
    uniqueIndex('register_shifts_register_open_uq')
      .on(table.registerId)
      .where(sql`${table.status} = 'open'`),
    index('register_shifts_org_opened_idx').on(table.organizationId, table.openedAt),
    index('register_shifts_org_register_idx').on(table.organizationId, table.registerId),
  ],
);

export const cashMovements = pgTable(
  'cash_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => registerShifts.id, { onDelete: 'cascade' }),
    type: cashMovementType('type').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    reason: text('reason').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('cash_movements_org_shift_idx').on(table.organizationId, table.shiftId)],
);
