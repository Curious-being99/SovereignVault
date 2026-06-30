import { UserProfile, FileData } from './db';
import { 
  getLocalFiles, 
  saveLocalFile, 
  getLocalSharedFiles,
  deleteLocalFile,
  addToSyncQueue,
  getLocalUsers,
  getLocalUserByUsername,
  saveLocalUser,
  getLocalFile
} from './storage';

// Resilient fetch helper to automatically retry transient network errors/connection-drops
const originalFetch = typeof window !== "undefined" ? window.fetch : (undefined as any);

async function resilientFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const maxRetries = 3;
  const baseDelay = 300;
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await originalFetch(input, init);
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

// Vault database write logging
function logVaultWriteOperation(operation: string, success: boolean, details: any, error?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, operation, success, details, error: error ? error.toString() : null };
  console[success ? 'log' : 'error']('[Vault Write Tracker]', JSON.stringify(logEntry, null, 2));
  
  if (!success) {
    try {
      const failedOps = JSON.parse(localStorage.getItem('vault_failed_writes') || '[]');
      failedOps.push(logEntry);
      // Keep only last 50
      if (failedOps.length > 50) failedOps.shift();
      localStorage.setItem('vault_failed_writes', JSON.stringify(failedOps));
    } catch(e) {}
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
  return '';
}

async function computeBufferHash(buffer: ArrayBuffer): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // fallback
    }
  }
  // resilient fallback hash for insecure context environments / old browsers
  const view = new DataView(buffer);
  let hash1 = 0x811c9dc5;
  let hash2 = 0x5381;
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    const byte = view.getUint8(i);
    hash1 = Math.imul(hash1 ^ byte, 16777619);
    hash2 = ((hash2 << 5) + hash2) ^ byte;
  }
  const part1 = (hash1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (hash2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2 + part1 + part2).substring(0, 64);
}

export const api = {
  async getAllUsers(): Promise<UserProfile[]> {
    try {
      const res = await fetch('/api/users');
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
    const localId = Date.now();
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
      }
      const data = await res.json();
      await saveLocalUser({ ...user, id: data.id });
      return data;
    } catch (e) {
      console.warn('Offline fallback for register:', e);
      await saveLocalUser({ ...user, id: localId });
      await addToSyncQueue('REGISTER_USER', { ...user, id: localId });
      return { id: localId };
    }
  },

  async getSalt(username: string): Promise<string> {
    try {
      const res = await fetch('/api/get-salt', {
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
    } catch (e) {
      console.warn('Offline fallback for getSalt:', e);
      const user = await getLocalUserByUsername(username);
      if (user) return user.passwordSalt;
      throw new Error('User not found offline');
    }
  },

  async login(username: string, passwordHash: string, passwordSalt?: string): Promise<UserProfile> {
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, passwordHash, passwordSalt })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Login failed');
      }
      const user = await res.json();
      await saveLocalUser(user);
      return user;
    } catch (e) {
      console.warn('Offline fallback for login:', e);
      const user = await getLocalUserByUsername(username);
      if (user && user.passwordHash === passwordHash) return user;
      throw new Error('Login failed offline');
    }
  },

  async updateProfile(user: Partial<UserProfile> & { id: number }): Promise<void> {
    try {
      await saveLocalUser(user);
      const res = await fetch('/api/users/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (!res.ok) throw new Error('Profile update failed');
    } catch (e) {
      console.warn('Offline fallback for updateProfile:', e);
      await addToSyncQueue('UPDATE_PROFILE', user);
    }
  },

  async getFiles(userId: number): Promise<FileData[]> {
    try {
      const res = await fetch(`/api/files/${userId}`, {
        headers: { 'X-User-Id': userId.toString() }
      });
      if (!res.ok) throw new Error('Network response not ok');
      const data = await res.json();
      
      const parsedData = data.map((f: any) => ({
        ...f,
        data: f.data ? base64ToBuffer(f.data) : null
      }));

      // Cache locally
      for (const f of parsedData) {
        await saveLocalFile(f).catch(() => {});
      }
      return parsedData;
    } catch (e) {
      console.log('Falling back to local storage for getFiles', e);
      return await getLocalFiles(userId);
    }
  },

  async getSharedFiles(): Promise<(FileData & { ownerDisplayName: string, ownerUsername: string })[]> {
    try {
      const res = await fetch('/api/files/shared', {
        headers: { 'X-User-Id': getCurrentUserId() }
      });
      if (!res.ok) throw new Error('Failed to fetch shared files');
      const data = await res.json();
      const parsedData = data.map((f: any) => ({
        ...f,
        data: f.data ? base64ToBuffer(f.data) : null
      }));
      // Cache locally
      for (const f of parsedData) {
        await saveLocalFile(f).catch(() => {});
      }
      return parsedData;
    } catch (e) {
      console.log('Falling back to local storage for getSharedFiles', e);
      return await getLocalSharedFiles() as any;
    }
  },

  async createFile(file: FileData, onProgress?: (percent: number) => void): Promise<{ id: number }> {
    // Save to local storage first (Offline-First)
    const localId = Date.now() + Math.floor(Math.random() * 100000);
    const localFile = { ...file, id: localId };
    await saveLocalFile(localFile).catch(console.error);

    try {
      // If it is a folder or contains no file payload, we use JSON
      const hasData = file.data && (
        (file.data instanceof ArrayBuffer && file.data.byteLength > 0) ||
        (typeof Blob !== 'undefined' && file.data instanceof Blob && file.data.size > 0)
      );

      if (file.isFolder || !hasData) {
        const payload = { ...file, data: null };
        const res = await fetch('/api/files', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-User-Id': file.userId.toString()
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
      let arrayBuffer: ArrayBuffer;
      if (file.data instanceof ArrayBuffer) {
        arrayBuffer = file.data;
      } else {
        arrayBuffer = await (file.data as Blob).arrayBuffer();
      }

      const CHUNK_SIZE = 1024 * 1024; // 1MB chunk size
      const totalSize = arrayBuffer.byteLength;
      const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
      
      const chunks: ArrayBuffer[] = [];
      const hashPromises: Promise<string>[] = [];

      for (let i = 0; i < chunkCount; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, totalSize);
        const chunkData = arrayBuffer.slice(start, end);
        chunks.push(chunkData);
        hashPromises.push(computeBufferHash(chunkData));
      }

      const chunkHashes = await Promise.all(hashPromises);

      const initRes = await fetch('/api/files/chunked/init', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': file.userId.toString()
        },
        body: JSON.stringify({
          name: file.name,
          size: totalSize,
          type: file.type || "application/octet-stream",
          folderPath: file.folderPath || "/",
          clientEncrypted: file.clientEncrypted !== false,
          lastModified: file.lastModified || Date.now(),
          chunkHashes,
          originalId: file.originalId
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

      const uploadChunkWithXhr = (chunkIndex: number, hash: string, data: ArrayBuffer): Promise<void> => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/files/chunked/upload');
          xhr.setRequestHeader('X-User-Id', file.userId.toString());
          xhr.setRequestHeader('X-File-Id', fileId.toString());
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
              reject(new Error(`Chunk upload failed status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during chunk upload'));
          xhr.ontimeout = () => reject(new Error('Chunk upload timed out'));
          xhr.onabort = () => reject(new Error('Chunk upload aborted'));
          xhr.timeout = 180000;
          xhr.send(data);
        });
      };

      const uploadChunkWithRetry = async (chunkIndex: number, hash: string, data: ArrayBuffer, retries = 3, delayMs = 1500): Promise<void> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await uploadChunkWithXhr(chunkIndex, hash, data);
            return;
          } catch (err: any) {
            if (attempt === retries) throw err;
            await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(1.5, attempt - 1)));
          }
        }
      };

      const queue = [...chunks.map((chunk, index) => ({ chunk, index, hash: chunkHashes[index] }))];
      const missingQueue = queue.filter(item => missingSet.has(item.hash));

      const concurrencyLimit = 6;
      const workers: Promise<void>[] = [];

      const runWorker = async () => {
        while (missingQueue.length > 0) {
          const item = missingQueue.shift();
          if (!item) break;
          await uploadChunkWithRetry(item.index, item.hash, item.chunk);
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
      await addToSyncQueue('CREATE_FILE', localFile).catch(console.error);
      if (onProgress) onProgress(100);
      return { id: localId };
    }
  },

  async updateFile(userId: number, id: number, updates: Partial<FileData>): Promise<void> {
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

        const res = await fetch(`/api/files/update-raw/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-User-Id': userId.toString(),
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
      const res = await fetch(`/api/files/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'X-User-Id': userId.toString()
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
      await addToSyncQueue('UPDATE_FILE', { id, updates }).catch(console.error);
    }
  },

  async deleteFile(userId: number, id: number): Promise<void> {
    await deleteLocalFile(id).catch(console.error);
    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
        headers: { 'X-User-Id': userId.toString() }
      });
      if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'File deletion failed');
      }
      logVaultWriteOperation('deleteFile', true, { id });
    } catch (e: any) {
      logVaultWriteOperation('deleteFile', false, { id }, e);
      console.warn("Offline fallback for deleteFile:", e);
      await addToSyncQueue('DELETE_FILE', { id }).catch(console.error);
    }
  },

  async emptyTrash(userId: number): Promise<void> {
    try {
      const res = await fetch(`/api/files/empty-trash/${userId}`, {
        method: 'POST',
        headers: { 'X-User-Id': userId.toString() }
      });
      if (!res.ok) throw new Error('Failed to empty trash');
      logVaultWriteOperation('emptyTrash', true, { userId });
    } catch (e: any) {
      logVaultWriteOperation('emptyTrash', false, { userId }, e);
      console.warn("Offline fallback for emptyTrash:", e);
      await addToSyncQueue('EMPTY_TRASH', { userId }).catch(console.error);
    }
  },

  async downloadFileContent(userId: number, fileId: number, onProgress?: (percent: number) => void): Promise<ArrayBuffer> {
    try {
      // To be extremely resilient to home network disruptions, we download the file in sequential 2MB segments (using HTTP Range headers).
      // If a segment fails, we retry up to 10 times with exponential backoff before continuing.
      // This allows resuming a download exactly where it stopped!
      
      // First, fetch the file's total size from metadata or perform a quick probe
      let totalSize = 0;
      try {
        const probeRes = await fetch(`/api/files/download/${fileId}?userId=${userId}`, { method: 'HEAD' });
        const lenHeader = probeRes.headers.get('Content-Length');
        if (probeRes.ok && lenHeader) {
          totalSize = parseInt(lenHeader, 10);
        }
      } catch (e) {
        console.warn("Probe HEAD request failed, falling back to full download:", e);
      }

      if (totalSize <= 0) {
        // Fallback if size unknown: do a standard resilient block download
        return await new Promise((resolve, reject) => {
          let attempt = 1;
          const maxAttempts = 10;
          const requestWithRetry = () => {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `/api/files/download/${fileId}?userId=${userId}`);
            xhr.setRequestHeader('X-User-Id', userId.toString());
            xhr.responseType = 'arraybuffer';
            if (onProgress) {
              xhr.onprogress = (e) => {
                if (e.lengthComputable) {
                  onProgress(Math.round((e.loaded / e.total) * 100));
                }
              };
            }
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
              } else {
                retry();
              }
            };
            xhr.onerror = () => retry();
            xhr.ontimeout = () => retry();
            
            const retry = () => {
              if (attempt < maxAttempts) {
                attempt++;
                setTimeout(requestWithRetry, 1500 * attempt);
              } else {
                reject(new Error("Network error during raw file download after retries"));
              }
            };
            xhr.send();
          };
          requestWithRetry();
        });
      }

      const SEGMENT_SIZE = 2 * 1024 * 1024; // 2MB segments
      const segmentsCount = Math.ceil(totalSize / SEGMENT_SIZE);
      const buffers: Uint8Array[] = [];
      let downloadedBytes = 0;

      const downloadSegmentWithRetry = async (start: number, end: number, retries = 3, delayMs = 1500): Promise<ArrayBuffer> => {
        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            return await new Promise<ArrayBuffer>((resolve, reject) => {
              const xhr = new XMLHttpRequest();
              xhr.open('GET', `/api/files/download/${fileId}?userId=${userId}`);
              xhr.setRequestHeader('X-User-Id', userId.toString());
              xhr.setRequestHeader('Range', `bytes=${start}-${end}`);
              xhr.responseType = 'arraybuffer';
              xhr.onload = () => {
                // 206 Partial Content is standard, 200 OK is also acceptable if server returned full file
                if (xhr.status === 206 || xhr.status === 200) {
                  resolve(xhr.response);
                } else {
                  reject(new Error(`Status error ${xhr.status}`));
                }
              };
              xhr.onerror = () => reject(new Error('Network error during range download'));
              xhr.ontimeout = () => reject(new Error('Range download timed out'));
              xhr.timeout = 60000;
              xhr.send();
            });
          } catch (err: any) {
            console.warn(`[ResilientDownloader] Segment bytes=${start}-${end} attempt ${attempt}/${retries} failed: ${err.message}. Retrying...`);
            if (attempt === retries) {
              throw err;
            }
            await new Promise((r) => setTimeout(r, delayMs * Math.pow(1.5, attempt - 1)));
          }
        }
        throw new Error("Out of retries");
      };

      for (let i = 0; i < segmentsCount; i++) {
        const start = i * SEGMENT_SIZE;
        const end = Math.min(start + SEGMENT_SIZE - 1, totalSize - 1);
        
        const segmentBuffer = await downloadSegmentWithRetry(start, end);
        
        // If the server ignored the Range header and returned the whole file (status 200) on first attempt, take it directly
        if (i === 0 && segmentBuffer.byteLength === totalSize) {
          if (onProgress) onProgress(100);
          return segmentBuffer;
        }

        buffers.push(new Uint8Array(segmentBuffer));
        downloadedBytes += segmentBuffer.byteLength;
        if (onProgress) {
          onProgress(Math.round((downloadedBytes / totalSize) * 100));
        }
      }

      // Merge all buffers into one single large ArrayBuffer
      const combined = new Uint8Array(totalSize);
      let offset = 0;
      for (const buf of buffers) {
        combined.set(buf, offset);
        offset += buf.length;
      }

      return combined.buffer;
    } catch (e) {
      console.warn('Offline fallback for downloadFileContent:', e);
      const localFile = await getLocalFile(fileId);
      if (localFile && localFile.data) {
        if (onProgress) onProgress(100);
        return localFile.data;
      }
      throw new Error('File not available offline');
    }
  },

  async verifyVaultDag(userId: number): Promise<{ success: boolean; isValidChain: boolean; count: number; errors: any[] }> {
    const res = await fetch(`/api/vault/verify-dag/${userId}`, {
      headers: { 'X-User-Id': userId.toString() }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to verify decentralized BlockDAG.');
    }
    return res.json();
  },

  async verifyVaultBlock(userId: number, fileId: number): Promise<{ success: boolean; isValid: boolean; audit: any }> {
    const res = await fetch(`/api/vault/verify-block/${fileId}`, {
      headers: { 'X-User-Id': userId.toString() }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to verify BlockDAG member.');
    }
    return res.json();
  },

  async rebuildVaultDag(userId: number): Promise<any> {
    const res = await fetch(`/api/vault/rebuild-dag/${userId}`, {
      method: "POST",
      headers: { 'X-User-Id': userId.toString() }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to rebuild DAG.');
    }
    return res.json();
  },

  async deepRecover(userId: number): Promise<any> {
    const res = await fetch(`/api/system/deep-recover/${userId}`, {
      method: "POST",
      headers: { 'X-User-Id': userId.toString() }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to perform deep system recovery.');
    }
    return res.json();
  },

  async exportVaultPack(userId: number): Promise<any> {
    const res = await fetch(`/api/vault/export-pack/${userId}`, {
      headers: { 'X-User-Id': userId.toString() }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to export master vault back-up pack.');
    }
    return res.json();
  },

  async importVaultPack(packData: any): Promise<{ success: boolean; user: UserProfile; recovery?: any; mesh_recovery?: number }> {
    const res = await fetch('/api/vault/import-pack', {
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
    return res.json();
  },

  async repairStorage(userId: number): Promise<{ success: boolean; message: string; stats?: any }> {
    const res = await fetch('/api/storage/repair', {
      method: 'POST',
      headers: { 'X-User-Id': userId.toString() }
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to perform storage repair scan.');
    }
    return res.json();
  },

  async downloadRawDatabase(userId: number): Promise<ArrayBuffer> {
    const res = await fetch('/api/admin/download-db', {
      headers: { 'X-User-Id': userId.toString() }
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
        'X-User-Id': userId.toString()
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
      headers: { 'X-User-Id': userId.toString() }
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
  }
};
