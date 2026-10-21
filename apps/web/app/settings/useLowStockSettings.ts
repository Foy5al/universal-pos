'use client';

import type { LowStockSettings } from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, clearToken, fetchSession, getToken } from '../lib/api';
import { fetchLowStockSettings, saveGlobalLowStockThreshold } from '../inventory/lowStockApi';

export function useLowStockSettings() {
  const router = useRouter();
  const [settings, setSettings] = useState<LowStockSettings | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    Promise.all([fetchLowStockSettings(), fetchSession(token)])
      .then(([loaded, session]) => {
        if (cancelled) return;
        setSettings(loaded);
        setCanManage(session.user.permissions.includes('inventory:manage'));
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Could not load the system settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function save(globalThreshold: string | null): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveGlobalLowStockThreshold(globalThreshold);
      setSettings(saved);
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        clearToken();
        router.replace('/login');
        return false;
      }
      setError(cause instanceof Error ? cause.message : 'Could not save the threshold.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { settings, canManage, loading, busy, error, save };
}
