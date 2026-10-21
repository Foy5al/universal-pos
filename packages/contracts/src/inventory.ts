import { z } from 'zod';

import { listQuerySchema, resourceIdSchema } from './pagination';

export const quantityStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d{1,12}(\.\d{1,4})?$/, 'Quantity must have at most 4 fractional digits');

export const stockLocationSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  storeId: z.uuid().nullable(),
  name: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type StockLocation = z.infer<typeof stockLocationSchema>;

export const createStockLocationRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  storeId: resourceIdSchema.optional(),
  isActive: z.boolean().optional(),
});

export type CreateStockLocationRequest = z.infer<typeof createStockLocationRequestSchema>;

export const updateStockLocationRequestSchema = createStockLocationRequestSchema.partial();

export type UpdateStockLocationRequest = z.infer<typeof updateStockLocationRequestSchema>;

export const stockBalanceSchema = z.object({
  locationId: z.uuid(),
  productId: z.uuid(),
  quantity: z.string(),
  updatedAt: z.string(),
});

export type StockBalance = z.infer<typeof stockBalanceSchema>;

export const STOCK_MOVEMENT_TYPES = ['adjustment', 'receipt', 'issue', 'return'] as const;

export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

export const STOCK_LOSS_REASONS = ['damaged', 'defective', 'expired', 'lost', 'other'] as const;

export const stockLossReasonSchema = z.enum(STOCK_LOSS_REASONS);

export type StockLossReason = z.infer<typeof stockLossReasonSchema>;

export const stockMovementSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  locationId: z.uuid(),
  productId: z.uuid(),
  movementType: stockMovementTypeSchema,
  quantityDelta: z.string(),
  balanceAfter: z.string(),
  reason: z.string().nullable(),
  lossReason: stockLossReasonSchema.nullable(),
  expiresOn: z.string().nullable(),
  unitCostMinor: z.number().int().nullable(),
  occurredAt: z.string(),
  createdAt: z.string(),
});

export type StockMovement = z.infer<typeof stockMovementSchema>;

export const createStockAdjustmentRequestSchema = z.object({
  locationId: resourceIdSchema,
  productId: resourceIdSchema,
  quantityDelta: quantityStringSchema.refine(
    (value) => !/^-?0(\.0+)?$/.test(value),
    'Quantity delta must not be zero',
  ),
  reason: z.string().trim().min(1).max(200),
});

export type CreateStockAdjustmentRequest = z.infer<typeof createStockAdjustmentRequestSchema>;

export const createStockLossRequestSchema = z.object({
  locationId: resourceIdSchema,
  productId: resourceIdSchema,
  quantity: quantityStringSchema.refine(
    (value) => !/^-?0(\.0+)?$/.test(value) && !value.startsWith('-'),
    'Quantity must be greater than zero',
  ),
  reason: stockLossReasonSchema,
  note: z.string().trim().max(500).optional(),
  expiresOn: z.iso.date().optional(),
});

export type CreateStockLossRequest = z.infer<typeof createStockLossRequestSchema>;

export const stockLossListQuerySchema = listQuerySchema.extend({
  locationId: resourceIdSchema.optional(),
  productId: resourceIdSchema.optional(),
  reason: stockLossReasonSchema.optional(),
});

export type StockLossListQuery = z.infer<typeof stockLossListQuerySchema>;

export const inventoryListQuerySchema = listQuerySchema.extend({
  locationId: resourceIdSchema.optional(),
  productId: resourceIdSchema.optional(),
});

export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;

/** Thresholds are quantities, so they keep exact decimal precision like stock. */
export const lowStockThresholdSchema = quantityStringSchema.refine(
  (value) => !value.startsWith('-'),
  'Low stock threshold must be zero or more',
);

export const lowStockSettingsSchema = z.object({
  organizationId: z.uuid(),
  globalThreshold: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type LowStockSettings = z.infer<typeof lowStockSettingsSchema>;

export const updateLowStockSettingsRequestSchema = z.object({
  globalThreshold: lowStockThresholdSchema.nullable(),
});

export type UpdateLowStockSettingsRequest = z.infer<typeof updateLowStockSettingsRequestSchema>;

export const LOW_STOCK_SOURCES = ['product', 'global'] as const;

export const lowStockSourceSchema = z.enum(LOW_STOCK_SOURCES);

export type LowStockSource = z.infer<typeof lowStockSourceSchema>;

export const lowStockAlertSchema = z.object({
  productId: z.uuid(),
  name: z.string(),
  sku: z.string(),
  onHand: z.string(),
  threshold: z.string(),
  source: lowStockSourceSchema,
});

export type LowStockAlert = z.infer<typeof lowStockAlertSchema>;

export const productLowStockThresholdSchema = z.object({
  productId: z.uuid(),
  threshold: z.string(),
});

export type ProductLowStockThreshold = z.infer<typeof productLowStockThresholdSchema>;

export const lowStockOverviewSchema = z.object({
  locationId: z.uuid().nullable(),
  globalThreshold: z.string().nullable(),
  items: z.array(lowStockAlertSchema),
  /** Product-level overrides currently configured, even when stock is healthy. */
  productThresholds: z.array(productLowStockThresholdSchema),
});

export type LowStockOverview = z.infer<typeof lowStockOverviewSchema>;

export const lowStockQuerySchema = z.object({ locationId: resourceIdSchema.optional() });

export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;

export const setProductLowStockThresholdRequestSchema = z.object({
  threshold: lowStockThresholdSchema.nullable(),
});

export type SetProductLowStockThresholdRequest = z.infer<
  typeof setProductLowStockThresholdRequestSchema
>;

export const setProductLowStockThresholdResultSchema = z.object({
  productId: z.uuid(),
  threshold: z.string().nullable(),
});

export type SetProductLowStockThresholdResult = z.infer<
  typeof setProductLowStockThresholdResultSchema
>;
