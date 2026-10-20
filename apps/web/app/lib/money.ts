const QUANTITY_SCALE = 10_000;

export function parseQuantity(value: string): number | null {
  const match = /^\d{1,12}(\.\d{1,4})?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const [whole, fraction = ''] = value.trim().split('.');
  const scaled = Number(whole) * QUANTITY_SCALE + Number((fraction + '0000').slice(0, 4));
  return scaled > 0 ? scaled : null;
}

export function lineTotalMinor(unitPriceMinor: number, scaledQuantity: number): number {
  return Math.round((unitPriceMinor * scaledQuantity) / QUANTITY_SCALE);
}

export function formatMinor(value: number, currency = 'BDT'): string {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
