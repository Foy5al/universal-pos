import { z } from 'zod';

export const PERMISSION_KEYS = [
  'organizations:read',
  'organizations:update',
  'stores:read',
  'stores:manage',
  'staff:read',
  'staff:manage',
  'roles:read',
  'roles:manage',
  'settings:read',
  'settings:manage',
  'catalog:read',
  'catalog:manage',
  'inventory:read',
  'inventory:adjust',
  'inventory:manage',
  'purchases:read',
  'purchases:manage',
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
  'audit:read',
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number];

export const permissionSchema = z.enum(PERMISSION_KEYS);

export const permissionSetSchema = z.array(permissionSchema);

export function hasPermission(granted: readonly Permission[], required: Permission): boolean {
  return granted.includes(required);
}

export function hasAllPermissions(
  granted: readonly Permission[],
  required: readonly Permission[],
): boolean {
  return required.every((permission) => granted.includes(permission));
}
