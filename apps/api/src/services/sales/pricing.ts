import { parseScaledQuantity } from '@pos/db';

import { validationError } from '../../core/errors';

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const QUANTITY_FACTOR = 10_000n;

/** Exact unit price times a scaled quantity, rounded half-up to minor units. */
export function lineTotalMinor(unitPriceMinor: number, quantity: string): number {
  const total =
    (BigInt(unitPriceMinor) * parseScaledQuantity(quantity) + QUANTITY_FACTOR / 2n) /
    QUANTITY_FACTOR;
  if (total > MAX_SAFE) {
    throw validationError('Line total exceeds the supported money range');
  }
  return Number(total);
}

export function sumTenderedMinor(payments: readonly { tenderedMinor: number }[]): number {
  let paidMinor = 0;
  for (const payment of payments) {
    paidMinor += payment.tenderedMinor;
    if (!Number.isSafeInteger(paidMinor)) {
      throw validationError('Payment total exceeds the supported money range');
    }
  }
  return paidMinor;
}

export function sumSubtotalMinor(lineTotals: readonly number[]): number {
  let subtotalMinor = 0;
  for (const total of lineTotals) {
    subtotalMinor += total;
    if (!Number.isSafeInteger(subtotalMinor)) {
      throw validationError('Sale total exceeds the supported money range');
    }
  }
  return subtotalMinor;
}
