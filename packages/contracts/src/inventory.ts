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

export const STOCK_MOVEMENT_TYPES = ['adjustment', 'receipt', 'issue'] as const;

export const stockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);

export type StockMovementType = z.infer<typeof stockMovementTypeSchema>;

export const stockMovementSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  locationId: z.uuid(),
  productId: z.uuid(),
  movementType: stockMovementTypeSchema,
  quantityDelta: z.string(),
  balanceAfter: z.string(),
  reason: z.string().nullable(),
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

export const inventoryListQuerySchema = listQuerySchema.extend({
  locationId: resourceIdSchema.optional(),
  productId: resourceIdSchema.optional(),
});

export type InventoryListQuery = z.infer<typeof inventoryListQuerySchema>;
