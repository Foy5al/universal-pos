import { z } from 'zod';

import { permissionSetSchema, type Permission } from './permissions';

export const STAFF_ROLE_KEYS = ['manager', 'cashier'] as const;

export const staffRoleSchema = z.enum(STAFF_ROLE_KEYS);

export type StaffRoleKey = z.infer<typeof staffRoleSchema>;

export interface StaffRolePreset {
  key: StaffRoleKey;
  name: string;
  description: string;
  permissions: readonly Permission[];
}

/**
 * Role presets are the starting point for a new team member. An organization
 * may edit the individual's permissions afterwards; the preset itself is the
 * baseline that overrides are measured against.
 */
export const STAFF_ROLE_PRESETS: readonly StaffRolePreset[] = [
  {
    key: 'manager',
    name: 'Manager',
    description: 'Runs the store: catalog, stock, purchasing, shifts, refunds and reports.',
    permissions: [
      'stores:read',
      'staff:read',
      'catalog:read',
      'catalog:manage',
      'inventory:read',
      'inventory:adjust',
      'inventory:manage',
      'restock:request',
      'purchases:read',
      'purchases:manage',
      'registers:read',
      'registers:manage',
      'sales:read',
      'sales:create',
      'sales:void',
      'refunds:read',
      'refunds:approve',
      'discounts:apply',
      'discounts:approve',
      'reports:read',
      'reports:export',
      'devices:read',
      'devices:manage',
      'sync:push',
      'sync:pull',
      'sync:review',
      'settings:read',
      'settings:manage',
      'audit:read',
    ],
  },
  {
    key: 'cashier',
    name: 'Cashier',
    description: 'Sells at the counter and runs the register shift.',
    permissions: [
      'stores:read',
      'catalog:read',
      'inventory:read',
      'restock:request',
      'registers:read',
      'registers:manage',
      'sales:read',
      'sales:create',
      'refunds:read',
      'discounts:apply',
      'sync:push',
      'sync:pull',
    ],
  },
];

export function findStaffRolePreset(key: StaffRoleKey): StaffRolePreset {
  const preset = STAFF_ROLE_PRESETS.find((candidate) => candidate.key === key);
  if (!preset) {
    throw new Error(`Unknown staff role preset: ${key}`);
  }
  return preset;
}

export const staffMemberSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  isActive: z.boolean(),
  role: z.string(),
  storeId: z.uuid().nullable(),
  permissions: permissionSetSchema,
});

export type StaffMember = z.infer<typeof staffMemberSchema>;

export const createStaffRequestSchema = z.object({
  email: z.email().max(200),
  displayName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(200),
  role: staffRoleSchema,
  storeId: z.uuid().optional(),
});

export type CreateStaffRequest = z.infer<typeof createStaffRequestSchema>;

export const updateStaffPermissionsRequestSchema = z.object({
  permissions: permissionSetSchema,
});

export type UpdateStaffPermissionsRequest = z.infer<typeof updateStaffPermissionsRequestSchema>;
