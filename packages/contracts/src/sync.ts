import { z } from 'zod';

import { resourceIdSchema } from './pagination';
import { salePaymentMethodSchema, saleQuantitySchema, saleSchema } from './sales';

const moneyMinorSchema = z.number().int().min(0).max(1_000_000_000_000);

export const deviceSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  platform: z.string(),
  storeId: z.uuid(),
  registerId: z.uuid().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  revokedAt: z.string().nullable(),
});

export type Device = z.infer<typeof deviceSchema>;

/** Device identity is client-generated so first enrollment can happen from the till. */
export const registerDeviceRequestSchema = z.object({
  id: resourceIdSchema,
  name: z.string().trim().min(1).max(80),
  platform: z.string().trim().min(1).max(40),
  /** Required by the explicit enrollment endpoint; derived from the sale offline. */
  storeId: resourceIdSchema.optional(),
  registerId: resourceIdSchema.optional(),
});

export type RegisterDeviceRequest = z.infer<typeof registerDeviceRequestSchema>;

export const SYNC_OPERATION_STATUSES = [
  'accepted',
  'duplicate',
  'needs_review',
  'rejected',
] as const;

export const syncOperationStatusSchema = z.enum(SYNC_OPERATION_STATUSES);

export type SyncOperationStatus = z.infer<typeof syncOperationStatusSchema>;

/**
 * Line prices are captured on the terminal at the time of sale. The server must
 * never replace an unsynced sale's totals with a newer catalog price (plan §5).
 */
export const offlineSaleLineSchema = z.object({
  productId: resourceIdSchema,
  quantity: saleQuantitySchema,
  unitPriceMinor: moneyMinorSchema,
});

export type OfflineSaleLine = z.infer<typeof offlineSaleLineSchema>;

export const offlineSalePaymentSchema = z.object({
  method: salePaymentMethodSchema,
  tenderedMinor: moneyMinorSchema.min(1, 'Payment must be greater than zero'),
});

export type OfflineSalePayment = z.infer<typeof offlineSalePaymentSchema>;

export const offlineSalePayloadSchema = z
  .object({
    locationId: resourceIdSchema,
    registerShiftId: resourceIdSchema,
    customerName: z.string().trim().max(160).optional(),
    /** Provisional receipt identifier printed before server acceptance. */
    provisionalNumber: z.string().trim().min(1).max(48),
    lines: z.array(offlineSaleLineSchema).min(1).max(200),
    payments: z.array(offlineSalePaymentSchema).min(1).max(4),
  })
  .refine(
    (value) => new Set(value.lines.map((line) => line.productId)).size === value.lines.length,
    { message: 'Each product may appear only once per sale', path: ['lines'] },
  );

export type OfflineSalePayload = z.infer<typeof offlineSalePayloadSchema>;

export const syncEventSchema = z.object({
  operationId: resourceIdSchema,
  /** Client-generated sale identifier, kept stable across retries. */
  entityId: resourceIdSchema,
  entityType: z.literal('sale'),
  eventType: z.literal('sale.completed'),
  deviceId: resourceIdSchema,
  clientSequence: z.number().int().min(1),
  occurredAt: z.iso.datetime(),
  payloadVersion: z.literal(1),
  payload: offlineSalePayloadSchema,
});

export type SyncEvent = z.infer<typeof syncEventSchema>;

export const SYNC_MAX_BATCH = 20;

export const syncPushRequestSchema = z.object({
  device: registerDeviceRequestSchema,
  events: z.array(syncEventSchema).min(1).max(SYNC_MAX_BATCH),
});

export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncPushResultSchema = z.object({
  operationId: z.uuid(),
  entityId: z.uuid(),
  status: syncOperationStatusSchema,
  sale: saleSchema.nullable(),
  conflictReason: z.string().nullable(),
  message: z.string().nullable(),
});

export type SyncPushResult = z.infer<typeof syncPushResultSchema>;

export const syncPushResponseSchema = z.object({
  serverTime: z.string(),
  results: z.array(syncPushResultSchema),
});

export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const SYNC_CONFLICT_STATUSES = ['open', 'resolved'] as const;

export const syncConflictStatusSchema = z.enum(SYNC_CONFLICT_STATUSES);

export type SyncConflictStatus = z.infer<typeof syncConflictStatusSchema>;

export const SYNC_CONFLICT_RESOLUTIONS = ['retried', 'dismissed'] as const;

export const syncConflictResolutionSchema = z.enum(SYNC_CONFLICT_RESOLUTIONS);

export type SyncConflictResolution = z.infer<typeof syncConflictResolutionSchema>;

export const syncConflictSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  operationId: z.uuid(),
  deviceId: z.uuid(),
  /** Cashier who captured the sale, retained when a manager retries the posting. */
  cashierId: z.uuid().nullable(),
  entityId: z.uuid(),
  reason: z.string(),
  details: z.string().nullable(),
  /** Captured terminal payload; null for conflicts recorded before payload storage. */
  payload: offlineSalePayloadSchema.nullable(),
  status: syncConflictStatusSchema,
  resolution: syncConflictResolutionSchema.nullable(),
  resolutionNote: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.uuid().nullable(),
  createdAt: z.string(),
});

export type SyncConflict = z.infer<typeof syncConflictSchema>;

export const SYNC_CONFLICT_REASONS = ['insufficient_stock', 'rejected_operation'] as const;

export const syncConflictReasonSchema = z.enum(SYNC_CONFLICT_REASONS);

export type SyncConflictReason = z.infer<typeof syncConflictReasonSchema>;

/**
 * Dismissing a conflict is a financial decision (the cashier already took
 * payment), so the reviewer must record why the sale was not posted (plan §5).
 */
export const resolveSyncConflictRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('retry'),
    note: z.string().trim().max(500).optional(),
  }),
  z.object({
    action: z.literal('dismiss'),
    note: z.string().trim().min(3, 'Explain how the cash sale was settled').max(500),
  }),
]);

export type ResolveSyncConflictRequest = z.infer<typeof resolveSyncConflictRequestSchema>;

export const resolveSyncConflictResponseSchema = z.object({
  conflict: syncConflictSchema,
  sale: saleSchema.nullable(),
});

export type ResolveSyncConflictResponse = z.infer<typeof resolveSyncConflictResponseSchema>;

export const syncPullQuerySchema = z.object({
  deviceId: resourceIdSchema,
  cursor: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

export const syncPullItemSchema = z.object({
  sequence: z.number().int(),
  operationId: z.uuid(),
  entityId: z.uuid(),
  status: syncOperationStatusSchema,
  sale: saleSchema.nullable(),
  conflictReason: z.string().nullable(),
});

export type SyncPullItem = z.infer<typeof syncPullItemSchema>;

export const syncPullResponseSchema = z.object({
  cursor: z.number().int(),
  serverTime: z.string(),
  items: z.array(syncPullItemSchema),
});

export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;
