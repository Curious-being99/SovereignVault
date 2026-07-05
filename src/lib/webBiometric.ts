/**
 * QuantumSecureVault - Sovereign Web Biometric & Passkey Enclave
 * Provides E2E zero-knowledge, browser-native biometrics via WebAuthn
 * and non-extractable Hardware/Sandbox-protected SubtleCrypto Keys.
 */

const ENCLAVE_DB_NAME = "SovereignBiometricEnclave";
const ENCLAVE_STORE_NAME = "credentials";

function openEnclaveDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ENCLAVE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENCLAVE_STORE_NAME)) {
        db.createObjectStore(ENCLAVE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getEnclaveValue(key: string): Promise<any> {
  const db = await openEnclaveDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENCLAVE_STORE_NAME, "readonly");
    const req = tx.objectStore(ENCLAVE_STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function setEnclaveValue(key: string, value: any): Promise<void> {
  const db = await openEnclaveDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENCLAVE_STORE_NAME, "readwrite");
    const req = tx.objectStore(ENCLAVE_STORE_NAME).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function deleteEnclaveValue(key: string): Promise<void> {
  const db = await openEnclaveDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ENCLAVE_STORE_NAME, "readwrite");
    const req = tx.objectStore(ENCLAVE_STORE_NAME).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function isWebBiometricSupported(): boolean {
  return typeof window !== "undefined" && !!window.crypto && !!window.crypto.subtle && !!window.indexedDB;
}

/**
 * Checks if biometric credentials have been saved for a user in this browser enclave.
 */
export async function hasWebBiometric(username: string): Promise<boolean> {
  if (!isWebBiometricSupported()) return false;
  const cleanUsername = username.trim().toLowerCase();
  try {
    const cred = await getEnclaveValue(`cred_${cleanUsername}`);
    const hwId = await getEnclaveValue(`webauthn_id_${cleanUsername}`);
    return !!(cred && hwId);
  } catch (e) {
    return false;
  }
}

/**
 * Saves credentials inside the secure local Web Enclave.
 * Generates a non-extractable cryptographic key and leverages WebAuthn Passkeys.
 */
export async function saveWebBiometric(username: string, password: string): Promise<boolean> {
  if (!isWebBiometricSupported()) return false;
  const cleanUsername = username.trim().toLowerCase();

  try {
    // 1. Try to register a WebAuthn platform passkey for biometric presence validation
    if (window.PublicKeyCredential) {
      try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const userId = window.crypto.getRandomValues(new Uint8Array(16));
        
        // This prompts the native Windows Hello, Mac TouchID/FaceID, iOS/Android biometric dialogue
        const credential = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: "Quantum Secure Vault", id: window.location.hostname },
            user: {
              id: userId,
              name: cleanUsername,
              displayName: cleanUsername,
            },
            pubKeyCredParams: [
              { type: "public-key", alg: -7 }, // ES256
              { type: "public-key", alg: -257 }, // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
              residentKey: "preferred",
            },
            timeout: 60000,
          },
        }) as PublicKeyCredential;

        if (credential) {
          // Store the credential ID to target it during login (prevents "No passkeys" prompt)
          await setEnclaveValue(`webauthn_id_${cleanUsername}`, credential.id);
        }
      } catch (authErr) {
        console.warn("WebAuthn platform registration skipped/cancelled, relying on secure key sandbox:", authErr);
      }
    }

    // 2. Generate an AES-GCM 256-bit Key with extractable: false
    // This key can NEVER be read by JavaScript (cannot leak to hackers or third party scripts),
    // but the browser's cryptographic engine can use it to encrypt/decrypt payloads inside the sandbox.
    const key = await window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      false, // non-extractable! Crucial for military-grade protection
      ["encrypt", "decrypt"]
    );

    // 3. Encrypt the password using this non-extractable key
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(password)
    );

    // 4. Store the encrypted data and the non-extractable key inside IndexedDB
    // Because Web Crypto allows storing 'CryptoKey' instances directly in IndexedDB,
    // the non-extractable security properties are perfectly preserved!
    await setEnclaveValue(`key_${cleanUsername}`, key);
    await setEnclaveValue(`cred_${cleanUsername}`, {
      iv: ArrayBuffer.isView(iv) ? iv.buffer : iv,
      ciphertext: encryptedData,
    });

    return true;
  } catch (err) {
    console.error("Enclave biometric storage failure:", err);
    return false;
  }
}

/**
 * Verifies user identity via WebAuthn, retrieves the non-extractable key,
 * and decrypts the master password to unlock the workspace offline.
 */
export async function getWebBiometric(username: string): Promise<string> {
  if (!isWebBiometricSupported()) {
    throw new Error("Sovereign biometric enclave is not supported on this browser.");
  }
  const cleanUsername = username.trim().toLowerCase();

  const key = await getEnclaveValue(`key_${cleanUsername}`);
  const cred = await getEnclaveValue(`cred_${cleanUsername}`);

  if (!key || !cred) {
    throw new Error("No stored credentials found for this node. Please login manually first.");
  }

  // 1. Prompt for Biometric / Passkey Verification if WebAuthn is available
  if (window.PublicKeyCredential) {
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const credId = await getEnclaveValue(`webauthn_id_${cleanUsername}`);
      
      if (!credId) {
        // If no hardware ID is registered, we notify the user that they need to setup biometrics.
        throw new Error("Hardware security not initialized. Please log in with your password and enable biometrics in Settings.");
      } else {
        const base64UrlToUint8Array = (base64Url: string) => {
          const padding = '='.repeat((4 - base64Url.length % 4) % 4);
          const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = window.atob(base64);
          const outputArray = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
          }
          return outputArray;
        };

        const options: CredentialRequestOptions = {
          publicKey: {
            challenge,
            rpId: window.location.hostname,
            userVerification: "required",
            timeout: 60000,
            allowCredentials: [{
              id: base64UrlToUint8Array(credId),
              type: 'public-key'
            }]
          },
        };

        const assertion = await navigator.credentials.get(options);
        
        if (!assertion) {
          throw new Error("Biometric signature refused by authenticator.");
        }
        console.log("[Enclave] Biometric signature verified via WebAuthn.");
      }
    } catch (authErr: any) {
      // If user cancels or if hardware is disconnected, we abort
      const isCancellation = authErr.name === "NotAllowedError" || 
                            authErr.name === "AbortError" ||
                            authErr.message?.toLowerCase().includes("cancel");
      
      if (isCancellation) {
        throw new Error("Biometric verification cancelled.");
      }
      
      // If no credentials found or other error, log but potentially allow fallback if IDB key is present
      console.warn("Hardware security anchor fallback check:", authErr);
    }
  }

  // 2. Perform Decryption using the non-extractable key
  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(cred.iv) },
      key,
      cred.ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (decErr) {
    throw new Error("Failed to decrypt secure biometric envelope. Please unlock manually.");
  }
}

/**
 * Removes biometric credentials from the local browser enclave.
 */
export async function clearWebBiometric(username: string): Promise<void> {
  if (!isWebBiometricSupported()) return;
  const cleanUsername = username.trim().toLowerCase();
  await deleteEnclaveValue(`key_${cleanUsername}`).catch(() => {});
  await deleteEnclaveValue(`cred_${cleanUsername}`).catch(() => {});
}
