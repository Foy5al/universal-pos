import { and, eq } from 'drizzle-orm';

import type { Permission } from '@pos/contracts';

import type { Database } from '../client';
import {
  memberships,
  permissions as permissionRows,
  rolePermissions,
  roles,
  userPermissionOverrides,
  userRoleAssignments,
  users,
} from '../schema/identity';
import { normalizeStaffEmail, type StaffRecord, type StaffRepository } from './staff';

function mergeRoles(
  records: Map<string, StaffRecord>,
  assignments: ReadonlyArray<{
    userId: string;
    roleName: string;
    storeId: string | null;
    permissionKey: string | null;
  }>,
): void {
  for (const assignment of assignments) {
    const record = records.get(assignment.userId);
    if (!record) continue;
    if (!record.roleName) {
      record.roleName = assignment.roleName;
      record.storeId = assignment.storeId;
    } else if (record.storeId !== null) {
      // Any organization-wide assignment widens the member's effective scope.
      record.storeId = assignment.storeId === null ? null : record.storeId;
    }
    if (assignment.permissionKey) {
      record.rolePermissions.push(assignment.permissionKey as Permission);
    }
  }
}

export function createDrizzleStaffRepository(db: Database): StaffRepository {
  async function loadMembers(organizationId: string): Promise<Map<string, StaffRecord>> {
    const memberRows = await db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        isActive: users.isActive,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, organizationId));

    const records = new Map<string, StaffRecord>();
    for (const member of memberRows) {
      records.set(member.userId, {
        ...member,
        organizationId,
        email: normalizeStaffEmail(member.email),
        roleName: '',
        storeId: null,
        rolePermissions: [],
        overrides: [],
      });
    }
    if (records.size === 0) {
      return records;
    }

    const assignmentRows = await db
      .select({
        userId: userRoleAssignments.userId,
        roleName: roles.name,
        storeId: userRoleAssignments.storeId,
        permissionKey: rolePermissions.permissionKey,
      })
      .from(userRoleAssignments)
      .innerJoin(roles, eq(roles.id, userRoleAssignments.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoleAssignments.roleId))
      .where(eq(userRoleAssignments.organizationId, organizationId));
    mergeRoles(records, assignmentRows);

    const overrideRows = await db
      .select({
        userId: userPermissionOverrides.userId,
        permissionKey: userPermissionOverrides.permissionKey,
        granted: userPermissionOverrides.granted,
      })
      .from(userPermissionOverrides)
      .where(eq(userPermissionOverrides.organizationId, organizationId));
    for (const override of overrideRows) {
      const record = records.get(override.userId);
      if (record) {
        record.overrides.push({
          permissionKey: override.permissionKey,
          granted: override.granted,
        });
      }
    }
    return records;
  }

  return {
    async listByOrganization(organizationId) {
      return [...(await loadMembers(organizationId)).values()].sort((left, right) =>
        left.displayName.localeCompare(right.displayName),
      );
    },

    async findInOrganization(organizationId, userId) {
      return (await loadMembers(organizationId)).get(userId) ?? null;
    },

    async findUserByEmail(email) {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizeStaffEmail(email)))
        .limit(1);
      return rows[0] ? { id: rows[0].id } : null;
    },

    async create(input) {
      await db.transaction(async (tx) => {
        if (input.rolePermissions.length > 0) {
          await tx
            .insert(permissionRows)
            .values(input.rolePermissions.map((key) => ({ key, description: key })))
            .onConflictDoNothing();
        }
        await tx
          .insert(roles)
          .values({
            organizationId: input.organizationId,
            name: input.roleName,
            isSystem: true,
          })
          .onConflictDoNothing();
        const roleRows = await tx
          .select({ id: roles.id })
          .from(roles)
          .where(
            and(eq(roles.organizationId, input.organizationId), eq(roles.name, input.roleName)),
          )
          .limit(1);
        const role = roleRows[0];
        if (!role) {
          throw new Error('Could not create the staff role');
        }
        if (input.rolePermissions.length > 0) {
          await tx
            .insert(rolePermissions)
            .values(
              input.rolePermissions.map((permissionKey) => ({
                roleId: role.id,
                permissionKey,
              })),
            )
            .onConflictDoNothing();
        }
        const userRows = await tx
          .insert(users)
          .values({
            email: normalizeStaffEmail(input.email),
            passwordHash: input.passwordHash,
            displayName: input.displayName,
          })
          .returning({ id: users.id });
        const user = userRows[0];
        if (!user) {
          throw new Error('Could not create the staff user');
        }
        await tx.insert(memberships).values({
          userId: user.id,
          organizationId: input.organizationId,
        });
        await tx.insert(userRoleAssignments).values({
          userId: user.id,
          roleId: role.id,
          organizationId: input.organizationId,
          storeId: input.storeId,
        });
      });
    },

    async setPermissionOverrides(organizationId, userId, overrides) {
      await db.transaction(async (tx) => {
        await tx
          .delete(userPermissionOverrides)
          .where(
            and(
              eq(userPermissionOverrides.organizationId, organizationId),
              eq(userPermissionOverrides.userId, userId),
            ),
          );
        if (overrides.length > 0) {
          await tx
            .insert(permissionRows)
            .values(
              overrides.map((override) => ({
                key: override.permissionKey,
                description: override.permissionKey,
              })),
            )
            .onConflictDoNothing();
          await tx.insert(userPermissionOverrides).values(
            overrides.map((override) => ({
              organizationId,
              userId,
              permissionKey: override.permissionKey,
              granted: override.granted,
            })),
          );
        }
      });
    },
  };
}
