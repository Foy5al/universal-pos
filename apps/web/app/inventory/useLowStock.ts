'use client';

import type { LowStockOverview } from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, clearToken, getToken } from '../lib/api';
import { fetchLowStock } from './lowStockApi';

export function useLowStock(locationId: string) {
  const router = useRouter();
  const [overview, setOverview] = useState<LowStockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setLoading(true);
    setError(null);
    fetchLowStock(locationId || undefined)
      .then((result) => {
        if (!cancelled) setOverview(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Could not load low stock alerts');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [locationId, router]);

  return { overview, loading, error };
}
