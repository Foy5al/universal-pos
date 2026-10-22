'use client';

import type { CreateStaffRequest, StaffMember, Store } from '@pos/contracts';
import { useState, type FormEvent } from 'react';

import { PermissionDialog } from './PermissionDialog';

interface StaffPanelProps {
  staff: readonly StaffMember[];
  stores: readonly Store[];
  canRead: boolean;
  canManage: boolean;
  currentUserId: string | null;
  onAdd: (input: CreateStaffRequest) => Promise<StaffMember>;
  onSavePermissions: (userId: string, permissions: StaffMember['permissions']) => Promise<void>;
}

export function StaffPanel({
  staff,
  stores,
  canRead,
  canManage,
  currentUserId,
  onAdd,
  onSavePermissions,
}: StaffPanelProps) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<CreateStaffRequest['role']>('manager');
  const [storeId, setStoreId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const storeNames = new Map(stores.map((store) => [store.id, store.name]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const member = await onAdd({
        email: email.trim(),
        displayName: displayName.trim(),
        password,
        role,
        ...(storeId ? { storeId } : {}),
      });
      setEmail('');
      setDisplayName('');
      setPassword('');
      setStoreId('');
      setSuccess(`${member.displayName} can now sign in as ${member.role.toLowerCase()}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add the team member.');
    } finally {
      setBusy(false);
    }
  }

  if (!canRead) {
    return (
      <section className="surface p-5" aria-labelledby="staff-heading">
        <h2 id="staff-heading" className="text-lg font-semibold">
          Team
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Your role cannot view or manage team members.
        </p>
      </section>
    );
  }

  return (
    <section className="surface space-y-4 p-5" aria-labelledby="staff-heading">
      <div>
        <h2 id="staff-heading" className="text-lg font-semibold">
          Team
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Managers and cashiers sign in with their own account. Permissions can be adjusted per
          person without changing anyone else.
        </p>
      </div>

      {staff.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
          No team members yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)]">
          {staff.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {member.displayName}
                  {member.userId === currentUserId && (
                    <span className="ml-2 rounded bg-[var(--color-border)]/50 px-1.5 py-0.5 text-xs">
                      You
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-muted)]">{member.email}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]">
                <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5">
                  {member.role}
                </span>
                <span>
                  {member.storeId
                    ? (storeNames.get(member.storeId) ?? 'Unknown store')
                    : 'All stores'}
                </span>
                <span>{member.permissions.length} permissions</span>
                {canManage && member.userId !== currentUserId && (
                  <button
                    type="button"
                    className="btn px-2 py-1 text-xs"
                    onClick={() => setEditing(member)}
                  >
                    Edit permissions
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <details className="border-t border-[var(--color-border)] pt-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Add a manager or cashier
          </summary>
          <form className="mt-3 space-y-3" onSubmit={submit}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--color-muted)]">Full name</span>
                <input
                  className="field"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  maxLength={120}
                  disabled={busy}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--color-muted)]">Email</span>
                <input
                  className="field"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={200}
                  disabled={busy}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--color-muted)]">Temporary password</span>
                <input
                  className="field"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={200}
                  autoComplete="new-password"
                  disabled={busy}
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--color-muted)]">Role</span>
                <select
                  className="field"
                  value={role}
                  onChange={(event) => setRole(event.target.value as CreateStaffRequest['role'])}
                  disabled={busy}
                >
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--color-muted)]">Store access</span>
                <select
                  className="field"
                  value={storeId}
                  onChange={(event) => setStoreId(event.target.value)}
                  disabled={busy}
                >
                  <option value="">All stores</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
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
              {busy ? 'Adding team member...' : 'Add team member'}
            </button>
          </form>
        </details>
      )}

      {editing && (
        <PermissionDialog
          key={editing.userId}
          member={editing}
          onSave={(permissions) => onSavePermissions(editing.userId, permissions)}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}
