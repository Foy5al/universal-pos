'use client';

import type { PosSettings, UpdatePosSettingsRequest } from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, clearToken, fetchSession, getToken } from '../lib/api';
import { fetchPosSettings, updatePosSettings } from '../lib/posSettingsApi';

export function usePosSettings() {
  const router = useRouter();
  const [settings, setSettings] = useState<PosSettings | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    Promise.all([fetchPosSettings(), fetchSession(token)])
      .then(([loaded, session]) => {
        if (cancelled) return;
        setSettings(loaded);
        setCanManage(session.user.permissions.includes('settings:manage'));
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        setError(cause instanceof Error ? cause.message : 'Could not load POS controls.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function save(input: UpdatePosSettingsRequest): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updatePosSettings(input);
      setSettings(saved);
      setNotice(
        saved.requireRemovalPassword
          ? 'Removal protection is on. Terminals receive the offline check on their next sync.'
          : 'Removal protection is off. Items can be removed without a password.',
      );
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        clearToken();
        router.replace('/login');
        return false;
      }
      setError(cause instanceof Error ? cause.message : 'Could not save POS controls.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { settings, canManage, loading, busy, error, notice, save };
}
