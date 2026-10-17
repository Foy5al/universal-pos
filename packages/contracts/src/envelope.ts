import { z } from 'zod';

export const API_ERROR_CODES = [
  'bad_request',
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  code: z.enum(API_ERROR_CODES),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiErrorEnvelopeSchema = z.object({ error: apiErrorSchema });

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal_error: 500,
};

export function successEnvelope<T>(data: T): { data: T } {
  return { data };
}

export function errorEnvelope(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): ApiErrorEnvelope {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}
