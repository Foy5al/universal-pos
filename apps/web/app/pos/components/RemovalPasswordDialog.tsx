'use client';

import { useEffect, useState, type FormEvent } from 'react';

interface RemovalPasswordDialogProps {
  description: string;
  error: string | null;
  verifying: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}

export function RemovalPasswordDialog({
  description,
  error,
  verifying,
  onConfirm,
  onCancel,
}: RemovalPasswordDialogProps) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || verifying) return;
    onConfirm(password);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="removal-password-heading"
        className="w-full max-w-sm rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-warning)]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="10" width="16" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <div>
            <h2 id="removal-password-heading" className="text-base font-semibold">
              Password required
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Enter the removal password to {description}.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Removal password</span>
            <input
              className="field"
              type="password"
              autoComplete="off"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={verifying}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="btn text-sm" onClick={onCancel} disabled={verifying}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-accent text-sm"
              disabled={!password || verifying}
            >
              {verifying ? 'Checking...' : 'Unlock removal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
