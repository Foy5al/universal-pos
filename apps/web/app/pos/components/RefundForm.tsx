'use client';

import type { Refund } from '@pos/contracts';
import { useState } from 'react';

import { refundSale } from '../../lib/api';
import { formatMinor } from '../../lib/money';

interface RefundFormProps {
  saleId: string;
  totalMinor: number;
  shiftId?: string | undefined;
  onRefunded: () => Promise<void> | void;
}

export function RefundForm({ saleId, totalMinor, shiftId, onRefunded }: RefundFormProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refund, setRefund] = useState<Refund | null>(null);

  if (!shiftId) {
    return <p className="text-xs text-[var(--color-muted)]">Open a register shift to refund.</p>;
  }

  if (refund) {
    return (
      <p role="status" className="text-xs font-semibold text-[var(--color-accent)]">
        Refund {refund.refundNumber} issued for {formatMinor(refund.amountMinor)}.
      </p>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!shiftId || reason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const created = await refundSale(saleId, {
        operationId: crypto.randomUUID(),
        registerShiftId: shiftId,
        reason: reason.trim(),
      });
      setRefund(created);
      await onRefunded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not issue the refund');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="btn text-xs" onClick={() => setOpen(true)}>
        Refund {formatMinor(totalMinor)}
      </button>
    );
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={submit}>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--color-muted)]">Refund reason</span>
        <input
          className="field py-1.5"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          minLength={3}
          maxLength={240}
          required
          autoFocus
        />
      </label>
      <div className="flex gap-2">
        <button type="submit" className="btn text-xs" disabled={busy || reason.trim().length < 3}>
          {busy ? 'Refunding...' : 'Confirm full refund'}
        </button>
        <button
          type="button"
          className="btn text-xs"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-destructive)]">
          {error}
        </p>
      )}
    </form>
  );
}
