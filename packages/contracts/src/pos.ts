import { z } from 'zod';

/**
 * The verifier is cached by terminals so an item can still be removed offline.
 * The removal password is a procedural control, not an authentication secret.
 */
export const removalPasswordVerifierSchema = z.object({
  algorithm: z.literal('pbkdf2-sha256'),
  salt: z.string().min(1),
  hash: z.string().min(1),
  iterations: z.number().int().positive(),
});

export type RemovalPasswordVerifier = z.infer<typeof removalPasswordVerifierSchema>;

export const posSettingsSchema = z.object({
  organizationId: z.uuid(),
  requireRemovalPassword: z.boolean(),
  removalPasswordSet: z.boolean(),
  /** Only exposed while protection is enabled. */
  removalPasswordVerifier: removalPasswordVerifierSchema.nullable(),
  updatedAt: z.string().nullable(),
});

export type PosSettings = z.infer<typeof posSettingsSchema>;

export const updatePosSettingsRequestSchema = z.object({
  requireRemovalPassword: z.boolean(),
  /** Omit to keep the current password; send a new one to replace it. */
  removalPassword: z.string().min(6).max(200).optional(),
});

export type UpdatePosSettingsRequest = z.infer<typeof updatePosSettingsRequestSchema>;
