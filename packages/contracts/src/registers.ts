import { z } from 'zod';

import { listQuerySchema, resourceIdSchema } from './pagination';

const moneyMinorSchema = z.number().int().min(0).max(1_000_000_000_000);

export const registerSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  storeId: z.uuid(),
  name: z.string(),
  code: z.string(),
});

export type Register = z.infer<typeof registerSchema>;

export const createRegisterRequestSchema = z.object({
  storeId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, dashes or underscores'),
});

export type CreateRegisterRequest = z.infer<typeof createRegisterRequestSchema>;

export const REGISTER_SHIFT_STATUSES = ['open', 'closed'] as const;

export const registerShiftStatusSchema = z.enum(REGISTER_SHIFT_STATUSES);

export type RegisterShiftStatus = z.infer<typeof registerShiftStatusSchema>;

export const CASH_MOVEMENT_TYPES = ['in', 'out'] as const;

export const cashMovementTypeSchema = z.enum(CASH_MOVEMENT_TYPES);

export type CashMovementType = z.infer<typeof cashMovementTypeSchema>;

export const cashMovementSchema = z.object({
  id: z.uuid(),
  shiftId: z.uuid(),
  type: cashMovementTypeSchema,
  amountMinor: z.number().int(),
  reason: z.string(),
  createdBy: z.uuid(),
  createdAt: z.string(),
});

export type CashMovement = z.infer<typeof cashMovementSchema>;

export const registerShiftSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  storeId: z.uuid(),
  registerId: z.uuid(),
  status: registerShiftStatusSchema,
  openingFloatMinor: z.number().int(),
  cashSalesMinor: z.number().int(),
  cashRefundsMinor: z.number().int(),
  cashInMinor: z.number().int(),
  cashOutMinor: z.number().int(),
  expectedCashMinor: z.number().int(),
  countedCashMinor: z.number().int().nullable(),
  varianceMinor: z.number().int().nullable(),
  openedBy: z.uuid(),
  closedBy: z.uuid().nullable(),
  openedAt: z.string(),
  closedAt: z.string().nullable(),
  notes: z.string().nullable(),
});

export type RegisterShift = z.infer<typeof registerShiftSchema>;

export const openRegisterShiftRequestSchema = z.object({
  registerId: resourceIdSchema,
  openingFloatMinor: moneyMinorSchema.default(0),
});

export type OpenRegisterShiftRequest = z.infer<typeof openRegisterShiftRequestSchema>;

export const addCashMovementRequestSchema = z.object({
  type: cashMovementTypeSchema,
  amountMinor: moneyMinorSchema.min(1, 'Cash movement must be greater than zero'),
  reason: z.string().trim().min(3).max(200),
});

export type AddCashMovementRequest = z.infer<typeof addCashMovementRequestSchema>;

export const closeRegisterShiftRequestSchema = z.object({
  countedCashMinor: moneyMinorSchema,
  notes: z.string().trim().max(500).optional(),
});

export type CloseRegisterShiftRequest = z.infer<typeof closeRegisterShiftRequestSchema>;

export const registerShiftListQuerySchema = listQuerySchema.extend({
  registerId: resourceIdSchema.optional(),
  status: registerShiftStatusSchema.optional(),
});

export type RegisterShiftListQuery = z.infer<typeof registerShiftListQuerySchema>;
