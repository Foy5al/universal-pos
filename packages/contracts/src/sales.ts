import { z } from 'zod';

import { listQuerySchema, resourceIdSchema } from './pagination';

const moneyMinorSchema = z.number().int().min(0).max(1_000_000_000_000);

/** Positive quantity, at most four fractional digits (exact decimal, ADR-0003). */
export const saleQuantitySchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,4})?$/, 'Quantity must be positive with at most 4 fractional digits')
  .refine((value) => !/^0(\.0+)?$/.test(value), 'Quantity must be greater than zero');

export const SALE_STATUSES = ['completed', 'voided'] as const;

export const saleStatusSchema = z.enum(SALE_STATUSES);

export type SaleStatus = z.infer<typeof saleStatusSchema>;

/** Only cash may settle an online sale until provider adapters exist. */
export const SALE_PAYMENT_METHODS = ['cash'] as const;

export const salePaymentMethodSchema = z.enum(SALE_PAYMENT_METHODS);

export type SalePaymentMethod = z.infer<typeof salePaymentMethodSchema>;

export const createSaleLineRequestSchema = z.object({
  productId: resourceIdSchema,
  quantity: saleQuantitySchema,
});

export type CreateSaleLineRequest = z.infer<typeof createSaleLineRequestSchema>;

export const createSalePaymentRequestSchema = z.object({
  method: salePaymentMethodSchema,
  tenderedMinor: moneyMinorSchema.min(1, 'Payment must be greater than zero'),
});

export type CreateSalePaymentRequest = z.infer<typeof createSalePaymentRequestSchema>;

export const createSaleRequestSchema = z
  .object({
    /** Client-generated idempotency key; repeated submissions return the same sale. */
    operationId: resourceIdSchema,
    locationId: resourceIdSchema,
    registerShiftId: resourceIdSchema,
    customerName: z.string().trim().max(160).optional(),
    lines: z.array(createSaleLineRequestSchema).min(1).max(200),
    payments: z.array(createSalePaymentRequestSchema).min(1).max(4),
  })
  .refine(
    (value) => new Set(value.lines.map((line) => line.productId)).size === value.lines.length,
    { message: 'Each product may appear only once per sale', path: ['lines'] },
  );

export type CreateSaleRequest = z.infer<typeof createSaleRequestSchema>;

export const saleLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  quantity: z.string(),
  unitPriceMinor: z.number().int(),
  lineTotalMinor: z.number().int(),
});

export type SaleLine = z.infer<typeof saleLineSchema>;

export const salePaymentSchema = z.object({
  id: z.uuid(),
  method: salePaymentMethodSchema,
  amountMinor: z.number().int(),
});

export type SalePayment = z.infer<typeof salePaymentSchema>;

export const saleSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  locationId: z.uuid(),
  saleNumber: z.string(),
  operationId: z.uuid(),
  registerShiftId: z.uuid().nullable(),
  status: saleStatusSchema,
  customerName: z.string().nullable(),
  currency: z.string(),
  subtotalMinor: z.number().int(),
  discountMinor: z.number().int(),
  taxMinor: z.number().int(),
  totalMinor: z.number().int(),
  paidMinor: z.number().int(),
  changeMinor: z.number().int(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  lines: z.array(saleLineSchema),
  payments: z.array(salePaymentSchema),
});

export type Sale = z.infer<typeof saleSchema>;

export const saleListQuerySchema = listQuerySchema.extend({
  locationId: resourceIdSchema.optional(),
});

export type SaleListQuery = z.infer<typeof saleListQuerySchema>;



