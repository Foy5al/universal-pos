'use client';

import type {
  Page,
  Product,
  Register,
  SessionUser,
  StockBalance,
  StockLocation,
} from '@pos/contracts';
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
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Failed to load');
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
    } catch {
      setBalances([]);
    }
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    if (!locationId) {
      setBalances([]);
      return;
    }
    listBalances(locationId)
      .then((result) => {
        if (!cancelled) setBalances(result.items);
      })
      .catch(() => {
        if (!cancelled) setBalances([]);
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
      await logout();
    } catch {
      // Local sign-out must still work when the API is unreachable.
    }
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
