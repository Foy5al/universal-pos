import { randomUUID } from 'node:crypto';

import type { restockRequests } from '../../schema/purchasing';
import type { CatalogListOptions, CatalogListResult } from '../catalog/types';
import { formatScaledQuantity, parseScaledQuantity } from '../inventory/quantity';
import type { RestockRequestStatus } from '@pos/contracts';

export interface RestockRequestRecord {
  id: string;
  organizationId: string;
  locationId: string;
  productId: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedQuantity: string;
  note: string | null;
  status: RestockRequestStatus;
  purchaseOrderId: string | null;
  purchaseOrderLineId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRestockRequestInput {
  organizationId: string;
  locationId: string;
  productId: string;
  requestedByUserId: string;
  requestedByName: string;
  requestedQuantity: string;
  note?: string | undefined;
}

export interface RestockRequestFilters {
  status?: RestockRequestStatus | undefined;
  locationIds?: readonly string[] | undefined;
  requestedByUserId?: string | undefined;
}

export interface ScheduleRestockInput {
  organizationId: string;
  locationId: string;
  purchaseOrderId: string;
  requestIds: readonly string[];
  lines: ReadonlyArray<{ id: string; productId: string }>;
}

export interface RestockRequestRepository {
  list(
    organizationId: string,
    filters: RestockRequestFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<RestockRequestRecord>>;
  findById(organizationId: string, id: string): Promise<RestockRequestRecord | null>;
  create(input: CreateRestockRequestInput): Promise<RestockRequestRecord>;
  dismiss(organizationId: string, id: string): Promise<RestockRequestRecord | null>;
  schedule(input: ScheduleRestockInput): Promise<number>;
  fulfillByOrder(organizationId: string, purchaseOrderId: string): Promise<number>;
  releaseByOrder(organizationId: string, purchaseOrderId: string): Promise<number>;
}

export function toRecord(row: typeof restockRequests.$inferSelect): RestockRequestRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    locationId: row.locationId,
    productId: row.productId,
    requestedByUserId: row.requestedByUserId,
    requestedByName: row.requestedByName,
    requestedQuantity: formatScaledQuantity(parseScaledQuantity(row.requestedQuantity)),
    note: row.note,
    status: row.status,
    purchaseOrderId: row.purchaseOrderId,
    purchaseOrderLineId: row.purchaseOrderLineId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function matches(record: RestockRequestRecord, filters: RestockRequestFilters): boolean {
  if (filters.status && record.status !== filters.status) return false;
  if (filters.locationIds && !filters.locationIds.includes(record.locationId)) return false;
  if (filters.requestedByUserId && record.requestedByUserId !== filters.requestedByUserId) {
    return false;
  }
  return true;
}

export class InMemoryRestockRequestRepository implements RestockRequestRepository {
  private readonly records: RestockRequestRecord[];

  constructor(records: readonly RestockRequestRecord[] = []) {
    this.records = records.map((record) => ({ ...record }));
  }

  async list(
    organizationId: string,
    filters: RestockRequestFilters,
    options: CatalogListOptions,
  ): Promise<CatalogListResult<RestockRequestRecord>> {
    const scoped = this.records
      .filter((record) => record.organizationId === organizationId)
      .filter((record) => matches(record, filters))
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
      );
    return {
      items: scoped.slice(options.offset, options.offset + options.limit),
      total: scoped.length,
    };
  }

  async findById(organizationId: string, id: string): Promise<RestockRequestRecord | null> {
    return (
      this.records.find(
        (record) => record.organizationId === organizationId && record.id === id,
      ) ?? null
    );
  }

  async create(input: CreateRestockRequestInput): Promise<RestockRequestRecord> {
    const now = new Date().toISOString();
    const record: RestockRequestRecord = {
      id: randomUUID(),
      organizationId: input.organizationId,
      locationId: input.locationId,
      productId: input.productId,
      requestedByUserId: input.requestedByUserId,
      requestedByName: input.requestedByName,
      requestedQuantity: formatScaledQuantity(parseScaledQuantity(input.requestedQuantity)),
      note: input.note ?? null,
      status: 'pending',
      purchaseOrderId: null,
      purchaseOrderLineId: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return record;
  }

  async dismiss(organizationId: string, id: string): Promise<RestockRequestRecord | null> {
    const record = await this.findById(organizationId, id);
    if (!record || record.status !== 'pending') return null;
    record.status = 'dismissed';
    record.updatedAt = new Date().toISOString();
    return record;
  }

  async schedule(input: ScheduleRestockInput): Promise<number> {
    let changed = 0;
    for (const id of input.requestIds) {
      const record = await this.findById(input.organizationId, id);
      if (!record || record.status !== 'pending' || record.locationId !== input.locationId) {
        continue;
      }
      const line = input.lines.find((candidate) => candidate.productId === record.productId);
      if (!line) continue;
      record.status = 'scheduled';
      record.purchaseOrderId = input.purchaseOrderId;
      record.purchaseOrderLineId = line.id;
      record.updatedAt = new Date().toISOString();
      changed += 1;
    }
    return changed;
  }

  async fulfillByOrder(organizationId: string, purchaseOrderId: string): Promise<number> {
    let changed = 0;
    for (const record of this.records) {
      if (
        record.organizationId === organizationId &&
        record.purchaseOrderId === purchaseOrderId &&
        record.status === 'scheduled'
      ) {
        record.status = 'fulfilled';
        record.updatedAt = new Date().toISOString();
        changed += 1;
      }
    }
    return changed;
  }

  async releaseByOrder(organizationId: string, purchaseOrderId: string): Promise<number> {
    let changed = 0;
    for (const record of this.records) {
      if (
        record.organizationId === organizationId &&
        record.purchaseOrderId === purchaseOrderId &&
        record.status === 'scheduled'
      ) {
        record.status = 'pending';
        record.purchaseOrderId = null;
        record.purchaseOrderLineId = null;
        record.updatedAt = new Date().toISOString();
        changed += 1;
      }
    }
    return changed;
  }
}
