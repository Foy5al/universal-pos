import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the monorepo root `.env` for dev scripts started from a package
 * directory (`pnpm --filter`, turbo). Values already present in the environment
 * always win so Docker, CI and hosting platforms keep their own configuration.
 */
export function loadRootEnv(cwd: string = process.cwd()): string | null {
  if (process.env.DATABASE_URL) return null;

  const rootEnv = resolve(cwd, '..', '..', '.env');
  const packageEnv = resolve(cwd, '.env');
  const file = existsSync(rootEnv) ? rootEnv : existsSync(packageEnv) ? packageEnv : null;
  if (!file) return null;

  process.loadEnvFile(file);
  return file;
}
