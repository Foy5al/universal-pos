import { randomUUID } from 'node:crypto';

import type { PurchaseOrderStatus } from '@pos/contracts';

import type { CatalogListOptions, CatalogListResult } from '../catalog/types';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import type { StockLedgerRepository } from '../inventory/ledger';

export interface PurchaseOrderLineRecord {
  id: string;
  productId: string;
  quantity: string;
  receivedQuantity: string;
  unitCostMinor: number;
  lineTotalMinor: number;
}

export interface PurchaseOrderRecord {
  id: string;
  organizationId: string;
  supplierId: string;
  locationId: string;
  status: PurchaseOrderStatus;
  notes: string | null;
  totalMinor: number;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLineRecord[];
}

export interface CreatePurchaseOrderLineInput {
  productId: string;
  quantity: string;
  unitCostMinor: number;
  lineTotalMinor: number;
}

export interface CreatePurchaseOrderInput {
  organizationId: string;
  supplierId: string;
  locationId: string;
  notes?: string | undefined;
  lines: readonly CreatePurchaseOrderLineInput[];
}

export interface ReceivePurchaseOrderLineInput {
  purchaseOrderLineId: string;
  quantity: string;
}

export interface ReceivePurchaseOrderInput {
  organizationId: string;
  purchaseOrderId: string;
  lines: readonly ReceivePurchaseOrderLineInput[];
  notes?: string | undefined;
}

export interface PurchaseOrderFilters {
  supplierId?: string | undefined;
  status?: PurchaseOrderStatus | undefined;
  locationIds?: readonly string[] | undefined;
}

export interface GoodsReceiptRecord {
  id: string;
  organizationId: string;
  purchaseOrderId: string;
  locationId: string;
  receivedAt: string;
}

export interface ReceiveResult {
  purchaseOrder: PurchaseOrderRecord;
  receipt: GoodsReceiptRecord;
}

export class ReceiveConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiveConflictError';
  }
}

export interface PurchaseOrderRepository {
  list(
    organizationId: string,
    filters: PurchaseOrderFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<PurchaseOrderRecord>>;
  findById(organizationId: string, id: string): Promise<PurchaseOrderRecord | null>;
  create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderRecord>;
  updateStatus(
    organizationId: string,
    id: string,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrderRecord | null>;
  receive(input: ReceivePurchaseOrderInput): Promise<ReceiveResult | null>;
}

export function nextOrderStatus(lines: readonly PurchaseOrderLineRecord[]): PurchaseOrderStatus {
  const allReceived = lines.every(
    (line) => parseScaledQuantity(line.receivedQuantity) >= parseScaledQuantity(line.quantity),
  );
  if (allReceived) {
    return 'received';
  }
  return lines.some((line) => parseScaledQuantity(line.receivedQuantity) > 0n)
    ? 'partially_received'
    : 'ordered';
}

function matchesFilters(order: PurchaseOrderRecord, filters: PurchaseOrderFilters): boolean {
  if (filters.supplierId && order.supplierId !== filters.supplierId) return false;
  if (filters.status && order.status !== filters.status) return false;
  if (filters.locationIds && !filters.locationIds.includes(order.locationId)) return false;
  return true;
}

export class InMemoryPurchaseOrderRepository implements PurchaseOrderRepository {
  private readonly records: PurchaseOrderRecord[];

  constructor(
    private readonly ledger: StockLedgerRepository,
    records: readonly PurchaseOrderRecord[] = [],
  ) {
    this.records = records.map((record) => ({ ...record, lines: [...record.lines] }));
  }

  async list(
    organizationId: string,
    filters: PurchaseOrderFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<PurchaseOrderRecord>> {
    const scoped = this.records
      .filter((record) => record.organizationId === organizationId)
      .filter((record) => matchesFilters(record, filters))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<PurchaseOrderRecord | null> {
    return (
      this.records.find((record) => record.organizationId === organizationId && record.id === id) ??
      null
    );
  }

  async create(input: CreatePurchaseOrderInput): Promise<PurchaseOrderRecord> {
    const now = new Date().toISOString();
    const order: PurchaseOrderRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      supplierId: input.supplierId,
      locationId: input.locationId,
      status: 'draft',
      notes: input.notes ?? null,
      totalMinor: input.lines.reduce((total, line) => total + line.lineTotalMinor, 0),
      createdAt: now,
      updatedAt: now,
      lines: input.lines.map((line) => ({
        id: randomUUID(),
        productId: line.productId,
        quantity: formatScaledQuantity(parseScaledQuantity(line.quantity)),
        receivedQuantity: '0',
        unitCostMinor: line.unitCostMinor,
        lineTotalMinor: line.lineTotalMinor,
      })),
    };
    this.records.push(order);
    return order;
  }

  async updateStatus(
    organizationId: string,
    id: string,
    status: PurchaseOrderStatus,
  ): Promise<PurchaseOrderRecord | null> {
    const order = await this.findById(organizationId, id);
    if (!order) {
      return null;
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    return order;
  }

  async receive(input: ReceivePurchaseOrderInput): Promise<ReceiveResult | null> {
    const order = await this.findById(input.organizationId, input.purchaseOrderId);
    if (!order) {
      return null;
    }
    if (order.status !== 'ordered' && order.status !== 'partially_received') {
      throw new ReceiveConflictError('Purchase order is not open for receiving');
    }
    for (const received of input.lines) {
      const line = order.lines.find((candidate) => candidate.id === received.purchaseOrderLineId);
      if (!line) {
        throw new ReceiveConflictError('Purchase order line does not belong to this order');
      }
      const quantity = parseScaledQuantity(received.quantity);
      const lineQuantity = parseScaledQuantity(line.quantity);
      const nextReceived = parseScaledQuantity(line.receivedQuantity) + quantity;
      if (nextReceived > lineQuantity) {
        throw new ReceiveConflictError('Received quantity exceeds the ordered quantity');
      }
      line.receivedQuantity = formatScaledQuantity(nextReceived);
    }

    const receipt: GoodsReceiptRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      purchaseOrderId: order.id,
      locationId: order.locationId,
      receivedAt: new Date().toISOString(),
    };
    for (const received of input.lines) {
      const line = order.lines.find((candidate) => candidate.id === received.purchaseOrderLineId)!;
      await this.ledger.recordMovement({
        organizationId: input.organizationId,
        locationId: order.locationId,
        productId: line.productId,
        movementType: 'receipt',
        quantityDelta: parseScaledQuantity(received.quantity),
        reason: `Purchase receipt ${receipt.id}`,
        unitCostMinor: line.unitCostMinor,
      });
    }

    order.status = nextOrderStatus(order.lines);
    order.updatedAt = new Date().toISOString();
    return { purchaseOrder: order, receipt };
  }
}
