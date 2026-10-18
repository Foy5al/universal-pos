export class UniqueConstraintError extends Error {
  constructor(readonly resource: string) {
    super(`${resource} already exists`);
    this.name = 'UniqueConstraintError';
  }
}

/** PostgreSQL unique_violation (SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}
