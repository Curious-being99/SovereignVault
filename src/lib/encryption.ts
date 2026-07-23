import { 
  N, 
  polyAdd, 
  polyMul, 
  sampleSparseNoise, 
  ringLweEncrypt, 
  ringLweDecrypt, 
  runRingLweSelfTest 
} from './quantum';

// Run self-test on load to verify the lattice mathematics are 100% operational
const selfTestResult = runRingLweSelfTest();
console.log(`[Lattice Crypto Initialization] Ring-LWE modulo arithmetic verified: ${selfTestResult.success ? "OK" : "FAILED"}`);

export async function deriveMasterKey(username: string, password: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const usernameBuffer = encoder.encode(username.toLowerCase());
    const saltBuffer = await crypto.subtle.digest('SHA-256', usernameBuffer);
    const salt = new Uint8Array(saltBuffer).slice(0, 16);

    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 600000,
            hash: "SHA-256"
        },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

/**
 * Deterministic Pseudo-Random Generator (Hash-DRBG) using SHA-256 for key expansion
 */
async function generateDRBGKeyStream(seed: Uint8Array, length: number): Promise<Uint8Array> {
    const keyStream = new Uint8Array(length);
    let offset = 0;
    let counter = 0;
    
    const tempBuffer = new Uint8Array(seed.length + 4);
    tempBuffer.set(seed, 0);
    
    while (offset < length) {
        tempBuffer[seed.length] = (counter >> 24) & 0xFF;
        tempBuffer[seed.length + 1] = (counter >> 16) & 0xFF;
        tempBuffer[seed.length + 2] = (counter >> 8) & 0xFF;
        tempBuffer[seed.length + 3] = counter & 0xFF;
        
        const hash = await crypto.subtle.digest('SHA-256', tempBuffer);
        const hashBytes = new Uint8Array(hash);
        
        const take = Math.min(hashBytes.length, length - offset);
        keyStream.set(hashBytes.subarray(0, take), offset);
        
        offset += take;
        counter++;
    }
    
    return keyStream;
}

/**
 * Derives a deterministic Ring-LWE key pair from the user's master password.
 */
async function deriveRingLweKeyPair(password: string) {
    const encoder = new TextEncoder();
    const pwBuffer = encoder.encode(password);
    const masterSeed = await crypto.subtle.digest('SHA-512', pwBuffer);
    const seedBytes = new Uint8Array(masterSeed);
    
    // Generate 768 bytes of deterministic keystream to derive parameters:
    // - a (256 bytes): uniform public ring element
    // - s (256 bytes): secret noise polynomial
    // - e (256 bytes): error noise polynomial
    const keyStream = await generateDRBGKeyStream(seedBytes, 768);
    
    const a = keyStream.subarray(0, 256);
    const sSeed = keyStream.subarray(256, 512);
    const eSeed = keyStream.subarray(512, 768);
    
    const s = sampleSparseNoise(sSeed);
    const e = sampleSparseNoise(eSeed);
    
    // b = a * s + e (mod X^256 + 1)
    const b = polyAdd(polyMul(a, s), e);
    
    return { a, b, s };
}

/**
 * Encrypts a file using modern Post-Quantum Hybrid Cryptography:
 * 1. Derives the user's deterministic Ring-LWE public key (a, b) from the password.
 * 2. Generates a random 256-bit symmetric file session key K.
 * 3. Encrypts K using actual Ring-LWE polynomial equations to generate (u, v) (512 bytes).
 * 4. Encrypts the raw file payload using high-speed AES-256-GCM under the key K.
 * 5. Returns a structured binary package containing the headers, LWE ciphertext (u,v), and AES ciphertext.
 */
export async function encryptData(data: ArrayBuffer | ArrayBufferLike, password: string): Promise<ArrayBuffer> {
    // 1. Derive user's Ring-LWE public parameters
    const { a, b } = await deriveRingLweKeyPair(password);

    // 2. Generate a random 32-byte (256-bit) session key
    const sessionKeyRaw = crypto.getRandomValues(new Uint8Array(32));

    // 3. Encrypt the session key using real Ring-LWE equations
    const { u, v } = ringLweEncrypt(sessionKeyRaw, a, b);

    // 4. Derive AES-GCM CryptoKey from the raw session key
    const aesKey = await crypto.subtle.importKey(
        "raw",
        sessionKeyRaw,
        { name: "AES-GCM" },
        false,
        ["encrypt"]
    );

    // 5. Encrypt bulk payload with AES-256-GCM
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedPayload = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        aesKey,
        data as ArrayBuffer
    );

    // 6. Concatenate:
    // - Magic Post-Quantum marker [0x50, 0x51, 0x76, 0x31] ('PQv1') (4 bytes)
    // - Salt (16 bytes)
    // - IV (12 bytes)
    // - Ring-LWE u (256 bytes)
    // - Ring-LWE v (256 bytes)
    // - AES-GCM Encrypted Payload (variable bytes)
    const result = new Uint8Array(4 + 16 + 12 + 256 + 256 + encryptedPayload.byteLength);
    result[0] = 0x50; // 'P'
    result[1] = 0x51; // 'Q'
    result[2] = 0x76; // 'v'
    result[3] = 0x31; // '1'
    
    result.set(salt, 4);
    result.set(iv, 20);
    result.set(u, 32);
    result.set(v, 288);
    result.set(new Uint8Array(encryptedPayload), 544);
    
    return result.buffer;
}

/**
 * Decrypts a file package encrypted with Post-Quantum Hybrid Cryptography:
 * 1. Extracts the magic headers, salt, iv, and the 512-byte Ring-LWE (u, v) package.
 * 2. Derives the user's deterministic Ring-LWE secret key s from the password.
 * 3. Decrypts the Ring-LWE ciphertext (u, v) using real polynomial ring subtraction and multiplication to recover K.
 * 4. Imports K as an AES-GCM key and decrypts the remaining file payload.
 */
export async function decryptData(encryptedData: ArrayBuffer | ArrayBufferLike, password: string): Promise<ArrayBuffer> {
    const data = new Uint8Array(encryptedData);
    
    // Check for Post-Quantum hybrid marker "PQv1"
    const isPQ = data.length >= 544 && data[0] === 0x50 && data[1] === 0x51 && data[2] === 0x76 && data[3] === 0x31;
    
    if (!isPQ) {
        // Fallback for legacy files
        const salt = data.subarray(0, 16);
        const iv = data.subarray(16, 28);
        const encryptedContent = data.subarray(28);
        
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        const legacyKey = await crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt,
                iterations: 1000000,
                hash: "SHA-512"
            },
            passwordKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );
        return await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            legacyKey,
            encryptedContent
        );
    }
    
    // Parse Ring-LWE and AES components
    const salt = data.subarray(4, 20);
    const iv = data.subarray(20, 32);
    const u = data.subarray(32, 288);
    const v = data.subarray(288, 544);
    const encryptedPayload = data.subarray(544);

    // 1. Derive user's deterministic Ring-LWE secret parameter s from password
    const { s } = await deriveRingLweKeyPair(password);

    // 2. Decrypt symmetric session key using real Ring-LWE polynomial mathematics
    const recoveredSessionKeyRaw = ringLweDecrypt(u, v, s);

    // 3. Derive AES CryptoKey from the recovered session key
    const aesKey = await crypto.subtle.importKey(
        "raw",
        recoveredSessionKeyRaw,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    // 4. Decrypt bulk file payload using hardware-accelerated Web Crypto API
    return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        aesKey,
        encryptedPayload
    );
}

export async function computeFileHash(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
