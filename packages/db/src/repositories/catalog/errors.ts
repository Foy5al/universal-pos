export class UniqueConstraintError extends Error {
  constructor(readonly resource: string) {
    super(`${resource} already exists`);
    this.name = 'UniqueConstraintError';
  }
}

/** PostgreSQL unique_violation (SQLSTATE 23505), including Drizzle's wrapped errors. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    if (typeof current === 'object' && 'code' in current) {
      if ((current as { code?: unknown }).code === '23505') {
        return true;
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
