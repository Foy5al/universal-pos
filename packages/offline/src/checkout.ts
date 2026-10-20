import type { OfflineSalePayload } from '@pos/contracts';

import { newUuid, type PosOfflineDatabase } from './db';
import type { CommitLocalSaleInput, LocalSale, LocalSaleLine } from './types';

const QUANTITY_FACTOR = 10_000n;

export function scaledQuantity(quantity: string): bigint {
  const trimmed = quantity.trim();
  if (!/^\d{1,12}(\.\d{1,4})?$/.test(trimmed) || /^0(\.0+)?$/.test(trimmed)) {
    throw new RangeError(`Invalid quantity: ${quantity}`);
  }
  const [whole = '0', fraction = ''] = trimmed.split('.');
  return BigInt(whole) * QUANTITY_FACTOR + BigInt((fraction + '0000').slice(0, 4));
}

/** Mirrors the server's half-up minor-unit rounding (ADR-0003). */
export function lineTotalMinor(unitPriceMinor: number, quantity: string): number {
  if (!Number.isSafeInteger(unitPriceMinor) || unitPriceMinor < 0) {
    throw new RangeError('Unit price must be a non-negative integer of minor units');
  }
  const total =
    (BigInt(unitPriceMinor) * scaledQuantity(quantity) + QUANTITY_FACTOR / 2n) / QUANTITY_FACTOR;
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Line total exceeds the supported money range');
  }
  return Number(total);
}

function provisionalNumber(registerCode: string, sequence: number): string {
  const code = registerCode
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `OFF-${code || 'REG'}-${sequence}`;
}

/**
 * Writes the sale, its lines and the outbox event in one IndexedDB transaction.
 * The caller may only show success after this resolves (plan §5).
 */
export async function commitLocalSale(
  db: PosOfflineDatabase,
  input: CommitLocalSaleInput,
): Promise<LocalSale> {
  if (input.lines.length === 0) throw new RangeError('A sale needs at least one line');
  if (!Number.isSafeInteger(input.tenderedMinor) || input.tenderedMinor < 1) {
    throw new RangeError('Payment must be a positive integer of minor units');
  }

  const lines: LocalSaleLine[] = input.lines.map((line) => ({
    productId: line.product.id,
    quantity: line.quantity,
    unitPriceMinor: line.product.priceMinor,
    sku: line.product.sku,
    name: line.product.name,
    lineTotalMinor: lineTotalMinor(line.product.priceMinor, line.quantity),
  }));
  const uniqueProducts = new Set(lines.map((line) => line.productId));
  if (uniqueProducts.size !== lines.length) {
    throw new RangeError('Each product may appear only once per sale');
  }

  const subtotalMinor = lines.reduce((total, line) => total + line.lineTotalMinor, 0);
  if (!Number.isSafeInteger(subtotalMinor)) {
    throw new RangeError('Sale total exceeds the supported money range');
  }
  if (input.tenderedMinor < subtotalMinor) {
    throw new RangeError('Payment is less than the sale total');
  }

  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const currency = input.currency ?? 'BDT';

  return db.transaction('rw', db.localSales, db.outbox, db.counters, async () => {
    const counter = await db.counters.get('saleSequence');
    const clientSequence = (counter?.value ?? 0) + 1;
    await db.counters.put({ key: 'saleSequence', value: clientSequence });

    const entityId = newUuid();
    const operationId = newUuid();
    const number = provisionalNumber(input.registerCode, clientSequence);
    const payload: OfflineSalePayload = {
      locationId: input.locationId,
      registerShiftId: input.registerShiftId,
      provisionalNumber: number,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPriceMinor: line.unitPriceMinor,
      })),
      payments: [{ method: 'cash', tenderedMinor: input.tenderedMinor }],
      ...(input.customerName ? { customerName: input.customerName } : {}),
    };

    const sale: LocalSale = {
      id: entityId,
      entityId,
      operationId,
      deviceId: input.deviceId,
      locationId: input.locationId,
      registerId: input.registerId,
      registerShiftId: input.registerShiftId,
      provisionalNumber: number,
      status: 'local_pending',
      currency,
      subtotalMinor,
      totalMinor: subtotalMinor,
      tenderedMinor: input.tenderedMinor,
      changeMinor: input.tenderedMinor - subtotalMinor,
      occurredAt,
      clientSequence,
      schemaVersion: 1,
      lines,
      payments: [{ method: 'cash', tenderedMinor: input.tenderedMinor }],
      serverSaleId: null,
      serverSaleNumber: null,
      conflictReason: null,
    };

    await db.localSales.put(sale);
    await db.outbox.put({
      operationId,
      entityId,
      deviceId: input.deviceId,
      clientSequence,
      occurredAt,
      status: 'pending',
      attempts: 0,
      nextAttemptAt: occurredAt,
      lastError: null,
      payload,
    });
    return sale;
  });
}
