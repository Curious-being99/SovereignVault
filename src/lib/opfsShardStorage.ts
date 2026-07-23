/**
 * High-efficiency Origin Private File System (OPFS) Shard Storage
 * Stores and retrieves encrypted file shards directly on the local hard drive
 * without memory bloat or the 5MB localStorage limitation.
 */

async function getOpfsShardDir(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
    return null;
  }
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('p2p_stored_shards', { create: true });
  } catch (e) {
    console.error('[OPFSShardStorage] Failed to access OPFS root directory:', e);
    return null;
  }
}

export async function writeOpfsShard(hash: string, data: ArrayBuffer | Uint8Array): Promise<boolean> {
  const dir = await getOpfsShardDir();
  if (!dir) return false;
  try {
    const fileHandle = await dir.getFileHandle(`${hash}.bin`, { create: true });
    // Create a writable stream (supported in modern browsers)
    // @ts-ignore
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();
    return true;
  } catch (e) {
    console.error(`[OPFSShardStorage] Failed to write shard ${hash} to OPFS:`, e);
    return false;
  }
}

export async function readOpfsShard(hash: string): Promise<ArrayBuffer | null> {
  const dir = await getOpfsShardDir();
  if (!dir) return null;
  try {
    const fileHandle = await dir.getFileHandle(`${hash}.bin`);
    const file = await fileHandle.getFile();
    return await file.arrayBuffer();
  } catch (e) {
    // Shard not found locally, which is expected for remote shards
    return null;
  }
}

export async function deleteOpfsShard(hash: string): Promise<boolean> {
  const dir = await getOpfsShardDir();
  if (!dir) return false;
  try {
    await dir.removeEntry(`${hash}.bin`);
    return true;
  } catch (e) {
    console.error(`[OPFSShardStorage] Failed to delete shard ${hash} from OPFS:`, e);
    return false;
  }
}

export async function listStoredShardHashes(): Promise<Set<string>> {
  const hashes = new Set<string>();
  const dir = await getOpfsShardDir();
  if (!dir) return hashes;
  try {
    // @ts-ignore
    for await (const name of dir.keys()) {
      if (name.endsWith('.bin')) {
        const hash = name.substring(0, name.length - 4);
        hashes.add(hash);
      }
    }
  } catch (e) {
    console.error('[OPFSShardStorage] Failed to list stored shards from OPFS:', e);
  }
  return hashes;
}

export async function clearAllStoredShards(): Promise<void> {
  const dir = await getOpfsShardDir();
  if (!dir) return;
  try {
    // @ts-ignore
    for await (const name of dir.keys()) {
      await dir.removeEntry(name);
    }
    console.log('[OPFSShardStorage] Cleared all hosted peer shards from OPFS.');
  } catch (e) {
    console.error('[OPFSShardStorage] Failed to clear OPFS shards:', e);
  }
}

export async function getOpfsShardStorageEstimate(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0
      };
    } catch (e) {}
  }
  return { usage: 0, quota: 0 };
}
