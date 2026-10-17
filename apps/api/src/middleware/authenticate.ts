import type { NextFunction, Request, Response } from 'express';

import { unauthorized } from '../core/errors';
import type { SessionResolver } from '../core/sessionResolver';

export function authenticate(resolver: SessionResolver) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      next(unauthorized('Missing bearer token'));
      return;
    }

    const principal = await resolver.resolve(token);
    if (!principal) {
      next(unauthorized('Invalid or expired session'));
      return;
    }

    req.principal = principal;
    next();
  };
}
