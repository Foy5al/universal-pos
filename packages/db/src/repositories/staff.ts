import { randomUUID } from 'node:crypto';

import type { Permission } from '@pos/contracts';

export interface StaffPermissionOverride {
  permissionKey: string;
  granted: boolean;
}

export interface StaffRecord {
  userId: string;
  organizationId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  roleName: string;
  storeId: string | null;
  rolePermissions: Permission[];
  overrides: StaffPermissionOverride[];
}

export interface CreateStaffInput {
  organizationId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  roleName: string;
  rolePermissions: readonly Permission[];
  storeId: string | null;
}

export interface StaffRepository {
  listByOrganization(organizationId: string): Promise<StaffRecord[]>;
  findInOrganization(organizationId: string, userId: string): Promise<StaffRecord | null>;
  findUserByEmail(email: string): Promise<{ id: string } | null>;
  create(input: CreateStaffInput): Promise<void>;
  setPermissionOverrides(
    organizationId: string,
    userId: string,
    overrides: readonly StaffPermissionOverride[],
  ): Promise<void>;
}

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

export class InMemoryStaffRepository implements StaffRepository {
  private readonly records = new Map<string, StaffRecord>();

  constructor(seed: readonly StaffRecord[] = []) {
    for (const record of seed) {
      this.records.set(record.userId, {
        ...record,
        email: normalizeStaffEmail(record.email),
        overrides: [...record.overrides],
      });
    }
  }

  async listByOrganization(organizationId: string): Promise<StaffRecord[]> {
    return [...this.records.values()]
      .filter((record) => record.organizationId === organizationId)
      .map((record) => ({ ...record, overrides: [...record.overrides] }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async findInOrganization(organizationId: string, userId: string): Promise<StaffRecord | null> {
    const record = this.records.get(userId);
    if (!record || record.organizationId !== organizationId) {
      return null;
    }
    return { ...record, overrides: [...record.overrides] };
  }

  async findUserByEmail(email: string): Promise<{ id: string } | null> {
    const target = normalizeStaffEmail(email);
    for (const record of this.records.values()) {
      if (record.email === target) {
        return { id: record.userId };
      }
    }
    return null;
  }

  async create(input: CreateStaffInput): Promise<void> {
    const email = normalizeStaffEmail(input.email);
    if (await this.findUserByEmail(email)) {
      throw new Error('A user with this email already exists');
    }
    const userId = randomUUID();
    this.records.set(userId, {
      userId,
      organizationId: input.organizationId,
      email,
      displayName: input.displayName,
      isActive: true,
      roleName: input.roleName,
      storeId: input.storeId,
      rolePermissions: [...input.rolePermissions],
      overrides: [],
    });
  }

  async setPermissionOverrides(
    organizationId: string,
    userId: string,
    overrides: readonly StaffPermissionOverride[],
  ): Promise<void> {
    const record = this.records.get(userId);
    if (!record || record.organizationId !== organizationId) {
      throw new Error('Staff member not found');
    }
    record.overrides = overrides.map((override) => ({ ...override }));
  }
}
