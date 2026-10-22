'use client';

import { unsyncedSaleCounts, type UnsyncedSaleCounts } from '@pos/offline';
import { useEffect, useState } from 'react';

import { offlineDatabase } from '../../lib/offlineSync';

const EMPTY_COUNTS: UnsyncedSaleCounts = {
  pending: 0,
  retryable: 0,
  needsReview: 0,
  rejected: 0,
  total: 0,
  needsAttention: 0,
};

const REFRESH_INTERVAL_MS = 10_000;

/**
 * Device-level count of sales that still need the server. The badge is only
 * advisory: `useOfflineCheckout` remains the owner of pushing the outbox.
 */
export function useUnsyncedSales(enabled: boolean): UnsyncedSaleCounts {
  const [counts, setCounts] = useState<UnsyncedSaleCounts>(EMPTY_COUNTS);

  useEffect(() => {
    if (!enabled) {
      setCounts(EMPTY_COUNTS);
      return;
    }
    let cancelled = false;

    const refresh = async () => {
      try {
        const next = await unsyncedSaleCounts(offlineDatabase());
        if (!cancelled) setCounts(next);
      } catch {
        if (!cancelled) setCounts(EMPTY_COUNTS);
      }
    };
    const retry = () => {
      void refresh();
    };
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    window.addEventListener('focus', retry);
    window.addEventListener('online', retry);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('focus', retry);
      window.removeEventListener('online', retry);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [enabled]);

  return counts;
}
