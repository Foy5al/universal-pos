import { pathToFileURL } from 'node:url';

import { PERMISSION_KEYS } from '@pos/contracts';

import { createDb, type Database } from './client';
import { permissions } from './schema/identity';

export async function seedPermissions(db: Database): Promise<number> {
  await db
    .insert(permissions)
    .values(PERMISSION_KEYS.map((key) => ({ key, description: key })))
    .onConflictDoNothing();
  return PERMISSION_KEYS.length;
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run the seed script');
  }
  const db = createDb(databaseUrl);
  try {
    const count = await seedPermissions(db);
    console.log(`Seeded ${count} permissions`);
  } finally {
    await db.$client.end();
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
