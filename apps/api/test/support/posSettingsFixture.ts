import type { Principal } from '@pos/contracts';
import type { OrganizationRef, UserRecord } from '@pos/db';
import request from 'supertest';

import { createApp } from '../../src/app';
import { Argon2PasswordHasher } from '../../src/core/passwordHasher';
import { createMemoryDeps } from '../../src/deps';

const PASSWORD = 'password123';

export const ORG_A = '00000000-0000-4000-8000-000000000101';
export const ORG_B = '00000000-0000-4000-8000-000000000102';
export const MANAGER_A = '00000000-0000-4000-8000-0000000001a1';
export const CASHIER_A = '00000000-0000-4000-8000-0000000001a2';
export const MANAGER_B = '00000000-0000-4000-8000-0000000001b1';

export const MANAGER_A_EMAIL = 'pos-manager-a@example.com';
export const CASHIER_A_EMAIL = 'pos-cashier-a@example.com';
export const MANAGER_B_EMAIL = 'pos-manager-b@example.com';

const principals: Principal[] = [
  {
    userId: MANAGER_A,
    email: MANAGER_A_EMAIL,
    displayName: 'POS Manager A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['sales:create', 'settings:read', 'settings:manage'],
  },
  {
    userId: CASHIER_A,
    email: CASHIER_A_EMAIL,
    displayName: 'POS Cashier A',
    organizationId: ORG_A,
    storeIds: [],
    permissions: ['sales:create'],
  },
  {
    userId: MANAGER_B,
    email: MANAGER_B_EMAIL,
    displayName: 'POS Manager B',
    organizationId: ORG_B,
    storeIds: [],
    permissions: ['sales:create', 'settings:read', 'settings:manage'],
  },
];

const organizations: OrganizationRef[] = [
  { id: ORG_A, slug: 'pos-settings-a' },
  { id: ORG_B, slug: 'pos-settings-b' },
];

export interface PosSettingsTestApp {
  app: ReturnType<typeof createApp>;
  auth: (email: string) => string;
}

export async function createPosSettingsTestApp(): Promise<PosSettingsTestApp> {
  const passwordHash = await new Argon2PasswordHasher().hash(PASSWORD);
  const users: UserRecord[] = principals.map((principal) => ({
    id: principal.userId,
    email: principal.email,
    passwordHash,
    displayName: principal.displayName,
    isActive: true,
  }));

  const app = createApp(
    createMemoryDeps({
      users,
      principals,
      organizations,
      memberships: principals.map((principal) => ({
        userId: principal.userId,
        organizationId: principal.organizationId,
      })),
    }),
  );

  const tokens: Record<string, string> = {};
  for (const principal of principals) {
    const response = await request(app)
      .post('/v1/auth/login')
      .send({ email: principal.email, password: PASSWORD })
      .expect(200);
    tokens[principal.email] = response.body.data.token as string;
  }

  return { app, auth: (email) => `Bearer ${tokens[email]}` };
}
