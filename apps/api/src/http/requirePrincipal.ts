import type { Request } from 'express';

import { unauthorized } from '../core/errors';
import type { Principal } from '../core/principal';

export function requirePrincipal(req: Request): Principal {
  if (!req.principal) {
    throw unauthorized();
  }
  return req.principal;
}
