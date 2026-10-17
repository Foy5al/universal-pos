import { hash, verify } from '@node-rs/argon2';

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(hashed: string, plain: string): Promise<boolean>;
}

// Argon2id (the @node-rs/argon2 default) with OWASP-recommended baseline
// parameters (ADR-0009).
const HASH_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return hash(plain, HASH_OPTIONS);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain);
    } catch {
      return false;
    }
  }
}
