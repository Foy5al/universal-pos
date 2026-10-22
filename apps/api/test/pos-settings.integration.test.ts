import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDb, createDrizzlePosSettingsRepository, runMigrations, schema } from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

describeIfDatabase('POS settings postgres integration', () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await runMigrations(db, migrationsFolder);
  });

  async function createOrg(prefix: string): Promise<string> {
    const id = crypto.randomUUID();
    await db
      .insert(schema.organizations)
      .values({ id, slug: `${prefix}-${id.slice(0, 8)}`, legalName: `${prefix} Org` });
    return id;
  }

  it('persists and isolates organization settings', async () => {
    const repository = createDrizzlePosSettingsRepository(db);
    const organizationId = await createOrg('pos-settings-a');
    const otherOrganizationId = await createOrg('pos-settings-b');

    const saved = await repository.upsert(organizationId, {
      requireRemovalPassword: true,
      removalPasswordSalt: 'c2FsdA==',
      removalPasswordHash: 'aGFzaA==',
      removalPasswordIterations: 120_000,
    });
    expect(saved).toMatchObject({
      organizationId,
      requireRemovalPassword: true,
      removalPasswordSalt: 'c2FsdA==',
      removalPasswordHash: 'aGFzaA==',
    });

    expect(await repository.get(otherOrganizationId)).toBeNull();

    await repository.upsert(otherOrganizationId, {
      requireRemovalPassword: false,
      removalPasswordSalt: null,
      removalPasswordHash: null,
      removalPasswordIterations: 120_000,
    });
    expect((await repository.get(organizationId))?.requireRemovalPassword).toBe(true);
    expect((await repository.get(otherOrganizationId))?.requireRemovalPassword).toBe(false);
  });

  it('rejects enabling protection without a stored verifier', async () => {
    const repository = createDrizzlePosSettingsRepository(db);
    const organizationId = await createOrg('pos-settings-invalid');

    await expect(
      repository.upsert(organizationId, {
        requireRemovalPassword: true,
        removalPasswordSalt: null,
        removalPasswordHash: null,
        removalPasswordIterations: 120_000,
      }),
    ).rejects.toThrow();
  });
});
