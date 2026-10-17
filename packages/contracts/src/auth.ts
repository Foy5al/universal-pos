import { z } from 'zod';

import { permissionSchema } from './permissions';

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
  organizationSlug: z.string().min(1).max(80).optional(),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const sessionUserSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  organizationId: z.uuid(),
  storeIds: z.array(z.uuid()),
  permissions: z.array(permissionSchema),
});

export type SessionUser = z.infer<typeof sessionUserSchema>;

/**
 * The authenticated request principal. Structurally identical to a session
 * user; the server derives it from the session, never from client input.
 */
export type Principal = SessionUser;

export const sessionResponseSchema = z.object({ user: sessionUserSchema });

export type SessionResponse = z.infer<typeof sessionResponseSchema>;
