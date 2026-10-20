'use client';

import type {
  CreateStockLossRequest,
  Page,
  Product,
  StockBalance,
  StockLocation,
  StockMovement,
} from '@pos/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  clearToken,
  createStockLoss,
  fetchSession,
  getToken,
  listBalances,
  listLocations,
  listProducts,
  listStockLosses,
} from '../lib/api';

export function useStock(locationId: string) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [losses, setLosses] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [canAdjust, setCanAdjust] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setCanAdjust(session.user.permissions.includes('inventory:adjust'));
        const [productPage, locationPage]: [Page<Product>, Page<StockLocation>] = await Promise.all(
          [listProducts(), listLocations()],
        );
        if (cancelled) return;
        setProducts(productPage.items);
        setLocations(locationPage.items);
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          router.replace('/login');
          return;
        }
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load stock data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const refresh = useCallback(async () => {
    if (!locationId) {
      setBalances([]);
      setLosses([]);
      return;
    }
    const [balancePage, lossPage]: [Page<StockBalance>, Page<StockMovement>] = await Promise.all([
      listBalances(locationId),
      listStockLosses(locationId),
    ]);
    setBalances(balancePage.items);
    setLosses(lossPage.items);
  }, [locationId]);

  useEffect(() => {
    let cancelled = false;
    if (!locationId) {
      setBalances([]);
      setLosses([]);
      return;
    }
    Promise.all([listBalances(locationId), listStockLosses(locationId)])
      .then(([balancePage, lossPage]) => {
        if (cancelled) return;
        setBalances(balancePage.items);
        setLosses(lossPage.items);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Could not load stock levels');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  async function recordLoss(input: CreateStockLossRequest) {
    setBusy(true);
    try {
      const result = await createStockLoss(input);
      try {
        await refresh();
      } catch {
        setError('Loss saved, but the stock list could not refresh. Reload to see it.');
      }
      return result;
    } finally {
      setBusy(false);
    }
  }

  return {
    products,
    locations,
    balances,
    losses,
    loading,
    busy,
    canAdjust,
    error,
    recordLoss,
  };
}
