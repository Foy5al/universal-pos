'use client';

import type { ShiftReport } from '@pos/contracts';
import { useEffect, useState } from 'react';

import { fetchShiftReport } from '../lib/api';

export function useShiftReport(shiftId: string | null) {
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!shiftId) {
      setReport(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchShiftReport(shiftId)
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((cause) => {
        if (!cancelled) {
          setReport(null);
          setError(cause instanceof Error ? cause.message : 'Could not load the shift report');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shiftId]);

  return { report, loading, error };
}
