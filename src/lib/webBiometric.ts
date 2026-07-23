const ENCLAVE_DB_NAME = "WebEnclave";
const ENCLAVE_STORE_NAME = "key_store";

function openEnclaveDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ENCLAVE_DB_NAME, 2);
    request.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
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

export async function saveWebBiometric(username: string, password: string): Promise<boolean> {
  if (!isWebBiometricSupported()) return false;
  const cleanUsername = username.trim().toLowerCase();
  
  let prfSupported = false;
  let prfSalt = window.crypto.getRandomValues(new Uint8Array(32));
  let hardwareDerivedKey: CryptoKey | null = null;

  try {
    if (window.PublicKeyCredential) {
      try {
        const challenge = window.crypto.getRandomValues(new Uint8Array(32));
        const userId = window.crypto.getRandomValues(new Uint8Array(16));
        
        const createOptions: any = {
          publicKey: {
            challenge,
            rp: { name: "Quantum Secure Vault", id: window.location.hostname },
            user: {
              id: userId,
              name: cleanUsername,
              displayName: cleanUsername,
            },
            pubKeyCredParams: [
              { type: "public-key", alg: -7 },
              { type: "public-key", alg: -257 },
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              userVerification: "required",
              residentKey: "preferred",
            },
            timeout: 120000, // Increased timeout for slow hardware/external keys
            extensions: {
              prf: {
                eval: {
                  first: prfSalt
                }
              }
            }
          },
        };

        const credential = await navigator.credentials.create(createOptions) as any;
        
        if (credential) {
          await setEnclaveValue(`webauthn_id_${cleanUsername}`, credential.id);
          
          const extResults = credential.getClientExtensionResults();
          if (extResults.prf && extResults.prf.results && extResults.prf.results.first) {
             const prfOutput = new Uint8Array(extResults.prf.results.first);
             console.log("[Enclave] WebAuthn PRF Supported! Derived hardware key.");
             prfSupported = true;
             
             // Import PRF output as raw AES-GCM key
             hardwareDerivedKey = await window.crypto.subtle.importKey(
               "raw",
               prfOutput,
               { name: "AES-GCM" },
               false,
               ["encrypt", "decrypt"]
             );
             await setEnclaveValue(`prf_salt_${cleanUsername}`, prfSalt);
          } else {
             console.log("[Enclave] WebAuthn PRF not supported by authenticator. Falling back to IDB Sandbox.");
          }
        }
      } catch (authErr) {
        console.warn("WebAuthn platform registration failed/skipped:", authErr);
      }
    }

    // Fallback: If PRF not supported or failed, generate random IDB key
    let encryptionKey = hardwareDerivedKey;
    if (!encryptionKey) {
       encryptionKey = await window.crypto.subtle.generateKey(
         { name: "AES-GCM", length: 256 },
         false, // non-extractable
         ["encrypt", "decrypt"]
       );
       await setEnclaveValue(`key_${cleanUsername}`, encryptionKey);
    }

    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      encryptionKey!,
      encoder.encode(password)
    );

    await setEnclaveValue(`cred_${cleanUsername}`, {
      iv: ArrayBuffer.isView(iv) ? iv.buffer : iv,
      ciphertext: encryptedData,
      isPrf: prfSupported
    });

    return true;
  } catch (err) {
    console.error("Enclave biometric storage failure:", err);
    return false;
  }
}

export async function getWebBiometric(username: string): Promise<string> {
  if (!isWebBiometricSupported()) {
    throw new Error("Sovereign biometric enclave is not supported on this browser.");
  }
  const cleanUsername = username.trim().toLowerCase();
  const cred = await getEnclaveValue(`cred_${cleanUsername}`);
  
  if (!cred) {
    throw new Error("No stored credentials found for this node. Please login manually first.");
  }

  let decryptionKey: CryptoKey | null = null;

  if (window.PublicKeyCredential) {
    try {
      const challenge = window.crypto.getRandomValues(new Uint8Array(32));
      const credId = await getEnclaveValue(`webauthn_id_${cleanUsername}`);
      
      if (!credId) {
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
        
        let extensions: any = undefined;
        if (cred.isPrf) {
           const prfSalt = await getEnclaveValue(`prf_salt_${cleanUsername}`);
           if (prfSalt) {
             extensions = {
               prf: {
                 eval: {
                   first: prfSalt
                 }
               }
             };
           }
        }

        const options: any = {
          publicKey: {
            challenge,
            rpId: window.location.hostname,
            userVerification: "required",
            timeout: 120000, // Increased timeout for slow hardware/external keys
            allowCredentials: [{
              id: base64UrlToUint8Array(credId),
              type: 'public-key'
            }],
            extensions
          },
        };

        const assertion = await navigator.credentials.get(options) as any;
        
        if (!assertion) {
          throw new Error("Biometric signature refused by authenticator.");
        }
        console.log("[Enclave] Biometric signature verified via WebAuthn.");
        
        if (cred.isPrf) {
           const extResults = assertion.getClientExtensionResults();
           if (extResults.prf && extResults.prf.results && extResults.prf.results.first) {
             const prfOutput = new Uint8Array(extResults.prf.results.first);
             decryptionKey = await window.crypto.subtle.importKey(
               "raw",
               prfOutput,
               { name: "AES-GCM" },
               false,
               ["encrypt", "decrypt"]
             );
           } else {
             throw new Error("Authenticator did not return PRF evaluation. Hardware key bound decryption failed.");
           }
        }
      }
    } catch (authErr: any) {
      const isCancellation = authErr.name === "NotAllowedError" || 
                             authErr.name === "AbortError" ||
                             authErr.message?.toLowerCase().includes("cancel") ||
                             authErr.message?.toLowerCase().includes("not allowed");
      
      if (isCancellation) {
        if (authErr.message?.includes("iframe") || authErr.message?.includes("cross-origin")) {
          throw new Error("Biometric verification is restricted inside preview frames. Please open the app in a new tab for native WebAuthn passkey verification.");
        }
        throw new Error("Biometric verification cancelled.");
      }
      
      if (cred.isPrf) {
         throw new Error("Hardware-bound PRF decryption failed: " + authErr.message);
      } else {
         throw new Error("Biometric signature failed: " + (authErr.message || "Authenticator rejected"));
      }
    }
  }

  if (!decryptionKey) {
     if (cred.isPrf) {
        throw new Error("Hardware-bound key could not be derived.");
     }
     decryptionKey = await getEnclaveValue(`key_${cleanUsername}`);
     if (!decryptionKey) {
        throw new Error("Sandbox key not found.");
     }
  }

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(cred.iv) },
      decryptionKey,
      cred.ciphertext
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (decErr) {
    throw new Error("Failed to decrypt secure biometric envelope. Please unlock manually.");
  }
}

export async function clearWebBiometric(username: string): Promise<void> {
  if (!isWebBiometricSupported()) return;
  const cleanUsername = username.trim().toLowerCase();
  await deleteEnclaveValue(`key_${cleanUsername}`).catch(() => {});
  await deleteEnclaveValue(`cred_${cleanUsername}`).catch(() => {});
  await deleteEnclaveValue(`webauthn_id_${cleanUsername}`).catch(() => {});
  await deleteEnclaveValue(`prf_salt_${cleanUsername}`).catch(() => {});
}
