import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema/index';

export function createPool(databaseUrl: string): Pool {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a database pool');
  }
  return new Pool({ connectionString: databaseUrl });
}

export function createDb(databaseUrl: string, pool: Pool = createPool(databaseUrl)) {
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
