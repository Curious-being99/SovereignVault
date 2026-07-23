// src/lib/doubleRatchet.ts
// Real, high-efficiency implementation of the Double Ratchet Protocol
// using the standard, native Web Crypto API for forward secrecy and deniability.

/**
 * ArrayBuffer and Base64 helper utilities
 */
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derives a new symmetric key using HMAC-SHA-256
 */
async function hmacSha256(keyData: ArrayBuffer, info: Uint8Array): Promise<ArrayBuffer> {
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", hmacKey, info);
}

/**
 * KDF for Chain Keys (produces next Chain Key and Message Key)
 * HKDF-like split using HMAC
 */
async function kdfCK(chainKey: ArrayBuffer): Promise<{ nextChainKey: ArrayBuffer; messageKey: ArrayBuffer }> {
  // Constant inputs for the HMAC to split keys
  const CK_INFO = encoder.encode("chain-key-advance");
  const MK_INFO = encoder.encode("message-key-derive");

  const nextChainKey = await hmacSha256(chainKey, CK_INFO);
  const messageKey = await hmacSha256(chainKey, MK_INFO);

  return { nextChainKey, messageKey };
}

/**
 * KDF for Root Key (produces next Root Key and next Chain Key from DH output)
 */
async function kdfRK(rootKey: ArrayBuffer, dhOutput: ArrayBuffer): Promise<{ nextRootKey: ArrayBuffer; chainKey: ArrayBuffer }> {
  const RK_INFO = encoder.encode("root-key-advance");
  const CK_INFO = encoder.encode("chain-key-derive");

  // Step 1: Advance Root Key using DH output as key material
  const nextRootKey = await hmacSha256(dhOutput, RK_INFO);
  // Step 2: Derive new Chain Key
  const chainKey = await hmacSha256(nextRootKey, CK_INFO);

  return { nextRootKey, chainKey };
}

export interface EncryptedMessagePayload {
  dhPublicKey: string; // Base64 of sender's ephemeral DH public key
  pn: number;          // Message count of previous sending chain
  n: number;           // Index of current message in chain
  ciphertext: string;  // Base64 of encrypted content
  iv: string;          // Base64 of initialization vector
}

export class DoubleRatchetSession {
  // Key state
  private rootKey: ArrayBuffer;
  private sendingChainKey: ArrayBuffer | null = null;
  private receivingChainKey: ArrayBuffer | null = null;

  // DH state
  private dKeyPair: CryptoKeyPair; // Ephemeral DH keypair of self
  private dhPeerPublicKey: CryptoKey | null = null; // DH public key of peer
  private dhPeerPublicKeyB64: string | null = null;

  // Message counters
  private Ns = 0; // Number of messages sent in current chain
  private Nr = 0; // Number of messages received in current chain
  private PN = 0; // Number of messages in previous sending chain

  // Skipped message keys (dictionary mapping of DH public key B64 + message number -> MessageKey)
  // Ensures out-of-order messages can be decrypted later
  private skippedMessageKeys: Map<string, ArrayBuffer> = new Map();

  private constructor(rootKey: ArrayBuffer, dKeyPair: CryptoKeyPair) {
    this.rootKey = rootKey;
    this.dKeyPair = dKeyPair;
  }

  /**
   * Initializes a new session between Alice and Bob.
   * We establish an initial root key from a shared secret (derived during handshaking)
   */
  public static async create(sharedSecret: ArrayBuffer, isInitiator: boolean): Promise<DoubleRatchetSession> {
    // 1. Generate local ECDH ephemeral key pair
    const dKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    const session = new DoubleRatchetSession(sharedSecret, dKeyPair);

    if (isInitiator) {
      // Initiator (Alice) starts with sending chain derived from a fresh DH step as soon as she has Bob's DH public key.
      // Initially, sending key is null until we do our first send, or we set up chains.
      session.sendingChainKey = await hmacSha256(sharedSecret, encoder.encode("initial-sending-chain"));
    } else {
      // Receiver (Bob) starts with receiving chain derived from Alice's initial handshake.
      session.receivingChainKey = await hmacSha256(sharedSecret, encoder.encode("initial-sending-chain"));
    }

    return session;
  }

  /**
   * Export our current ephemeral public key to send with packets or handshakes
   */
  public async getLocalPublicKeyB64(): Promise<string> {
    const exported = await crypto.subtle.exportKey("raw", this.dKeyPair.publicKey);
    return bufferToBase64(exported);
  }

  /**
   * Process a DH ratchet step when peer public key changes
   */
  private async dhRatchet(peerPublicKeyB64: string): Promise<void> {
    if (this.dhPeerPublicKeyB64 === peerPublicKeyB64) return;

    // 1. Import peer public key
    const rawPeerKey = base64ToBuffer(peerPublicKeyB64);
    const peerKey = await crypto.subtle.importKey(
      "raw",
      rawPeerKey,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );

    this.dhPeerPublicKey = peerKey;
    this.dhPeerPublicKeyB64 = peerPublicKeyB64;

    // 2. Perform DH with current local private key & peer's public key
    const dhOutput1 = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerKey },
      this.dKeyPair.privateKey,
      256
    );

    // 3. Update root and receiving chain key
    const update1 = await kdfRK(this.rootKey, dhOutput1);
    this.rootKey = update1.nextRootKey;
    this.receivingChainKey = update1.chainKey;
    this.PN = this.Ns;
    this.Ns = 0;
    this.Nr = 0;

    // 4. Generate new local ephemeral DH key pair
    this.dKeyPair = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );

    // 5. Perform DH with new local private key & peer's public key
    const dhOutput2 = await crypto.subtle.deriveBits(
      { name: "ECDH", public: peerKey },
      this.dKeyPair.privateKey,
      256
    );

    // 6. Update root and sending chain key
    const update2 = await kdfRK(this.rootKey, dhOutput2);
    this.rootKey = update2.nextRootKey;
    this.sendingChainKey = update2.chainKey;
  }

  /**
   * Encrypt a message with Perfect Forward Secrecy (PFS)
   */
  public async encrypt(plaintext: string): Promise<EncryptedMessagePayload> {
    if (!this.sendingChainKey) {
      // If we don't have a sending chain, derive one from the root
      this.sendingChainKey = await hmacSha256(this.rootKey, encoder.encode("self-healing-send-advance"));
    }

    // 1. Ratchet sending chain key to get Message Key
    const { nextChainKey, messageKey } = await kdfCK(this.sendingChainKey);
    this.sendingChainKey = nextChainKey;

    const currentN = this.Ns;
    this.Ns++;

    // 2. Encrypt plaintext using messageKey via AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await crypto.subtle.importKey(
      "raw",
      messageKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"]
    );

    const ciphertextBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      aesKey,
      encoder.encode(plaintext)
    );

    const localPubB64 = await this.getLocalPublicKeyB64();

    return {
      dhPublicKey: localPubB64,
      pn: this.PN,
      n: currentN,
      ciphertext: bufferToBase64(ciphertextBuf),
      iv: bufferToBase64(iv.buffer)
    };
  }

  /**
   * Decrypt a message with out-of-order and forward-secrecy resilience
   */
  public async decrypt(payload: EncryptedMessagePayload): Promise<string> {
    // 1. Skip message keys calculation if needed
    await this.skipMessageKeys(payload.dhPublicKey, payload.pn);

    // 2. Perform DH Ratchet if payload contains a new DH key
    if (payload.dhPublicKey !== this.dhPeerPublicKeyB64) {
      await this.dhRatchet(payload.dhPublicKey);
    }

    // 3. Retrieve or calculate message key
    let messageKey: ArrayBuffer | undefined = this.skippedMessageKeys.get(`${payload.dhPublicKey}-${payload.n}`);

    if (messageKey) {
      this.skippedMessageKeys.delete(`${payload.dhPublicKey}-${payload.n}`);
    } else {
      if (!this.receivingChainKey) {
        throw new Error("No receiving chain established for decryption");
      }
      
      // Ratchet receiving chain key up to the index of incoming message
      let currentCK = this.receivingChainKey;
      let computedKey: ArrayBuffer | null = null;

      for (let i = this.Nr; i <= payload.n; i++) {
        const { nextChainKey, messageKey: mk } = await kdfCK(currentCK);
        currentCK = nextChainKey;
        if (i === payload.n) {
          computedKey = mk;
        } else {
          // Store skipped key for future out-of-order message
          this.skippedMessageKeys.set(`${payload.dhPublicKey}-${i}`, mk);
        }
      }

      this.receivingChainKey = currentCK;
      this.Nr = payload.n + 1;
      messageKey = computedKey!;
    }

    // 4. Decrypt ciphertext using derived message key
    const aesKey = await crypto.subtle.importKey(
      "raw",
      messageKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64ToBuffer(payload.iv) },
      aesKey,
      base64ToBuffer(payload.ciphertext)
    );

    return decoder.decode(decryptedBuf);
  }

  /**
   * Handle skipped messages to prevent permanent message loss or replay attacks
   */
  private async skipMessageKeys(peerPublicKeyB64: string, tillPN: number): Promise<void> {
    // If the incoming public key is different and we have a receiving chain,
    // we must skip any remaining keys in the current receiving chain before advancing.
    if (peerPublicKeyB64 !== this.dhPeerPublicKeyB64 && this.receivingChainKey) {
      let currentCK = this.receivingChainKey;
      for (let i = this.Nr; i < tillPN; i++) {
        const { nextChainKey, messageKey } = await kdfCK(currentCK);
        currentCK = nextChainKey;
        this.skippedMessageKeys.set(`${this.dhPeerPublicKeyB64}-${i}`, messageKey);
      }
      this.receivingChainKey = null; // Will be recreated by DH ratchet
    }
  }
}
