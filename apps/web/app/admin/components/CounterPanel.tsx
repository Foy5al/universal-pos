'use client';

import type { CreateRegisterRequest, Register, Store } from '@pos/contracts';
import { useState, type FormEvent } from 'react';

interface CounterPanelProps {
  registers: readonly Register[];
  stores: readonly Store[];
  canManage: boolean;
  onAdd: (input: CreateRegisterRequest) => Promise<Register>;
}

export function CounterPanel({ registers, stores, canManage, onAdd }: CounterPanelProps) {
  const [storeId, setStoreId] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeStoreId = storeId || stores[0]?.id || '';
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeStoreId) {
      setError('Choose a store for this counter.');
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const register = await onAdd({
        storeId: activeStoreId,
        name: name.trim(),
        code: code.trim().toUpperCase(),
      });
      setName('');
      setCode('');
      setSuccess(
        `${register.name} is ready at ${storeNames.get(register.storeId) ?? 'the store'}.`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the counter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface space-y-4 p-5" aria-labelledby="counters-heading">
      <div>
        <h2 id="counters-heading" className="text-lg font-semibold">
          Counters
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Each counter is a register with its own shift and cash drawer.
        </p>
      </div>

      {registers.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
          No counters yet. Add the first checkout counter below.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {registers.map((register) => (
            <li
              key={register.id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"
            >
              <span>
                <span className="font-medium">{register.name}</span>
                <span className="ml-2 rounded bg-[var(--color-border)]/50 px-1.5 py-0.5 font-mono text-xs">
                  {register.code}
                </span>
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                {storeNames.get(register.storeId) ?? 'Unknown store'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage ? (
        <form className="space-y-3 border-t border-[var(--color-border)] pt-4" onSubmit={submit}>
          <h3 className="text-sm font-semibold">Add a counter</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">Store</span>
              <select
                className="field"
                value={activeStoreId}
                onChange={(event) => setStoreId(event.target.value)}
                disabled={busy || stores.length === 0}
                required
              >
                {stores.length === 0 && <option value="">No stores available</option>}
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">Counter name</span>
              <input
                className="field"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Front counter"
                maxLength={120}
                disabled={busy}
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-[var(--color-muted)]">Short code</span>
              <input
                className="field"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="C1"
                maxLength={24}
                pattern="[A-Za-z0-9_-]+"
                title="Use letters, numbers, dashes or underscores"
                disabled={busy}
                required
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-[var(--color-accent)]">
              {success}
            </p>
          )}
          <button type="submit" className="btn btn-accent text-sm" disabled={busy}>
            {busy ? 'Adding counter...' : 'Add counter'}
          </button>
        </form>
      ) : (
        <p className="text-xs text-[var(--color-muted)]">
          Your role can view counters but cannot add them.
        </p>
      )}
    </section>
  );
}
