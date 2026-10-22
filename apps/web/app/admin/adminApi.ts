import type {
  CreateRegisterRequest,
  CreateStaffRequest,
  Permission,
  Register,
  StaffMember,
  Store,
} from '@pos/contracts';

import { apiFetch } from '../lib/api';

export function listAllStores(): Promise<{ stores: Store[] }> {
  return apiFetch('/stores');
}

export function listAllRegisters(): Promise<{ items: Register[]; total: number }> {
  return apiFetch('/registers?limit=200');
}

export function createCounter(body: CreateRegisterRequest): Promise<Register> {
  return apiFetch('/registers', { method: 'POST', body });
}

export function listStaffMembers(): Promise<{ staff: StaffMember[] }> {
  return apiFetch('/staff');
}

export function createStaffMember(body: CreateStaffRequest): Promise<StaffMember> {
  return apiFetch('/staff', { method: 'POST', body });
}

export function saveStaffPermissions(
  userId: string,
  permissions: Permission[],
): Promise<StaffMember> {
  return apiFetch(`/staff/${encodeURIComponent(userId)}/permissions`, {
    method: 'PATCH',
    body: { permissions },
  });
}
