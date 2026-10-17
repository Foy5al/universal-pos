import type { Principal } from '@pos/contracts';
import type { AuthorizationRepository, SessionRepository } from '@pos/db';

import type { TokenService } from './tokenService';

export interface SessionResolver {
  resolve(token: string): Promise<Principal | null>;
}

/**
 * Resolves a bearer token to the current principal by hashing the token,
 * loading the active session, then re-deriving the principal from roles.
 * Re-deriving means permission or membership changes take effect immediately.
 */
export class RepositorySessionResolver implements SessionResolver {
  constructor(
    private readonly deps: {
      sessions: SessionRepository;
      authorization: AuthorizationRepository;
      tokens: TokenService;
      now?: () => Date;
    },
  ) {}

  async resolve(token: string): Promise<Principal | null> {
    const tokenHash = this.deps.tokens.hash(token);
    const session = await this.deps.sessions.findActiveByTokenHash(tokenHash, this.now());
    if (!session) {
      return null;
    }
    return this.deps.authorization.loadPrincipal(session.userId, session.organizationId);
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
