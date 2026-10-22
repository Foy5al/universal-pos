import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createDb,
  createDrizzleAuthorizationRepository,
  createDrizzleRegisterRepository,
  createDrizzleStaffRepository,
  runMigrations,
  schema,
} from '@pos/db';
import { beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

describeIfDatabase('staff administration postgres integration', () => {
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

  async function createStore(organizationId: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.insert(schema.stores).values({
      id,
      organizationId,
      name: `Store ${id.slice(0, 8)}`,
    });
    return id;
  }

  it('applies role defaults and per-user permission overrides', async () => {
    const organizationId = await createOrg('staff');
    const otherOrganizationId = await createOrg('other');
    const storeId = await createStore(organizationId);
    const staff = createDrizzleStaffRepository(db);
    const email = `manager-${crypto.randomUUID().slice(0, 8)}@example.com`;

    await staff.create({
      organizationId,
      email,
      displayName: 'Manager One',
      passwordHash: 'x',
      roleName: 'Manager',
      rolePermissions: ['stores:read', 'reports:read', 'staff:manage'],
      storeId,
    });

    const created = await staff.findUserByEmail(email);
    expect(created).not.toBeNull();
    const before = await staff.findInOrganization(organizationId, created!.id);
    expect(before?.roleName).toBe('Manager');
    expect(before?.storeId).toBe(storeId);
    expect([...(before?.rolePermissions ?? [])].sort()).toEqual([
      'reports:read',
      'staff:manage',
      'stores:read',
    ]);

    await staff.setPermissionOverrides(organizationId, created!.id, [
      { permissionKey: 'reports:read', granted: false },
      { permissionKey: 'sync:push', granted: true },
    ]);

    const authorization = createDrizzleAuthorizationRepository(db);
    const principal = await authorization.loadPrincipal(created!.id, organizationId);
    expect(principal?.permissions).toContain('stores:read');
    expect(principal?.permissions).toContain('staff:manage');
    expect(principal?.permissions).toContain('sync:push');
    expect(principal?.permissions).not.toContain('reports:read');
    expect(principal?.storeIds).toEqual([storeId]);

    expect(await staff.listByOrganization(otherOrganizationId)).toEqual([]);
    expect(await staff.findInOrganization(otherOrganizationId, created!.id)).toBeNull();
  });

  it('enforces a unique counter code per store', async () => {
    const organizationId = await createOrg('counter');
    const otherOrganizationId = await createOrg('counter-other');
    const storeId = await createStore(organizationId);
    const registers = createDrizzleRegisterRepository(db);

    const created = await registers.create({
      organizationId,
      storeId,
      name: 'Front counter',
      code: 'C1',
    });
    expect(created.code).toBe('C1');
    expect(await registers.findByCode(organizationId, storeId, 'C1')).not.toBeNull();

    await expect(
      registers.create({
        organizationId,
        storeId,
        name: 'Duplicate',
        code: 'C1',
      }),
    ).rejects.toThrow();

    await expect(
      registers.create({
        organizationId: otherOrganizationId,
        storeId,
        name: 'Foreign',
        code: 'C2',
      }),
    ).rejects.toThrow();
  });
});
