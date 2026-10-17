/**
 * Quantities are exact decimals stored as scaled integers (scale = 4),
 * e.g. 1.2500 kg -> 12500. See ADR-0003.
 */
export const QUANTITY_SCALE = 4;
const QUANTITY_FACTOR = 10 ** QUANTITY_SCALE;

export type Quantity = number & { readonly __brand: 'Quantity' };

export function quantity(scaled: number): Quantity {
  if (!Number.isInteger(scaled)) {
    throw new RangeError(`Quantity must be a scaled integer, received ${scaled}`);
  }
  return scaled as Quantity;
}

export function parseQuantity(input: string | number): Quantity {
  const normalized = typeof input === 'number' ? input.toString() : input.trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new RangeError(`Invalid quantity: ${input}`);
  }
  const negative = normalized.startsWith('-');
  const [whole = '0', fraction = ''] = normalized.replace('-', '').split('.');
  const paddedFraction = (fraction + '0'.repeat(QUANTITY_SCALE)).slice(0, QUANTITY_SCALE);
  const scaled = Number(whole) * QUANTITY_FACTOR + Number(paddedFraction || '0');
  return quantity(negative ? -scaled : scaled);
}

export function addQuantity(a: Quantity, b: Quantity): Quantity {
  return quantity(a + b);
}

export function formatQuantity(value: Quantity): string {
  const whole = Math.trunc(value / QUANTITY_FACTOR);
  const fraction = Math.abs(value % QUANTITY_FACTOR).toString().padStart(QUANTITY_SCALE, '0');
  const trimmed = fraction.replace(/0+$/, '');
  return trimmed.length > 0 ? `${whole}.${trimmed}` : `${whole}`;
}
