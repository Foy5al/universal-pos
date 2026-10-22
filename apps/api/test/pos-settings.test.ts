import { pbkdf2Sync } from 'node:crypto';

import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  CASHIER_A_EMAIL,
  createPosSettingsTestApp,
  MANAGER_A_EMAIL,
  MANAGER_B_EMAIL,
  ORG_A,
  ORG_B,
  type PosSettingsTestApp,
} from './support/posSettingsFixture';

interface Verifier {
  algorithm: string;
  salt: string;
  hash: string;
  iterations: number;
}

function matches(password: string, verifier: Verifier): boolean {
  const derived = pbkdf2Sync(
    password,
    Buffer.from(verifier.salt, 'base64'),
    verifier.iterations,
    32,
    'sha256',
  );
  return derived.equals(Buffer.from(verifier.hash, 'base64'));
}

describe('POS settings', () => {
  let app: PosSettingsTestApp['app'];
  let auth: PosSettingsTestApp['auth'];

  beforeAll(async () => {
    ({ app, auth } = await createPosSettingsTestApp());
  });

  function read(email: string) {
    return request(app).get('/v1/pos/settings').set('authorization', auth(email));
  }

  function save(email: string, body: Record<string, unknown>) {
    return request(app).put('/v1/pos/settings').set('authorization', auth(email)).send(body);
  }

  it('requires authentication and lets a cashier read the defaults', async () => {
    await request(app).get('/v1/pos/settings').expect(401);

    const response = await read(CASHIER_A_EMAIL).expect(200);
    expect(response.body.data).toEqual({
      organizationId: ORG_A,
      requireRemovalPassword: false,
      removalPasswordSet: false,
      removalPasswordVerifier: null,
      updatedAt: null,
    });
  });

  it('allows only settings managers to change the control', async () => {
    await save(CASHIER_A_EMAIL, { requireRemovalPassword: false }).expect(403);
    await save(MANAGER_A_EMAIL, { requireRemovalPassword: true }).expect(422);
    await save(MANAGER_A_EMAIL, {
      requireRemovalPassword: true,
      removalPassword: 'short',
    }).expect(422);
  });

  it('stores a verifier without returning the plaintext password', async () => {
    const saved = await save(MANAGER_A_EMAIL, {
      requireRemovalPassword: true,
      removalPassword: 'counter-42',
    }).expect(200);

    const settings = saved.body.data;
    expect(settings).toMatchObject({
      organizationId: ORG_A,
      requireRemovalPassword: true,
      removalPasswordSet: true,
    });
    expect(JSON.stringify(saved.body)).not.toContain('counter-42');

    const verifier = settings.removalPasswordVerifier as Verifier;
    expect(verifier.algorithm).toBe('pbkdf2-sha256');
    expect(verifier.iterations).toBeGreaterThan(100_000);
    expect(matches('counter-42', verifier)).toBe(true);
    expect(matches('wrong-pass', verifier)).toBe(false);

    const cashierView = await read(CASHIER_A_EMAIL).expect(200);
    expect(cashierView.body.data.removalPasswordVerifier).toEqual(verifier);
  });

  it('replaces the password and keeps it when protection is disabled', async () => {
    const changed = await save(MANAGER_A_EMAIL, {
      requireRemovalPassword: true,
      removalPassword: 'new-counter-99',
    }).expect(200);
    const verifier = changed.body.data.removalPasswordVerifier as Verifier;
    expect(matches('new-counter-99', verifier)).toBe(true);
    expect(matches('counter-42', verifier)).toBe(false);

    const disabled = await save(MANAGER_A_EMAIL, {
      requireRemovalPassword: false,
    }).expect(200);
    expect(disabled.body.data).toMatchObject({
      requireRemovalPassword: false,
      removalPasswordSet: true,
      removalPasswordVerifier: null,
    });

    const reenabled = await save(MANAGER_A_EMAIL, {
      requireRemovalPassword: true,
    }).expect(200);
    expect(reenabled.body.data.requireRemovalPassword).toBe(true);
    expect(matches('new-counter-99', reenabled.body.data.removalPasswordVerifier)).toBe(true);
  });

  it('keeps each organization on its own settings', async () => {
    const other = await read(MANAGER_B_EMAIL).expect(200);
    expect(other.body.data).toEqual({
      organizationId: ORG_B,
      requireRemovalPassword: false,
      removalPasswordSet: false,
      removalPasswordVerifier: null,
      updatedAt: null,
    });

    const otherSaved = await save(MANAGER_B_EMAIL, {
      requireRemovalPassword: true,
      removalPassword: 'other-store-77',
    }).expect(200);
    expect(otherSaved.body.data.organizationId).toBe(ORG_B);

    const original = await read(MANAGER_A_EMAIL).expect(200);
    expect(matches('new-counter-99', original.body.data.removalPasswordVerifier)).toBe(true);
    expect(matches('other-store-77', original.body.data.removalPasswordVerifier)).toBe(false);
  });
});
