import { encryptData, decryptData, computeFileHash } from './encryption';
import { encodeErasureShards, decodeErasureShards } from './erasure';
import { FileData } from './db';

const CHUNK_SIZE = 1024 * 1024; // 1MB chunks

export interface ChunkMetadata {
  id: string;
  hash: string;
  peerIds: string[];
}

export interface DecentralizedFileMetadata {
  fileId: string;
  name: string;
  size: number;
  type: string;
  totalChunks: number;
  chunkHashes: string[]; // For non-RS or RS chunk group IDs
  sssEnabled: boolean;
  rsEnabled?: boolean;
  rsConfig?: { n: number; k: number };
  rsShardsMetadata?: Record<string, { originalLength: number, shards: { hash: string, index: number }[] }>; // Map of chunkHash -> shard metadata
  timestamp: number;
}

export class DecentralizedStorage {
  static async prepareUpload(file: FileData, password: string, useRS: boolean = false) {
    const data = file.data;
    const totalChunks = Math.ceil(data.byteLength / CHUNK_SIZE) || 1;
    const chunkHashes: string[] = [];
    const encryptedChunks: ArrayBuffer[] = [];
    
    // For Erasure Coding
    const rsShardsMetadata: Record<string, { originalLength: number, shards: { hash: string, index: number }[] }> = {};
    const rsEncodedShards: { hash: string, data: ArrayBuffer, index: number, chunkHash: string }[] = [];

    const n = 5;
    const k = 3;

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, data.byteLength);
      let chunk = data.slice(start, end);
      if (chunk.byteLength === 0) {
          chunk = new ArrayBuffer(1);
      }

      // Encrypt chunk
      const encryptedChunk = await encryptData(chunk as ArrayBuffer, password);
      
      const chunkHash = await computeFileHash(encryptedChunk);
      chunkHashes.push(chunkHash);

      if (useRS) {
        // Apply Erasure Coding (Reed-Solomon)
        const encryptedBytes = new Uint8Array(encryptedChunk);
        const shards = encodeErasureShards(encryptedBytes, n, k);
        const shardList: { hash: string, index: number }[] = [];
        
        for (let sIdx = 0; sIdx < shards.length; sIdx++) {
           const shardData = shards[sIdx].buffer as ArrayBuffer;
           const shardHash = await computeFileHash(shardData);
           shardList.push({ hash: shardHash, index: sIdx });
           rsEncodedShards.push({ hash: shardHash, data: shardData, index: sIdx, chunkHash });
        }
        rsShardsMetadata[chunkHash] = {
           originalLength: encryptedBytes.length,
           shards: shardList
        };
      } else {
        encryptedChunks.push(encryptedChunk);
      }
    }

    const metadata: DecentralizedFileMetadata = {
      fileId: file.id?.toString() || Math.random().toString(36).substring(7),
      name: file.name,
      size: file.size || data.byteLength,
      type: file.type,
      totalChunks,
      chunkHashes,
      sssEnabled: useRS, // Keep legacy flag name if used elsewhere, but meaning RS
      rsEnabled: useRS,
      rsConfig: useRS ? { n, k } : undefined,
      rsShardsMetadata: useRS ? rsShardsMetadata : undefined,
      timestamp: Date.now(),
    };

    return { metadata, encryptedChunks, rsEncodedShards };
  }

    static async rebuildFile(metadata: DecentralizedFileMetadata, chunks: Record<string, ArrayBuffer>, password: string): Promise<ArrayBuffer> {
    const decryptedChunks: ArrayBuffer[] = [];
    const chunkHashes = Array.isArray(metadata.chunkHashes) ? metadata.chunkHashes : Object.values(metadata.chunkHashes || {});

    for (const chunkHash of chunkHashes) {
      let encryptedChunk: ArrayBuffer;

      if (metadata.rsEnabled || metadata.sssEnabled) {
         const shardMeta = metadata.rsShardsMetadata?.[chunkHash as string];
         if (!shardMeta) throw new Error("Missing RS metadata for chunk");
         
         const availableShards: Uint8Array[] = [];
         const shardIndices: number[] = [];
         
         const shards = Array.isArray(shardMeta.shards) ? shardMeta.shards : Object.values(shardMeta.shards);

         for (const sm of shards as any[]) {
             if (chunks[sm.hash]) {
                 availableShards.push(new Uint8Array(chunks[sm.hash]));
                 shardIndices.push(sm.index);
             }
         }
         
         const k = metadata.rsConfig?.k || 3;
         if (availableShards.length < k) {
             throw new Error(`Cannot rebuild file: Only found ${availableShards.length}/${k} required RS shards for chunk ${chunkHash}`);
         }
         
         const decoded = decodeErasureShards(availableShards.slice(0, k), shardIndices.slice(0, k), k, shardMeta.originalLength);
         encryptedChunk = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer;
      } else {
         const chunk = chunks[chunkHash as string];
         if (!chunk) throw new Error(`Missing chunk with hash: ${chunkHash}`);
         encryptedChunk = chunk;
      }

      const decrypted = await decryptData(encryptedChunk, password);
      decryptedChunks.push(decrypted);
    }

    const totalLength = decryptedChunks.reduce((acc, c) => acc + c.byteLength, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of decryptedChunks) {
      result.set(new Uint8Array(chunk), offset);
      offset += chunk.byteLength;
    }

    return result.buffer;
  }
}
