import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { Database } from './client';

/** Applies pending SQL migrations from the given folder. */
export function runMigrations(db: Database, migrationsFolder: string): Promise<void> {
  return migrate(db, { migrationsFolder });
}
