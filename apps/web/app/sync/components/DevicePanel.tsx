'use client';

import type { Device } from '@pos/contracts';

interface DevicePanelProps {
  devices: readonly Device[];
  busy: boolean;
  canManage: boolean;
  onRevoke: (id: string) => Promise<void>;
}

function timeOf(value: string | null): string {
  if (!value) return 'never';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'never' : date.toLocaleString();
}

export function DevicePanel({ devices, busy, canManage, onRevoke }: DevicePanelProps) {
  async function revoke(device: Device) {
    if (!window.confirm(`Revoke ${device.name}? It will be blocked from syncing.`)) return;
    await onRevoke(device.id);
  }

  return (
    <section className="surface p-4" aria-labelledby="device-heading">
      <h2 id="device-heading" className="text-base font-semibold">
        Registered terminals
      </h2>
      <p className="text-xs text-[var(--color-muted)]">
        A terminal enrolls itself on its first sync. Revoking blocks every later push; the local
        unsynced sales stay on the device for manual recovery.
      </p>

      {devices.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          No terminals have synced yet.
        </p>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Registered terminals">
          {devices.map((device) => {
            const revoked = device.revokedAt !== null;
            return (
              <li
                key={device.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] p-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {device.name}
                    <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
                      {device.platform}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    Store {device.storeId.slice(0, 8)} · last seen {timeOf(device.lastSeenAt)} ·{' '}
                    {device.id.slice(0, 8)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold ${
                      revoked ? 'text-[var(--color-destructive)]' : 'text-[var(--color-accent)]'
                    }`}
                  >
                    {revoked ? `Revoked ${timeOf(device.revokedAt)}` : 'Active'}
                  </span>
                  {canManage && !revoked && (
                    <button
                      type="button"
                      className="btn px-2 py-1 text-xs text-[var(--color-destructive)]"
                      disabled={busy}
                      onClick={() => {
                        void revoke(device);
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
