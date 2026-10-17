import { createHash, randomBytes } from 'node:crypto';

export interface TokenService {
  /** Generates an opaque, high-entropy session token. */
  generate(): string;
  /** Hashes a token for at-rest storage; raw tokens are never persisted. */
  hash(token: string): string;
}

export class OpaqueTokenService implements TokenService {
  generate(): string {
    return randomBytes(32).toString('base64url');
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
