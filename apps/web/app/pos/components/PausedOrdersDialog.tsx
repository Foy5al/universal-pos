'use client';

import { useEffect, useRef, useState } from 'react';

import { formatMinor } from '../../lib/money';
import type { PausedOrder } from '../pausedOrders';
import { cartTotalMinor } from '../types';

interface PausedOrdersDialogProps {
  orders: readonly PausedOrder[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}

function pausedTime(createdAt: string): string {
  return new Date(createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function PausedOrdersDialog({
  orders,
  onResume,
  onDiscard,
  onClose,
}: PausedOrdersDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="paused-orders-heading"
        tabIndex={-1}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h2 id="paused-orders-heading" className="text-base font-semibold">
              Paused sales
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              Resume a customer&apos;s sale or discard it. Captured prices are kept.
            </p>
          </div>
          <button type="button" className="btn min-h-9 px-3 py-1.5 text-xs" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {orders.length === 0 ? (
            <p className="px-2 py-10 text-center text-sm text-[var(--color-muted)]">
              No sales are paused on this terminal.
            </p>
          ) : (
            <ul className="space-y-2">
              {orders.map((order) => {
                const names = order.lines
                  .slice(0, 3)
                  .map((line) => line.product.name)
                  .join(', ');
                const more = order.lines.length > 3 ? ` +${order.lines.length - 3} more` : '';
                return (
                  <li key={order.id} className="rounded-lg border border-[var(--color-border)] p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">
                          {pausedTime(order.createdAt)}
                          <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                            {order.lines.length} line{order.lines.length === 1 ? '' : 's'}
                          </span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                          {names}
                          {more}
                        </p>
                      </div>
                      <p className="text-sm font-semibold">
                        {formatMinor(cartTotalMinor(order.lines))}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`btn min-h-9 px-3 py-1.5 text-xs ${
                            confirmId === order.id
                              ? 'border-[var(--color-destructive)] text-[var(--color-destructive)]'
                              : ''
                          }`}
                          onClick={() => {
                            if (confirmId === order.id) {
                              onDiscard(order.id);
                              setConfirmId(null);
                            } else {
                              setConfirmId(order.id);
                            }
                          }}
                        >
                          {confirmId === order.id ? 'Confirm discard' : 'Discard'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-accent min-h-9 px-3 py-1.5 text-xs"
                          onClick={() => onResume(order.id)}
                        >
                          Resume sale
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
