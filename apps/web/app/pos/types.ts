import type { Product } from '@pos/contracts';

export interface CartLine {
  product: Product;
  quantity: string;
}

export function parseStockScaled(value: string): number | null {
  const match = /^(\d{1,12})(?:\.(\d{1,4}))?$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1]) * 10_000 + Number((match[2] ?? '').padEnd(4, '0'));
}

export function parseQuantityScaled(value: string): number | null {
  const scaled = parseStockScaled(value);
  return scaled !== null && scaled > 0 ? scaled : null;
}

export function cartTotalMinor(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => {
    const scaled = parseQuantityScaled(line.quantity) ?? 0;
    return total + Math.round((line.product.priceMinor * scaled) / 10_000);
  }, 0);
}

function formatQuantityScaled(scaled: number): string {
  const wholePart = Math.floor(scaled / 10_000);
  const fractionPart = String(scaled % 10_000)
    .padStart(4, '0')
    .replace(/0+$/, '');
  return fractionPart.length > 0 ? `${wholePart}.${fractionPart}` : `${wholePart}`;
}

export function nextQuantity(quantity: string): string {
  const scaled = parseQuantityScaled(quantity) ?? 0;
  return formatQuantityScaled(scaled + 10_000);
}

/** Never drops below one unit; the quantity field still allows manual decimals. */
export function previousQuantity(quantity: string): string {
  const scaled = parseQuantityScaled(quantity);
  if (scaled === null || scaled <= 10_000) return '1';
  return formatQuantityScaled(scaled - 10_000);
}

export function isValidQuantity(quantity: string): boolean {
  return parseQuantityScaled(quantity) !== null;
}

export function lineQuantityIssue(
  quantity: string,
  stock: string | undefined,
  productName: string,
): string | null {
  const scaledQuantity = parseQuantityScaled(quantity);
  if (scaledQuantity === null) {
    return `Enter a quantity greater than zero for ${productName}.`;
  }
  const available = parseStockScaled(stock ?? '0') ?? 0;
  if (scaledQuantity > available) {
    return `Only ${stock ?? '0'} in stock for ${productName}.`;
  }
  return null;
}

export function parseMoneyMinor(value: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? '').padEnd(2, '0'));
  return whole * 100 + fraction;
}

export function parseTenderMinor(value: string): number | null {
  const minor = parseMoneyMinor(value);
  return minor !== null && minor > 0 ? minor : null;
}

/** Exact amount plus useful note round-ups, in minor units. */
export function quickTenderAmounts(totalMinor: number): number[] {
  if (totalMinor <= 0) return [];
  const amounts = new Set<number>([totalMinor]);
  for (const step of [10_000, 50_000, 100_000]) {
    amounts.add(Math.ceil(totalMinor / step) * step);
  }
  return [...amounts].sort((left, right) => left - right);
}
