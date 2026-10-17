import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

import { API_ERROR_STATUS, errorEnvelope } from '@pos/contracts';

import { AppError } from '../core/errors';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(errorEnvelope('not_found', 'Route not found'));
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(API_ERROR_STATUS[err.code]).json(errorEnvelope(err.code, err.message, err.details));
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json(errorEnvelope('validation_error', 'Validation failed', err.issues));
    return;
  }

  console.error(err);
  res.status(500).json(errorEnvelope('internal_error', 'Internal server error'));
}
