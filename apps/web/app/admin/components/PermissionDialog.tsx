'use client';

import type { Permission, StaffMember } from '@pos/contracts';
import { useEffect, useState, type FormEvent } from 'react';

import { permissionGroups, permissionLabel } from '../permissions';

interface PermissionDialogProps {
  member: StaffMember;
  onSave: (permissions: Permission[]) => Promise<void>;
  onClose: () => void;
}

export function PermissionDialog({ member, onSave, onClose }: PermissionDialogProps) {
  const [selected, setSelected] = useState<Set<Permission>>(() => new Set(member.permissions));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groups = permissionGroups();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function toggle(permission: Permission) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permission)) {
        next.delete(permission);
      } else {
        next.add(permission);
      }
      return next;
    });
  }

  function setAll(permissions: readonly Permission[], enabled: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const permission of permissions) {
        if (enabled) {
          next.add(permission);
        } else {
          next.delete(permission);
        }
      }
      return next;
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave([...selected]);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the permissions.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="permissions-heading"
        className="surface max-h-[90vh] w-full max-w-3xl overflow-y-auto p-5"
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="permissions-heading" className="text-lg font-semibold">
              Permissions for {member.displayName}
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Role: {member.role}. These changes apply to this person only.
            </p>
          </div>
          <button type="button" className="btn text-sm" onClick={onClose} autoFocus>
            Close
          </button>
        </header>

        <form className="mt-4 space-y-4" onSubmit={submit}>
          <div className="space-y-4">
            {groups.map((group) => {
              const allSelected = group.permissions.every((permission) => selected.has(permission));
              return (
                <fieldset
                  key={group.resource}
                  className="rounded-lg border border-[var(--color-border)] p-3"
                >
                  <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {group.resource}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.permissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(permission)}
                          onChange={() => toggle(permission)}
                          disabled={busy}
                        />
                        <span>{permissionLabel(permission)}</span>
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs underline text-[var(--color-muted)]"
                    onClick={() => setAll(group.permissions, !allSelected)}
                    disabled={busy}
                  >
                    {allSelected ? 'Clear this group' : 'Select this group'}
                  </button>
                </fieldset>
              );
            })}
          </div>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] pt-4">
            <p className="text-xs text-[var(--color-muted)]">
              {selected.size} of{' '}
              {groups.reduce((total, group) => total + group.permissions.length, 0)} permissions
              selected.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn text-sm" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-accent text-sm" disabled={busy}>
                {busy ? 'Saving...' : 'Save permissions'}
              </button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
