import { z } from 'zod';

/** Bounded offset pagination for list endpoints. */
export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export const resourceIdSchema = z.uuid();

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export function page<T>(items: T[], total: number, query: ListQuery): Page<T> {
  return { items, total, limit: query.limit, offset: query.offset };
}
