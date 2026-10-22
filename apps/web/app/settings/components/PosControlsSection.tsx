'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { usePosSettings } from '../usePosSettings';

export function PosControlsSection() {
  const data = usePosSettings();
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (data.settings) setEnabled(data.settings.requireRemovalPassword);
  }, [data.settings]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (password.length > 0 && password.length < 6) {
      setFormError('The removal password must be at least 6 characters.');
      return;
    }
    if (enabled && !data.settings?.removalPasswordSet && password.length === 0) {
      setFormError('Set a removal password before turning protection on.');
      return;
    }
    const saved = await data.save({
      requireRemovalPassword: enabled,
      ...(password ? { removalPassword: password } : {}),
    });
    if (saved) setPassword('');
  }

  return (
    <section
      id="pos-controls"
      className="surface space-y-4 p-5"
      aria-labelledby="pos-controls-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="pos-controls-heading" className="text-lg font-semibold">
            POS controls
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            Protect the till from accidental or unapproved line removals. When enabled, the cashier
            must enter the removal password to remove an item, clear the sale or discard a paused
            sale.
          </p>
        </div>
        {data.settings && (
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
              data.settings.requireRemovalPassword
                ? 'border-[var(--color-accent)]/50 text-[var(--color-accent)]'
                : 'border-[var(--color-border)] text-[var(--color-muted)]'
            }`}
          >
            {data.settings.requireRemovalPassword ? 'Protection on' : 'Protection off'}
          </span>
        )}
      </div>

      {data.loading ? (
        <p role="status" className="text-sm text-[var(--color-muted)]">
          Loading POS controls...
        </p>
      ) : data.error && !data.settings ? (
        <p role="alert" className="text-sm text-[var(--color-destructive)]">
          {data.error}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
                setFormError(null);
              }}
              disabled={!data.canManage || data.busy}
            />
            <span>
              <span className="block font-medium">Require a password to remove items</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--color-muted)]">
                The check runs on the terminal, so it keeps working offline after the setting has
                synced once. Use a password the counter staff can enter quickly but customers cannot
                guess.
              </span>
            </span>
          </label>

          <label className="block max-w-md text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Removal password</span>
            <input
              type="password"
              className="field"
              autoComplete="new-password"
              minLength={6}
              maxLength={200}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFormError(null);
              }}
              placeholder={
                data.settings?.removalPasswordSet
                  ? 'Leave blank to keep the current password'
                  : 'At least 6 characters'
              }
              disabled={!data.canManage || data.busy}
            />
            <span className="mt-1 block text-xs text-[var(--color-muted)]">
              {data.settings?.removalPasswordSet
                ? 'A password is set. Enter a new one only if you want to replace it.'
                : 'The password is stored as a one-way verifier; it is never shown again.'}
            </span>
          </label>

          {formError && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {formError}
            </p>
          )}
          {data.error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {data.error}
            </p>
          )}
          {data.notice && (
            <p role="status" className="text-sm text-[var(--color-accent)]">
              {data.notice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="btn btn-accent text-sm"
              disabled={!data.canManage || data.busy}
            >
              {data.busy ? 'Saving...' : 'Save POS controls'}
            </button>
            {!data.canManage && (
              <span className="text-xs text-[var(--color-muted)]">
                A manager with settings permission can change this control.
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
