import { createDb, seedDemoData } from '@pos/db';
import { loadRootEnv } from '@pos/db/env';

import { Argon2PasswordHasher } from './core/passwordHasher';

async function main(): Promise<void> {
  // .env is optional; the caller may export variables directly.
  loadRootEnv();
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== '1') {
    throw new Error('Refusing to seed demo data in production');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed demo data');
  }

  const email = process.env.DEMO_EMAIL ?? 'owner@demo.pos';
  const password = process.env.DEMO_PASSWORD ?? 'password123';
  const db = createDb(databaseUrl);
  try {
    const result = await seedDemoData(db, {
      email,
      passwordHash: await new Argon2PasswordHasher().hash(password),
      organizationSlug: process.env.DEMO_ORG_SLUG,
    });
    console.log(`Demo login ready: ${email} / ${password}`);
    console.log(`Organization ${result.organizationId}, location ${result.locationId}`);
    console.log(`Register ${result.registerId}`);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
