'use client';

import type { Register, RegisterShift } from '@pos/contracts';
import { useEffect, useMemo, useState } from 'react';

import {
  addCashMovement as addCashMovementRequest,
  closeShift as closeShiftRequest,
  currentShift,
  openShift as openShiftRequest,
} from '../lib/api';
import { readPosBootstrap, savePosBootstrap } from './posBootstrap';

export function useRegisterShift(registers: readonly Register[], storeId: string | null) {
  const [registerId, setRegisterId] = useState(() => readPosBootstrap()?.registerId ?? '');
  const [shift, setShift] = useState<RegisterShift | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const available = useMemo(
    () => registers.filter((register) => register.storeId === storeId),
    [registers, storeId],
  );

  useEffect(() => {
    if (available.length === 0) return;
    if (!available.some((register) => register.id === registerId)) {
      setRegisterId(available[0]?.id ?? '');
    }
  }, [available, registerId]);

  useEffect(() => {
    if (!registerId) {
      setShift(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    currentShift(registerId)
      .then((result) => {
        if (cancelled) return;
        setShift(result);
        savePosBootstrap({ registerId, shift: result });
      })
      .catch((cause) => {
        if (cancelled) return;
        const cached = readPosBootstrap();
        if (cached?.registerId === registerId && cached.shift) {
          setShift(cached.shift);
          setError(null);
          return;
        }
        setShift(null);
        setError(cause instanceof Error ? cause.message : 'Could not load the shift');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [registerId, reloadKey]);

  async function openShift(openingFloatMinor: number): Promise<void> {
    if (!registerId) return;
    setBusy(true);
    setError(null);
    try {
      const opened = await openShiftRequest({ registerId, openingFloatMinor });
      setShift(opened);
      savePosBootstrap({ registerId, shift: opened });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open the shift');
    } finally {
      setBusy(false);
    }
  }

  async function addCashMovement(
    type: 'in' | 'out',
    amountMinor: number,
    reason: string,
  ): Promise<void> {
    if (!shift) return;
    setBusy(true);
    setError(null);
    try {
      await addCashMovementRequest(shift.id, { type, amountMinor, reason });
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the cash movement');
    } finally {
      setBusy(false);
    }
  }

  async function closeShift(countedCashMinor: number, notes: string): Promise<boolean> {
    if (!shift) return false;
    setBusy(true);
    setError(null);
    try {
      await closeShiftRequest(shift.id, { countedCashMinor, notes: notes || undefined });
      setShift(null);
      savePosBootstrap({ registerId, shift: null });
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not close the shift');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    registerId,
    setRegisterId,
    availableRegisters: available,
    shift,
    loading,
    busy,
    error,
    openShift,
    addCashMovement,
    closeShift,
    refresh: () => setReloadKey((key) => key + 1),
  };
}
