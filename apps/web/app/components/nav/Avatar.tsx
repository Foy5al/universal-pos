export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] font-bold text-[var(--color-accent-foreground)] ${
        size === 'lg' ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-[10px]'
      }`}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
