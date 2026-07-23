import fs from 'fs';

const p2p = fs.readFileSync('src/lib/p2p.ts', 'utf-8');
const lines = p2p.split('\n');

const downloadIndex = lines.findIndex(l => l.includes('downloadFileFromCloud: async (fileId: string, password: string) => {'));

const prefix = lines.slice(0, downloadIndex).join('\n');

const correctSuffix = `    downloadFileFromCloud: async (fileId: string, password: string) => {
      const metadata = decentralizedFiles[fileId];
      if (!metadata) throw new Error("Metadata not found for file: " + fileId);

      const chunks: Record<string, ArrayBuffer> = {};
      
      // GunJS transforms arrays to objects sometimes
      const chunkHashes = Array.isArray(metadata.chunkHashes) ? metadata.chunkHashes : Object.values(metadata.chunkHashes || {});
      metadata.chunkHashes = chunkHashes as any;
      
      // Compute all hashes we need
      const requiredHashes = new Set<string>();
      if (metadata.rsEnabled || metadata.sssEnabled) {
          for (const chash of metadata.chunkHashes) {
             const sm = metadata.rsShardsMetadata?.[chash];
             if (sm) {
                 const shards = Array.isArray(sm.shards) ? sm.shards : Object.values(sm.shards);
                 shards.forEach(s => requiredHashes.add(s.hash));
             }
          }
      } else {
          metadata.chunkHashes.forEach(h => requiredHashes.add(h));
      }

      const checkComplete = () => {
         if (metadata.rsEnabled || metadata.sssEnabled) {
            let complete = true;
            for (const chash of metadata.chunkHashes) {
               const sm = metadata.rsShardsMetadata?.[chash];
               if (!sm) continue;
               const k = metadata.rsConfig?.k || 3;
               const shards = Array.isArray(sm.shards) ? sm.shards : Object.values(sm.shards);
               const available = shards.filter(s => chunks[s.hash]).length;
               if (available < k) {
                  complete = false;
                  break;
               }
            }
            return complete;
         } else {
            return Object.keys(chunks).length === metadata.totalChunks;
         }
      };

      return new Promise<ArrayBuffer>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Download timed out. Not all chunks retrieved."));
        }, 30000);

        const onData = (data: any) => {
          if (data.type === "shard_response" && requiredHashes.has(data.cid)) {
            chunks[data.cid] = data.shard;
            if (checkComplete()) {
              clearTimeout(timeout);
              shardCallbacks.current.delete(onData);
              DecentralizedStorage.rebuildFile(metadata, chunks, password)
                .then(resolve)
                .catch(reject);
            }
          }
        };

        // Check local shards first
        requiredHashes.forEach(hash => {
          if (storedShards[hash]) {
            chunks[hash] = storedShards[hash];
          }
        });

        if (checkComplete()) {
          clearTimeout(timeout);
          DecentralizedStorage.rebuildFile(metadata, chunks, password)
            .then(resolve)
            .catch(reject);
          return;
        }

        shardCallbacks.current.add(onData);
        
        // Broadcast requests
        requiredHashes.forEach(hash => {
          if (!chunks[hash]) {
            activeConnections.current.forEach(conn => {
              conn.send({ type: "shard_request", cid: hash });
            });
          }
        });
      });
    },
    broadcastShard: (cid: string, shard: any) => {
      activeConnections.current.forEach(conn => {
        conn.send({ type: "shard_store", cid, shard });
      });
    },
    requestShard: (cid: string) => {
      activeConnections.current.forEach(conn => {
        conn.send({ type: "shard_request", cid });
      });
    },
    onShardReceived: (callback: (data: any) => void) => {
      shardCallbacks.current.add(callback);
      return () => shardCallbacks.current.delete(callback);
    }
  };
}
`;

fs.writeFileSync('src/lib/p2p.ts', prefix + '\n' + correctSuffix);
console.log("Fixed p2p.ts");
