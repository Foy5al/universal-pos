import type { Register, RegisterShift, SessionUser, StockLocation } from '@pos/contracts';

const BOOTSTRAP_KEY = 'pos.bootstrap.v1';

export interface PosBootstrap {
  savedAt: string;
  user?: SessionUser;
  locations?: StockLocation[];
  registers?: Register[];
  locationId?: string;
  registerId?: string;
  shift?: RegisterShift | null;
}

export function readPosBootstrap(): PosBootstrap | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(BOOTSTRAP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PosBootstrap;
  } catch {
    return null;
  }
}

/** Merges a partial snapshot so separate hooks can persist their own slice. */
export function savePosBootstrap(patch: Partial<PosBootstrap>): void {
  if (typeof window === 'undefined') return;
  const current = readPosBootstrap() ?? { savedAt: new Date().toISOString() };
  const next: PosBootstrap = { ...current, ...patch, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(next));
  } catch {
    // A full quota must never block checkout; the cached copy is best effort.
  }
}

export function clearPosBootstrap(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(BOOTSTRAP_KEY);
}
