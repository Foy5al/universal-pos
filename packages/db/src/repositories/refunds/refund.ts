import { randomUUID } from 'node:crypto';

import type { StockLedgerRepository } from '../inventory/ledger';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';

export interface RefundLineRecord {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface RefundRecord {
  id: string;
  organizationId: string;
  saleId: string;
  registerShiftId: string;
  refundNumber: string;
  operationId: string;
  amountMinor: number;
  reason: string;
  createdBy: string;
  createdAt: string;
  lines: RefundLineRecord[];
}

export interface CreateRefundLineInput {
  productId: string;
  sku: string;
  name: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface CreateRefundInput {
  organizationId: string;
  saleId: string;
  locationId: string;
  registerShiftId: string;
  operationId: string;
  amountMinor: number;
  reason: string;
  createdBy: string;
  lines: readonly CreateRefundLineInput[];
}

export interface RefundRepository {
  findByOperationId(organizationId: string, operationId: string): Promise<RefundRecord | null>;
  findBySaleId(organizationId: string, saleId: string): Promise<RefundRecord | null>;
  sumByShift(organizationId: string, registerShiftId: string): Promise<number>;
  create(input: CreateRefundInput): Promise<RefundRecord>;
}

export class SaleAlreadyRefundedError extends Error {
  constructor() {
    super('Sale has already been refunded');
    this.name = 'SaleAlreadyRefundedError';
  }
}

export class SaleNotRefundableError extends Error {
  constructor() {
    super('Sale is not refundable');
    this.name = 'SaleNotRefundableError';
  }
}

/** Collision-resistant, immutable refund document number. */
export function buildRefundNumber(id: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `REF-${date}-${id.slice(0, 8).toUpperCase()}`;
}

export class InMemoryRefundRepository implements RefundRepository {
  private readonly records: RefundRecord[];

  constructor(
    private readonly ledger: StockLedgerRepository,
    records: readonly RefundRecord[] = [],
  ) {
    this.records = records.map((record) => ({
      ...record,
      lines: [...record.lines],
    }));
  }

  async findByOperationId(
    organizationId: string,
    operationId: string,
  ): Promise<RefundRecord | null> {
    return (
      this.records.find(
        (record) => record.organizationId === organizationId && record.operationId === operationId,
      ) ?? null
    );
  }

  async findBySaleId(organizationId: string, saleId: string): Promise<RefundRecord | null> {
    return (
      this.records.find(
        (record) => record.organizationId === organizationId && record.saleId === saleId,
      ) ?? null
    );
  }

  snapshot(): readonly RefundRecord[] {
    return this.records;
  }

  async sumByShift(organizationId: string, registerShiftId: string): Promise<number> {
    return this.records
      .filter(
        (record) =>
          record.organizationId === organizationId && record.registerShiftId === registerShiftId,
      )
      .reduce((total, record) => total + record.amountMinor, 0);
  }

  async create(input: CreateRefundInput): Promise<RefundRecord> {
    const existing = await this.findByOperationId(input.organizationId, input.operationId);
    if (existing) {
      return existing;
    }
    if (await this.findBySaleId(input.organizationId, input.saleId)) {
      throw new SaleAlreadyRefundedError();
    }

    const id = randomUUID();
    const refund: RefundRecord = {
      id,
      organizationId: input.organizationId,
      saleId: input.saleId,
      registerShiftId: input.registerShiftId,
      refundNumber: buildRefundNumber(id),
      operationId: input.operationId,
      amountMinor: input.amountMinor,
      reason: input.reason,
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
      lines: input.lines.map((line) => ({
        id: randomUUID(),
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        quantity: formatScaledQuantity(parseScaledQuantity(line.quantity)),
        unitPriceMinor: line.unitPriceMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };

    for (const line of refund.lines) {
      await this.ledger.recordMovement({
        organizationId: input.organizationId,
        locationId: input.locationId,
        productId: line.productId,
        movementType: 'return',
        quantityDelta: parseScaledQuantity(line.quantity),
        reason: `Refund ${refund.refundNumber}`,
      });
    }
    this.records.push(refund);
    return refund;
  }
}
