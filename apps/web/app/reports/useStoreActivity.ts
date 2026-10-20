'use client';

import type { StoreActivity } from '@pos/contracts';
import { useEffect, useState } from 'react';

import { ApiError, fetchStoreActivity } from '../lib/api';

export function useStoreActivity(from: string, to: string, reloadKey: number) {
  const [activity, setActivity] = useState<StoreActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStoreActivity({
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
    })
      .then((result) => {
        if (!cancelled) setActivity(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        setActivity(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? 'Your session expired. Sign in again to view store activity.'
            : cause instanceof Error
              ? cause.message
              : 'Could not load store activity',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [from, to, reloadKey]);

  return { activity, loading, error };
}
