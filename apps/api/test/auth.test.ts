import type { Principal } from '@pos/contracts';
import type { OrganizationRef, UserRecord } from '@pos/db';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../src/app';
import { Argon2PasswordHasher } from '../src/core/passwordHasher';
import { createMemoryDeps } from '../src/deps';

const PASSWORD = 'password123';
const USER_ID = '00000000-0000-4000-8000-0000000000d1';
const ORG = '00000000-0000-4000-8000-000000000001';
const ORG_OTHER = '00000000-0000-4000-8000-000000000002';
const EMAIL = 'owner@example.com';

const organizations: OrganizationRef[] = [
  { id: ORG, slug: 'my-org' },
  { id: ORG_OTHER, slug: 'other-org' },
];

describe('authentication', () => {
  let app: ReturnType<typeof createApp>;

  beforeAll(async () => {
    const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
    const users: UserRecord[] = [
      {
        id: USER_ID,
        email: EMAIL,
        passwordHash,
        displayName: 'Owner',
        isActive: true,
      },
    ];
    const principals: Principal[] = [
      {
        userId: USER_ID,
        email: EMAIL,
        displayName: 'Owner',
        organizationId: ORG,
        storeIds: [],
        permissions: ['organizations:read', 'stores:read'],
      },
    ];
    app = createApp(
      createMemoryDeps({
        users,
        principals,
        organizations,
        memberships: [{ userId: USER_ID, organizationId: ORG }],
      }),
    );
  });

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.organizationId).toBe(ORG);
  });

  it('rejects a wrong password', async () => {
    await request(app)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects an unknown email', async () => {
    await request(app)
      .post('/v1/auth/login')
      .send({ email: 'nobody@example.com', password: PASSWORD })
      .expect(401);
  });

  it('rejects an organization the user is not a member of', async () => {
    await request(app)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD, organizationSlug: 'other-org' })
      .expect(401);
  });

  it('validates the request body', async () => {
    await request(app).post('/v1/auth/login').send({ email: 'not-an-email' }).expect(422);
  });

  it('revokes the session on logout', async () => {
    const login = await request(app)
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const token = login.body.data.token as string;

    await request(app)
      .get('/v1/auth/session')
      .set('authorization', `Bearer ${token}`)
      .expect(200);

    await request(app)
      .post('/v1/auth/logout')
      .set('authorization', `Bearer ${token}`)
      .expect(204);

    await request(app)
      .get('/v1/auth/session')
      .set('authorization', `Bearer ${token}`)
      .expect(401);
  });
});

describe('argon2 password hasher', () => {
  it('round-trips a password and rejects a wrong one', async () => {
    const hasher = new Argon2PasswordHasher();
    const digest = await hasher.hash(PASSWORD);
    expect(digest).not.toContain(PASSWORD);
    await expect(hasher.verify(digest, PASSWORD)).resolves.toBe(true);
    await expect(hasher.verify(digest, 'wrong-password')).resolves.toBe(false);
  });
});
