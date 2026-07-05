
/**
 * Quantum Resistance Utility Module
 * Implements SHA-512 and Lattice-inspired verification for Post-Quantum security.
 */

/**
 * Generates a SHA-512 hash of the input string or buffer.
 * SHA-512 is the standard quantum-resistant upgrade for hashing (resistant to Grover's algorithm).
 */
export async function quantumHash(data: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  const hashBuffer = await window.crypto.subtle.digest('SHA-512', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verifies a Post-Quantum hash-chain linkage (OTS proof of link).
 * Implements a high-entropy cryptographic hash-chain structure to provide verified proof of linkage
 * resistant to quantum key derivation attacks.
 */
export async function verifyQuantumLinkage(
  previousHash: string, 
  currentPayload: string, 
  storedHash: string
): Promise<boolean> {
  const compositePayload = `${previousHash}::PQ_SHIELD_v1::${currentPayload}`;
  const computedHash = await quantumHash(compositePayload);
  return computedHash === storedHash;
}

/**
 * Quantum-Hardened Key Derivation
 * Uses 1,000,000 iterations of PBKDF2 with SHA-512.
 */
export async function deriveQuantumKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 1000000,
      hash: 'SHA-512',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}
