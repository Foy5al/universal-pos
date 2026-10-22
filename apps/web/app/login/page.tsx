'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';

import { ThemeToggle } from '../components/ThemeToggle';
import { ApiError, fetchSession, getToken, login, setToken } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('owner@demo.pos');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchSession(token)
      .then(() => router.replace('/pos'))
      .catch(() => undefined);
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login({ email, password });
      setToken(result.token);
      router.replace('/pos');
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : 'Could not reach the POS API. Is it running?',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-6">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Universal POS
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Sign in to the till</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Sessions are issued by the API; permissions are enforced server-side.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="surface space-y-4 p-5">
          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Email</span>
            <input
              className="field"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-[var(--color-muted)]">Password</span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-[var(--color-destructive)]">
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-accent w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Open the till'}
          </button>
        </form>

        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Development demo: run <code>pnpm db:seed:demo</code> once. Credentials can be changed with
          DEMO_EMAIL / DEMO_PASSWORD.
        </p>
      </div>
    </main>
  );
}
