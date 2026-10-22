'use client';

import type { SessionUser } from '@pos/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Avatar } from './Avatar';
import { isActivePath, navLinks } from './navLinks';

interface MobileMenuProps {
  user: SessionUser | null;
  loggingOut: boolean;
  onSignOut: () => void;
}

export function MobileMenu({ user, loggingOut, onSignOut }: MobileMenuProps) {
  const pathname = usePathname();

  return (
    <div id="mobile-navigation" className="mobile-panel lg:hidden">
      <nav aria-label="Mobile navigation" className="grid gap-1 sm:grid-cols-2">
        {navLinks.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className="mobile-link"
            >
              {link.label}
              <span aria-hidden="true" className="text-[var(--color-muted)]">
                →
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
        {user ? (
          <div className="flex items-center gap-3">
            <Avatar name={user.displayName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.displayName}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{user.email}</p>
            </div>
            <button
              type="button"
              className="btn min-h-9 px-3 py-1.5 text-xs"
              onClick={onSignOut}
              disabled={loggingOut}
            >
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <Link href="/login" className="btn btn-accent w-full text-sm">
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
