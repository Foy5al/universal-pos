import {
  findStaffRolePreset,
  PERMISSION_KEYS,
  type CreateStaffRequest,
  type Permission,
  type StaffMember,
} from '@pos/contracts';
import type {
  StaffPermissionOverride,
  StaffRecord,
  StaffRepository,
  StoreRepository,
} from '@pos/db';

import { conflict, forbidden, notFound, validationError } from '../../core/errors';
import type { PasswordHasher } from '../../core/passwordHasher';

export interface StaffService {
  list(organizationId: string): Promise<StaffMember[]>;
  create(organizationId: string, input: CreateStaffRequest): Promise<StaffMember>;
  setPermissions(
    organizationId: string,
    actorUserId: string,
    targetUserId: string,
    permissions: readonly Permission[],
  ): Promise<StaffMember>;
}

export interface StaffServiceDeps {
  staff: StaffRepository;
  stores: StoreRepository;
  hasher: PasswordHasher;
}

function effectivePermissions(record: StaffRecord): Permission[] {
  const granted = new Set<string>(record.rolePermissions);
  for (const override of record.overrides) {
    if (override.granted) {
      granted.add(override.permissionKey);
    } else {
      granted.delete(override.permissionKey);
    }
  }
  return PERMISSION_KEYS.filter((key) => granted.has(key));
}

function toMember(record: StaffRecord): StaffMember {
  return {
    userId: record.userId,
    email: record.email,
    displayName: record.displayName,
    isActive: record.isActive,
    role: record.roleName || 'No role',
    storeId: record.storeId,
    permissions: effectivePermissions(record),
  };
}

export function createStaffService(deps: StaffServiceDeps): StaffService {
  async function requireMember(organizationId: string, userId: string): Promise<StaffRecord> {
    const record = await deps.staff.findInOrganization(organizationId, userId);
    if (!record) {
      throw notFound('Staff member not found');
    }
    return record;
  }

  return {
    async list(organizationId) {
      const records = await deps.staff.listByOrganization(organizationId);
      return records.map(toMember);
    },

    async create(organizationId, input) {
      const preset = findStaffRolePreset(input.role);
      if (input.storeId) {
        const store = await deps.stores.findInOrganization(organizationId, input.storeId);
        if (!store) {
          throw validationError('Store not found');
        }
      }
      const email = input.email.trim().toLowerCase();
      if (await deps.staff.findUserByEmail(email)) {
        throw conflict('A user with this email already exists');
      }

      await deps.staff.create({
        organizationId,
        email,
        displayName: input.displayName,
        passwordHash: await deps.hasher.hash(input.password),
        roleName: preset.name,
        rolePermissions: preset.permissions,
        storeId: input.storeId ?? null,
      });

      const created = await deps.staff.findUserByEmail(email);
      if (!created) {
        throw new Error('Created staff member could not be loaded');
      }
      return toMember(await requireMember(organizationId, created.id));
    },

    async setPermissions(organizationId, actorUserId, targetUserId, permissions) {
      const target = await requireMember(organizationId, targetUserId);
      if (target.userId === actorUserId) {
        throw forbidden('You cannot change your own permissions');
      }

      const desired = new Set(permissions);
      const baseline = new Set(target.rolePermissions);
      const overrides: StaffPermissionOverride[] = [];
      for (const key of PERMISSION_KEYS) {
        if (desired.has(key) && !baseline.has(key)) {
          overrides.push({ permissionKey: key, granted: true });
        } else if (!desired.has(key) && baseline.has(key)) {
          overrides.push({ permissionKey: key, granted: false });
        }
      }

      await deps.staff.setPermissionOverrides(organizationId, targetUserId, overrides);
      return toMember(await requireMember(organizationId, targetUserId));
    },
  };
}
