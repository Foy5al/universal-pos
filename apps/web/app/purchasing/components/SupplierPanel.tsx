'use client';

import type { Supplier } from '@pos/contracts';
import { useState, type FormEvent } from 'react';

interface SupplierPanelProps {
  suppliers: readonly Supplier[];
  canManage: boolean;
  busy: boolean;
  onCreate: (name: string) => Promise<Supplier>;
}

export function SupplierPanel({
  suppliers,
  canManage,
  busy,
  onCreate,
}: SupplierPanelProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setError('Enter a supplier name.');
      return;
    }
    setError(null);
    setSuccess(null);
    try {
      const supplier = await onCreate(value);
      setName('');
      setSuccess(`${supplier.name} added.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the supplier.');
    }
  }

  return (
    <section className="surface p-4" aria-labelledby="suppliers-heading">
      <h2 id="suppliers-heading" className="text-base font-semibold">
        Suppliers
      </h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Purchase orders must belong to a supplier.
      </p>

      {suppliers.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--color-muted)]">No suppliers yet.</p>
      ) : (
        <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-sm" aria-label="Suppliers">
          {suppliers.map((supplier) => (
            <li
              key={supplier.id}
              className="flex items-center justify-between border-b border-[var(--color-border)]/60 py-1.5 last:border-0"
            >
              <span>{supplier.name}</span>
              <span className="text-xs text-[var(--color-muted)]">
                {supplier.isActive ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form className="mt-3 border-t border-[var(--color-border)] pt-3" onSubmit={submit}>
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">New supplier</span>
            <input
              className="field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Rahim Traders"
              maxLength={160}
              disabled={busy}
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="mt-2 text-sm text-[var(--color-accent)]">
              {success}
            </p>
          )}
          <button type="submit" className="btn mt-2 w-full justify-center" disabled={busy}>
            {busy ? 'Saving...' : 'Add supplier'}
          </button>
        </form>
      )}
    </section>
  );
}
