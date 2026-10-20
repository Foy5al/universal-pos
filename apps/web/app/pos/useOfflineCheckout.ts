'use client';

import {
  commitLocalSale,
  getOrCreateDeviceIdentity,
  outboxSummary,
  readLastSyncedAt,
  runSync,
  type CommitLocalSaleInput,
  type LocalSale,
  type SyncSummary,
} from '@pos/offline';
import { useCallback, useEffect, useState } from 'react';

import { apiSyncTransport, offlineDatabase } from '../lib/offlineSync';

const EMPTY_SUMMARY: SyncSummary = {
  pending: 0,
  retryable: 0,
  needsReview: 0,
  rejected: 0,
  acknowledged: 0,
};

/**
 * Durable checkout: the sale is committed to IndexedDB before any success is
 * shown, then pushed online when possible (plan §5, ADR-0004).
 */
export function useOfflineCheckout(options: { online: boolean }) {
  const [summary, setSummary] = useState<SyncSummary>(EMPTY_SUMMARY);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const db = offlineDatabase();
    setSummary(await outboxSummary(db));
    setLastSyncedAt(await readLastSyncedAt(db));
  }, []);

  const sync = useCallback(async () => {
    if (!options.online) return;
    const db = offlineDatabase();
    setSyncing(true);
    setSyncError(null);
    try {
      const identity = await getOrCreateDeviceIdentity(db);
      await runSync(
        db,
        { id: identity.deviceId, name: identity.name, platform: identity.platform },
        apiSyncTransport,
      );
    } catch (cause) {
      setSyncError(cause instanceof Error ? cause.message : 'Could not sync sales');
    } finally {
      await refresh();
      setSyncing(false);
    }
  }, [options.online, refresh]);

  useEffect(() => {
    void refresh();
    void sync();
  }, [refresh, sync]);

  useEffect(() => {
    const retry = () => {
      void sync();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retry();
    };
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [sync]);

  const checkout = useCallback(
    async (input: Omit<CommitLocalSaleInput, 'deviceId'>): Promise<LocalSale> => {
      const db = offlineDatabase();
      const identity = await getOrCreateDeviceIdentity(db);
      const sale = await commitLocalSale(db, { ...input, deviceId: identity.deviceId });
      await refresh();

      if (options.online) {
        await sync();
        return (await db.localSales.get(sale.id)) ?? sale;
      }
      return sale;
    },
    [options.online, refresh, sync],
  );

  return { checkout, sync, syncing, summary, lastSyncedAt, syncError };
}
