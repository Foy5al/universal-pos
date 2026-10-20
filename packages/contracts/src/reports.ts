import { z } from 'zod';

import { resourceIdSchema } from './pagination';
import { registerShiftSchema } from './registers';

export const reportRangeQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  locationId: resourceIdSchema.optional(),
});

export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const salesDaySummarySchema = z.object({
  date: z.string(),
  saleCount: z.number().int(),
  refundCount: z.number().int(),
  grossSalesMinor: z.number().int(),
  refundsMinor: z.number().int(),
  netSalesMinor: z.number().int(),
  unitsSold: z.string(),
});

export type SalesDaySummary = z.infer<typeof salesDaySummarySchema>;

export const salesSummarySchema = z.object({
  from: z.string(),
  to: z.string(),
  locationId: z.uuid().nullable(),
  saleCount: z.number().int(),
  refundCount: z.number().int(),
  grossSalesMinor: z.number().int(),
  refundsMinor: z.number().int(),
  netSalesMinor: z.number().int(),
  averageSaleMinor: z.number().int(),
  unitsSold: z.string(),
  days: z.array(salesDaySummarySchema),
});

export type SalesSummary = z.infer<typeof salesSummarySchema>;

const storeSalesSummarySchema = salesSummarySchema.omit({
  from: true,
  to: true,
  locationId: true,
  days: true,
});

export const reportMovementSummarySchema = z.object({
  count: z.number().int(),
  units: z.string(),
  costValueMinor: z.number().int(),
  missingCostCount: z.number().int(),
});

export type ReportMovementSummary = z.infer<typeof reportMovementSummarySchema>;

export const storeActivitySchema = z.object({
  from: z.string(),
  to: z.string(),
  locationId: z.uuid().nullable(),
  sales: storeSalesSummarySchema,
  losses: reportMovementSummarySchema,
  receiving: reportMovementSummarySchema,
});

export type StoreActivity = z.infer<typeof storeActivitySchema>;

export const shiftReportSchema = z.object({
  type: z.enum(['x', 'z']),
  shift: registerShiftSchema,
  saleCount: z.number().int(),
  refundCount: z.number().int(),
  unitsSold: z.string(),
  grossSalesMinor: z.number().int(),
  refundsMinor: z.number().int(),
  netSalesMinor: z.number().int(),
});

export type ShiftReport = z.infer<typeof shiftReportSchema>;
