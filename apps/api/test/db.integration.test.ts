import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDb, createDrizzleStoreRepository, runMigrations, schema } from '@pos/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { Argon2PasswordHasher } from '../src/core/passwordHasher';
import { createPostgresDeps } from '../src/deps';

const databaseUrl = process.env.DATABASE_URL;
const describeIfDatabase = databaseUrl ? describe : describe.skip;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder = path.resolve(here, '../../../packages/db/migrations');

const PASSWORD = 'password123';

/**
 * Real-database integration checks. Skipped unless DATABASE_URL is set
 * (`docker compose -f infra/docker-compose.yml up -d`).
 */
describeIfDatabase('postgres integration', () => {
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    db = createDb(databaseUrl as string);
    await runMigrations(db, migrationsFolder);
  });

  it('scopes stores by organization', async () => {
    const repository = createDrizzleStoreRepository(db);
    const organizationId = crypto.randomUUID();
    const otherOrganizationId = crypto.randomUUID();

    await db.insert(schema.organizations).values([
      { id: organizationId, slug: `it-${organizationId.slice(0, 8)}`, legalName: 'IT Org' },
      {
        id: otherOrganizationId,
        slug: `it-${otherOrganizationId.slice(0, 8)}`,
        legalName: 'IT Other',
      },
    ]);

    const created = await repository.create({
      organizationId,
      name: 'Main',
      timezone: 'Asia/Dhaka',
    });

    const mine = await repository.listByOrganization(organizationId);
    const theirs = await repository.listByOrganization(otherOrganizationId);

    expect(mine.map((store) => store.id)).toContain(created.id);
    expect(theirs).toHaveLength(0);
  });

  it('authenticates a real user and authorizes a scoped read', async () => {
    const organizationId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const roleId = crypto.randomUUID();
    const storeId = crypto.randomUUID();
    const email = `it-${userId.slice(0, 8)}@example.com`;

    await db.insert(schema.permissions).values({ key: 'stores:read', description: 'stores:read' }).onConflictDoNothing();
    await db.insert(schema.organizations).values({
      id: organizationId,
      slug: `it-${organizationId.slice(0, 8)}`,
      legalName: 'Auth Org',
    });
    await db.insert(schema.stores).values({
      id: storeId,
      organizationId,
      name: 'Auth Store',
      timezone: 'Asia/Dhaka',
    });
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    await db.insert(schema.users).values({
      id: userId,
      email,
      passwordHash,
      displayName: 'DB Cashier',
    });
    await db.insert(schema.memberships).values({ userId, organizationId });
    await db.insert(schema.roles).values({ id: roleId, organizationId, name: `cashier-${roleId.slice(0, 6)}` });
    await db.insert(schema.rolePermissions).values({ roleId, permissionKey: 'stores:read' });
    await db
      .insert(schema.userRoleAssignments)
      .values({ userId, roleId, organizationId, storeId: null });

    const app = createApp(createPostgresDeps(db));

    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    const token = login.body.data.token as string;
    expect(login.body.data.user.permissions).toContain('stores:read');

    const stores = await request(app)
      .get('/v1/stores')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(stores.body.data.stores.map((store: { id: string }) => store.id)).toContain(storeId);

    // Logout revokes the persisted session.
    await request(app)
      .post('/v1/auth/logout')
      .set('authorization', `Bearer ${token}`)
      .expect(204);
    await request(app)
      .get('/v1/stores')
      .set('authorization', `Bearer ${token}`)
      .expect(401);
  });
});
