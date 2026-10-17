import type { ApiErrorCode } from '@pos/contracts';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Unauthorized'): AppError =>
  new AppError('unauthorized', message);

export const forbidden = (message = 'Forbidden'): AppError => new AppError('forbidden', message);

export const notFound = (message = 'Not found'): AppError => new AppError('not_found', message);

export const badRequest = (message = 'Bad request'): AppError =>
  new AppError('bad_request', message);
