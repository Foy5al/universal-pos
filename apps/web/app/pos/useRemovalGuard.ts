'use client';

import type { PosSettings } from '@pos/contracts';
import { useState } from 'react';

import { verifyRemovalPassword } from './removalPassword';

export interface GuardedAction {
  description: string;
  run: () => void;
}

export type RemovalGuardState = ReturnType<typeof useRemovalGuard>;

export function useRemovalGuard(settings: PosSettings | null) {
  const [pending, setPending] = useState<GuardedAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  function request(action: GuardedAction): string | null {
    if (!settings?.requireRemovalPassword) {
      action.run();
      return null;
    }
    if (!settings.removalPasswordVerifier) {
      return 'Password protection is on, but this terminal has not downloaded the check yet. Connect once and reopen the till.';
    }
    setError(null);
    setPending(action);
    return null;
  }

  async function confirm(password: string): Promise<void> {
    const verifier = settings?.removalPasswordVerifier;
    if (!pending || !verifier) return;
    setVerifying(true);
    setError(null);
    try {
      const valid = await verifyRemovalPassword(password, verifier);
      if (!valid) {
        setError('That removal password is not correct.');
        return;
      }
      pending.run();
      setPending(null);
    } catch {
      setError('This device could not check the password.');
    } finally {
      setVerifying(false);
    }
  }

  function cancel(): void {
    if (verifying) return;
    setPending(null);
    setError(null);
  }

  return {
    pending,
    error,
    verifying,
    requiresPassword: Boolean(settings?.requireRemovalPassword),
    request,
    confirm,
    cancel,
  };
}
