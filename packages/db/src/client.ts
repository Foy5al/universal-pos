import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import * as schema from './schema/index';

const LOCAL_POOL_MAX = 10;
// Each serverless instance holds its own pool, so keep it minimal and rely on
// the provider's pooled endpoint (Neon `-pooler`) for fan-out.
const SERVERLESS_POOL_MAX = 1;

function poolMax(): number {
  const configured = Number(process.env.DATABASE_POOL_MAX);
  if (Number.isInteger(configured) && configured > 0) return configured;
  return process.env.VERCEL ? SERVERLESS_POOL_MAX : LOCAL_POOL_MAX;
}

export function createPool(databaseUrl: string): Pool {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a database pool');
  }
  return new Pool({
    connectionString: databaseUrl,
    max: poolMax(),
    // Let a frozen serverless instance exit instead of waiting on idle sockets.
    allowExitOnIdle: Boolean(process.env.VERCEL),
  });
}

export function createDb(databaseUrl: string, pool: Pool = createPool(databaseUrl)) {
  return drizzle(pool, { schema });
}

export type Database = ReturnType<typeof createDb>;
