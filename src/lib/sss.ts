/**
 * Shamir's Secret Sharing (SSS) implementation for Sovereign Vault.
 * This module provides functions to split a secret (buffer) into N shares,
 * requiring K shares to reconstruct the original secret.
 * 
 * Uses a Finite Field GF(256) for byte-wise operations.
 */

// Primitive polynomial for GF(256): x^8 + x^4 + x^3 + x^2 + 1 (0x11d)
const PRIMITIVE = 0x11d;

// Log and Exponent tables for fast multiplication in GF(256)
const logTable = new Uint8Array(256);
const expTable = new Uint8Array(256);

(function initGF256() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    expTable[i] = x;
    logTable[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIMITIVE;
  }
  // expTable[255] is same as expTable[0] for cyclic properties
  expTable[255] = expTable[0];
})();

function multiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return expTable[(logTable[a] + logTable[b]) % 255];
}

function divide(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero in GF(256)");
  if (a === 0) return 0;
  return expTable[(logTable[a] - logTable[b] + 255) % 255];
}

/**
 * Evaluates a polynomial at x using Horner's method.
 * coefficients[0] is the constant term (the secret byte).
 */
function evaluatePolynomial(coefficients: number[], x: number): number {
  if (x === 0) return coefficients[0];
  let result = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) {
    result = multiply(result, x) ^ coefficients[i];
  }
  return result;
}

export interface SSSShare {
  x: number;
  data: Uint8Array;
}

/**
 * Splits a secret buffer into n shares, requiring k to reconstruct.
 */
export function split(secret: Uint8Array, n: number, k: number): SSSShare[] {
  if (k > n) throw new Error("Threshold k cannot be greater than n");
  if (k < 1) throw new Error("Threshold k must be at least 1");
  if (n > 255) throw new Error("Maximum 255 shares supported in GF(256)");

  const shares: SSSShare[] = [];
  for (let i = 1; i <= n; i++) {
    shares.push({ x: i, data: new Uint8Array(secret.length) });
  }

  // Process each byte of the secret
  for (let i = 0; i < secret.length; i++) {
    const coefficients = new Uint8Array(k);
    coefficients[0] = secret[i];
    // Fill remaining coefficients with random values
    for (let j = 1; j < k; j++) {
      coefficients[j] = Math.floor(Math.random() * 256);
    }

    // Generate shares for this byte
    for (let j = 0; j < n; j++) {
      shares[j].data[i] = evaluatePolynomial(Array.from(coefficients), shares[j].x);
    }
  }

  return shares;
}

/**
 * Reconstructs a secret from a list of shares.
 */
export function reconstruct(shares: SSSShare[]): Uint8Array {
  if (shares.length === 0) throw new Error("No shares provided");
  const secretLength = shares[0].data.length;
  const secret = new Uint8Array(secretLength);

  for (let i = 0; i < secretLength; i++) {
    let result = 0;
    for (let j = 0; j < shares.length; j++) {
      let weight = 1;
      for (let m = 0; m < shares.length; m++) {
        if (j === m) continue;
        const numerator = shares[m].x;
        const denominator = shares[m].x ^ shares[j].x;
        weight = multiply(weight, divide(numerator, denominator));
      }
      result ^= multiply(weight, shares[j].data[i]);
    }
    secret[i] = result;
  }

  return secret;
}
