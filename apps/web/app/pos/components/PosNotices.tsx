interface PosNoticesProps {
  error: string | null;
  restockNotice: string | null;
}

export function PosNotices({ error, restockNotice }: PosNoticesProps) {
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-[var(--color-destructive)]/50 p-3 text-sm"
        >
          {error}
        </p>
      )}

      {restockNotice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-accent)]/50 p-3 text-sm text-[var(--color-accent)]"
        >
          {restockNotice}
        </p>
      )}
    </>
  );
}
