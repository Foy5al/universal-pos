import { pbkdf2, randomBytes } from 'node:crypto';

export const REMOVAL_PASSWORD_ITERATIONS = 120_000;
export const REMOVAL_PASSWORD_KEY_BYTES = 32;

export interface RemovalPasswordVerifier {
  algorithm: 'pbkdf2-sha256';
  salt: string;
  hash: string;
  iterations: number;
}

function derive(password: string, salt: Buffer, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, REMOVAL_PASSWORD_KEY_BYTES, 'sha256', (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Builds the verifier cached by terminals for offline removal checks. PBKDF2 is
 * used because both Node and Web Crypto can derive it with the same parameters.
 */
export async function createRemovalPasswordVerifier(
  password: string,
): Promise<RemovalPasswordVerifier> {
  if (password.length < 6) {
    throw new RangeError('Removal password must be at least 6 characters');
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt, REMOVAL_PASSWORD_ITERATIONS);
  return {
    algorithm: 'pbkdf2-sha256',
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
    iterations: REMOVAL_PASSWORD_ITERATIONS,
  };
}
