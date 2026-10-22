'use client';

import { useState } from 'react';

import { parseMoneyMinor } from '../types';

interface CashMovementFormProps {
  busy: boolean;
  onSubmit: (type: 'in' | 'out', amountMinor: number, reason: string) => Promise<void>;
}

export function CashMovementForm({ busy, onSubmit }: CashMovementFormProps) {
  const [type, setType] = useState<'in' | 'out' | null>(null);
  const [amount, setAmount] = useState('0.00');
  const [reason, setReason] = useState('');

  const amountMinor = parseMoneyMinor(amount);
  const valid =
    amountMinor !== null && amountMinor > 0 && reason.trim().length >= 3 && reason.length <= 200;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || amountMinor === null || type === null) return;
    await onSubmit(type, amountMinor, reason.trim());
    setType(null);
    setAmount('0.00');
    setReason('');
  }

  if (type === null) {
    return (
      <div className="flex items-center gap-2">
        <button type="button" className="btn text-xs" onClick={() => setType('in')}>
          Cash in
        </button>
        <button type="button" className="btn text-xs" onClick={() => setType('out')}>
          Cash out
        </button>
      </div>
    );
  }

  return (
    <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
      <span className="pb-2 text-xs font-semibold">{type === 'in' ? 'Cash in' : 'Cash out'}</span>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--color-muted)]">Amount</span>
        <input
          className="field w-28 py-1.5 text-right"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          autoFocus
          required
        />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-[var(--color-muted)]">Reason</span>
        <input
          className="field w-40 py-1.5"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={200}
          placeholder="Required"
          required
        />
      </label>
      <button type="submit" className="btn btn-accent text-xs" disabled={busy || !valid}>
        {busy ? 'Saving...' : 'Record'}
      </button>
      <button type="button" className="btn text-xs" onClick={() => setType(null)} disabled={busy}>
        Cancel
      </button>
    </form>
  );
}
