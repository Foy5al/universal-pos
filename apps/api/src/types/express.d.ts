import type { Principal } from '../core/principal';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

export {};
