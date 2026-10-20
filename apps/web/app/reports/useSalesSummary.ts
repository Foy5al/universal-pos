'use client';

import type { SalesSummary } from '@pos/contracts';
import { useEffect, useState } from 'react';

import { ApiError, fetchSalesSummary } from '../lib/api';

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const today = new Date();
  const start = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
  return { from: isoDay(start), to: isoDay(today) };
}

export function useSalesSummary() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [applied, setApplied] = useState(initial);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSalesSummary({
      from: `${applied.from}T00:00:00.000Z`,
      to: `${applied.to}T23:59:59.999Z`,
    })
      .then((result) => {
        if (!cancelled) setSummary(result);
      })
      .catch((cause) => {
        if (cancelled) return;
        setSummary(null);
        setError(
          cause instanceof ApiError && cause.status === 401
            ? 'Your session expired. Sign in again to view reports.'
            : cause instanceof Error
              ? cause.message
              : 'Could not load the sales summary',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied, reloadKey]);

  function applyRange(): void {
    if (!from || !to) {
      setError('Choose both a start and end date.');
      return;
    }
    if (from > to) {
      setError('The start date must be on or before the end date.');
      return;
    }
    setError(null);
    setApplied({ from, to });
  }

  return {
    from,
    to,
    applied,
    setFrom,
    setTo,
    applyRange,
    summary,
    loading,
    error,
    reloadKey,
    refresh: () => setReloadKey((key) => key + 1),
  };
}
