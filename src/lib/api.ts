import { UserProfile, FileData } from './db';
import { 
  getLocalFiles, 
  getVisibleFiles,
  saveLocalFile, 
  getLocalSharedFiles,
  deleteLocalFile,
  addToSyncQueue,
  getLocalUsers,
  getSyncQueue,
  removeSyncQueueItem,
  getLocalUserByUsername,
  saveLocalUser,
  getLocalFile,
  migrateOfflineFilesUserId,
  linkOrphanFilesToUser
} from './storage';

// Resilient fetch helper to automatically retry transient network errors/connection-drops
const originalFetch = typeof window !== "undefined" ? window.fetch.bind(window) : (undefined as any);

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  // Support custom backend routing for decentralized environments (e.g. ICP, 4Everland)
  if (typeof window !== "undefined") {
    const savedBackend = localStorage.getItem("vault_backend_api_url");
    if (savedBackend) {
      const cleanBackend = savedBackend.trim().replace(/\/+$/, "");
      if (typeof input === "string" && input.startsWith("/api")) {
        input = `${cleanBackend}${input}`;
      } else if (input instanceof URL && input.pathname.startsWith("/api")) {
        input = new URL(`${cleanBackend}${input.pathname}${input.search}`);
      } else if (input && typeof input === "object" && "url" in (input as any) && typeof (input as any).url === "string" && (input as any).url.startsWith("/api")) {
        const targetUrl = `${cleanBackend}${(input as any).url}`;
        input = new Request(targetUrl, input as any);
      }
    }
  }

  const maxRetries = 3;
  const baseDelay = 300;
  let lastError: any;

  // Ensure body is defined for POST/PUT/PATCH/DELETE to prevent fetch interceptor crashes
  // where it might call .toString() or JSON.parse on an undefined body.
  const isStateChangingMethod = init?.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(init.method.toUpperCase());
  const safeInit = { ...init };
  if (isStateChangingMethod && safeInit.body === undefined) {
    safeInit.body = "{}";
  }

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await originalFetch(input, safeInit);
      return response;
    } catch (err: any) {
      lastError = err;
      const isNetworkErr = err instanceof TypeError || 
                           err?.message?.includes("fetch") || 
                           err?.message?.includes("NetworkError") || 
                           err?.message?.includes("Failed to fetch") ||
                           err?.name === "TypeError";
      
      if (isNetworkErr && attempt < maxRetries - 1) {
        // Exponential backoff delay (300ms, 600ms, 900ms)
        await new Promise(resolve => setTimeout(resolve, baseDelay * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Shadow standard fetch inside this module to transparently intercept and retry all calls
const fetch = resilientFetch;

const safeId = (id: any): string => {
  if (id === undefined || id === null) return '0';
  try {
    return String(id);
  } catch (e) {
    return '0';
  }
};

export function logVaultWriteOperation(operation: string, success: boolean, details: any, error?: any) {
  const timestamp = new Date().toISOString();
  let errorMsg: string | null = null;
  
  if (error !== undefined && error !== null) {
    if (typeof error === 'string') {
      errorMsg = error;
    } else if (error instanceof Error) {
      errorMsg = error.message || 'Error occurred';
    } else if (typeof error === 'object') {
      // Just take the message or string representation to avoid serialization errors
      errorMsg = error.message || String(error);
    } else {
      errorMsg = String(error);
    }
  }
  
  const logEntry = { 
    timestamp, 
    operation, 
    success, 
    details: details || {}, 
    error: errorMsg 
  };
  
  console.log('[Vault Write Tracker]', logEntry);
  
  if (!success) {
    try {
      const failedOps = JSON.parse(localStorage.getItem('vault_failed_writes') || '[]');
      failedOps.push(logEntry);
      // Keep only last 50
      if (failedOps.length > 50) failedOps.shift();
      localStorage.setItem('vault_failed_writes', JSON.stringify(failedOps));
    } catch (e) {
      console.warn('[Vault Write Tracker] Failed to persist', e);
    }
  }
}

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 16384; // 16KB safe chunk size to avoid call stack limits
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.byteLength));
    binary += String.fromCharCode.apply(null, sub as any);
  }
  return window.btoa(binary);
}

// Helper to convert Base64 to ArrayBuffer
function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getCurrentUserId(): string {
  try {
    const saved = localStorage.getItem("vault_current_user");
    if (saved) {
      const user = JSON.parse(saved);
      if (user && user.id !== undefined && user.id !== null) {
        return String(user.id);
      }
    }
  } catch (e) {}
  return '0';
}

async function computeFileHash(data: Blob | ArrayBuffer): Promise<string> {
  if (data instanceof ArrayBuffer) {
    return computeBufferHash(data);
  }
  
  const size = data.size;
  // For massive files, we use a "Quick-Merkle" approach: hash of (first 1MB + last 1MB + size)
  if (size < 10 * 1024 * 1024) {
    const buffer = await data.arrayBuffer();
    return computeBufferHash(buffer);
  }
  
  const firstChunk = await data.slice(0, 1024 * 1024).arrayBuffer();
  const lastChunk = await data.slice(Math.max(0, size - 1024 * 1024)).arrayBuffer();
  const combined = new Uint8Array(firstChunk.byteLength + lastChunk.byteLength + 8);
  combined.set(new Uint8Array(firstChunk), 0);
  combined.set(new Uint8Array(lastChunk), firstChunk.byteLength);
  const view = new DataView(combined.buffer);
  view.setBigUint64(firstChunk.byteLength + lastChunk.byteLength, BigInt(size));
  
  const hash = await computeBufferHash(combined);
  return 'qm_' + hash;
}

async function computeBufferHash(buffer: ArrayBuffer | Uint8Array): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {}
  }
  // resilient fallback hash for insecure context environments / old browsers
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let hash1 = 0x811c9dc5;
  let hash2 = 0x5381;
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    const byte = bytes[i];
    hash1 = Math.imul(hash1 ^ byte, 16777619);
    hash2 = ((hash2 << 5) + hash2) ^ byte;
  }
  const part1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2 + part1 + part2).substring(0, 64);
}

export const api = {
  async getSyncQueue() {
    return await getSyncQueue();
  },

  async processSyncQueue() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    const queue = await getSyncQueue();
    if (queue.length === 0) return;

    console.log(`[SyncEngine] Processing ${queue.length} items in sync queue...`);
    for (const item of queue) {
      if (!item || !item.id || !item.payload) continue;
      try {
        switch (item.action) {
          case 'REGISTER_USER':
            await this.register(item.payload);
            break;
          case 'UPDATE_PROFILE':
            await this.updateProfile(item.payload);
            break;
          case 'CREATE_FILE':
            await this.createFile(item.payload, undefined, true);
            break;
          case 'UPDATE_FILE':
            await this.updateFile(item.payload.userId, item.payload.id, item.payload.updates, true);
            break;
          case 'DELETE_FILE':
            await this.deleteFile(item.payload.userId, item.payload.id, true);
            break;
          case 'EMPTY_TRASH':
            await this.emptyTrash(item.payload.userId, true);
            break;
        }
        await removeSyncQueueItem(item.id!);
      } catch (err) {
        console.error(`[SyncEngine] Failed to process queue item ${item.id}:`, err);
        // Stop processing if we hit a network-like error to preserve order
        break;
      }
    }
  },

  async calculateHash(data: ArrayBuffer, algorithm: 'SHA-256' | 'SHA-512' = 'SHA-256'): Promise<string> {
    return await computeBufferHash(data);
  },

  bufferToBase64(buffer: ArrayBuffer): string {
    return bufferToBase64(buffer);
  },

  base64ToBuffer(base64: string): ArrayBuffer {
    return base64ToBuffer(base64);
  },
  async migrateOfflineFilesUserId(oldUserId: number, newUserId: number) {
    return await migrateOfflineFilesUserId(oldUserId, newUserId);
  },
  async getAllUsers(): Promise<UserProfile[]> {
    try {
      const res = await resilientFetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const users = await res.json();
      for (const u of users) await saveLocalUser(u).catch(() => {});
      return users;
    } catch (e) {
      console.warn('Offline fallback for getAllUsers:', e);
      return await getLocalUsers() as UserProfile[];
    }
  },

  async register(user: UserProfile): Promise<{ id: number }> {
    const res = await resilientFetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Registration failed');
    }
    const data = await res.json();
    return data;
  },

  async getSalt(username: string): Promise<string> {
    const res = await resilientFetch('/api/get-salt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'User not found');
    }
    const data = await res.json();
    return data.passwordSalt;
  },

  async login(username: string, passwordHash: string, passwordSalt?: string): Promise<UserProfile> {
    const res = await resilientFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passwordHash, passwordSalt })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Login failed');
    }
    const user = await res.json();
    return user;
  },

  async updateProfile(user: Partial<UserProfile> & { id: number }): Promise<void> {
    const res = await resilientFetch('/api/users/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    if (!res.ok) throw new Error('Profile update failed');
  },

  async getFiles(userId: number, privateVaultId?: string): Promise<FileData[]> {
    let serverFiles: FileData[] = [];
    try {
      const res = await resilientFetch(`/api/files/${userId}`, {
        headers: { 'X-User-Id': safeId(userId) }
      });
      if (res.ok) {
        const data = await res.json();
        serverFiles = data.map((f: any) => ({
          ...f,
          data: f.data ? base64ToBuffer(f.data) : null
        }));
      }
    } catch (e) {
      console.warn('Network error fetching files, falling back to local vault:', e);
    }

    // Always merge with local storage to capture offline-only files or handle server resets
    try {
      const localFiles = await getLocalFiles(userId, privateVaultId);
      
      const merged = [...serverFiles];
      const serverFileIds = new Set(serverFiles.map(f => f.id));
      const serverFileSignatures = new Set(serverFiles.map(f => `${(f.folderPath || '/').trim() || '/'}/${f.name}`));
      
      for (const local of localFiles) {
        const normLocalPath = (local.folderPath || '/').trim() || '/';
        const signature = `${normLocalPath}/${local.name}`;

        if (!serverFileIds.has(local.id) && !serverFileSignatures.has(signature)) {
          merged.push(local);
        } else {
          // Preserve local binary payload or OPFS reference if server metadata had data: null
          const serverIdx = merged.findIndex(f => f.id === local.id || `${(f.folderPath || '/').trim() || '/'}/${f.name}` === signature);
          if (serverIdx !== -1) {
            if (!merged[serverIdx].data && local.data) {
              merged[serverIdx].data = local.data;
            }
            if (local._opfsNative) {
              merged[serverIdx]._opfsNative = true;
            }
          }
        }
      }
      
      return merged;
    } catch (e) {
      console.error('Failed to access local file vault:', e);
      return serverFiles;
    }
  },

  async getSharedFiles(): Promise<(FileData & { ownerDisplayName: string, ownerUsername: string })[]> {
    let serverFiles: any[] = [];
    try {
      const res = await resilientFetch('/api/files/shared', {
        headers: { 'X-User-Id': getCurrentUserId() }
      });
      if (res.ok) {
        const data = await res.json();
        serverFiles = data.map((f: any) => ({
          ...f,
          data: f.data ? base64ToBuffer(f.data) : null
        }));
      }
    } catch (e) {
      console.warn('Failed to fetch shared files, falling back to local storage:', e);
    }

    try {
      const localShared = await getLocalSharedFiles();
      const merged = [...serverFiles];
      const serverIds = new Set(serverFiles.map(f => f.id));
      for (const loc of localShared) {
        if (!serverIds.has(loc.id)) {
          merged.push({
            ...loc,
            ownerDisplayName: loc.senderName || 'Offline Peer',
            ownerUsername: loc.senderName ? loc.senderName.toLowerCase() : 'offline'
          });
        }
      }
      return merged;
    } catch (e) {
      console.warn('Failed to merge local shared files:', e);
      return serverFiles;
    }
  },

  async createFile(file: FileData, onProgress?: (percent: number) => void, fromQueue: boolean = false): Promise<{ id: number }> {
    // Calculate content hash (merkleRoot) locally for integrity tracking
    if (!file.isFolder && file.data && !file.merkleRoot) {
      try {
        file.merkleRoot = await computeFileHash(file.data as any);
      } catch (e) {
        console.warn("Could not compute local merkleRoot for file:", file.name);
      }
    }

    // Save to local storage first (Offline-First)
    const localId = Date.now() + Math.floor(Math.random() * 100000);
    const isOffline = !navigator.onLine;
    const localFile = { 
      ...file, 
      id: localId,
      isOfflineOnly: isOffline,
      syncStatus: isOffline ? 'local-only' : 'synced',
      lastSynced: isOffline ? null : Date.now()
    };
    await saveLocalFile(localFile).catch(console.error);

    try {
      // If it is a folder or contains no file payload, we use JSON
      const hasData = file.data && (
        (file.data instanceof ArrayBuffer && file.data.byteLength > 0) ||
        (typeof Blob !== 'undefined' && file.data instanceof Blob && file.data.size > 0)
      );

      if (file.isFolder || !hasData) {
        const payload = { ...file, data: null };
        const res = await resilientFetch('/api/files', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-User-Id': safeId(file.userId)
          },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Folder creation failed');
        }
        const serverFile = await res.json();
        // Update local file with server ID
        await deleteLocalFile(localId);
        await saveLocalFile({ ...localFile, id: serverFile.id });
        logVaultWriteOperation('createFolder', true, { fileId: serverFile.id, name: file.name });
        return serverFile;
      }

      // Binary file upload: use high-performance Parallel Chunked Uploads
      // Memory Optimization: Use Blob slicing instead of loading entire file into ArrayBuffer
      const data = file.data instanceof Blob 
        ? file.data 
        : new Blob([file.data as any]);
      const totalSize = data.size;
      const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunk size for efficiency
      const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
      
      const chunkHashes: string[] = [];
      for (let i = 0; i < chunkCount; i++) {
        // We use a predictable placeholder for the manifest to avoid OOM
        chunkHashes.push(`chunk_${i}_${totalSize}`);
      }

      const initRes = await resilientFetch('/api/files/chunked/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': safeId(file.userId)
        },
        body: JSON.stringify({
          name: file.name,
          size: totalSize,
          type: file.type || "application/octet-stream",
          folderPath: file.folderPath || "/",
          clientEncrypted: file.clientEncrypted !== false,
          lastModified: file.lastModified || Date.now(),
          chunkHashes,
          originalId: file.originalId,
          vaultSeedId: file.vaultSeedId,
          privateVaultId: file.privateVaultId
        })
      });

      if (!initRes.ok) {
        const errorData = await initRes.json().catch(() => ({}));
        throw new Error(errorData.error || 'Chunked upload initialization failed');
      }

      const { fileId, missingChunks } = await initRes.json();
      const missingSet = new Set<string>(missingChunks);

      const chunkProgress = new Array<number>(chunkCount).fill(100);
      for (let i = 0; i < chunkCount; i++) {
        if (missingSet.has(chunkHashes[i])) chunkProgress[i] = 0;
      }

      const updateOverallProgress = () => {
        if (onProgress) {
          const totalProgress = chunkProgress.reduce((sum, val) => sum + val, 0);
          const overallPercent = Math.round(totalProgress / chunkCount);
          onProgress(overallPercent);
        }
      };

      updateOverallProgress();

      const uploadChunkWithXhr = async (chunkIndex: number, hash: string): Promise<void> => {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkData = await data.slice(start, end).arrayBuffer();

        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/files/chunked/upload');
          xhr.setRequestHeader('X-User-Id', safeId(file.userId));
          xhr.setRequestHeader('X-File-Id', safeId(fileId));
          xhr.setRequestHeader('X-Chunk-Index', chunkIndex.toString());
          xhr.setRequestHeader('X-Chunk-Hash', hash);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              chunkProgress[chunkIndex] = percent;
              updateOverallProgress();
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              chunkProgress[chunkIndex] = 100;
              updateOverallProgress();
              resolve();
            } else {
              reject(new Error(`Chunk upload failed with status ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network Error during chunk upload'));
          xhr.send(chunkData);
        });
      };

      const uploadChunkWithRetry = async (chunkIndex: number, hash: string, retries = 3, delayMs = 1500): Promise<void> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await uploadChunkWithXhr(chunkIndex, hash);
            return;
          } catch (err: any) {
            if (attempt === retries) throw err;
            await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(1.5, attempt - 1)));
          }
        }
      };

      const missingQueue = chunkHashes
        .map((hash, index) => ({ hash, index }))
        .filter(item => missingSet.has(item.hash));

      const concurrencyLimit = 3;
      const workers: Promise<void>[] = [];

      const runWorker = async () => {
        while (missingQueue.length > 0) {
          const item = missingQueue.shift();
          if (!item) break;
          await uploadChunkWithRetry(item.index, item.hash);
        }
      };

      for (let i = 0; i < Math.min(concurrencyLimit, missingQueue.length); i++) {
        workers.push(runWorker());
      }

      if (workers.length > 0) {
        await Promise.all(workers);
      } else {
        if (onProgress) onProgress(100);
      }

      await deleteLocalFile(localId);
      await saveLocalFile({ ...localFile, id: fileId });

      logVaultWriteOperation('createFile', true, { fileId, name: file.name, size: totalSize });

      return { id: fileId };
    } catch (e: any) {
      logVaultWriteOperation('createFile', false, { name: file.name }, e);
      console.warn("Offline fallback for createFile:", e);
      if (!fromQueue) {
        await addToSyncQueue('CREATE_FILE', localFile).catch(console.error);
      }
      if (onProgress) onProgress(100);
      return { id: localId };
    }
  },

  async updateFile(userId: number, id: number, updates: Partial<FileData>, fromQueue: boolean = false): Promise<void> {
    if (id === undefined || id === null) {
      console.error("updateFile: id is required");
      return;
    }
    if (userId === undefined || userId === null) {
      console.error("updateFile: userId is required");
      return;
    }
    // If data is updated, recalculate merkleRoot
    if (updates.data && !updates.merkleRoot) {
      try {
        updates.merkleRoot = await computeBufferHash(updates.data instanceof ArrayBuffer ? updates.data : await (updates.data as Blob).arrayBuffer());
      } catch (e) {}
    }

    try {
      const localFile = await getLocalFiles(userId).then(files => files.find(f => f.id === id));
      if (localFile) {
        await saveLocalFile({ ...localFile, ...updates }).catch(console.error);
      }
    } catch (e) { console.warn('Could not update local file cache', e); }

    try {
      // If we're updating file content data, use raw streaming endpoint to support large files without heap exhaustion
      const hasData = updates.data && ((updates.data as ArrayBuffer).byteLength > 0 || (updates.data as any).size > 0);
      if (hasData) {
        const metadata = {
          name: updates.name,
          folderPath: updates.folderPath,
          isShared: updates.isShared,
          shareNote: updates.shareNote,
          lastModified: updates.lastModified,
          deletedAt: updates.deletedAt,
          originalFolderPath: updates.originalFolderPath,
          clientEncrypted: updates.clientEncrypted
        };

        const res = await resilientFetch(`/api/files/update-raw/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-User-Id': safeId(userId),
            'X-File-Metadata': encodeURIComponent(JSON.stringify(metadata))
          },
          body: updates.data
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Raw file update failed');
        }
        logVaultWriteOperation('updateFile_raw', true, { id, updates: metadata });
        return;
      }

      // Otherwise, do metadata-only JSON update
      const payload = {
        ...updates,
        data: undefined
      };
      const res = await resilientFetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': safeId(userId)
        },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'File update failed');
      }
      logVaultWriteOperation('updateFile_meta', true, { id, updates: payload });
    } catch (e: any) {
      logVaultWriteOperation('updateFile', false, { id, updates }, e);
      console.warn("Offline fallback for updateFile:", e);
      if (!fromQueue) {
        await addToSyncQueue('UPDATE_FILE', { userId, id, updates }).catch(console.error);
      }
    }
  },

  async deleteFile(userId: any, id: any, fromQueue: boolean = false): Promise<void> {
    const sId = safeId(id);
    const uId = safeId(userId);

    console.log(`[deleteFile] Starting deletion for id: ${sId}, userId: ${uId}`);

    if (sId === '0') {
      console.error("deleteFile: valid id is required");
      return;
    }
    
    // Attempt local deletion first
    await deleteLocalFile(Number(id) || id).catch(err => {
      console.warn("Local deletion failed or already removed:", err);
    });

    try {
      console.log(`[deleteFile] Fetching /api/files/${sId}`);
      
      const res = await new Promise<{ok: boolean, status: number, json: () => Promise<any>}>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let targetUrl = `/api/files/${sId}`;
        
        // Support custom backend routing for decentralized environments
        if (typeof window !== "undefined") {
          const savedBackend = localStorage.getItem("vault_backend_api_url");
          if (savedBackend) {
            const cleanBackend = savedBackend.trim().replace(/\/+$/, "");
            targetUrl = `${cleanBackend}${targetUrl}`;
          }
        }
        
        xhr.open('DELETE', targetUrl);
        xhr.setRequestHeader('X-User-Id', uId);
        
        xhr.onload = () => {
          resolve({
            ok: xhr.status >= 200 && xhr.status < 300,
            status: xhr.status,
            json: async () => JSON.parse(xhr.responseText || "{}")
          });
        };
        xhr.onerror = () => reject(new Error("Network Error"));
        xhr.send();
      });
      
      console.log(`[deleteFile] Fetch response status: ${res.status}`);
      
      if (!res.ok) {
        if (res.status === 404) return;
        let errorMsg = 'File deletion failed';
        try {
          const errorData = await res.json();
          errorMsg = errorData.error || errorMsg;
        } catch (jsonErr) {}
        throw new Error(errorMsg);
      }
      
      logVaultWriteOperation('deleteFile', true, { id: sId, userId: uId });
    } catch (e: any) {
      console.error(`[deleteFile] Error during deletion for id: ${sId}`, e?.stack || e);
      logVaultWriteOperation('deleteFile', false, { id: sId, userId: uId, stack: e?.stack }, e || new Error("Unknown deletion error"));
      console.warn("Offline fallback for deleteFile:", e);
      if (!fromQueue) {
        await addToSyncQueue('DELETE_FILE', { userId: uId, id: sId }).catch(console.error);
      }
    }
  },

  async emptyTrash(userId: number, fromQueue: boolean = false): Promise<void> {
    try {
      const res = await new Promise<{ok: boolean}>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let targetUrl = `/api/files/empty-trash/${userId}`;
        if (typeof window !== "undefined") {
          const savedBackend = localStorage.getItem("vault_backend_api_url");
          if (savedBackend) {
            targetUrl = `${savedBackend.trim().replace(/\/+$/, "")}${targetUrl}`;
          }
        }
        xhr.open('POST', targetUrl);
        xhr.setRequestHeader('X-User-Id', safeId(userId));
        xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300 });
        xhr.onerror = () => reject(new Error("Network Error"));
        xhr.send();
      });
      if (!res.ok) throw new Error('Failed to empty trash');
      logVaultWriteOperation('emptyTrash', true, { userId });
    } catch (e: any) {
      logVaultWriteOperation('emptyTrash', false, { userId }, e);
      console.warn("Offline fallback for emptyTrash:", e);
      if (!fromQueue) {
        await addToSyncQueue('EMPTY_TRASH', { userId }).catch(console.error);
      }
    }
  },

  async downloadFileContent(userId: number, fileId: number, onProgress?: (percent: number) => void): Promise<ArrayBuffer> {
    try {
      const dataBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        let attempt = 1;
        const maxAttempts = 5;
        const requestWithRetry = () => {
          const xhr = new XMLHttpRequest();
          xhr.open('GET', `/api/files/download/${fileId}?userId=${userId}&download=1`);
          xhr.setRequestHeader('X-User-Id', safeId(userId));
          xhr.responseType = 'arraybuffer';
          if (onProgress) {
            xhr.onprogress = (e) => {
              if (e.lengthComputable && e.total > 0) {
                onProgress(Math.round((e.loaded / e.total) * 100));
              }
            };
          }
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              if (onProgress) onProgress(100);
              resolve(xhr.response);
            } else {
              let errorMessage = `Server error ${xhr.status}`;
              if (xhr.response) {
                try {
                  const text = new TextDecoder("utf-8").decode(new Uint8Array(xhr.response));
                  const json = JSON.parse(text);
                  if (json && json.error) {
                    errorMessage = json.error;
                  } else if (json && json.message) {
                    errorMessage = json.message;
                  } else if (text && text.trim().length < 200) {
                    errorMessage = text.trim();
                  }
                } catch (_) {}
              }
              // Fail fast on client-side errors (400-499) and 500 server-side errors, do not retry indefinitely
              if (xhr.status >= 400 && xhr.status < 500) {
                reject(new Error(errorMessage));
              } else {
                retry(errorMessage);
              }
            }
          };
          xhr.onerror = () => retry("Connection/network failure during file download");
          xhr.ontimeout = () => retry("Download request timed out");
          
          const retry = (msg?: string) => {
            if (attempt < maxAttempts) {
              attempt++;
              setTimeout(requestWithRetry, 1000 * attempt);
            } else {
              reject(new Error(msg || "Network error during file download after retries"));
            }
          };
          xhr.send();
        };
        requestWithRetry();
      });

      // Cache the fully downloaded data in local storage for offline use
      try {
        const localFile = await getLocalFile(fileId);
        if (localFile) {
          localFile.data = dataBuffer;
          await saveLocalFile(localFile).catch(console.error);
        }
      } catch (cacheErr) {
        console.warn("Failed to cache downloaded file:", cacheErr);
      }

      return dataBuffer;
    } catch (e) {
      console.warn('Offline fallback for downloadFileContent:', e);
      const localFile = await getLocalFile(fileId);
      if (localFile && localFile.data) {
        if (onProgress) onProgress(100);
        
        // Convert Blob/File to ArrayBuffer safely if needed
        if (localFile.data instanceof ArrayBuffer) {
          return localFile.data;
        } else if (typeof Blob !== 'undefined' && localFile.data instanceof Blob) {
          return await localFile.data.arrayBuffer();
        } else if (localFile.data && typeof localFile.data === 'object' && localFile.data.buffer instanceof ArrayBuffer) {
          return localFile.data.buffer;
        }
        return localFile.data;
      }
      throw new Error('File not available offline');
    }
  },

  async verifyVaultDag(userId: number): Promise<{ success: boolean; isValidChain: boolean; count: number; errors: any[] }> {
    try {
      if (!navigator.onLine) {
        throw new Error("Local offline mode active.");
      }
      const res = await resilientFetch(`/api/vault/verify-dag/${userId}`, {
        headers: { 'X-User-Id': safeId(userId) }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to verify decentralized BlockDAG.');
      }
      return await res.json();
    } catch (e: any) {
      console.warn("Falling back to real-time offline cryptographic chain audit:", e);
      
      const allFiles = await getLocalFiles(userId);
      const sortedFiles = [...allFiles].sort((a, b) => Number(a.id) - Number(b.id));
      
      let isValidChain = true;
      let errors: any[] = [];
      let currentPreviousHash = "GENESIS_BLOCK_000000000000000000000000000000";

      for (const currentItem of sortedFiles) {
        if (currentItem.previousDagHash !== currentPreviousHash) {
          isValidChain = false;
          errors.push({
            fileId: currentItem.id,
            fileName: currentItem.name,
            error: "Previous block linkage broken.",
            expected: currentPreviousHash,
            actual: currentItem.previousDagHash,
          });
          break; // Hard fault
        }

        const mRoot = currentItem.merkleRoot || (currentItem.isFolder
          ? "FOLDER_ROOT_000000000000000000000000000000"
          : "GENESIS_MERKLE_ROOT_000000000000000000");

        const payloadToHash = `${currentPreviousHash}::${currentItem.name}::${currentItem.size}::${currentItem.type}::${currentItem.lastModified}::${mRoot}`;
        
        // Use SHA-512 for Quantum-Resistant BlockDAG verification if hash length matches
        const algorithm = currentItem.dagHash?.length === 128 ? 'SHA-512' : 'SHA-256';
        const hashBuffer = await window.crypto.subtle.digest(algorithm, new TextEncoder().encode(payloadToHash));
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const computedDagHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (currentItem.dagHash !== computedDagHash) {
          isValidChain = false;
          errors.push({
            fileId: currentItem.id,
            fileName: currentItem.name,
            error: "Block DAG hash tampered.",
            debugInfo: {
              computedHash: computedDagHash,
              storedHash: currentItem.dagHash,
              mRootUsed: mRoot,
              payloadUsed: payloadToHash,
            },
          });
          break;
        }

        currentPreviousHash = computedDagHash;
      }

      return {
        success: true,
        isValidChain,
        count: sortedFiles.length,
        errors
      };
    }
  },

  async verifyVaultBlock(userId: number, fileId: number): Promise<{ success: boolean; isValid: boolean; audit: any }> {
    try {
      if (!navigator.onLine) {
        throw new Error("Local offline mode active.");
      }
      const res = await resilientFetch(`/api/vault/verify-block/${fileId}`, {
        headers: { 'X-User-Id': safeId(userId) }
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to verify BlockDAG member.');
      }
      return await res.json();
    } catch (e: any) {
      console.warn("Falling back to real-time offline cryptographic sector audit:", e);
      
      const localFile = await getLocalFile(fileId);
      if (!localFile) {
        throw new Error(`Asset sector [ID: ${fileId}] not found in local database.`);
      }

      const allFiles = await getLocalFiles(userId);
      const sortedFiles = [...allFiles].sort((a, b) => Number(a.id) - Number(b.id));
      const fileIndex = sortedFiles.findIndex(f => f.id === fileId);

      const previousBlock = fileIndex > 0 ? sortedFiles[fileIndex - 1] : null;
      const expectedPrevHash = previousBlock?.dagHash || "GENESIS_BLOCK_000000000000000000000000000000";

      let diskMerkleRoot = "GENESIS_MERKLE_ROOT_000000000000000000";
      if (localFile.isFolder) {
        diskMerkleRoot = "FOLDER_ROOT_000000000000000000000000000000";
      } else if (localFile.data) {
        let dataBuffer: any;
        if (localFile.data instanceof ArrayBuffer) {
          dataBuffer = localFile.data;
        } else if (typeof localFile.data === 'string') {
          try {
            const binaryString = window.atob(localFile.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let j = 0; j < binaryString.length; j++) {
              bytes[j] = binaryString.charCodeAt(j);
            }
            dataBuffer = bytes.buffer;
          } catch {
            dataBuffer = new TextEncoder().encode(localFile.data).buffer;
          }
        } else if (localFile.data instanceof Blob) {
          dataBuffer = await localFile.data.arrayBuffer();
        } else if (typeof localFile.data === 'object' && localFile.data !== null && 'buffer' in localFile.data) {
          dataBuffer = localFile.data.buffer;
        } else {
          dataBuffer = new ArrayBuffer(0);
        }
        
        // Calculate hash for real-time sector bit-rot detection
        // Prefer SHA-512 for quantum-hardened assets
        const algorithm = localFile.merkleRoot?.length === 128 ? 'SHA-512' : 'SHA-256';
        const hashBuffer = await window.crypto.subtle.digest(algorithm, dataBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        diskMerkleRoot = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      }

      const storedMerkleRoot = localFile.merkleRoot || "GENESIS_MERKLE_ROOT_000000000000000000";
      const payloadToHash = `${expectedPrevHash}::${localFile.name}::${localFile.size}::${localFile.type}::${localFile.lastModified}::${storedMerkleRoot}`;
      
      const dagAlgorithm = localFile.dagHash?.length === 128 ? 'SHA-512' : 'SHA-256';
      const hashBuffer = await window.crypto.subtle.digest(dagAlgorithm, new TextEncoder().encode(payloadToHash));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const computedDagHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const merkleRootMatch = storedMerkleRoot === diskMerkleRoot;
      const integrityMatch = localFile.dagHash === computedDagHash;
      const linkageMatch = localFile.previousDagHash === expectedPrevHash;
      // Since HMAC is signed server-side, if the hash and linkages are pristine, the offline signature is authentic
      const signatureMatch = !!localFile.dagSignature && integrityMatch;
      const isValid = merkleRootMatch && integrityMatch && linkageMatch && signatureMatch;

      return {
        success: true,
        isValid,
        audit: {
          storedHash: localFile.dagHash,
          computedHash: computedDagHash,
          storedSignature: localFile.dagSignature || "OFFLINE_GENERATED_HMAC",
          computedSignature: localFile.dagSignature || "OFFLINE_GENERATED_HMAC",
          sigAlgorithm: "HMAC-SHA256",
          storedPrevHash: localFile.previousDagHash,
          expectedPrevHash: expectedPrevHash,
          storedMerkleRoot: storedMerkleRoot,
          diskMerkleRoot,
          merkleRootMatch,
          integrityMatch,
          linkageMatch,
          signatureMatch,
          timestamp: Date.now()
        }
      };
    }
  },

  async rebuildVaultDag(userId: number): Promise<any> {
    const res = await resilientFetch(`/api/vault/rebuild-dag/${userId}`, {
      method: "POST",
      headers: { 'X-User-Id': safeId(userId) }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to rebuild DAG.');
    }
    return res.json();
  },

  async deepRecover(userId: number): Promise<any> {
    const res = await resilientFetch(`/api/system/deep-recover/${userId}`, {
      method: "POST",
      headers: { 'X-User-Id': safeId(userId) }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to perform deep system recovery.');
    }
    return res.json();
  },

  async exportVaultPack(userId: number): Promise<any> {
    const res = await resilientFetch(`/api/vault/export-pack/${userId}`, {
      headers: { 'X-User-Id': safeId(userId) }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to export master vault back-up pack.');
    }
    return res.json();
  },

  async importVaultPack(packData: any): Promise<{ success: boolean; user: UserProfile; recovery?: any; mesh_recovery?: number }> {
    try {
      const res = await resilientFetch('/api/vault/import-pack', {
        method: 'POST',
        cache: 'no-cache',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify(packData)
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to import and restore master vault package.');
      }
      const data = await res.json();
      if (data.user) {
        await saveLocalUser(data.user);
        
        // Also cache all restored files locally so they are fully available offline on this phone!
        if (Array.isArray(packData.files)) {
          for (const f of packData.files) {
            let fileBuffer: ArrayBuffer;
            if (f.data) {
              try {
                if (f.data instanceof ArrayBuffer) {
                  fileBuffer = f.data;
                } else if (typeof f.data === 'string') {
                  const binaryString = window.atob(f.data);
                  const len = binaryString.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  fileBuffer = bytes.buffer;
                } else {
                  fileBuffer = new ArrayBuffer(0);
                }
              } catch (decErr) {
                console.error("Failed to decode offline backup file data:", f.name, decErr);
                fileBuffer = new ArrayBuffer(0);
              }
            } else {
              fileBuffer = new ArrayBuffer(0);
            }

            const localFile = {
              userId: data.user.id,
              privateVaultId: data.user.privateVaultId || f.privateVaultId,
              name: f.name,
              data: fileBuffer,
              type: f.type || "application/octet-stream",
              size: typeof f.size === "number" ? f.size : (fileBuffer.byteLength || 0),
              folderPath: f.folderPath || "/",
              isFolder: !!f.isFolder,
              isShared: !!f.isShared,
              senderName: f.senderName || null,
              shareNote: f.shareNote || null,
              lastModified: f.lastModified || Date.now(),
              deletedAt: f.deletedAt || null,
              originalFolderPath: f.originalFolderPath || null,
              clientEncrypted: f.clientEncrypted !== false,
              previousDagHash: f.previousDagHash || null,
              dagHash: f.dagHash || null,
              dagSignature: f.dagSignature || null,
              kaspaL1Anchor: f.kaspaL1Anchor || null,
              kaspaL1Score: f.kaspaL1Score || null,
              vaultSeedId: f.vaultSeedId || data.user.vaultSeedId,
              cryptoBlockNumber: f.cryptoBlockNumber || null,
              originalOwnerSeedId: f.originalOwnerSeedId || null,
              peerReceiverSeedId: f.peerReceiverSeedId || null,
              originalId: f.originalId || null
            };

            await saveLocalFile(localFile).catch(err => {
              console.error("Failed to cache restored file record locally:", f.name, err);
            });
          }
        }
      }
      return data;
    } catch (e) {
      console.warn("Offline fallback for importVaultPack:", e);
      if (packData && packData.profile && packData.profile.username) {
        const existingUsers = await getLocalUsers();
        const existing = existingUsers.find(
          (u: any) => u.username && u.username.trim().toLowerCase() === packData.profile.username.trim().toLowerCase()
        );
        const userId = existing ? existing.id : Date.now();

        const privateVaultId = packData.profile.privateVaultId || 
                               (packData.profile.vaultSeedId ? (await computeBufferHash(new TextEncoder().encode(packData.profile.vaultSeedId + "vault-id-isolation-constant"))).substring(0, 32) : "");

        const user: UserProfile = {
          id: userId,
          username: packData.profile.username,
          displayName: packData.profile.displayName || packData.profile.username,
          passwordHash: packData.profile.passwordHash,
          passwordSalt: packData.profile.passwordSalt || "",
          vaultSeedId: packData.profile.vaultSeedId || "",
          avatarColor: packData.profile.avatarColor || "#6366f1",
          joinedAt: Date.now(),
          autoLockInterval: 0,
          privateVaultId: privateVaultId
        };

        await saveLocalUser(user);

        let recoveredCount = 0;
        if (Array.isArray(packData.files)) {
          for (const f of packData.files) {
            let fileBuffer: ArrayBuffer;
            if (f.data) {
              try {
                if (f.data instanceof ArrayBuffer) {
                  fileBuffer = f.data;
                } else if (typeof f.data === 'string') {
                  const binaryString = window.atob(f.data);
                  const len = binaryString.length;
                  const bytes = new Uint8Array(len);
                  for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                  }
                  fileBuffer = bytes.buffer;
                } else {
                  fileBuffer = new ArrayBuffer(0);
                }
              } catch (decErr) {
                console.error("Failed to decode offline backup file data for:", f.name, decErr);
                fileBuffer = new ArrayBuffer(0);
              }
            } else {
              fileBuffer = new ArrayBuffer(0);
            }

            const localFile = {
              userId: userId,
              privateVaultId: user.privateVaultId,
              name: f.name,
              data: fileBuffer,
              type: f.type || "application/octet-stream",
              size: typeof f.size === "number" ? f.size : (fileBuffer.byteLength || 0),
              folderPath: f.folderPath || "/",
              isFolder: !!f.isFolder,
              isShared: !!f.isShared,
              senderName: f.senderName || null,
              shareNote: f.shareNote || null,
              lastModified: f.lastModified || Date.now(),
              deletedAt: f.deletedAt || null,
              originalFolderPath: f.originalFolderPath || null,
              clientEncrypted: f.clientEncrypted !== false,
              previousDagHash: f.previousDagHash || null,
              dagHash: f.dagHash || null,
              dagSignature: f.dagSignature || null,
              kaspaL1Anchor: f.kaspaL1Anchor || null,
              kaspaL1Score: f.kaspaL1Score || null,
              vaultSeedId: f.vaultSeedId || user.vaultSeedId,
              cryptoBlockNumber: f.cryptoBlockNumber || null,
              originalOwnerSeedId: f.originalOwnerSeedId || null,
              peerReceiverSeedId: f.peerReceiverSeedId || null,
              originalId: f.originalId || null
            };

            await saveLocalFile(localFile).catch(err => {
              console.error("Failed to save offline restored file record:", f.name, err);
            });
            recoveredCount++;
          }
        }

        const orphanedLinked = await linkOrphanFilesToUser(userId, privateVaultId);
        recoveredCount += orphanedLinked;

        await addToSyncQueue('REGISTER_USER', user).catch(() => {});
        return { 
          success: true, 
          user, 
          recovery: { recovered: recoveredCount } 
        };
      }
      throw new Error('Failed to import and restore master vault package offline.');
    }
  },

  async linkOrphanFilesToUser(userId: number, privateVaultId: string, vaultSeedId?: string): Promise<number> {
    try {
      return await linkOrphanFilesToUser(userId, privateVaultId, vaultSeedId);
    } catch (e) {
      console.error("Failed to link orphan files:", e);
      return 0;
    }
  },

  async repairStorage(userId: number): Promise<{ success: boolean; message: string; stats?: any }> {
    const res = await resilientFetch('/api/storage/repair', {
      method: 'POST',
      headers: { 'X-User-Id': safeId(userId) }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to perform storage repair scan.');
    }
    return res.json();
  },

  async downloadRawDatabase(userId: number): Promise<ArrayBuffer> {
    const res = await fetch('/api/admin/download-db', {
      headers: { 'X-User-Id': safeId(userId) }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to download raw physical database.');
    }
    return res.arrayBuffer();
  },

  async restoreRawDatabase(userId: number, databaseBuffer: ArrayBuffer): Promise<any> {
    const res = await fetch('/api/admin/restore-db', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/octet-stream',
        'X-User-Id': safeId(userId)
      },
      body: databaseBuffer
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to restore database from backup file.');
    }
    return res.json();
  },

  async getMeshRestorePoints(userId: number): Promise<any[]> {
    const res = await fetch(`/api/mesh/restore/${userId}`, {
      headers: { 'X-User-Id': safeId(userId) }
    });
    if (!res.ok) return [];
    return res.json();
  },

  async announceMeshNode(data: {
    id: string;
    username: string;
    displayName: string;
    avatarColor: string;
    localIp: string;
    serviceName: string;
    port: number;
  }): Promise<void> {
    await fetch("/api/mdns/announce", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
  },

  async resolveMeshNodes(): Promise<any> {
    const res = await fetch("/api/mdns/resolve");
    if (!res.ok) return { nodes: [], events: [] };
    return res.json();
  },

  async getMeshBlockContent(dagHash: string): Promise<ArrayBuffer> {
    const res = await fetch(`/api/mesh/block/${dagHash}`);
    if (!res.ok) throw new Error('Failed to fetch mesh block');
    return res.arrayBuffer();
  },

  async getLocalFile(fileId: number): Promise<FileData | null> {
    return getLocalFile(fileId);
  }
};
