export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("spki", key);
    const exportedAsString = String.fromCharCode.apply(null, Array.from(new Uint8Array(exported)));
    const exportedAsBase64 = btoa(exportedAsString);
    return exportedAsBase64;
}

export async function exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await crypto.subtle.exportKey("pkcs8", key);
    const exportedAsString = String.fromCharCode.apply(null, Array.from(new Uint8Array(exported)));
    const exportedAsBase64 = btoa(exportedAsString);
    return exportedAsBase64;
}

export async function importPublicKey(pem: string): Promise<CryptoKey> {
    const binaryDerString = atob(pem);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
        "spki",
        binaryDer.buffer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["encrypt"]
    );
}

export async function importPrivateKey(pem: string): Promise<CryptoKey> {
    const binaryDerString = atob(pem);
    const binaryDer = new Uint8Array(binaryDerString.length);
    for (let i = 0; i < binaryDerString.length; i++) {
        binaryDer[i] = binaryDerString.charCodeAt(i);
    }

    return await crypto.subtle.importKey(
        "pkcs8",
        binaryDer.buffer,
        {
            name: "RSA-OAEP",
            hash: "SHA-256",
        },
        true,
        ["decrypt"]
    );
}
