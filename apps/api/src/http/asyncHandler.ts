import type { NextFunction, Request, Response } from 'express';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Wraps an async Express handler so rejected promises reach the error middleware. */
export function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
