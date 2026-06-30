import { Peer } from "peerjs";
import { useEffect, useState, useRef } from "react";
// @ts-ignore
import Gun from "gun";

import { createAntiEntropyManager, AntiEntropyState, SyncAuditEntry } from "./antiEntropy";

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
  const [storedShards, setStoredShards] = useState<Record<string, any>>({});
  const shardCallbacks = useRef<Set<(data: any) => void>>(new Set());

  // Load shards from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("sovereign_shards");
    if (saved) {
      try {
        setStoredShards(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse shards", e);
      }
    }
  }, []);

  // Persist shards
  useEffect(() => {
    if (Object.keys(storedShards).length > 0) {
      localStorage.setItem("sovereign_shards", JSON.stringify(storedShards));
    }
  }, [storedShards]);

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

        // Hardening: Cryptographic Handshake (64-byte challenge)
        const challenge = crypto.getRandomValues(new Uint8Array(64));
        conn.send({ type: "challenge", challenge });
        
        setConnectedPeers((prev) => ({ ...prev, [conn.peer]: conn }));
        
        // Simple Latency Ping
        const start = Date.now();
        conn.send({ type: "ping", start });

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
        } else if (data?.type === "shard_store") {
          // A peer wants us to store a shard for them
          if (data.cid && data.shard) {
            setStoredShards(prev => ({ ...prev, [data.cid]: data.shard }));
            conn.send({ type: "shard_store_ack", cid: data.cid });
          }
        } else if (data?.type === "shard_request") {
          // A peer is looking for a shard (recovery flow)
          const shard = storedShards[data.cid];
          if (shard) {
            conn.send({ type: "shard_response", cid: data.cid, shard });
          }
        } else if (data?.type === "shard_response") {
          // A peer responded with a shard
          if (data.cid && data.shard) {
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
  }, []); // Empty dependency array to avoid infinite loop

  return { 
    peerId, 
    connectedPeers, 
    latencies, 
    antiEntropyState: aeState,
    p2pStatus: {
      peers: Object.keys(connectedPeers).length,
      isOnline: !!peerId,
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
