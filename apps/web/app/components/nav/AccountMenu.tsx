'use client';

import type { SessionUser } from '@pos/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { Avatar } from './Avatar';
import { ChevronIcon, SignOutIcon } from './NavIcons';

interface AccountMenuProps {
  user: SessionUser;
  loggingOut: boolean;
  onSignOut: () => void;
}

export function AccountMenu({ user, loggingOut, onSignOut }: AccountMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className="user-button"
        aria-label={`Account menu for ${user.displayName}`}
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Avatar name={user.displayName} />
        <span className="user-name hidden sm:block">{user.displayName}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div id="account-menu" className="menu-panel">
          <div className="border-b border-[var(--color-border)] px-3 pb-2.5 pt-1.5">
            <p className="truncate text-sm font-semibold">{user.displayName}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">{user.email}</p>
          </div>
          <div className="pt-1">
            <Link href="/settings" className="menu-item">
              Settings
            </Link>
            <Link href="/admin" className="menu-item">
              Team and counters
            </Link>
          </div>
          <div className="menu-divider" />
          <button
            type="button"
            className="menu-item menu-item-danger"
            onClick={onSignOut}
            disabled={loggingOut}
          >
            <SignOutIcon />
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
