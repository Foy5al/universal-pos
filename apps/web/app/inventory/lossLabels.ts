import type { StockLossReason, StockMovement } from '@pos/contracts';

import { parseQuantity } from '../lib/money';

export const LOSS_REASON_LABELS: Record<StockLossReason, string> = {
  damaged: 'Damaged',
  defective: 'Defective',
  expired: 'Expired',
  lost: 'Lost or missing',
  other: 'Other',
};

export const LOSS_REASON_OPTIONS = (
  Object.entries(LOSS_REASON_LABELS) as [StockLossReason, string][]
).map(([value, label]) => ({ value, label }));

export function lossValueMinor(movement: StockMovement): number | null {
  if (movement.unitCostMinor === null) return null;
  const scaled = parseQuantity(movement.quantityDelta.replace('-', ''));
  if (scaled === null) return null;
  return Math.round((movement.unitCostMinor * scaled) / 10_000);
}

export function removedQuantity(movement: StockMovement): string {
  return movement.quantityDelta.replace(/^-/, '');
}
