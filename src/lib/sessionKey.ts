
import * as db from './storage';

const WRAPPING_KEY_ALIAS = 'session-wrapping-key';

async function getWrappingKey(): Promise<CryptoKey> {
    let key = await db.getItem(WRAPPING_KEY_ALIAS);
    if (!key) {
        key = await crypto.subtle.generateKey(
            { name: "AES-KW", length: 256 },
            true,
            ["wrapKey", "unwrapKey"]
        );
        await db.setItem(WRAPPING_KEY_ALIAS, key);
    }
    return key as CryptoKey;
}

export async function storeSessionKey(sessionKey: CryptoKey): Promise<void> {
    const wrappingKey = await getWrappingKey();
    const wrapped = await crypto.subtle.wrapKey("raw", sessionKey, wrappingKey, "AES-KW");
    await db.setItem('encryptedSessionKey', wrapped);
}

export async function retrieveSessionKey(): Promise<CryptoKey | null> {
    const wrapped = await db.getItem('encryptedSessionKey');
    if (!wrapped) return null;
    const wrappingKey = await getWrappingKey();
    return await crypto.subtle.unwrapKey(
        "raw",
        wrapped,
        wrappingKey,
        "AES-KW",
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}
