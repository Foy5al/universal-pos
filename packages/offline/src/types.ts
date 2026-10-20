import type {
  OfflineSaleLine,
  OfflineSalePayload,
  OfflineSalePayment,
  Product,
} from '@pos/contracts';

/** Local status mirrors the plan's sale lifecycle (plan §5). */
export const LOCAL_SALE_STATUSES = [
  'local_pending',
  'server_accepted',
  'requires_review',
  'rejected',
] as const;

export type LocalSaleStatus = (typeof LOCAL_SALE_STATUSES)[number];

export const OUTBOX_STATUSES = [
  'pending',
  'sending',
  'retryable_error',
  'needs_review',
  'rejected',
  'acknowledged',
] as const;

export type OutboxStatus = (typeof OUTBOX_STATUSES)[number];

export interface LocalSaleLine extends OfflineSaleLine {
  sku: string;
  name: string;
  lineTotalMinor: number;
}

/**
 * Durable local sale written before the cashier sees success. It stores the
 * prices captured at the till so a later catalog change cannot rewrite it.
 */
export interface LocalSale {
  id: string;
  operationId: string;
  entityId: string;
  deviceId: string;
  locationId: string;
  registerId: string;
  registerShiftId: string;
  provisionalNumber: string;
  status: LocalSaleStatus;
  currency: string;
  subtotalMinor: number;
  totalMinor: number;
  tenderedMinor: number;
  changeMinor: number;
  occurredAt: string;
  clientSequence: number;
  schemaVersion: 1;
  lines: LocalSaleLine[];
  payments: OfflineSalePayment[];
  serverSaleId: string | null;
  serverSaleNumber: string | null;
  conflictReason: string | null;
}

export interface OutboxEvent {
  operationId: string;
  entityId: string;
  deviceId: string;
  clientSequence: number;
  occurredAt: string;
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  payload: OfflineSalePayload;
}

export interface CachedProduct extends Product {
  cachedAt: string;
}

export interface CachedBalance {
  /** `${locationId}:${productId}` keeps the compound lookup unique. */
  id: string;
  locationId: string;
  productId: string;
  quantity: string;
  cachedAt: string;
}

export interface StateRecord {
  key: string;
  value: string;
}

export interface CounterRecord {
  key: string;
  value: number;
}

export interface SyncSummary {
  pending: number;
  retryable: number;
  needsReview: number;
  rejected: number;
  acknowledged: number;
}

export interface CheckoutLineInput {
  product: Pick<Product, 'id' | 'sku' | 'name' | 'priceMinor'>;
  quantity: string;
}

export interface CommitLocalSaleInput {
  deviceId: string;
  locationId: string;
  registerId: string;
  registerCode: string;
  registerShiftId: string;
  currency?: string;
  occurredAt?: string;
  lines: readonly CheckoutLineInput[];
  tenderedMinor: number;
  customerName?: string;
}

export interface DeviceIdentity {
  deviceId: string;
  name: string;
  platform: string;
  registerId?: string;
}
