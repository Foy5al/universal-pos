'use client';

import type { PosSettings } from '@pos/contracts';
import { useEffect, useState } from 'react';

import { getToken } from '../lib/api';
import { fetchPosSettings } from '../lib/posSettingsApi';
import { readCachedPosSettings, saveCachedPosSettings } from './posSettingsCache';

const REFRESH_INTERVAL_MS = 5 * 60_000;

export function usePosControls(organizationId: string | null): PosSettings | null {
  const [settings, setSettings] = useState<PosSettings | null>(null);

  useEffect(() => {
    if (!organizationId) {
      setSettings(null);
      return;
    }
    const cached = readCachedPosSettings();
    setSettings(cached?.organizationId === organizationId ? cached : null);
    if (!getToken()) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await fetchPosSettings();
        if (cancelled || next.organizationId !== organizationId) return;
        setSettings(next);
        saveCachedPosSettings(next);
      } catch {
        // Keep the cached verifier when the API is unreachable.
      }
    };
    const retry = () => {
      void refresh();
    };

    void refresh();
    const interval = window.setInterval(retry, REFRESH_INTERVAL_MS);
    window.addEventListener('online', retry);
    window.addEventListener('focus', retry);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener('online', retry);
      window.removeEventListener('focus', retry);
    };
  }, [organizationId]);

  return settings;
}
