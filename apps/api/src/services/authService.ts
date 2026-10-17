import type { LoginRequest, Principal } from '@pos/contracts';
import type {
  AuthorizationRepository,
  MembershipRepository,
  SessionRepository,
  UserRepository,
} from '@pos/db';

import { unauthorized } from '../core/errors';
import type { PasswordHasher } from '../core/passwordHasher';
import type { TokenService } from '../core/tokenService';

export interface LoginResult {
  token: string;
  user: Principal;
}

export interface AuthService {
  login(input: LoginRequest): Promise<LoginResult>;
  logout(token: string): Promise<void>;
}

export interface AuthServiceDeps {
  users: UserRepository;
  memberships: MembershipRepository;
  authorization: AuthorizationRepository;
  sessions: SessionRepository;
  hasher: PasswordHasher;
  tokens: TokenService;
  sessionTtlMs: number;
  now?: () => Date;
}

export class DefaultAuthService implements AuthService {
  private readonly dummyHash: Promise<string>;

  constructor(private readonly deps: AuthServiceDeps) {
    // Verified on unknown-email logins so response timing does not leak account existence.
    this.dummyHash = deps.hasher.hash('__non_existent_account__');
  }

  async login(input: LoginRequest): Promise<LoginResult> {
    const user = await this.deps.users.findActiveByEmail(input.email);
    if (!user) {
      await this.deps.hasher.verify(await this.dummyHash, input.password);
      throw unauthorized('Invalid credentials');
    }

    const passwordValid = await this.deps.hasher.verify(user.passwordHash, input.password);
    if (!passwordValid) {
      throw unauthorized('Invalid credentials');
    }

    const organizationId = await this.resolveOrganization(user.id, input.organizationSlug);
    if (!organizationId) {
      throw unauthorized('No organization access');
    }

    const principal = await this.deps.authorization.loadPrincipal(user.id, organizationId);
    if (!principal) {
      throw unauthorized('No organization access');
    }

    const token = this.deps.tokens.generate();
    const now = this.now();
    await this.deps.sessions.create({
      userId: user.id,
      organizationId,
      tokenHash: this.deps.tokens.hash(token),
      expiresAt: new Date(now.getTime() + this.deps.sessionTtlMs),
    });

    return { token, user: principal };
  }

  async logout(token: string): Promise<void> {
    await this.deps.sessions.revokeByTokenHash(this.deps.tokens.hash(token), this.now());
  }

  private async resolveOrganization(userId: string, slug?: string): Promise<string | null> {
    if (slug) {
      const organization = await this.deps.memberships.findOrganizationBySlug(slug);
      if (!organization) {
        return null;
      }
      return (await this.deps.memberships.isMember(userId, organization.id)) ? organization.id : null;
    }
    const organizationIds = await this.deps.memberships.listOrganizationIds(userId);
    return organizationIds[0] ?? null;
  }

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }
}
