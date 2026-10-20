import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleSyncRepository,
  DeviceOwnershipConflictError,
  runMigrations,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

describeIfDatabase('sync postgres integration', () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await runMigrations(db, migrationsFolder);
  });

  async function createOrg(prefix: string): Promise<{ organizationId: string; storeId: string }> {
    const organizationId = crypto.randomUUID();
    await db.insert(schema.organizations).values({
      id: organizationId,
      slug: `${prefix}-${organizationId.slice(0, 8)}`,
      legalName: `${prefix} Org`,
    });
    const store = (
      await db
        .insert(schema.stores)
        .values({ organizationId, name: `Store ${organizationId.slice(0, 6)}` })
        .returning()
    )[0];
    if (!store) throw new Error('Failed to create store');
    return { organizationId, storeId: store.id };
  }

  it('deduplicates device enrollment, operations and conflicts per organization', async () => {
    const sync = createDrizzleSyncRepository(db);
    const { organizationId, storeId } = await createOrg('sync');
    const other = await createOrg('sync-other');
    const deviceId = crypto.randomUUID();

    const enrolled = await sync.registerDevice({
      id: deviceId,
      organizationId,
      storeId,
      name: 'Till 1',
      platform: 'web',
    });
    expect(enrolled.organizationId).toBe(organizationId);
    expect(enrolled.lastSeenAt).not.toBeNull();

    await sync.registerDevice({
      id: deviceId,
      organizationId,
      storeId,
      name: 'Till 1 renamed',
      platform: 'web',
    });
    expect((await sync.findDevice(organizationId, deviceId))?.name).toBe('Till 1 renamed');
    expect(await sync.listDevices(other.organizationId)).toHaveLength(0);

    await expect(
      sync.registerDevice({
        id: deviceId,
        organizationId: other.organizationId,
        storeId: other.storeId,
        name: 'Foreign',
        platform: 'web',
      }),
    ).rejects.toBeInstanceOf(DeviceOwnershipConflictError);

    const operationId = crypto.randomUUID();
    const input = {
      organizationId,
      deviceId,
      operationId,
      entityId: crypto.randomUUID(),
      entityType: 'sale',
      eventType: 'sale.completed',
      clientSequence: 1,
      status: 'accepted' as const,
      occurredAt: '2026-10-20T10:00:00.000Z',
    };
    const first = await sync.recordOperation(input);
    const second = await sync.recordOperation({ ...input, status: 'duplicate' });
    expect(second.sequence).toBe(first.sequence);
    expect(second.status).toBe('accepted');

    const listed = await sync.listOperationsAfter(organizationId, deviceId, 0, 10);
    expect(listed).toHaveLength(1);
    expect(
      await sync.listOperationsAfter(organizationId, deviceId, first.sequence, 10),
    ).toHaveLength(0);
    expect(await sync.listOperationsAfter(other.organizationId, deviceId, 0, 10)).toHaveLength(0);

    const conflictInput = {
      organizationId,
      deviceId,
      operationId,
      entityId: input.entityId,
      reason: 'insufficient_stock',
      details: 'Insufficient stock',
    };
    const conflict = await sync.recordConflict(conflictInput);
    const duplicate = await sync.recordConflict(conflictInput);
    expect(duplicate.id).toBe(conflict.id);
    expect(await sync.listConflicts(organizationId, 10)).toHaveLength(1);
    expect(await sync.listConflicts(other.organizationId, 10)).toHaveLength(0);

    const revoked = await sync.revokeDevice(organizationId, deviceId);
    expect(revoked?.revokedAt).not.toBeNull();
    expect(await sync.revokeDevice(other.organizationId, deviceId)).toBeNull();
  });
});
