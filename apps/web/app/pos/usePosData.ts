'use client';

import type {
  Page,
  Product,
  Register,
  SessionUser,
  StockBalance,
  StockLocation,
} from '@pos/contracts';
import {
  cacheBalances,
  cacheProducts,
  outboxSummary,
  readCachedBalances,
  readCachedProducts,
} from '@pos/offline';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  clearToken,
  fetchSession,
  getToken,
  listBalances,
  listLocations,
  listProducts,
  listRegisters,
  logout,
} from '../lib/api';
import { clearOfflineCatalog, offlineDatabase } from '../lib/offlineSync';
import { clearPosBootstrap, readPosBootstrap, savePosBootstrap } from './posBootstrap';
import { clearPausedOrders } from './pausedOrders';

function cachedBalances(
  locationId: string,
  quantities: Array<{ productId: string; quantity: string }>,
) {
  const updatedAt = new Date().toISOString();
  return quantities.map((balance) => ({ ...balance, locationId, updatedAt }));
}

export function usePosData(locationId: string) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);

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
        setUser(session.user);
        const [productPage, locationPage, registerPage]: [
          Page<Product>,
          Page<StockLocation>,
          Page<Register>,
        ] = await Promise.all([listProducts(), listLocations(), listRegisters()]);
        if (cancelled) return;
        setProducts(productPage.items);
        setLocations(locationPage.items);
        setRegisters(registerPage.items);
        savePosBootstrap({
          user: session.user,
          locations: locationPage.items,
          registers: registerPage.items,
        });
        await cacheProducts(offlineDatabase(), productPage.items);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        const cached = readPosBootstrap();
        const cachedCatalog = await readCachedProducts(offlineDatabase()).catch(
          () => [] as Product[],
        );
        if (!cancelled && cached?.user && cached.locations && cached.registers) {
          setUser(cached.user);
          setLocations(cached.locations);
          setRegisters(cached.registers);
          setProducts(cachedCatalog);
          setError(null);
        } else if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refreshBalances = useCallback(async () => {
    if (!locationId) return;
    try {
      const result = await listBalances(locationId);
      setBalances(result.items);
      await cacheBalances(offlineDatabase(), locationId, result.items);
    } catch {
      try {
        const cached = await readCachedBalances(offlineDatabase(), locationId);
        setBalances(cachedBalances(locationId, cached));
      } catch {
        setBalances([]);
      }
    }
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    if (!locationId) {
      setBalances([]);
      return;
    }
    listBalances(locationId)
      .then(async (result) => {
        if (cancelled) return;
        setBalances(result.items);
        await cacheBalances(offlineDatabase(), locationId, result.items);
      })
      .catch(async () => {
        const cached = await readCachedBalances(offlineDatabase(), locationId).catch(
          () => [] as Array<{ productId: string; quantity: string }>,
        );
        if (!cancelled) setBalances(cachedBalances(locationId, cached));
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      const summary = await outboxSummary(offlineDatabase());
      const unsynced = summary.pending + summary.retryable + summary.needsReview + summary.rejected;
      if (unsynced > 0) {
        setError('Sync or reconcile the queued sales before signing out.');
        return;
      }
    } catch {
      // An unavailable local store must not strand the user in the session.
    }

    try {
      await logout();
    } catch {
      // Local sign-out must still work when the API is unreachable.
    }
    try {
      await clearOfflineCatalog();
    } catch {
      // Cache cleanup is best effort.
    }
    clearPausedOrders();
    clearPosBootstrap();
    clearToken();
    router.replace('/login');
  }, [router]);

  return {
    user,
    products,
    locations,
    registers,
    balances,
    loading,
    error,
    setError,
    online,
    refreshBalances,
    signOut,
  };
}
