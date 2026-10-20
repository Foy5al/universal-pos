'use client';

import type { RegisterShift } from '@pos/contracts';
import { useState } from 'react';

import { formatMinor } from '../../lib/money';
import { CashMovementForm } from './CashMovementForm';
import { parseMoneyMinor } from '../types';

interface ShiftPanelProps {
  shift: RegisterShift | null;
  registerSelected: boolean;
  busy: boolean;
  error: string | null;
  onOpen: (openingFloatMinor: number) => Promise<void>;
  onCashMovement: (type: 'in' | 'out', amountMinor: number, reason: string) => Promise<void>;
  onClose: (countedCashMinor: number, notes: string) => Promise<boolean>;
}

function inputFromMinor(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function ShiftPanel({
  shift,
  registerSelected,
  busy,
  error,
  onOpen,
  onCashMovement,
  onClose,
}: ShiftPanelProps) {
  const [openingFloat, setOpeningFloat] = useState('0.00');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [closedShiftId, setClosedShiftId] = useState<string | null>(null);

  const openingFloatMinor = parseMoneyMinor(openingFloat);
  const countedMinor = parseMoneyMinor(counted);
  const varianceMinor =
    shift && countedMinor !== null ? countedMinor - shift.expectedCashMinor : null;

  async function submitOpen(event: React.FormEvent) {
    event.preventDefault();
    if (openingFloatMinor === null) return;
    await onOpen(openingFloatMinor);
  }

  async function submitClose(event: React.FormEvent) {
    event.preventDefault();
    if (countedMinor === null || !shift) return;
    const shiftId = shift.id;
    const closed = await onClose(countedMinor, notes.trim());
    if (!closed) return;
    setClosedShiftId(shiftId);
    setClosing(false);
    setNotes('');
  }

  if (!registerSelected) {
    return (
      <section className="surface px-4 py-3 text-sm text-[var(--color-muted)]">
        Select a selling location with a configured register to start a shift.
      </section>
    );
  }

  return (
    <section
      aria-label="Register shift"
      className="surface flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${shift ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-destructive)]'}`}
        />
        <span className="font-semibold">{shift ? 'Shift open' : 'No open shift'}</span>
      </div>

      {shift ? (
        <>
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div>
              <dt className="text-[var(--color-muted)]">Float</dt>
              <dd>{formatMinor(shift.openingFloatMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Cash sales</dt>
              <dd>{formatMinor(shift.cashSalesMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Cash refunds</dt>
              <dd>{formatMinor(shift.cashRefundsMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Cash in</dt>
              <dd>{formatMinor(shift.cashInMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Cash out</dt>
              <dd>{formatMinor(shift.cashOutMinor)}</dd>
            </div>
            <div>
              <dt className="text-[var(--color-muted)]">Expected</dt>
              <dd className="font-semibold">{formatMinor(shift.expectedCashMinor)}</dd>
            </div>
          </dl>

          {closing ? (
            <form className="flex flex-wrap items-end gap-2" onSubmit={submitClose}>
              <label className="text-xs">
                <span className="mb-1 block text-[var(--color-muted)]">Counted cash</span>
                <input
                  className="field w-32 py-1.5 text-right"
                  inputMode="decimal"
                  value={counted}
                  onChange={(event) => setCounted(event.target.value)}
                  autoFocus
                  required
                />
              </label>
              <label className="text-xs">
                <span className="mb-1 block text-[var(--color-muted)]">Notes</span>
                <input
                  className="field w-44 py-1.5"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={500}
                />
              </label>
              <button
                type="submit"
                className="btn btn-accent text-xs"
                disabled={busy || countedMinor === null}
              >
                {busy ? 'Closing...' : 'Close shift'}
              </button>
              <button
                type="button"
                className="btn text-xs"
                onClick={() => setClosing(false)}
                disabled={busy}
              >
                Cancel
              </button>
              {varianceMinor !== null && (
                <span
                  className={`text-xs font-semibold ${varianceMinor === 0 ? 'text-[var(--color-accent)]' : 'text-[var(--color-destructive)]'}`}
                >
                  Variance {formatMinor(varianceMinor)}
                </span>
              )}
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn text-xs"
                onClick={() => {
                  setCounted(inputFromMinor(shift.expectedCashMinor));
                  setClosing(true);
                }}
              >
                Count and close
              </button>
              <a
                className="btn text-xs"
                href={`/reports?shiftId=${shift.id}`}
                target="_blank"
                rel="noreferrer"
              >
                X report
              </a>
              <CashMovementForm busy={busy} onSubmit={onCashMovement} />
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={submitOpen}>
            <label className="text-xs">
              <span className="mb-1 block text-[var(--color-muted)]">Opening float</span>
              <input
                className="field w-32 py-1.5 text-right"
                inputMode="decimal"
                value={openingFloat}
                onChange={(event) => setOpeningFloat(event.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              className="btn btn-accent text-xs"
              disabled={busy || openingFloatMinor === null}
            >
              {busy ? 'Opening...' : 'Open shift'}
            </button>
          </form>
          {closedShiftId && (
            <a
              className="btn text-xs"
              href={`/reports?shiftId=${closedShiftId}`}
              target="_blank"
              rel="noreferrer"
            >
              View Z report
            </a>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="w-full text-xs text-[var(--color-destructive)]">
          {error}
        </p>
      )}
    </section>
  );
}
