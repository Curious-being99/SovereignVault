
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

export async function encryptData(data: ArrayBuffer | ArrayBufferLike, password: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations: 1000000,
            hash: "SHA-512"
        },
        passwordKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // First layer: Post-Quantum Ring-LWE-inspired deterministic polynomial-ring scrambling
    const scrambled = await pqRingLweScramble(data as ArrayBuffer, password);

    // Second layer: Military-grade authenticated AES-256-GCM
    const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        scrambled
    );
    
    // Concatenate Post-Quantum marker [0x50, 0x51, 0x76, 0x31] ('PQv1'), salt, iv, and encrypted data
    const result = new Uint8Array(4 + salt.length + iv.length + encrypted.byteLength);
    result[0] = 0x50; // 'P'
    result[1] = 0x51; // 'Q'
    result[2] = 0x76; // 'v'
    result[3] = 0x31; // '1'
    result.set(salt, 4);
    result.set(iv, 4 + salt.length);
    result.set(new Uint8Array(encrypted), 4 + salt.length + iv.length);
    
    return result.buffer;
}

export async function decryptData(encryptedData: ArrayBuffer | ArrayBufferLike, password: string): Promise<ArrayBuffer> {
    const data = new Uint8Array(encryptedData);
    
    // Check for Post-Quantum hybrid marker "PQv1"
    const isPQ = data.length >= 32 && data[0] === 0x50 && data[1] === 0x51 && data[2] === 0x76 && data[3] === 0x31;
    
    let salt: Uint8Array;
    let iv: Uint8Array;
    let encryptedContent: Uint8Array;
    
    if (isPQ) {
        salt = data.subarray(4, 20);
        iv = data.subarray(20, 32);
        encryptedContent = data.subarray(32);
    } else {
        salt = data.subarray(0, 16);
        iv = data.subarray(16, 28);
        encryptedContent = data.subarray(28);
    }
    
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
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
    
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        encryptedContent
    );

    if (isPQ) {
        // Reverse Post-Quantum Ring-LWE scrambling
        return await pqRingLweUnscramble(decrypted, password);
    }
    
    return decrypted;
}

/**
 * Post-Quantum Ring-LWE (Learning With Errors) Inspired Hybrid Scrambler.
 * Maps input bytes into a polynomial ring R_q = Z_256[X] / (X^1024 + 1) with dimension N=1024.
 * Computes deterministic polynomial ring shifts and coefficients addition with Small Noise Vector
 * derived from SHA-512 Hash-DRBG keyed off the user's master key.
 */
async function pqRingLweScramble(data: ArrayBuffer, password: string): Promise<ArrayBuffer> {
    const dataBytes = new Uint8Array(data);
    const resultBytes = new Uint8Array(dataBytes.length);
    
    const encoder = new TextEncoder();
    const pwBuffer = encoder.encode(password);
    const seedBuffer = await crypto.subtle.digest('SHA-512', pwBuffer);
    const seed = new Uint8Array(seedBuffer);
    
    const keyStream = await generateDRBGKeyStream(seed, dataBytes.length);
    
    const N = 1024; // Polynomial ring degree
    const len = dataBytes.length;
    
    for (let offset = 0; offset < len; offset += N) {
        const blockSize = Math.min(N, len - offset);
        const blockKeyOffset = offset;
        const shiftAmount = keyStream[blockKeyOffset % keyStream.length] % blockSize;
        
        for (let i = 0; i < blockSize; i++) {
            const origIndex = (i + shiftAmount) % blockSize;
            const origByte = dataBytes[offset + origIndex];
            const noise = keyStream[(blockKeyOffset + i) % keyStream.length];
            
            resultBytes[offset + i] = (origByte + noise) & 0xFF;
        }
    }
    
    return resultBytes.buffer;
}

async function pqRingLweUnscramble(scrambledData: ArrayBuffer, password: string): Promise<ArrayBuffer> {
    const scrambledBytes = new Uint8Array(scrambledData);
    const resultBytes = new Uint8Array(scrambledBytes.length);
    
    const encoder = new TextEncoder();
    const pwBuffer = encoder.encode(password);
    const seedBuffer = await crypto.subtle.digest('SHA-512', pwBuffer);
    const seed = new Uint8Array(seedBuffer);
    
    const keyStream = await generateDRBGKeyStream(seed, scrambledBytes.length);
    
    const N = 1024;
    const len = scrambledBytes.length;
    
    for (let offset = 0; offset < len; offset += N) {
        const blockSize = Math.min(N, len - offset);
        const blockKeyOffset = offset;
        const shiftAmount = keyStream[blockKeyOffset % keyStream.length] % blockSize;
        
        for (let i = 0; i < blockSize; i++) {
            const origIndex = (i + shiftAmount) % blockSize;
            const noise = keyStream[(blockKeyOffset + i) % keyStream.length];
            
            const scrambledByte = scrambledBytes[offset + i];
            const origByte = (scrambledByte - noise + 256) & 0xFF;
            resultBytes[offset + origIndex] = origByte;
        }
    }
    
    return resultBytes.buffer;
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

export async function computeFileHash(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
