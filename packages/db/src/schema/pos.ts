import { sql } from 'drizzle-orm';
import { boolean, check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { organizations } from './tenancy';

/**
 * Organization-wide POS controls. The removal password is stored only as a
 * PBKDF2 verifier; the plaintext never reaches the database.
 */
export const posSettings = pgTable(
  'pos_settings',
  {
    organizationId: uuid('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    requireRemovalPassword: boolean('require_removal_password').notNull().default(false),
    removalPasswordSalt: text('removal_password_salt'),
    removalPasswordHash: text('removal_password_hash'),
    removalPasswordIterations: integer('removal_password_iterations').notNull().default(120_000),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'pos_settings_removal_password_required',
      sql`not ${table.requireRemovalPassword} or (${table.removalPasswordSalt} is not null and ${table.removalPasswordHash} is not null)`,
    ),
    check(
      'pos_settings_removal_password_iterations_positive',
      sql`${table.removalPasswordIterations} > 0`,
    ),
  ],
);
