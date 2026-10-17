import { and, eq } from 'drizzle-orm';

import { PERMISSION_KEYS, type Permission, type Principal } from '@pos/contracts';

import type { Database } from '../client';
import {
  memberships,
  rolePermissions,
  userRoleAssignments,
  users,
} from '../schema/identity';

export interface AuthorizationRepository {
  /** Resolves the effective principal for a user within one organization, or null. */
  loadPrincipal(userId: string, organizationId: string): Promise<Principal | null>;
}

function principalKey(userId: string, organizationId: string): string {
  return `${userId}:${organizationId}`;
}

export class InMemoryAuthorizationRepository implements AuthorizationRepository {
  private readonly principals = new Map<string, Principal>();

  constructor(entries: readonly Principal[] = []) {
    for (const principal of entries) {
      this.principals.set(principalKey(principal.userId, principal.organizationId), principal);
    }
  }

  async loadPrincipal(userId: string, organizationId: string): Promise<Principal | null> {
    return this.principals.get(principalKey(userId, organizationId)) ?? null;
  }
}

export function createDrizzleAuthorizationRepository(db: Database): AuthorizationRepository {
  const allowedPermissions = new Set<string>(PERMISSION_KEYS);

  return {
    async loadPrincipal(userId, organizationId) {
      const userRows = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isActive, true)))
        .limit(1);
      const user = userRows[0];
      if (!user) {
        return null;
      }

      const membershipRows = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)),
        )
        .limit(1);
      if (membershipRows.length === 0) {
        return null;
      }

      const grantRows = await db
        .select({
          storeId: userRoleAssignments.storeId,
          permissionKey: rolePermissions.permissionKey,
        })
        .from(userRoleAssignments)
        .leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoleAssignments.roleId))
        .where(
          and(
            eq(userRoleAssignments.userId, userId),
            eq(userRoleAssignments.organizationId, organizationId),
          ),
        );

      const storeIds = new Set<string>();
      const permissionSet = new Set<string>();
      let organizationWide = false;
      for (const row of grantRows) {
        if (row.storeId === null) {
          organizationWide = true;
        } else {
          storeIds.add(row.storeId);
        }
        if (row.permissionKey) {
          permissionSet.add(row.permissionKey);
        }
      }

      const permissions = [...permissionSet].filter((key): key is Permission =>
        allowedPermissions.has(key),
      );

      return {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        organizationId,
        storeIds: organizationWide ? [] : [...storeIds],
        permissions,
      };
    },
  };
}
