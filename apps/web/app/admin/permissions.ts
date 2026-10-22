import { PERMISSION_KEYS, type Permission } from '@pos/contracts';

const RESOURCE_LABELS: Record<string, string> = {
  organizations: 'Organization',
  stores: 'Stores',
  staff: 'Team',
  roles: 'Roles',
  settings: 'Settings',
  catalog: 'Catalog',
  inventory: 'Stock',
  restock: 'Restock requests',
  purchases: 'Purchasing',
  registers: 'Counters and shifts',
  sales: 'Sales',
  refunds: 'Refunds',
  discounts: 'Discounts',
  reports: 'Reports',
  devices: 'Devices',
  sync: 'Offline sync',
  audit: 'Audit log',
};

const ACTION_LABELS: Record<string, string> = {
  read: 'View',
  manage: 'Manage',
  create: 'Create',
  update: 'Update',
  adjust: 'Adjust',
  approve: 'Approve',
  apply: 'Apply',
  export: 'Export',
  push: 'Send',
  pull: 'Receive',
  review: 'Review',
  void: 'Void',
  request: 'Request',
};

function resourceOf(permission: Permission): string {
  return permission.split(':')[0] ?? permission;
}

function actionOf(permission: Permission): string {
  return permission.split(':')[1] ?? permission;
}

export function permissionLabel(permission: Permission): string {
  const resource = RESOURCE_LABELS[resourceOf(permission)] ?? resourceOf(permission);
  const action = ACTION_LABELS[actionOf(permission)] ?? actionOf(permission);
  return `${action} ${resource.toLowerCase()}`;
}

export function permissionGroups(): Array<{ resource: string; permissions: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const permission of PERMISSION_KEYS) {
    const resource = RESOURCE_LABELS[resourceOf(permission)] ?? resourceOf(permission);
    groups.set(resource, [...(groups.get(resource) ?? []), permission]);
  }
  return [...groups.entries()].map(([resource, permissions]) => ({ resource, permissions }));
}
