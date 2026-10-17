import { z } from 'zod';

export const organizationIdSchema = z.uuid();
export const storeIdSchema = z.uuid();
export const userIdSchema = z.uuid();
export const registerIdSchema = z.uuid();

export const organizationSchema = z.object({
  id: organizationIdSchema,
  slug: z.string(),
  legalName: z.string(),
  currency: z.string().length(3),
  timezone: z.string(),
  createdAt: z.string().datetime(),
});

export type Organization = z.infer<typeof organizationSchema>;

export const storeSchema = z.object({
  id: storeIdSchema,
  organizationId: organizationIdSchema,
  name: z.string(),
  timezone: z.string(),
  isActive: z.boolean(),
});

export type Store = z.infer<typeof storeSchema>;

/**
 * Request-scoped tenant identity derived from the authenticated session.
 * Never populated from client input; the server owns this value.
 */
export interface TenantContext {
  organizationId: string;
  storeIds: readonly string[];
}
