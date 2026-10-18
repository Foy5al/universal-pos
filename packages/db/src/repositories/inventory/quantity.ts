/**
 * Exact decimal quantity math for the stock ledger. Quantities are stored as
 * PostgreSQL `numeric(18,4)`; this module keeps additions in scaled BigInt so
 * no binary floating point ever touches a stock balance (ADR-0003).
 */
export const QUANTITY_SCALE = 4;

const FACTOR = 10n ** BigInt(QUANTITY_SCALE);

export function parseScaledQuantity(value: string): bigint {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) {
    throw new RangeError(`Invalid quantity: ${value}`);
  }
  const [, sign, whole = '0', fraction = ''] = match;
  const padded = (fraction + '0000').slice(0, QUANTITY_SCALE);
  const magnitude = BigInt(whole) * FACTOR + BigInt(padded || '0');
  return sign === '-' ? -magnitude : magnitude;
}

export function formatScaledQuantity(scaled: bigint): string {
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / FACTOR;
  const fraction = (absolute % FACTOR).toString().padStart(QUANTITY_SCALE, '0').replace(/0+$/, '');
  const body = fraction.length > 0 ? `${whole}.${fraction}` : `${whole}`;
  return negative ? `-${body}` : body;
}
