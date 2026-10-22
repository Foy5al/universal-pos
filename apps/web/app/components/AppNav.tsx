'use client';

import type { SessionUser } from '@pos/contracts';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApiError, clearToken, fetchSession, getToken, logout } from '../lib/api';
import { AccountMenu } from './nav/AccountMenu';
import { MobileMenu } from './nav/MobileMenu';
import { CloseIcon, MenuIcon, SignOutIcon } from './nav/NavIcons';
import { hiddenRoutes, isActivePath, navLinks } from './nav/navLinks';
import { SyncBadge } from './nav/SyncBadge';
import { useUnsyncedSales } from './nav/useUnsyncedSales';
import { ThemeToggle } from './ThemeToggle';

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const syncCounts = useUnsyncedSales(Boolean(user) && !hiddenRoutes.has(pathname));

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      setUser(null);
      return;
    }
    let cancelled = false;
    fetchSession(token)
      .then((result) => {
        if (!cancelled) setUser(result.user);
      })
      .catch((cause) => {
        if (cancelled) return;
        if (cause instanceof ApiError && cause.status === 401) {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  async function signOut() {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // The local session is cleared even if the API is offline.
    } finally {
      clearToken();
      setUser(null);
      setLoggingOut(false);
      setMobileOpen(false);
      router.replace('/login');
    }
  }

  if (hiddenRoutes.has(pathname)) {
    return null;
  }

  return (
    <header className="topbar">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 lg:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Universal POS home">
          <span className="brand-mark">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
              <path d="M9 8h6M9 12h4" />
            </svg>
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-semibold tracking-tight">Universal POS</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[var(--color-muted)]">
              Store operations
            </span>
          </span>
        </Link>

        <nav aria-label="Main navigation" className="ml-2 hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => {
            const active = isActivePath(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className="nav-link"
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">
          {user && <SyncBadge counts={syncCounts} />}
          <ThemeToggle />

          <span
            aria-hidden="true"
            className="mx-1 hidden h-6 w-px bg-[var(--color-border)] sm:block"
          />

          {checking ? (
            <span
              aria-hidden="true"
              className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-surface-2)]"
            />
          ) : user ? (
            <>
              <AccountMenu user={user} loggingOut={loggingOut} onSignOut={signOut} />

              <button
                type="button"
                className="btn hidden min-h-9 border-transparent bg-transparent px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-foreground)] xl:inline-flex"
                onClick={signOut}
                disabled={loggingOut}
                aria-label="Sign out"
                title="Sign out"
              >
                <SignOutIcon />
                <span>{loggingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </>
          ) : (
            <Link href="/login" className="btn btn-accent min-h-9 px-3 py-1.5 text-xs">
              Sign in
            </Link>
          )}

          <button
            type="button"
            className="icon-btn lg:hidden"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {mobileOpen && <MobileMenu user={user} loggingOut={loggingOut} onSignOut={signOut} />}
    </header>
  );
}
