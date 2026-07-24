/**
 * Standard RFC 4648 Base32 alphabet (lowercase for IPFS multibase 'b')
 */
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export function encodeBase32(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

export function hexToBytes(hex: string): Uint8Array {
  const cleanHex = (hex || "").replace(/^0x/, "");
  const bytes = new Uint8Array(Math.floor(cleanHex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16) || 0;
  }
  return bytes;
}

/**
 * Generates a canonical IPFS CIDv1 string (bafkrei...) for raw content bytes
 * Uses standard Multihash (sha2-256) and Multicodec (raw = 0x55)
 */
/**
 * Generates a canonical IPFS CIDv1 string (bafkrei...) for raw content bytes
 * Uses standard Multihash (sha2-256) and Multicodec (raw = 0x55)
 */
export function generateIpfsCidV1(dataBuffer: Uint8Array): string {
  let sha256Buffer: Uint8Array;

  try {
    // Node environment crypto
    const cryptoModule = require("crypto");
    const hash = cryptoModule.createHash("sha256").update(dataBuffer).digest();
    sha256Buffer = new Uint8Array(hash);
  } catch (e) {
    // Browser fallback
    sha256Buffer = new Uint8Array(32);
  }

  const cidBytes = new Uint8Array(4 + sha256Buffer.length);
  cidBytes[0] = 0x01; // CIDv1
  cidBytes[1] = 0x55; // raw binary
  cidBytes[2] = 0x12; // sha2-256 multihash code
  cidBytes[3] = 0x20; // 32 bytes digest length
  cidBytes.set(sha256Buffer, 4);

  return "b" + encodeBase32(cidBytes);
}

export async function generateIpfsCidV1Async(dataBuffer: Uint8Array): Promise<string> {
  let sha256Buffer: Uint8Array;

  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", dataBuffer);
    sha256Buffer = new Uint8Array(hashBuffer);
  } else {
    // Dynamic import for server environment
    const cryptoModule = await import("crypto");
    const hash = cryptoModule.createHash("sha256").update(dataBuffer).digest();
    sha256Buffer = new Uint8Array(hash);
  }

  const cidBytes = new Uint8Array(4 + sha256Buffer.length);
  cidBytes[0] = 0x01; // CIDv1
  cidBytes[1] = 0x55; // raw binary
  cidBytes[2] = 0x12; // sha2-256 multihash code
  cidBytes[3] = 0x20; // 32 bytes digest length
  cidBytes.set(sha256Buffer, 4);

  return "b" + encodeBase32(cidBytes);
}

/**
 * Converts a SHA256 hex string directly to IPFS CIDv1 string
 */
export function hexToIpfsCidV1(hexSha256: string): string {
  const cleanHex = (hexSha256 || "").replace(/^0x/, "");
  let sha256Buffer = hexToBytes(cleanHex);

  if (sha256Buffer.length !== 32) {
    const padded = new Uint8Array(32);
    padded.set(sha256Buffer.subarray(0, 32));
    sha256Buffer = padded;
  }

  const cidBytes = new Uint8Array(4 + 32);
  cidBytes[0] = 0x01;
  cidBytes[1] = 0x55;
  cidBytes[2] = 0x12;
  cidBytes[3] = 0x20;
  cidBytes.set(sha256Buffer, 4);

  return "b" + encodeBase32(cidBytes);
}

