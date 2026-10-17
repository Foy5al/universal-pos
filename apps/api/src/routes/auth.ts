import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { loginRequestSchema, successEnvelope } from '@pos/contracts';

import { requirePrincipal } from '../http/requirePrincipal';
import type { AuthService } from '../services/authService';

/** Public login handler; mounted outside the authenticated router. */
export function createLoginHandler(auth: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = loginRequestSchema.parse(req.body);
      const result = await auth.login(input);
      res.json(successEnvelope({ token: result.token, user: result.user }));
    } catch (error) {
      next(error);
    }
  };
}

/** Authenticated auth routes: current session and logout. */
export function createAuthRouter(auth: AuthService): Router {
  const router = Router();

  router.get('/auth/session', (req, res) => {
    res.json(successEnvelope({ user: requirePrincipal(req) }));
  });

  router.post('/auth/logout', async (req, res, next) => {
    try {
      const header = req.header('authorization') ?? '';
      const token = header.split(' ')[1];
      if (token) {
        await auth.logout(token);
      }
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
