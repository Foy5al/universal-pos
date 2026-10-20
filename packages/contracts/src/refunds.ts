import { z } from 'zod';

import { resourceIdSchema } from './pagination';

export const createRefundRequestSchema = z.object({
  /** Client-generated idempotency key; repeated submissions return the same refund. */
  operationId: resourceIdSchema,
  registerShiftId: resourceIdSchema,
  reason: z.string().trim().min(3).max(240),
});

export type CreateRefundRequest = z.infer<typeof createRefundRequestSchema>;

export const refundLineSchema = z.object({
  id: z.uuid(),
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  quantity: z.string(),
  unitPriceMinor: z.number().int(),
  lineTotalMinor: z.number().int(),
});

export type RefundLine = z.infer<typeof refundLineSchema>;

export const refundSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  saleId: z.uuid(),
  registerShiftId: z.uuid(),
  refundNumber: z.string(),
  operationId: z.uuid(),
  amountMinor: z.number().int(),
  reason: z.string(),
  createdBy: z.uuid(),
  createdAt: z.string(),
  lines: z.array(refundLineSchema),
});

export type Refund = z.infer<typeof refundSchema>;
