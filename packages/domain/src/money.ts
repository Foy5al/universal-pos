/**
 * Money is always an integer count of minor units (e.g. poisha for BDT).
 * See ADR-0003. Binary floating point is never used to store or compute money.
 */
export type Minor = number & { readonly __brand: 'Minor' };

const MIN_SAFE = Number.MIN_SAFE_INTEGER;
const MAX_SAFE = Number.MAX_SAFE_INTEGER;

export function minor(value: number): Minor {
  if (!Number.isInteger(value)) {
    throw new RangeError(`Money must be an integer number of minor units, received ${value}`);
  }
  return value as Minor;
}

export function toMinor(major: number, minorUnitExponent: number): Minor {
  const scale = 10 ** minorUnitExponent;
  return minor(Math.round(major * scale));
}

export function fromMinor(value: Minor, minorUnitExponent: number): number {
  return value / 10 ** minorUnitExponent;
}

export function addMinor(a: Minor, b: Minor): Minor {
  const sum = a + b;
  if (sum < MIN_SAFE || sum > MAX_SAFE) {
    throw new RangeError('Money addition overflowed the safe integer range');
  }
  return minor(sum);
}

export function subtractMinor(a: Minor, b: Minor): Minor {
  return addMinor(a, minor(-b));
}

export function sumMinor(values: readonly Minor[]): Minor {
  return values.reduce<Minor>((total, value) => addMinor(total, value), minor(0));
}

/** Multiply money by an integer quantity (never a float). */
export function multiplyMinor(value: Minor, quantity: number): Minor {
  if (!Number.isInteger(quantity)) {
    throw new RangeError('Quantity must be an integer when multiplying money');
  }
  return minor(value * quantity);
}

/**
 * Apply a rate expressed in basis points (1 bp = 0.01%) with half-up rounding.
 * Using basis points keeps tax/discount math in integers.
 */
export function applyBasisPoints(value: Minor, basisPoints: number): Minor {
  if (!Number.isInteger(basisPoints)) {
    throw new RangeError('Basis points must be an integer');
  }
  const numerator = value * basisPoints;
  const denom = 10_000;
  return minor(Math.round(Math.abs(numerator) / denom) * Math.sign(numerator));
}

export function formatMinor(
  value: Minor,
  locale: string,
  currency: string,
  minorUnitExponent: number,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: minorUnitExponent,
    maximumFractionDigits: minorUnitExponent,
  }).format(fromMinor(value, minorUnitExponent));
}
