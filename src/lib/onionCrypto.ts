// src/lib/onionCrypto.ts
// Real, high-efficiency metadata-obfuscated layered onion encryption

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface OnionPacket {
  ephemeralPublicKey: string; // Base64 raw ECDH public key
  iv: string;                 // Base64 AES-GCM IV
  ciphertext: string;         // Base64 encrypted payload (contains the JSON of next layer or message)
}

/**
 * Encrypt a payload for a target recipient's raw ECDH public key
 */
export async function encryptLayer(
  payload: string,
  recipientRawPublicKeyB64: string
): Promise<OnionPacket> {
  // 1. Import recipient's public key
  const rawRecipientKey = base64ToBuffer(recipientRawPublicKeyB64);
  const recipientKey = await crypto.subtle.importKey(
    "raw",
    rawRecipientKey,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  // 2. Generate local ephemeral ECDH keypair
  const ephemeralKeyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits", "deriveKey"]
  );

  // 3. Derive shared bits
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    ephemeralKeyPair.privateKey,
    256
  );

  // 4. Import shared bits as AES-GCM key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // 5. Encrypt payload
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoder.encode(payload)
  );

  // 6. Export ephemeral public key
  const exportedEphemeralPub = await crypto.subtle.exportKey("raw", ephemeralKeyPair.publicKey);

  return {
    ephemeralPublicKey: bufferToBase64(exportedEphemeralPub),
    iv: bufferToBase64(iv.buffer),
    ciphertext: bufferToBase64(encryptedBuf)
  };
}

/**
 * Decrypt an onion packet using our private identity key
 */
export async function decryptLayer(
  packet: OnionPacket,
  myPrivateKey: CryptoKey
): Promise<string> {
  // 1. Import ephemeral public key from packet
  const rawEphemeralPub = base64ToBuffer(packet.ephemeralPublicKey);
  const ephemeralKey = await crypto.subtle.importKey(
    "raw",
    rawEphemeralPub,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    []
  );

  // 2. Derive shared bits using our private key and the ephemeral public key
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ephemeralKey },
    myPrivateKey,
    256
  );

  // 3. Import shared bits as AES-GCM key
  const aesKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // 4. Decrypt ciphertext
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(packet.iv) },
    aesKey,
    base64ToBuffer(packet.ciphertext)
  );

  return decoder.decode(decryptedBuf);
}

/**
 * Helper to build nested onion layers over a specific path of peers.
 * The path is [Hop1, Hop2, Hop3, Receiver] where each element is { id: string, publicKey: string }
 * Returns the outermost OnionPacket to be sent to Hop1.
 */
export async function wrapOnion(
  message: string,
  senderSeedId: string,
  path: { id: string; publicKey: string }[]
): Promise<OnionPacket> {
  if (path.length === 0) {
    throw new Error("Cannot wrap onion with empty path");
  }

  // We construct from inside out (from receiver to hop1)
  // Innermost payload is the final message
  let currentPayload = JSON.stringify({
    type: "ONION_FINAL",
    message,
    senderSeedId,
    timestamp: Date.now()
  });

  // Wrap from back to front
  for (let i = path.length - 1; i >= 0; i--) {
    const currentHop = path[i];
    const isHop = i > 0;
    
    // Create the packet for current hop
    const packet = await encryptLayer(currentPayload, currentHop.publicKey);

    // If there is a previous hop, the payload for that hop contains this packet and the nextHop identifier
    if (isHop) {
      currentPayload = JSON.stringify({
        type: "ONION_FORWARD",
        nextHop: currentHop.id,
        packet
      });
    } else {
      // Outermost packet is ready
      return packet;
    }
  }

  throw new Error("Onion wrapping failed");
}
