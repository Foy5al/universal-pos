'use client';

import { useEffect, useState } from 'react';

import { parseThresholdInput } from '../../inventory/thresholdInput';

interface GlobalThresholdFormProps {
  globalThreshold: string | null;
  canManage: boolean;
  busy: boolean;
  onSave: (threshold: string | null) => Promise<boolean>;
}

export function GlobalThresholdForm({
  globalThreshold,
  canManage,
  busy,
  onSave,
}: GlobalThresholdFormProps) {
  const [value, setValue] = useState(globalThreshold ?? '');
  const [inputError, setInputError] = useState<string | null>(null);

  useEffect(() => {
    setValue(globalThreshold ?? '');
  }, [globalThreshold]);

  async function submit(next: string | null) {
    setInputError(null);
    const saved = await onSave(next);
    if (saved) setValue(next ?? '');
  }

  if (!canManage) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--color-border)] p-3 text-sm text-[var(--color-muted)]">
        {globalThreshold === null
          ? 'No global low stock threshold is configured.'
          : `Global threshold: notify when stock is below ${globalThreshold} units.`}{' '}
        Only managers with inventory management permission can change it.
      </p>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = parseThresholdInput(value);
        if (parsed === undefined) {
          setInputError('Enter a non-negative number with up to 4 decimal places.');
          return;
        }
        void submit(parsed);
      }}
    >
      <label className="text-sm">
        <span className="mb-1 block text-xs text-[var(--color-muted)]">
          Notify when stock is below
        </span>
        <input
          className="field w-44"
          inputMode="decimal"
          placeholder={globalThreshold === null ? 'No global rule' : globalThreshold}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={busy}
        />
      </label>
      <button
        type="submit"
        className="btn btn-accent text-sm"
        disabled={busy || value.trim() === ''}
      >
        {busy ? 'Saving...' : 'Save global threshold'}
      </button>
      <button
        type="button"
        className="btn text-sm"
        disabled={busy || globalThreshold === null}
        onClick={() => {
          setValue('');
          void submit(null);
        }}
      >
        Clear
      </button>
      {inputError && (
        <p role="alert" className="w-full text-xs text-[var(--color-destructive)]">
          {inputError}
        </p>
      )}
    </form>
  );
}
