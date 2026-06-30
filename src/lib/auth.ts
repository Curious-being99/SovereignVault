import { UserProfile } from './db';

// Securely hash a password with individual salt using PBKDF2 RFC 2898
export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Securely hash a password with individual salt using PBKDF2 RFC 2898
export async function getDeterministicSalt(username: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const usernameBuffer = encoder.encode(username.toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', usernameBuffer);
  return new Uint8Array(hashBuffer).slice(0, 16);
}

// Securely hash a password with individual salt using PBKDF2 RFC 2898
export async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    256 // length in bits
  );

  return bufferToHex(derivedBits);
}

// Generate random salt (legacy, for new accounts if we still want randomness, but for this specific request we want deterministic)
export function generateSalt(length = 16): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}
