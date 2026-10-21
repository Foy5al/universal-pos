'use client';

import type { Device, ResolveSyncConflictRequest, SyncConflict } from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  clearToken,
  fetchSession,
  getToken,
  listDevices,
  listSyncConflicts,
  resolveSyncConflict,
  revokeDevice as revokeDeviceRequest,
} from '../lib/api';

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function useSyncAdmin() {
  const router = useRouter();
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [canReview, setCanReview] = useState(false);
  const [canReadDevices, setCanReadDevices] = useState(false);
  const [canManageDevices, setCanManageDevices] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const session = await fetchSession(token);
        if (cancelled) return;
        const permissions = session.user.permissions;
        const review = permissions.includes('sync:review');
        const readDevices = permissions.includes('devices:read');
        setCanReview(review);
        setCanReadDevices(readDevices);
        setCanManageDevices(permissions.includes('devices:manage'));

        const [conflictList, deviceList] = await Promise.all([
          review ? listSyncConflicts(100) : Promise.resolve([]),
          readDevices ? listDevices() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setConflicts(conflictList);
        setDevices(deviceList);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        if (!cancelled) setError(messageOf(cause, 'Could not load sync review data'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [conflictList, deviceList] = await Promise.all([
        canReview ? listSyncConflicts(100) : Promise.resolve([]),
        canReadDevices ? listDevices() : Promise.resolve([]),
      ]);
      setConflicts(conflictList);
      setDevices(deviceList);
    } catch (cause) {
      setError(messageOf(cause, 'Could not refresh sync review data'));
    }
  }, [canReadDevices, canReview]);

  const resolve = useCallback(async (id: string, input: ResolveSyncConflictRequest) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await resolveSyncConflict(id, input);
      setConflicts((current) =>
        current.map((conflict) =>
          conflict.id === result.conflict.id ? result.conflict : conflict,
        ),
      );
      setNotice(
        result.sale
          ? `Conflict resolved. Sale ${result.sale.saleNumber} posted with stock and payment.`
          : 'Conflict dismissed. The operation will stay visible to the till as rejected.',
      );
    } catch (cause) {
      setError(messageOf(cause, 'Could not resolve the conflict'));
    } finally {
      setBusy(false);
    }
  }, []);

  const revoke = useCallback(async (id: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const device = await revokeDeviceRequest(id);
      setDevices((current) => current.map((item) => (item.id === device.id ? device : item)));
      setNotice(`Device ${device.name} revoked. Further sync pushes are blocked.`);
    } catch (cause) {
      setError(messageOf(cause, 'Could not revoke the device'));
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    conflicts,
    devices,
    loading,
    busy,
    error,
    notice,
    canReview,
    canReadDevices,
    canManageDevices,
    refresh,
    resolve,
    revoke,
  };
}
