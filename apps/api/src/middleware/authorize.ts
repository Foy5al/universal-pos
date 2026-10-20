import type { NextFunction, Request, Response } from 'express';

import { hasAllPermissions, type Permission } from '@pos/contracts';

import { forbidden } from '../core/errors';
import { requirePrincipal } from '../http/requirePrincipal';

/**
 * Server-side authorization gate. Permissions are always checked on the server;
 * the UI hiding a control is never sufficient (ADR-0002).
 */
export function authorize(...required: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = requirePrincipal(req);
    if (!hasAllPermissions(principal.permissions, required)) {
      next(forbidden('Missing required permission'));
      return;
    }
    next();
  };
}

export function authorizeAny(...allowed: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const principal = requirePrincipal(req);
    if (!allowed.some((permission) => principal.permissions.includes(permission))) {
      next(forbidden('Missing required permission'));
      return;
    }
    next();
  };
}
