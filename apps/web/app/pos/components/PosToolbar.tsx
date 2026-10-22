'use client';

import type { Register, StockLocation } from '@pos/contracts';

interface PosToolbarProps {
  locations: readonly StockLocation[];
  locationId: string;
  onLocationChange: (value: string) => void;
  registers: readonly Register[];
  registerId: string;
  onRegisterChange: (value: string) => void;
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  onScan: () => void;
  onMoveHighlight: (delta: number) => void;
}

export function PosToolbar({
  locations,
  locationId,
  onLocationChange,
  registers,
  registerId,
  onRegisterChange,
  loading,
  search,
  onSearchChange,
  onScan,
  onMoveHighlight,
}: PosToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-sm">
        <span className="mr-2 text-[var(--color-muted)]">Selling from</span>
        <select
          className="field inline-block w-auto min-w-44"
          value={locationId}
          onChange={(event) => onLocationChange(event.target.value)}
          disabled={loading}
        >
          {locations.length === 0 && <option value="">No locations</option>}
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="mr-2 text-[var(--color-muted)]">Register</span>
        <select
          className="field inline-block w-auto min-w-40"
          value={registerId}
          onChange={(event) => onRegisterChange(event.target.value)}
          disabled={loading || registers.length === 0}
        >
          {registers.length === 0 && <option value="">No register</option>}
          {registers.map((register) => (
            <option key={register.id} value={register.id}>
              {register.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-64 flex-1 items-center gap-2 text-sm">
        <span className="sr-only">Scan barcode or search products</span>
        <input
          id="product-search"
          className="field"
          placeholder="Scan barcode or search name / SKU"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onScan();
            } else if (
              search.trim().length > 0 &&
              !event.ctrlKey &&
              !event.altKey &&
              !event.metaKey &&
              !event.shiftKey &&
              (event.key === 'ArrowDown' || event.key === 'ArrowUp')
            ) {
              event.preventDefault();
              onMoveHighlight(event.key === 'ArrowDown' ? 1 : -1);
            }
          }}
          autoFocus
        />
      </label>
    </div>
  );
}
