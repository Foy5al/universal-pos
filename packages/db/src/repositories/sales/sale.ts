import { randomUUID } from 'node:crypto';

import type { SalePaymentMethod, SaleStatus } from '@pos/contracts';

import type { CatalogListOptions, CatalogListResult } from '../catalog/types';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import type { StockLedgerRepository } from '../inventory/ledger';

export interface SaleLineRecord {
  id: string;
  productId: string;
  sku: string;
  name: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface SalePaymentRecord {
  id: string;
  method: SalePaymentMethod;
  amountMinor: number;
}

export interface SaleRecord {
  id: string;
  organizationId: string;
  locationId: string;
  saleNumber: string;
  operationId: string;
  registerShiftId: string | null;
  status: SaleStatus;
  customerName: string | null;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  paidMinor: number;
  changeMinor: number;
  createdBy: string;
  createdAt: string;
  lines: SaleLineRecord[];
  payments: SalePaymentRecord[];
}

export interface CreateSaleLineInput {
  productId: string;
  sku: string;
  name: string;
  quantity: string;
  unitPriceMinor: number;
  lineTotalMinor: number;
}

export interface CreateSalePaymentInput {
  method: SalePaymentMethod;
  amountMinor: number;
}

export interface CreateSaleInput {
  organizationId: string;
  locationId: string;
  operationId: string;
  registerShiftId: string;
  customerName?: string | undefined;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  paidMinor: number;
  changeMinor: number;
  createdBy: string;
  lines: readonly CreateSaleLineInput[];
  payments: readonly CreateSalePaymentInput[];
}

export interface SaleFilters {
  locationId?: string | undefined;
}

export interface SaleRepository {
  list(
    organizationId: string,
    filters: SaleFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<SaleRecord>>;
  findById(organizationId: string, id: string): Promise<SaleRecord | null>;
  findByOperationId(organizationId: string, operationId: string): Promise<SaleRecord | null>;
  sumCashByShift(organizationId: string, registerShiftId: string): Promise<number>;
  create(input: CreateSaleInput): Promise<SaleRecord>;
}

export class InsufficientStockError extends Error {
  constructor(readonly productId: string) {
    super('Insufficient stock for the requested quantity');
    this.name = 'InsufficientStockError';
  }
}

/** Collision-resistant, immutable invoice number; the UUID suffix keeps retries safe. */
export function buildSaleNumber(id: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${date}-${id.slice(0, 8).toUpperCase()}`;
}

function matchesFilters(sale: SaleRecord, filters: SaleFilters): boolean {
  return !filters.locationId || sale.locationId === filters.locationId;
}

export class InMemorySaleRepository implements SaleRepository {
  private readonly records: SaleRecord[];

  constructor(
    private readonly ledger: StockLedgerRepository,
    records: readonly SaleRecord[] = [],
  ) {
    this.records = records.map((record) => ({
      ...record,
      lines: [...record.lines],
      payments: [...record.payments],
    }));
  }

  async list(
    organizationId: string,
    filters: SaleFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<SaleRecord>> {
    const scoped = this.records
      .filter((record) => record.organizationId === organizationId)
      .filter((record) => matchesFilters(record, filters))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<SaleRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async findByOperationId(organizationId: string, operationId: string): Promise<SaleRecord | null> {
    return (
      this.records.find(
        (record) => record.organizationId === organizationId && record.operationId === operationId,
      ) ?? null
    );
  }

  async create(input: CreateSaleInput): Promise<SaleRecord> {
    const existing = await this.findByOperationId(input.organizationId, input.operationId);
    if (existing) {
      return existing;
    }

    for (const line of input.lines) {
      const balances = await this.ledger.listBalances(
        input.organizationId,
        { locationId: input.locationId, productId: line.productId },
        { limit: 1, offset: 0 },
      );
      const available = balances.items[0] ? parseScaledQuantity(balances.items[0].quantity) : 0n;
      if (available < parseScaledQuantity(line.quantity)) {
        throw new InsufficientStockError(line.productId);
      }
    }

    const id = randomUUID();
    const sale: SaleRecord = {
      id,
      organizationId: input.organizationId,
      locationId: input.locationId,
      saleNumber: buildSaleNumber(id),
      operationId: input.operationId,
      registerShiftId: input.registerShiftId,
      status: 'completed',
      customerName: input.customerName ?? null,
      currency: input.currency,
      subtotalMinor: input.subtotalMinor,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: input.totalMinor,
      paidMinor: input.paidMinor,
      changeMinor: input.changeMinor,
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
      payments: input.payments.map((payment) => ({
        id: randomUUID(),
        method: payment.method,
        amountMinor: payment.amountMinor,
      })),
    };

    for (const line of sale.lines) {
      await this.ledger.recordMovement({
        organizationId: input.organizationId,
        locationId: input.locationId,
        productId: line.productId,
        movementType: 'issue',
        quantityDelta: -parseScaledQuantity(line.quantity),
        reason: `Sale ${sale.saleNumber}`,
      });
    }
    this.records.push(sale);
    return sale;
  }

  snapshot(): readonly SaleRecord[] {
    return this.records;
  }

  async sumCashByShift(organizationId: string, registerShiftId: string): Promise<number> {
    return this.records
      .filter(
        (record) =>
          record.organizationId === organizationId &&
          record.registerShiftId === registerShiftId &&
          record.status === 'completed',
      )
      .reduce((total, record) => total + record.totalMinor, 0);
  }
}
