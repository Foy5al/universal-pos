'use client';

import type {
  CreateRegisterRequest,
  CreateStaffRequest,
  Permission,
  Register,
  SessionUser,
  StaffMember,
  Store,
} from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, clearToken, fetchSession, getToken } from '../lib/api';
import {
  createCounter as createCounterRequest,
  createStaffMember as createStaffMemberRequest,
  listAllRegisters,
  listAllStores,
  listStaffMembers,
  saveStaffPermissions,
} from './adminApi';

function sortRegisters(registers: readonly Register[]): Register[] {
  return [...registers].sort(
    (left, right) => left.name.localeCompare(right.name) || left.code.localeCompare(right.code),
  );
}

function sortStaff(staff: readonly StaffMember[]): StaffMember[] {
  return [...staff].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function useAdmin() {
  const router = useRouter();
  const [session, setSession] = useState<SessionUser | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const current = await fetchSession(token);
        if (cancelled) return;
        setSession(current.user);
        const permissions = current.user.permissions;

        await Promise.all([
          permissions.includes('stores:read')
            ? listAllStores().then((result) => {
                if (!cancelled) setStores(result.stores);
              })
            : Promise.resolve(),
          permissions.includes('registers:read')
            ? listAllRegisters().then((page) => {
                if (!cancelled) setRegisters(sortRegisters(page.items));
              })
            : Promise.resolve(),
          permissions.includes('staff:read')
            ? listStaffMembers().then((result) => {
                if (!cancelled) setStaff(sortStaff(result.staff));
              })
            : Promise.resolve(),
        ]);
      } catch (cause) {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Could not load the admin data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleActionError(cause: unknown): never {
    if (cause instanceof ApiError && cause.status === 401) {
      clearToken();
      router.replace('/login');
    }
    throw cause;
  }

  async function addCounter(input: CreateRegisterRequest): Promise<Register> {
    try {
      const register = await createCounterRequest(input);
      setRegisters((current) => sortRegisters([...current, register]));
      return register;
    } catch (cause) {
      return handleActionError(cause);
    }
  }

  async function addStaffMember(input: CreateStaffRequest): Promise<StaffMember> {
    try {
      const member = await createStaffMemberRequest(input);
      setStaff((current) => sortStaff([...current, member]));
      return member;
    } catch (cause) {
      return handleActionError(cause);
    }
  }

  async function updatePermissions(
    userId: string,
    permissions: Permission[],
  ): Promise<StaffMember> {
    try {
      const member = await saveStaffPermissions(userId, permissions);
      setStaff((current) =>
        sortStaff(current.map((entry) => (entry.userId === member.userId ? member : entry))),
      );
      return member;
    } catch (cause) {
      return handleActionError(cause);
    }
  }

  const permissions = session?.permissions ?? [];

  return {
    session,
    stores,
    registers,
    staff,
    loading,
    error,
    canReadStaff: permissions.includes('staff:read'),
    canManageStaff: permissions.includes('staff:manage'),
    canReadCounters: permissions.includes('registers:read'),
    canManageCounters: permissions.includes('registers:manage'),
    addCounter,
    addStaffMember,
    updatePermissions,
  };
}
