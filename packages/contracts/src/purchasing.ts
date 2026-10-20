import { z } from 'zod';

import { listQuerySchema, resourceIdSchema } from './pagination';

const nameSchema = z.string().trim().min(1).max(160);
const optionalText = (max: number) => z.string().trim().min(1).max(max).optional();
const moneyMinorSchema = z.number().int().min(0).max(1_000_000_000_000);

/** Positive quantity, at most four fractional digits (exact decimal, ADR-0003). */
export const positiveQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,4})?$/, 'Quantity must be positive with at most 4 fractional digits')
  .refine((value) => !/^0(\.0+)?$/.test(value), 'Quantity must be greater than zero');

export const supplierSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  contactName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type Supplier = z.infer<typeof supplierSchema>;

export const createSupplierRequestSchema = z.object({
  name: nameSchema,
  contactName: optionalText(160),
  phone: optionalText(32),
  email: z.email().max(200).optional(),
  address: optionalText(400),
  isActive: z.boolean().optional(),
});

export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;

export const updateSupplierRequestSchema = createSupplierRequestSchema.partial();

export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;

export const supplierProductSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  supplierId: z.uuid(),
  productId: z.uuid(),
  supplierSku: z.string().nullable(),
  unitCostMinor: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export type SupplierProduct = z.infer<typeof supplierProductSchema>;

export const addSupplierProductRequestSchema = z.object({
  productId: resourceIdSchema,
  supplierSku: z.string().trim().min(1).max(80).optional(),
  unitCostMinor: moneyMinorSchema,
  isActive: z.boolean().optional(),
});

export type AddSupplierProductRequest = z.infer<typeof addSupplierProductRequestSchema>;

export const supplierProductListQuerySchema = listQuerySchema;

export type SupplierProductListQuery = z.infer<typeof supplierProductListQuerySchema>;

export const RESTOCK_REQUEST_STATUSES = [
  'pending',
  'scheduled',
  'fulfilled',
  'dismissed',
] as const;

export const restockRequestStatusSchema = z.enum(RESTOCK_REQUEST_STATUSES);

export type RestockRequestStatus = z.infer<typeof restockRequestStatusSchema>;

export const restockRequestSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  locationId: z.uuid(),
  productId: z.uuid(),
  requestedByUserId: z.uuid(),
  requestedByName: z.string(),
  requestedQuantity: z.string(),
  note: z.string().nullable(),
  status: restockRequestStatusSchema,
  purchaseOrderId: z.uuid().nullable(),
  purchaseOrderLineId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RestockRequest = z.infer<typeof restockRequestSchema>;

export const createRestockRequestSchema = z.object({
  locationId: resourceIdSchema,
  productId: resourceIdSchema,
  quantity: positiveQuantitySchema,
  note: z.string().trim().max(400).optional(),
});

export type CreateRestockRequest = z.infer<typeof createRestockRequestSchema>;

export const restockRequestListQuerySchema = listQuerySchema.extend({
  status: restockRequestStatusSchema.optional(),
  locationId: resourceIdSchema.optional(),
});

export type RestockRequestListQuery = z.infer<typeof restockRequestListQuerySchema>;

export const updateRestockRequestSchema = z.object({
  status: z.literal('dismissed'),
});

export type UpdateRestockRequest = z.infer<typeof updateRestockRequestSchema>;

export const PURCHASE_ORDER_STATUSES = [
  'draft',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
] as const;

export const purchaseOrderStatusSchema = z.enum(PURCHASE_ORDER_STATUSES);

export type PurchaseOrderStatus = z.infer<typeof purchaseOrderStatusSchema>;

export const purchaseOrderLineRequestSchema = z.object({
  productId: resourceIdSchema,
  quantity: positiveQuantitySchema,
  unitCostMinor: moneyMinorSchema,
});

export type PurchaseOrderLineRequest = z.infer<typeof purchaseOrderLineRequestSchema>;

export const createPurchaseOrderRequestSchema = z.object({
  supplierId: resourceIdSchema,
  locationId: resourceIdSchema,
  notes: z.string().trim().max(400).optional(),
  lines: z.array(purchaseOrderLineRequestSchema).min(1).max(200),
  restockRequestIds: z.array(resourceIdSchema).max(100).optional(),
});

export type CreatePurchaseOrderRequest = z.infer<typeof createPurchaseOrderRequestSchema>;

export const purchaseOrderLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  quantity: z.string(),
  receivedQuantity: z.string(),
  unitCostMinor: z.number().int(),
  lineTotalMinor: z.number().int(),
});

export type PurchaseOrderLine = z.infer<typeof purchaseOrderLineSchema>;

export const purchaseOrderSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  supplierId: z.uuid(),
  locationId: z.uuid(),
  status: purchaseOrderStatusSchema,
  notes: z.string().nullable(),
  totalMinor: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(purchaseOrderLineSchema),
});

export type PurchaseOrder = z.infer<typeof purchaseOrderSchema>;

export const purchaseOrderListQuerySchema = listQuerySchema.extend({
  supplierId: resourceIdSchema.optional(),
  status: purchaseOrderStatusSchema.optional(),
});

export type PurchaseOrderListQuery = z.infer<typeof purchaseOrderListQuerySchema>;

export const updatePurchaseOrderStatusRequestSchema = z.object({
  status: z.enum(['ordered', 'cancelled']),
});

export type UpdatePurchaseOrderStatusRequest = z.infer<
  typeof updatePurchaseOrderStatusRequestSchema
>;

export const goodsReceiptLineRequestSchema = z.object({
  purchaseOrderLineId: resourceIdSchema,
  quantity: positiveQuantitySchema,
});

export type GoodsReceiptLineRequest = z.infer<typeof goodsReceiptLineRequestSchema>;

export const receivePurchaseOrderRequestSchema = z.object({
  lines: z.array(goodsReceiptLineRequestSchema).min(1).max(200),
  notes: z.string().trim().max(400).optional(),
});

export type ReceivePurchaseOrderRequest = z.infer<typeof receivePurchaseOrderRequestSchema>;

export const goodsReceiptSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  purchaseOrderId: z.uuid(),
  locationId: z.uuid(),
  receivedAt: z.string(),
});

export type GoodsReceipt = z.infer<typeof goodsReceiptSchema>;

export const purchaseReceiveResultSchema = z.object({
  receipt: goodsReceiptSchema,
  purchaseOrder: purchaseOrderSchema,
});

export type PurchaseReceiveResult = z.infer<typeof purchaseReceiveResultSchema>;
