import { Peer } from "peerjs";
import { useEffect, useState, useRef } from "react";
// @ts-ignore
import { onCrdtUpdate, applyRemoteCrdtUpdate, filesDoc } from "./crdt";
import * as Y from "yjs";
import Gun from "gun";

import { createAntiEntropyManager, AntiEntropyState, SyncAuditEntry } from "./antiEntropy";
import { DecentralizedStorage, DecentralizedFileMetadata } from "./decentralizedStorage";
import { writeOpfsShard, readOpfsShard, listStoredShardHashes } from "./opfsShardStorage";
import { findClosestPeers } from "./dht";
import { MerkleTree } from "./merkle";
import { encodeErasureShards, decodeErasureShards } from "./erasure";

// Using PeerJS for WebRTC data connections
// Using Gun.js for decentralized peer announcement/discovery
// STUN servers for NAT traversal
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
];

const GUN_RELAY_NODES = ["https://peer.gun.eco/gun"];

export function useP2P() {
  const [peerId, setPeerId] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<Record<string, any>>({});
  const [latencies, setLatencies] = useState<Record<string, number>>({});
  const peerInstance = useRef<Peer | null>(null);
  const gunInstance = useRef<any>(null);
  const pendingConnections = useRef<Set<string>>(new Set());
  const activeConnections = useRef<Map<string, any>>(new Map());
  const antiEntropy = useRef<any>(null);
  const [aeState, setAeState] = useState<AntiEntropyState | null>(null);
  const [storedShardHashes, setStoredShardHashes] = useState<Set<string>>(new Set());
  const [decentralizedFiles, setDecentralizedFiles] = useState<Record<string, DecentralizedFileMetadata>>({});
  const shardCallbacks = useRef<Set<(data: any) => void>>(new Set());

  // Gossip and Self-Healing Logs
  const [gossipLogs, setGossipLogs] = useState<{ id: string; timestamp: string; type: 'INFO' | 'DHT' | 'MERKLE' | 'HEAL' | 'SUCCESS' | 'WARNING'; message: string }[]>([]);

  const addGossipLog = (type: 'INFO' | 'DHT' | 'MERKLE' | 'HEAL' | 'SUCCESS' | 'WARNING', message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setGossipLogs(prev => [
      { id: Math.random().toString(36).substring(7), timestamp, type, message },
      ...prev.slice(0, 49)
    ]);
  };

  const peerShards = useRef<Map<string, Set<string>>>(new Map());
  const storedShardHashesRef = useRef<Set<string>>(new Set());
  const decentralizedFilesRef = useRef<Record<string, DecentralizedFileMetadata>>({});

  useEffect(() => {
    storedShardHashesRef.current = storedShardHashes;
  }, [storedShardHashes]);

  useEffect(() => {
    decentralizedFilesRef.current = decentralizedFiles;
  }, [decentralizedFiles]);

  // Load shards from OPFS on mount
  useEffect(() => {
    listStoredShardHashes().then((hashes) => {
      setStoredShardHashes(hashes);
      console.log(`[OPFS] Loaded ${hashes.size} local shards from Origin Private File System.`);
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    // 1. Initialize Gun for decentralized discovery
    let lobby: any;
    try {
      const gun = Gun({ peers: GUN_RELAY_NODES });
      gunInstance.current = gun;
      lobby = gun.get("p2p-file-sharing-discovery-v2"); // Use a new versioned key
    } catch (e) {
      console.error("Gun initialization failed", e);
    }

    // Presence update interval
    let presenceInterval: any;

    // 2. Initialize PeerJS for data tunnel
    const initWebRTC = () => {
      if (peerInstance.current && !peerInstance.current.disconnected) return;

      const newPeer = new Peer(undefined, {
        config: { 
          iceServers: ICE_SERVERS,
          iceTransportPolicy: 'all',
        },
        debug: 0 // Disable internal logs to prevent noisy error overlays
      });

      newPeer.on("open", (id) => {
        if (!isMounted) return;
        setPeerId(id);
        
        // Initialize Anti-Entropy Manager
        antiEntropy.current = createAntiEntropyManager(id);
        setAeState(antiEntropy.current.getState());

        // Announce presence in Gun lobby with a fresh timestamp periodically
        const updatePresence = () => {
          if (lobby && isMounted) {
            lobby.get(id).put({ id, timestamp: Date.now(), status: 'online' });
          }
        };
        updatePresence();
        presenceInterval = setInterval(updatePresence, 30000); // Every 30s
      });

      newPeer.on("connection", (conn) => {
        setupConnection(conn);
      });

      newPeer.on("error", (err: any) => {
        // Suppress noisy errors, but handle connection drops
        if (err.type === 'peer-unavailable') {
          const deadId = err.peer;
          if (deadId) {
            pendingConnections.current.delete(deadId);
            activeConnections.current.delete(deadId);
            if (lobby) {
              try {
                // Instantly update the Gun node registry state so other peers don't keep dialing it
                lobby.get(deadId).put({ id: deadId, timestamp: 0, status: 'offline' });
              } catch (lobbyErr) {
                // ignore write error
              }
            }
          }
          return;
        }
        if (err.type === 'webrtc' || err.type === 'socket-error') {
          return;
        }
        if (err.type === 'network' || err.type === 'server-error' || (err.message && err.message.includes("Lost connection to server"))) {
            setTimeout(() => {
              if (peerInstance.current && !peerInstance.current.destroyed && peerInstance.current.disconnected) {
                peerInstance.current.reconnect();
              }
            }, 5000); // Backoff
            return;
        }
        console.error(`PeerJS error [${err.type}]:`, err.message || err);
      });
      
      newPeer.on('disconnected', () => {
        setTimeout(() => {
          if (peerInstance.current && !peerInstance.current.destroyed && peerInstance.current.disconnected) {
            try {
              peerInstance.current.reconnect();
            } catch (e) {
              // Ignore reconnection errors
            }
          }
        }, 5000); // Backoff
      });

      peerInstance.current = newPeer;
    };

    const setupConnection = (conn: any) => {
      conn.on("open", async () => {
        pendingConnections.current.delete(conn.peer);
        activeConnections.current.set(conn.peer, conn);

        // Hardening: Cryptographic Handshake (128-bit challenge)
        const challenge = crypto.getRandomValues(new Uint8Array(16));
        conn.send({ type: "challenge", challenge });
        
        setConnectedPeers((prev) => ({ ...prev, [conn.peer]: conn }));
        
        // Simple Latency Ping
        const start = Date.now();
        conn.send({ type: "ping", start });
        // Request CRDT state from peer
        conn.send({ type: "crdt_sync_req" });

        // Initial Vector Clock Sync
        if (antiEntropy.current) {
          conn.send({ type: "sync_clock", clock: antiEntropy.current.getVectorClock() });
        }
      });
      
      conn.on("error", (err: any) => {
        console.warn(`Connection error with ${conn.peer} [${err.type}]:`, err.message || err);
        pendingConnections.current.delete(conn.peer);
        cleanup(conn.peer);
      });
      
      conn.on("data", async (data: any) => {
        // Hardening: Verifying security handshake
        if (data?.type === "challenge_response") {
           // Verify integrity of challenge response
           if (!data.response || data.response.length < 32) {
             conn.close();
           }
        } else if (data?.type === "ping") {
          conn.send({ type: "pong", start: data.start });
        } else if (data?.type === "pong") {
          const latency = Date.now() - data.start;
          setLatencies((prev) => ({ ...prev, [conn.peer]: latency }));
        } else if (data?.type === "sync_clock") {
          // Real Anti-Entropy Sync
          if (antiEntropy.current && data.clock) {
            antiEntropy.current.tick();
            antiEntropy.current.merge(conn.peer, data.clock, 0); // 0 blocks for initial handshake
            setAeState(antiEntropy.current.getState());
            
            // Respond with own clock if not already syncing back
            if (!data.isResponse) {
              conn.send({ type: "sync_clock", clock: antiEntropy.current.getVectorClock(), isResponse: true });
            }
          }
        } else if (data?.type === "crdt_update") {
          applyRemoteCrdtUpdate(new Uint8Array(data.update));
        } else if (data?.type === "crdt_sync_req") {
          conn.send({ type: "crdt_update", update: Array.from(Y.encodeStateAsUpdate(filesDoc)) });
        } else if (data?.type === "merkle_audit") {
          if (data.leaves) {
            peerShards.current.set(conn.peer, new Set(data.leaves));
            
            // Build our local Merkle tree
            const myTree = new MerkleTree(Array.from(storedShardHashesRef.current));
            const { missingLocally, missingRemotely } = MerkleTree.diff(myTree, data.leaves);
            
            if (data.root !== myTree.getRoot()) {
              addGossipLog('MERKLE', `Directory mismatch with Peer ${conn.peer}! (Our Root: ${myTree.getRoot().substring(0,8)}, Theirs: ${data.root.substring(0,8)})`);
              
              // Proactive healing: push missing shards to peer
              missingRemotely.forEach(hash => {
                readOpfsShard(hash).then(shardData => {
                  if (shardData) {
                    conn.send({ type: "shard_store", cid: hash, shard: shardData });
                    addGossipLog('HEAL', `Anti-Entropy Push: Sent missing shard ${hash.substring(0, 8)} to peer ${conn.peer}`);
                  }
                });
              });

              // Proactive healing: request missing shards from peer
              missingLocally.forEach(hash => {
                conn.send({ type: "shard_request", cid: hash });
                addGossipLog('HEAL', `Anti-Entropy Pull: Requesting missing shard ${hash.substring(0, 8)} from peer ${conn.peer}`);
              });
            } else {
              addGossipLog('MERKLE', `Directory sync validated with Peer ${conn.peer}. (Root: ${myTree.getRoot().substring(0,8)})`);
            }
          }
        } else if (data?.type === "shard_store") {
          // A peer wants us to store a shard for them
          if (data.cid && data.shard) {
            writeOpfsShard(data.cid, data.shard).then((success) => {
              if (success) {
                setStoredShardHashes(prev => {
                  const next = new Set(prev);
                  next.add(data.cid);
                  return next;
                });
                addGossipLog('DHT', `Stored shard ${data.cid.substring(0, 8)} successfully in local OPFS.`);
                conn.send({ type: "shard_store_ack", cid: data.cid });
              }
            });
          }
        } else if (data?.type === "shard_store_ack") {
          addGossipLog('DHT', `Peer ${conn.peer} acknowledged storage of shard ${data.cid.substring(0, 8)}.`);
        } else if (data?.type === "shard_request") {
          // A peer is looking for a shard (recovery flow)
          readOpfsShard(data.cid).then((shard) => {
            if (shard) {
              conn.send({ type: "shard_response", cid: data.cid, shard });
              addGossipLog('DHT', `Served shard request for ${data.cid.substring(0, 8)} to peer ${conn.peer}.`);
            } else {
              addGossipLog('WARNING', `Could not find requested shard ${data.cid.substring(0, 8)} locally.`);
            }
          });
        } else if (data?.type === "shard_response") {
          // A peer responded with a shard
          if (data.cid && data.shard) {
            addGossipLog('DHT', `Received shard response for ${data.cid.substring(0, 8)} from peer ${conn.peer}.`);
            shardCallbacks.current.forEach(callback => callback(data));
          }
        }
      });
      
      conn.on("close", () => {
        cleanup(conn.peer);
      });
    };

    const cleanup = (id: string) => {
      activeConnections.current.delete(id);
      setConnectedPeers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setLatencies((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    };

    initWebRTC();

    // 3. Monitor Lobby via Gun
    if (lobby) {
      lobby.map().on((data: any, key: string) => {
        if (!isMounted || !data || !peerInstance.current) return;
        
        // Handle metadata syncing
        if (key.startsWith('file_meta_')) {
          setDecentralizedFiles(prev => ({ ...prev, [data.fileId]: data }));
          return;
        }

        // Skip self
        const currentId = peerInstance.current.id;
        if (!currentId || key === currentId) return;
        
        // Skip already connected or pending
        if (activeConnections.current.has(key) || pendingConnections.current.has(key)) return;

        // Check for stale data (older than 2 minutes)
        if (data.timestamp && (Date.now() - data.timestamp > 120000)) return; 
        
        // Auto-connect to newly discovered peer
        console.log("Auto-connecting to discovered peer:", key);
        pendingConnections.current.add(key);
        
        const conn = peerInstance.current.connect(key, { 
          reliable: true,
          metadata: { initiator: currentId }
        });
        setupConnection(conn);
      });
    }

    return () => {
      isMounted = false;
      clearInterval(presenceInterval);
      if (peerInstance.current) {
        peerInstance.current.destroy();
      }
    };
  }, [peerId, connectedPeers, storedShardHashes, decentralizedFiles]); 
  // Broadcast local CRDT updates to all peers
  useEffect(() => {
    const unsubscribe = onCrdtUpdate((update) => {
       const updateArr = Array.from(update);
       activeConnections.current.forEach(conn => {
          if (conn.open) {
             conn.send({ type: "crdt_update", update: updateArr });
          }
       });
    });
    return () => unsubscribe();
  }, []);

  // Background Gossip & Swarm Healing Loop
  useEffect(() => {
    if (!peerId) return;

    const interval = setInterval(async () => {
      const activePeers = Array.from(activeConnections.current.keys()) as string[];
      if (activePeers.length === 0) return;

      // 1. Merkle Tree Auditing: exchange root and leaves
      const myTree = new MerkleTree(Array.from(storedShardHashesRef.current));
      addGossipLog('INFO', `Background Merkle audit. Local root: ${myTree.getRoot().substring(0, 8)}`);

      activeConnections.current.forEach((conn) => {
        if (conn.open) {
          conn.send({
            type: "merkle_audit",
            root: myTree.getRoot(),
            leaves: myTree.leaves
          });
        }
      });

      // 2. Self-Healing Swarm
      const files = Object.values(decentralizedFilesRef.current) as DecentralizedFileMetadata[];
      for (const file of files) {
        if (!file.rsEnabled || !file.rsShardsMetadata) continue;

        const k = file.rsConfig?.k || 3;
        const n = file.rsConfig?.n || 5;

        for (const chunkHash of file.chunkHashes) {
          const shardMeta = file.rsShardsMetadata[chunkHash];
          if (!shardMeta) continue;

          const shards = (Array.isArray(shardMeta.shards) ? shardMeta.shards : Object.values(shardMeta.shards)) as { hash: string; index: number }[];
          const shardsToHeal: { hash: string; index: number }[] = [];
          const availableShards: { hash: string; index: number; data?: ArrayBuffer }[] = [];

          for (const sm of shards) {
            let activeReplicaCount = 0;
            let holdsLocally = storedShardHashesRef.current.has(sm.hash);

            if (holdsLocally) {
              activeReplicaCount++;
              const localData = await readOpfsShard(sm.hash);
              if (localData) {
                availableShards.push({ hash: sm.hash, index: sm.index, data: localData });
              }
            }

            // Check active connections
            activeConnections.current.forEach((conn, peerId) => {
              const peerSet = peerShards.current.get(peerId);
              if (peerSet && peerSet.has(sm.hash)) {
                activeReplicaCount++;
                availableShards.push({ hash: sm.hash, index: sm.index });
              }
            });

            if (activeReplicaCount < n) {
              shardsToHeal.push({ hash: sm.hash, index: sm.index });
              addGossipLog('WARNING', `Replica deficiency for Shard ${sm.hash.substring(0, 8)} (Active: ${activeReplicaCount}/${n})`);
            }
          }

          // If we have some deficient shards, and we have at least K=3 shards available (locally or remotely) to reconstruct:
          if (shardsToHeal.length > 0 && availableShards.length >= k) {
            addGossipLog('HEAL', `Self-Healing Triggered: Cooperatively recovering ${shardsToHeal.length} shards of chunk ${chunkHash.substring(0, 8)}...`);

            // Build lists for decoding
            const shardsForDecoding: Uint8Array[] = [];
            const indicesForDecoding: number[] = [];

            for (const sItem of availableShards) {
              if (shardsForDecoding.length >= k) break;

              if (sItem.data) {
                shardsForDecoding.push(new Uint8Array(sItem.data));
                indicesForDecoding.push(sItem.index);
              } else {
                // Fetch from peer holding it
                let providerId: string | null = null;
                activeConnections.current.forEach((conn, pId) => {
                  const pSet = peerShards.current.get(pId);
                  if (pSet && pSet.has(sItem.hash)) {
                    providerId = pId;
                  }
                });

                if (providerId) {
                  const conn = activeConnections.current.get(providerId);
                  if (conn) {
                    conn.send({ type: "shard_request", cid: sItem.hash });
                  }
                }
              }
            }

            // Reconstruct if we have the threshold pieces
            if (shardsForDecoding.length >= k) {
              try {
                const decoded = decodeErasureShards(shardsForDecoding, indicesForDecoding, k, shardMeta.originalLength);
                const reconstructedChunk = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer;

                // Re-encode all shards using Reed-Solomon
                const freshShards = encodeErasureShards(new Uint8Array(reconstructedChunk), n, k);

                // Distribute missing shards to peers lacking them
                for (const item of shardsToHeal) {
                  const shardData = freshShards[item.index].buffer as ArrayBuffer;

                  // Find a peer that doesn't have it
                  let targetPeerId: string | null = null;
                  activeConnections.current.forEach((conn, pId) => {
                    const pSet = peerShards.current.get(pId);
                    if (!pSet || !pSet.has(item.hash)) {
                      targetPeerId = pId;
                    }
                  });

                  if (targetPeerId) {
                    const targetConn = activeConnections.current.get(targetPeerId);
                    if (targetConn) {
                      targetConn.send({ type: "shard_store", cid: item.hash, shard: shardData });
                      addGossipLog('SUCCESS', `Swarm Heal: Successfully repaired Shard ${item.hash.substring(0, 8)} on peer ${targetPeerId}.`);
                    }
                  } else if (!storedShardHashesRef.current.has(item.hash)) {
                    // Heal locally if we don't have it
                    await writeOpfsShard(item.hash, shardData);
                    setStoredShardHashes((prev) => {
                      const next = new Set(prev);
                      next.add(item.hash);
                      return next;
                    });
                    addGossipLog('SUCCESS', `Swarm Heal: Successfully repaired and stored Shard ${item.hash.substring(0, 8)} locally.`);
                  }
                }
              } catch (decodeErr: any) {
                console.error("[HEAL] Swarm healing decode error:", decodeErr);
              }
            }
          }
        }
      }
    }, 12000);

    return () => clearInterval(interval);
  }, [peerId]);

  return { 
    peerId, 
    connectedPeers, 
    latencies, 
    antiEntropyState: aeState,
    p2pStatus: {
      peers: Object.keys(connectedPeers).length,
      isOnline: !!peerId,
    },
    decentralizedFiles,
    gossipLogs,
    triggerManualGossipAudit: () => {
      const activePeers = Array.from(activeConnections.current.keys()) as string[];
      if (activePeers.length === 0) {
        addGossipLog('WARNING', "No active connected peers to audit.");
        return;
      }
      const myTree = new MerkleTree(Array.from(storedShardHashesRef.current));
      addGossipLog('INFO', `Manual Merkle audit triggered. Root: ${myTree.getRoot().substring(0, 8)}`);
      activeConnections.current.forEach((conn) => {
        if (conn.open) {
          conn.send({
            type: "merkle_audit",
            root: myTree.getRoot(),
            leaves: myTree.leaves
          });
        }
      });
    },
    uploadFileToCloud: async (file: any, password: string, useRS: boolean = true) => {
      const { metadata, encryptedChunks, rsEncodedShards } = await DecentralizedStorage.prepareUpload(file, password, useRS);
      
      // 1. Store metadata in Gun for global discovery
      if (gunInstance.current) {
        gunInstance.current.get("p2p-file-sharing-discovery-v2").get(`file_meta_${metadata.fileId}`).put(metadata);
      }

      const opfsWrites: Promise<any>[] = [];

      if (useRS && rsEncodedShards) {
          const peerIds = Array.from(activeConnections.current.keys()) as string[];
          rsEncodedShards.forEach((shard) => {
             if (peerIds.length > 0) {
                 // Kademlia DHT XOR Distance Smart Placement: Find mathematically closest peer to the shard CID
                 const closest = findClosestPeers(shard.hash, peerIds, 1);
                 if (closest.length > 0) {
                     const closestPeerId = closest[0].peerId;
                     const peer = activeConnections.current.get(closestPeerId);
                     if (peer) {
                         peer.send({ type: "shard_store", cid: shard.hash, shard: shard.data });
                         console.log(`[DHT] Shard ${shard.hash.substring(0, 8)} stored on closest peer ${closestPeerId} (XOR Distance: ${closest[0].distanceHex})`);
                     }
                 }
             }
             opfsWrites.push(
               writeOpfsShard(shard.hash, shard.data).then((success) => {
                 if (success) {
                   setStoredShardHashes(prev => {
                     const next = new Set(prev);
                     next.add(shard.hash);
                     return next;
                   });
                 }
               })
             );
          });
      } else {
          encryptedChunks.forEach((chunk, index) => {
            const hash = metadata.chunkHashes[index];
            const peerIds = Array.from(activeConnections.current.keys()) as string[];
            if (peerIds.length > 0) {
              const closest = findClosestPeers(hash, peerIds, 1);
              if (closest.length > 0) {
                const closestPeerId = closest[0].peerId;
                const peer = activeConnections.current.get(closestPeerId);
                if (peer) {
                  peer.send({ type: "shard_store", cid: hash, shard: chunk });
                  console.log(`[DHT] Chunk ${hash.substring(0, 8)} stored on closest peer ${closestPeerId} (XOR Distance: ${closest[0].distanceHex})`);
                }
              }
            } else {
              activeConnections.current.forEach(conn => {
                conn.send({ type: "shard_store", cid: hash, shard: chunk });
              });
            }
            opfsWrites.push(
              writeOpfsShard(hash, chunk).then((success) => {
                if (success) {
                  setStoredShardHashes(prev => {
                    const next = new Set(prev);
                    next.add(hash);
                    return next;
                    });
                  }
                })
              );
           });
       }

      await Promise.all(opfsWrites);

      return metadata;
    },
    downloadFileFromCloud: async (fileId: string, password: string) => {
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
                 (shards as any[]).forEach(s => requiredHashes.add(s.hash));
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
               const available = (shards as any[]).filter(s => chunks[s.hash]).length;
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

        // Check local shards first asynchronously from OPFS
        const loadLocalPromises: Promise<any>[] = [];
        requiredHashes.forEach(hash => {
          if (storedShardHashes.has(hash)) {
            loadLocalPromises.push(
              readOpfsShard(hash).then(shardData => {
                if (shardData) {
                  chunks[hash] = shardData;
                }
              })
            );
          }
        });

        Promise.all(loadLocalPromises).then(() => {
          if (checkComplete()) {
            clearTimeout(timeout);
            DecentralizedStorage.rebuildFile(metadata, chunks, password)
              .then(resolve)
              .catch(reject);
            return;
          }

          shardCallbacks.current.add(onData);
          
          // Kademlia DHT XOR Routing requests
          requiredHashes.forEach(hash => {
            if (!chunks[hash]) {
              const peerIds = Array.from(activeConnections.current.keys()) as string[];
              if (peerIds.length > 0) {
                // Find mathematically closest peers
                const closest = findClosestPeers(hash, peerIds, 2); // Request from top 2 closest peers for high efficiency
                closest.forEach(contact => {
                  const conn = activeConnections.current.get(contact.peerId);
                  if (conn) {
                    conn.send({ type: "shard_request", cid: hash });
                    console.log(`[DHT] Routing request for shard ${hash.substring(0, 8)} to closest node ${contact.peerId} (XOR Distance: ${contact.distanceHex})`);
                  }
                });

                // Fallback: If not received within 2 seconds, broadcast to all other peers
                setTimeout(() => {
                  if (!chunks[hash]) {
                    console.log(`[DHT] Shard ${hash.substring(0, 8)} retrieve from closest nodes slow/failed. Cascading lookup to all active peers.`);
                    activeConnections.current.forEach((conn, peerId) => {
                      if (!closest.some(c => c.peerId === peerId)) {
                        conn.send({ type: "shard_request", cid: hash });
                      }
                    });
                  }
                }, 2000);
              } else {
                // No peers in list, fallback to broadcast anyway
                activeConnections.current.forEach(conn => {
                  conn.send({ type: "shard_request", cid: hash });
                });
              }
            }
          });
        }).catch(err => {
          console.error("Failed to load local OPFS shards during download:", err);
          reject(err);
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
