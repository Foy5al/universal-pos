import type { RemovalPasswordVerifier } from '@pos/contracts';

const encoder = new TextEncoder();

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return mismatch === 0;
}

/**
 * Runs entirely on the terminal so a cashier can correct a line while offline.
 * The server stores the same PBKDF2 verifier; the password itself never leaves
 * the dialog.
 */
export async function verifyRemovalPassword(
  password: string,
  verifier: RemovalPasswordVerifier,
): Promise<boolean> {
  if (
    verifier.algorithm !== 'pbkdf2-sha256' ||
    verifier.iterations < 10_000 ||
    verifier.iterations > 1_000_000
  ) {
    return false;
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser cannot verify the removal password.');
  }
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: fromBase64(verifier.salt),
      iterations: verifier.iterations,
      hash: 'SHA-256',
    },
    key,
    256,
  );
  return constantTimeEqual(new Uint8Array(derived), fromBase64(verifier.hash));
}
