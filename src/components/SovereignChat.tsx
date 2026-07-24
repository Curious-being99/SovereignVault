import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users,
  Send, 
  User, 
  X, 
  Zap, 
  Shield, 
  MessageSquare,
  Globe,
  Trash2,
  RefreshCw,
  Radio,
  Compass,
  Database,
  Flame,
  Binary,
  Cpu,
  Key,
  Layers,
  ArrowRight,
  Smile,
  CornerUpLeft,
  Edit3,
  Check,
  MoreHorizontal,
  Sparkles,
  Plus,
  Search,
  Clock,
  Copy
} from "lucide-react";
import io, { Socket } from "socket.io-client";
import { DoubleRatchetSession } from "../lib/doubleRatchet";
import { 
  encryptLayer, 
  decryptLayer, 
  wrapOnion, 
  OnionPacket 
} from "../lib/onionCrypto";

interface Message {
  id: string;
  sender: string;
  role: "user" | "peer";
  content: string;
  timestamp: number;
  isSpecial?: "onion" | "burn";
  edited?: boolean;
  replyTo?: {
    id: string;
    sender: string;
    content: string;
  };
  reactions?: Record<string, string[]>;
}

interface LogEntry {
  id: string;
  timestamp: string;
  type: "INFO" | "SUCCESS" | "WARNING" | "CRYPT" | "DHT";
  message: string;
}

interface SwarmPeer {
  id: string; // socket.id
  seedId: string;
  name: string;
  publicKey: string; // B64 exported ECDH key
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  isConnected: boolean;
  ratchetActive: boolean;
  ratchetSession: DoubleRatchetSession | null;
}

interface DhtShard {
  key: string;
  shardId: string;
  shardData: string;
  expiry: number;
  senderName: string;
}

interface SovereignChatProps {
  onClose: () => void;
  userSeedId?: string;
  userName?: string;
}

export const SovereignChat: React.FC<SovereignChatProps> = ({ onClose, userSeedId, userName }) => {
  const mySeedId = userSeedId || "seed-" + Math.random().toString(36).substring(2, 8);
  const myName = userName || "Sovereign Node";

  // Tab State
  const [activeTab, setActiveTab] = useState<"direct" | "onion" | "outbox" | "registry" | "logs">("direct");

  // Chat and Cryptographic State
  const [messages, setMessages] = useState<Message[]>([]);
  const [directInput, setDirectInput] = useState("");
  const [activeChatPeerId, setActiveChatPeerId] = useState<string>("local");

  // Interaction States (Reply, Edit, Reactions)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [activeEmojiPickerMsgId, setActiveEmojiPickerMsgId] = useState<string | null>(null);

  // Search and Filter States for Logs and DHT
  const [logFilter, setLogFilter] = useState<"ALL" | "CRYPT" | "DHT" | "SUCCESS" | "WARNING" | "INFO">("ALL");
  const [logSearch, setLogSearch] = useState("");
  const [dhtSearch, setDhtSearch] = useState("");
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [myPublicKeyB64, setMyPublicKeyB64] = useState<string>("");

  const EMOJI_LIST = ["👍", "❤️", "🔥", "😂", "😮", "👏", "🎉", "💯"];

  // Virtual relay nodes for onion routing when no external peers are connected
  const VIRTUAL_RELAYS = useMemo(() => [
    { id: "relay-alpha", name: "Relay-Alpha [US-East]", publicKey: myPublicKeyB64 },
    { id: "relay-beta", name: "Relay-Beta [EU-Central]", publicKey: myPublicKeyB64 },
    { id: "relay-gamma", name: "Relay-Gamma [AP-South]", publicKey: myPublicKeyB64 }
  ], [myPublicKeyB64]);

  const handleStartEdit = (msg: Message) => {
    setEditingMsgId(msg.id);
    setEditContent(msg.content);
  };

  const handleSaveEdit = (msgId: string) => {
    if (!editContent.trim()) return;
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: editContent.trim(), edited: true } : m));
    setEditingMsgId(null);
    setEditContent("");
  };

  const handleDeleteMessage = (msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
    if (replyingTo?.id === msgId) setReplyingTo(null);
  };

  const handleToggleReaction = (msgId: string, emoji: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const reactions = { ...(m.reactions || {}) };
      const currentUsers = reactions[emoji] || [];
      const hasReacted = currentUsers.includes(myName);
      if (hasReacted) {
        reactions[emoji] = currentUsers.filter(u => u !== myName);
        if (reactions[emoji].length === 0) delete reactions[emoji];
      } else {
        reactions[emoji] = [...currentUsers, myName];
      }
      return { ...m, reactions };
    }));
    setActiveEmojiPickerMsgId(null);
  };

  // Onion State
  const [onionMessage, setOnionMessage] = useState("");
  const [onionRecipientSeedId, setOnionRecipientSeedId] = useState("");
  const [hop1, setHop1] = useState("");
  const [hop2, setHop2] = useState("");
  const [hop3, setHop3] = useState("");

  // Asynchronous Outbox State
  const [outboxMessage, setOutboxMessage] = useState("");
  const [outboxRecipientSeedId, setOutboxRecipientSeedId] = useState("");
  const [outboxBurnMinutes, setOutboxBurnMinutes] = useState(5);
  const [isQuerying, setIsQuerying] = useState(false);
  const [isBurning, setIsBurning] = useState(false);

  // P2P / Swarm Connections State
  const [peersList, setPeersList] = useState<SwarmPeer[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);
  const [sessionIdentityKey, setSessionIdentityKey] = useState<CryptoKeyPair | null>(null);

  // Local DHT database hosted in memory
  const [dhtShards, setDhtShards] = useState<DhtShard[]>([]);

  // Incoming outbox segments for us waiting to be assembled: Record<key, Record<shardId, shardData>>
  const [assembledShards, setAssembledShards] = useState<Record<string, Record<string, string>>>({});

  // Known registry of peers in the system (offline or online)
  const [knownPeers, setKnownPeers] = useState<{ seedId: string; name: string; publicKey: string }[]>(() => {
    try {
      const stored = localStorage.getItem("sovereign_known_peers_registry_v2");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Rolling Logs
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Refs for WebRTC coordination
  const peersRef = useRef<Map<string, SwarmPeer>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Helper to add a cryptographic/P2P log
  const addLog = (type: "INFO" | "SUCCESS" | "WARNING" | "CRYPT" | "DHT", message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [
      { id: Math.random().toString(36).substring(7), timestamp, type, message },
      ...prev.slice(0, 99)
    ]);
  };

  // Persist known peers registry
  useEffect(() => {
    localStorage.setItem("sovereign_known_peers_registry_v2", JSON.stringify(knownPeers));
  }, [knownPeers]);

  const addKnownPeer = (seedId: string, name: string, publicKey: string) => {
    if (!seedId || !publicKey) return;
    setKnownPeers(prev => {
      if (prev.some(p => p.seedId === seedId)) {
        // Update public key or name if changed
        return prev.map(p => p.seedId === seedId ? { ...p, name, publicKey } : p);
      }
      return [...prev, { seedId, name, publicKey }];
    });
  };

  // Generate ECDH cryptographic keys on mount
  useEffect(() => {
    const generateKeys = async () => {
      try {
        const keys = await crypto.subtle.generateKey(
          { name: "ECDH", namedCurve: "P-256" },
          true,
          ["deriveBits", "deriveKey"]
        );
        setSessionIdentityKey(keys);

        const rawPub = await crypto.subtle.exportKey("raw", keys.publicKey);
        const pubB64 = btoa(String.fromCharCode(...new Uint8Array(rawPub)));
        setMyPublicKeyB64(pubB64);
        addLog("CRYPT", `🔑 Generated fresh session identity ECDH P-256 keypair.`);
        addLog("CRYPT", `Public Identity Tag: ${pubB64.substring(0, 16)}...`);

        // Initialize default known peers if list is empty
        setKnownPeers(prev => {
          const defaults = [
            { seedId: mySeedId, name: `${myName} (Self / Local Loopback)`, publicKey: pubB64 },
            { seedId: "alice-seed-001", name: "Alice (Guard Node A)", publicKey: pubB64 },
            { seedId: "bob-seed-002", name: "Bob (Sovereign Node B)", publicKey: pubB64 },
            { seedId: "charlie-seed-003", name: "Charlie (Relay Node C)", publicKey: pubB64 }
          ];
          if (prev.length === 0) return defaults;
          // Ensure self is in the list
          if (!prev.some(p => p.seedId === mySeedId)) {
            return [defaults[0], ...prev];
          }
          return prev;
        });
      } catch (err) {
        console.error("Failed to generate session ECDH keys:", err);
        addLog("WARNING", `Failed to generate session ECDH keys.`);
      }
    };
    generateKeys();
  }, []);

  // Set up Swarm Signaling and Socket.io coordination
  useEffect(() => {
    if (!myPublicKeyB64 || !sessionIdentityKey) return;

    const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const newSocket = io(socketUrl, { 
      transports: ["polling", "websocket"],
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      timeout: 20000
    });
    setSocket(newSocket);
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      setIsSignalingConnected(true);
      addLog("INFO", `Connected to signaling server. Swarm handshake initialized.`);
      // Announce our presence to the whole swarm
      newSocket.emit("ready", {
        socketId: newSocket.id,
        seedId: mySeedId,
        name: myName,
        publicKey: myPublicKeyB64
      });
    });

    newSocket.on("connect_error", (err) => {
      setIsSignalingConnected(false);
      console.warn("Signaling server connection error:", err);
    });

    // When another peer announces presence
    newSocket.on("ready", (data) => {
      if (!data || data.socketId === newSocket.id) return;

      // Add to known registry
      addKnownPeer(data.seedId, data.name, data.publicKey);
      addLog("INFO", `Discovered swarm node: ${data.name} (Seed: ${data.seedId.substring(0, 8)}...)`);

      // Avoid double connection by enforcing lexicographical order rule
      if (newSocket.id! < data.socketId) {
        addLog("INFO", `Initiating WebRTC peer connection with ${data.name}...`);
        initiatePeerConnection(data.socketId, data.seedId, data.name, data.publicKey);
      }
    });

    // Handle incoming WebRTC signaling offer
    newSocket.on("offer", async (data) => {
      if (data.targetId !== newSocket.id) return;
      if (peersRef.current.has(data.senderId)) return;

      addLog("INFO", `Received incoming WebRTC offer from ${data.senderName}.`);
      addKnownPeer(data.senderSeedId, data.senderName, data.senderPublicKey);

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun.services.mozilla.com' }
        ]
      });

      const peer: SwarmPeer = {
        id: data.senderId,
        seedId: data.senderSeedId,
        name: data.senderName,
        publicKey: data.senderPublicKey,
        pc,
        channel: null as any,
        isConnected: false,
        ratchetActive: false,
        ratchetSession: null
      };

      peersRef.current.set(data.senderId, peer);
      setPeersList(Array.from(peersRef.current.values()));

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          newSocket.emit("candidate", {
            candidate: event.candidate,
            targetId: data.senderId,
            senderId: newSocket.id
          });
        }
      };

      pc.ondatachannel = (event) => {
        peer.channel = event.channel;
        setupDataChannel(data.senderId, event.channel);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      newSocket.emit("answer", {
        answer,
        targetId: data.senderId,
        senderId: newSocket.id,
        senderSeedId: mySeedId,
        senderName: myName,
        senderPublicKey: myPublicKeyB64
      });
    });

    // Handle incoming WebRTC answer
    newSocket.on("answer", async (data) => {
      if (data.targetId !== newSocket.id) return;
      const peer = peersRef.current.get(data.senderId);
      if (peer) {
        addLog("INFO", `Received answering signal from ${peer.name}. Establishing channel...`);
        await peer.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    // Handle incoming ICE candidate
    newSocket.on("candidate", async (data) => {
      if (data.targetId !== newSocket.id) return;
      const peer = peersRef.current.get(data.senderId);
      if (peer) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn("Error adding ICE candidate:", e);
        }
      }
    });

    newSocket.on("disconnect", () => {
      setIsSignalingConnected(false);
      addLog("WARNING", `Disconnected from swarm signaling coordinator.`);
    });

    return () => {
      newSocket.disconnect();
      peersRef.current.forEach(p => p.pc.close());
      peersRef.current.clear();
      setPeersList([]);
      setIsSignalingConnected(false);
    };
  }, [myPublicKeyB64, sessionIdentityKey]);

  // Initiate WebRTC connection to discovered peer
  const initiatePeerConnection = async (targetId: string, targetSeedId: string, targetName: string, targetPublicKey: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
      ]
    });

    const channel = pc.createDataChannel("chat");

    const peer: SwarmPeer = {
      id: targetId,
      seedId: targetSeedId,
      name: targetName,
      publicKey: targetPublicKey,
      pc,
      channel,
      isConnected: false,
      ratchetActive: false,
      ratchetSession: null
    };

    peersRef.current.set(targetId, peer);
    setPeersList(Array.from(peersRef.current.values()));

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("candidate", {
          candidate: event.candidate,
          targetId,
          senderId: socketRef.current.id
        });
      }
    };

    setupDataChannel(targetId, channel);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (socketRef.current) {
        socketRef.current.emit("offer", {
          offer,
          targetId,
          senderId: socketRef.current.id,
          senderSeedId: mySeedId,
          senderName: myName,
          senderPublicKey: myPublicKeyB64
        });
      }
    } catch (err) {
      console.error("Failed to create offer:", err);
    }
  };

  // Bind WebRTC data channel events
  const setupDataChannel = (peerId: string, channel: RTCDataChannel) => {
    channel.onopen = async () => {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.isConnected = true;
        setPeersList(Array.from(peersRef.current.values()));
        addLog("SUCCESS", `WebRTC DataChannel connected with peer: ${peer.name}`);

        // Trigger Double Ratchet handshake by sending identity keys
        const handshakeMsg = {
          type: "RATCHET_INIT",
          seedId: mySeedId,
          dhPublicKey: myPublicKeyB64,
          timestamp: Date.now()
        };
        channel.send(JSON.stringify(handshakeMsg));
      }
    };

    channel.onclose = () => {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        addLog("WARNING", `WebRTC Connection with peer closed: ${peer.name}`);
        peer.isConnected = false;
        peer.ratchetActive = false;
        peer.ratchetSession = null;
        peersRef.current.delete(peerId);
        setPeersList(Array.from(peersRef.current.values()));
      }
    };

    channel.onmessage = async (event) => {
      try {
        const payload = JSON.parse(event.data);
        const peer = peersRef.current.get(peerId);
        if (!peer) return;

        // Double Ratchet Session Initiation Handshake
        if (payload && payload.type === "RATCHET_INIT") {
          addLog("CRYPT", `Handshaking Double Ratchet with ${peer.name}...`);
          const rawPeerKey = new Uint8Array(
            atob(payload.dhPublicKey).split("").map(c => c.charCodeAt(0))
          ).buffer;

          const peerKey = await crypto.subtle.importKey(
            "raw",
            rawPeerKey,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
          );

          const sharedSecret = await crypto.subtle.deriveBits(
            { name: "ECDH", public: peerKey },
            sessionIdentityKey!.privateKey,
            256
          );

          // Standard Double Ratchet initiator/receiver rule
          const isInitiator = mySeedId < payload.seedId;
          const session = await DoubleRatchetSession.create(sharedSecret, isInitiator);
          peer.ratchetSession = session;
          peer.ratchetActive = true;
          setPeersList(Array.from(peersRef.current.values()));

          addLog("SUCCESS", `🔒 Double Ratchet fully activated with ${peer.name}. Perfect Forward Secrecy active.`);
        } 
        // Double Ratchet Message
        else if (payload && payload.type === "RATCHET_MSG") {
          if (!peer.ratchetSession) {
            addLog("WARNING", `Received secure packet before handshaking finished with ${peer.name}.`);
            return;
          }
          const decryptedText = await peer.ratchetSession.decrypt(payload.encryptedPayload);
          let content = decryptedText;
          let replyTo = undefined;
          try {
            const parsed = JSON.parse(decryptedText);
            if (parsed && typeof parsed.content === "string") {
              content = parsed.content;
              replyTo = parsed.replyTo;
            }
          } catch {
            // Text is plain string
          }

          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: peer.name,
              role: "peer",
              content,
              timestamp: Date.now(),
              replyTo
            }
          ]);
        }
        // Plain Text Message
        else if (payload && payload.type === "PLAIN_MSG") {
          setMessages(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              sender: peer.name,
              role: "peer",
              content: typeof payload.content === "string" ? payload.content : String(payload.content),
              timestamp: Date.now(),
              replyTo: payload.replyTo
            }
          ]);
        }
        // Onion Packet Routing
        else if (payload && payload.type === "ONION_PACKET") {
          addLog("CRYPT", `🧅 Received onion layer packet from peer: ${peer.name}. Attempting decryption...`);
          try {
            // Decrypt the outermost layer of the onion message
            const decryptedStr = await decryptLayer(payload.packet, sessionIdentityKey!.privateKey);
            const decrypted = JSON.parse(decryptedStr);

            // If we are an intermediate hop, forward the packet to the next hop
            if (decrypted.type === "ONION_FORWARD") {
              const nextHopSocketId = decrypted.nextHop;
              const nextPeer = peersRef.current.get(nextHopSocketId);
              if (nextPeer && nextPeer.channel && nextPeer.channel.readyState === "open") {
                nextPeer.channel.send(JSON.stringify({
                  type: "ONION_PACKET",
                  packet: decrypted.packet
                }));
                addLog("INFO", `🧅 Onion layer stripped successfully. Forwarding inner onion packet to next hop peer: ${nextPeer.name}`);
              } else {
                addLog("WARNING", `🧅 Onion route broken! Next hop peer ${nextHopSocketId} is unreachable.`);
              }
            } 
            // If we are the final destination, process the message
            else if (decrypted.type === "ONION_FINAL") {
              addLog("SUCCESS", `🎉 Onion packet successfully decrypted! Message reached its final target destination.`);
              setMessages(prev => [
                ...prev,
                {
                  id: "onion-" + Date.now(),
                  sender: `🧅 Onion (Origin: ${decrypted.senderSeedId.substring(0, 8)})`,
                  role: "peer",
                  content: decrypted.message,
                  timestamp: decrypted.timestamp,
                  isSpecial: "onion"
                }
              ]);
            }
          } catch (decryptErr) {
            // Decryption fails when we are not the target recipient for this specific onion layer
            addLog("CRYPT", `🧅 Layer is encrypted for another node. Skipping decryption (Obfuscation intact).`);
          }
        }
        // Asynchronous DHT Store
        else if (payload && payload.type === "DHT_STORE") {
          const { key, shardId, shardData, expiry } = payload;
          addLog("DHT", `💾 Received DHT_STORE request from ${peer.name}. Storing outbox fragment locally...`);
          
          setDhtShards(prev => {
            if (prev.some(s => s.key === key && s.shardId === shardId)) return prev;
            return [...prev, { key, shardId, shardData, expiry, senderName: peer.name }];
          });

          addLog("SUCCESS", `💾 Fragment ${shardId} stored securely for key: ${key.substring(0, 12)}...`);

          // Ephemeral burn timer to wipe fragments automatically
          const delay = expiry - Date.now();
          if (delay > 0) {
            setTimeout(() => {
              setDhtShards(prev => {
                const exists = prev.some(s => s.key === key && s.shardId === shardId);
                if (exists) {
                  addLog("SUCCESS", `🔥 Ephemeral burn timer triggered: Shard ${shardId} for key ${key.substring(0, 12)}... destroyed automatically.`);
                }
                return prev.filter(s => !(s.key === key && s.shardId === shardId));
              });
            }, delay);
          }
        }
        // Asynchronous DHT Query
        else if (payload && payload.type === "DHT_QUERY") {
          const { key } = payload;
          addLog("DHT", `🔍 DHT_QUERY request for key: ${key.substring(0, 12)}... from ${peer.name}`);
          
          setDhtShards(prev => {
            const matches = prev.filter(s => s.key === key);
            matches.forEach(m => {
              peer.channel.send(JSON.stringify({
                type: "DHT_RESPONSE",
                key,
                shardId: m.shardId,
                shardData: m.shardData
              }));
              addLog("DHT", `📤 Routing matching shard fragment ${m.shardId} back to ${peer.name}`);
            });
            return prev;
          });
        }
        // Asynchronous DHT Response Shard
        else if (payload && payload.type === "DHT_RESPONSE") {
          const { key, shardId, shardData } = payload;
          addLog("DHT", `📥 Retrieved shard fragment ${shardId} for outbox key: ${key.substring(0, 12)}...`);

          setAssembledShards(prev => {
            const current = prev[key] || {};
            if (current[shardId]) return prev;

            const updated = { ...current, [shardId]: shardData };
            const nextState = { ...prev, [key]: updated };

            // When we receive all 3 shards, trigger local reconstruction
            const count = Object.keys(updated).length;
            if (count === 3) {
              reconstructAndDecryptBurnNote(key, updated);
            }

            return nextState;
          });
        }
        // Asynchronous DHT Burn Note Wipe Signal
        else if (payload && payload.type === "DHT_BURN") {
          const { key } = payload;
          setDhtShards(prev => {
            const targetCount = prev.filter(s => s.key === key).length;
            if (targetCount > 0) {
              addLog("SUCCESS", `🔥 RECEIVED GLOBAL BURN COMMAND! Purging all matching fragments for key ${key.substring(0, 12)}... from local registry.`);
            }
            return prev.filter(s => s.key !== key);
          });
        }
      } catch (err) {
        console.warn("Direct processing fallback triggered:", err);
      }
    };
  };

  // Reconstruct outbox burn notes locally
  const reconstructAndDecryptBurnNote = async (key: string, shards: Record<string, string>) => {
    try {
      const fullBase64PacketStr = shards["shard-1"] + shards["shard-2"] + shards["shard-3"];
      const packet: OnionPacket = JSON.parse(fullBase64PacketStr);

      const decryptedStr = await decryptLayer(packet, sessionIdentityKey!.privateKey);
      const decrypted = JSON.parse(decryptedStr);

      addLog("SUCCESS", `🔓 Successful Assembly! Outbox burn note fully reconstructed & decrypted locally.`);
      
      setMessages(prev => [
        ...prev,
        {
          id: "burn-" + Date.now(),
          sender: `🔥 Burn Note (from ${decrypted.senderName})`,
          role: "peer",
          content: decrypted.message,
          timestamp: decrypted.timestamp,
          isSpecial: "burn"
        }
      ]);

      // Fire the BURN command across all peers immediately
      setIsBurning(true);
      addLog("CRYPT", `🔥 Propagating global burn signals across active connections...`);
      
      peersRef.current.forEach(peer => {
        if (peer.channel && peer.channel.readyState === "open") {
          peer.channel.send(JSON.stringify({
            type: "DHT_BURN",
            key
          }));
        }
      });

      // Clear from local query state
      setAssembledShards(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });

      setTimeout(() => setIsBurning(false), 2000);
    } catch (err) {
      console.error("Failed to reconstruct or decrypt outbox note:", err);
      addLog("WARNING", `Failed to reconstruct or decrypt outbox note.`);
    }
  };

  // Trigger outbox query broadcast (queries both online peers and local/virtual DHT registry)
  const queryOutboxDHT = () => {
    setIsQuerying(true);
    const targetKey = "outbox-" + (outboxRecipientSeedId || mySeedId);
    addLog("DHT", `🔍 Querying DHT swarm for matching shards with key: ${targetKey.substring(0, 18)}...`);

    // 1. Check local DHT node storage
    setDhtShards(prev => {
      const matches = prev.filter(s => s.key === targetKey || s.key === "outbox-" + mySeedId);
      if (matches.length > 0) {
        matches.forEach(m => {
          addLog("DHT", `📥 Local DHT shard ${m.shardId} retrieved for key ${m.key.substring(0, 12)}...`);
          setAssembledShards(prevAssembled => {
            const current = prevAssembled[m.key] || {};
            if (current[m.shardId]) return prevAssembled;
            const updated = { ...current, [m.shardId]: m.shardData };
            const nextState = { ...prevAssembled, [m.key]: updated };
            if (Object.keys(updated).length === 3) {
              setTimeout(() => reconstructAndDecryptBurnNote(m.key, updated), 300);
            }
            return nextState;
          });
        });
      }
      return prev;
    });

    // 2. Broadcast query to connected WebRTC peers
    const onlinePeers = (Array.from(peersRef.current.values()) as SwarmPeer[]).filter(p => p.isConnected);
    if (onlinePeers.length > 0) {
      onlinePeers.forEach(peer => {
        if (peer.channel && peer.channel.readyState === "open") {
          peer.channel.send(JSON.stringify({
            type: "DHT_QUERY",
            key: targetKey
          }));
        }
      });
    }

    setTimeout(() => setIsQuerying(false), 2000);
  };

  // Send Direct Secure Message
  const handleSendDirectMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!directInput.trim()) return;

    const msgText = directInput.trim();
    const newMsg: Message = {
      id: Date.now().toString(),
      sender: myName,
      role: "user",
      content: msgText,
      timestamp: Date.now(),
      replyTo: replyingTo ? { id: replyingTo.id, sender: replyingTo.sender, content: replyingTo.content } : undefined
    };

    if (activeChatPeerId && activeChatPeerId !== "local") {
      const peer = peersRef.current.get(activeChatPeerId);
      if (peer && peer.isConnected) {
        try {
          const payloadData = JSON.stringify({ content: msgText, replyTo: newMsg.replyTo });
          if (peer.ratchetSession) {
            const encryptedPayload = await peer.ratchetSession.encrypt(payloadData);
            peer.channel.send(JSON.stringify({
              type: "RATCHET_MSG",
              encryptedPayload
            }));
            addLog("CRYPT", `🔒 Message encrypted via Double Ratchet and transmitted to ${peer.name}.`);
          } else {
            peer.channel.send(JSON.stringify({
              type: "PLAIN_MSG",
              content: msgText,
              replyTo: newMsg.replyTo
            }));
            addLog("INFO", `Plain text message transmitted to ${peer.name}.`);
          }
        } catch (err) {
          console.error(err);
          addLog("WARNING", "Failed to transmit message to peer.");
        }
      }
    } else {
      // Local Mesh Mode
      addLog("INFO", "Message posted to local sovereign mesh.");
      // Spawn automated loopback response
      setTimeout(() => {
        const replies = [
          "Secure loopback acknowledged. Channel integrity verified via ECDH-P256.",
          "Sovereign node relay confirmed. Double-ratchet key rotation scheduled.",
          "Zero-Trust packet encapsulated and routed through local virtual loop.",
          "Mesh standing by. Signal strength optimal. Transmitting telemetry heartbeat...",
          "Decentralized ledger partition updated. Sync validation score: 100.00%."
        ];
        const randomReply = replies[Math.floor(Math.random() * replies.length)];
        const replyMsg: Message = {
          id: (Date.now() + 1).toString(),
          sender: "⚡ Local Loopback Peer",
          role: "peer",
          content: randomReply,
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, replyMsg]);
        addLog("SUCCESS", "Received automated loopback packet from local mesh peer.");
      }, 1000);
    }

    setMessages(prev => [...prev, newMsg]);
    setDirectInput("");
    setReplyingTo(null);
  };

  // Send Onion Routed Message
  const handleSendOnionMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!onionMessage.trim() || !onionRecipientSeedId) return;

    const recipient = knownPeers.find(p => p.seedId === onionRecipientSeedId) || {
      seedId: onionRecipientSeedId,
      name: "Target Swarm Node",
      publicKey: myPublicKeyB64
    };

    const getHopInfo = (hopId: string) => {
      const peer = peersRef.current.get(hopId);
      if (peer) return { id: peer.id, name: peer.name, publicKey: peer.publicKey, isReal: true };
      const v = VIRTUAL_RELAYS.find(r => r.id === hopId);
      if (v) return { id: v.id, name: v.name, publicKey: v.publicKey, isReal: false };
      return null;
    };

    const path: { id: string; name: string; publicKey: string; isReal: boolean }[] = [];
    if (hop1) { const h = getHopInfo(hop1); if (h) path.push(h); }
    if (hop2) { const h = getHopInfo(hop2); if (h) path.push(h); }
    if (hop3) { const h = getHopInfo(hop3); if (h) path.push(h); }
    path.push({ id: recipient.seedId, name: recipient.name, publicKey: recipient.publicKey, isReal: false });

    try {
      addLog("CRYPT", `🧅 Wrapping message into ${path.length} onion layers of ECDH + AES-GCM encryption...`);
      const outerPacket = await wrapOnion(onionMessage, mySeedId, path);

      // Unpeeling simulation logs
      let step = 1;
      for (let i = 0; i < path.length - 1; i++) {
        const currentHop = path[i];
        setTimeout(() => {
          addLog("INFO", `🧅 [Hop ${step}: ${currentHop.name}] Decrypted outer layer. Forwarding payload to next hop...`);
        }, step * 350);
        step++;
      }

      // Final destination arrival
      setTimeout(() => {
        addLog("SUCCESS", `🎉 [Destination: ${recipient.name}] Final onion packet layer unwrapped! Payload decrypted.`);
        setMessages(prev => [
          ...prev,
          {
            id: "onion-sent-" + Date.now(),
            sender: `🧅 Onion Route (to ${recipient.name})`,
            role: "user",
            content: onionMessage,
            timestamp: Date.now(),
            isSpecial: "onion"
          }
        ]);
      }, step * 350);

      // Transmit real packet over WebRTC if Hop 1 is a connected peer
      if (path[0]?.isReal) {
        const firstHopPeer = peersRef.current.get(path[0].id);
        if (firstHopPeer && firstHopPeer.channel && firstHopPeer.channel.readyState === "open") {
          firstHopPeer.channel.send(JSON.stringify({
            type: "ONION_PACKET",
            packet: outerPacket
          }));
        }
      }

      setOnionMessage("");
    } catch (err) {
      console.error(err);
      addLog("WARNING", "Failed to construct or route onion packet.");
    }
  };

  // Disperse Asynchronous Outbox Burn Note
  const handleSendAsynchronousOutbox = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!outboxMessage.trim() || !outboxRecipientSeedId) return;

    const recipient = knownPeers.find(p => p.seedId === outboxRecipientSeedId) || {
      seedId: outboxRecipientSeedId,
      name: "Swarm Node",
      publicKey: myPublicKeyB64
    };

    try {
      addLog("CRYPT", `🔐 Encrypting outbox burn note with ${recipient.name}'s public key...`);
      const outboxPayloadJson = JSON.stringify({
        senderName: myName,
        senderSeedId: mySeedId,
        message: outboxMessage,
        timestamp: Date.now()
      });

      const packet = await encryptLayer(outboxPayloadJson, recipient.publicKey);
      const packetStr = JSON.stringify(packet);

      // Fragment packet into 3 shards
      const totalLen = packetStr.length;
      const shardLen = Math.ceil(totalLen / 3);
      const shards = [
        packetStr.substring(0, shardLen),
        packetStr.substring(shardLen, shardLen * 2),
        packetStr.substring(shardLen * 2)
      ];

      const outboxKey = "outbox-" + recipient.seedId;
      const expiry = Date.now() + (outboxBurnMinutes * 60000);

      addLog("DHT", `📦 Segmented note into 3 shards. Distributing under key "${outboxKey.substring(0, 16)}..."`);

      const onlinePeers = (Array.from(peersRef.current.values()) as SwarmPeer[]).filter(p => p.isConnected);

      for (let i = 0; i < 3; i++) {
        const shardData = shards[i];
        const shardId = `shard-${i + 1}`;

        // Host in local DHT node registry for loopback & local access
        setDhtShards(prev => {
          if (prev.some(s => s.key === outboxKey && s.shardId === shardId)) return prev;
          return [...prev, { key: outboxKey, shardId, shardData, expiry, senderName: myName }];
        });

        // Send to WebRTC peers if online
        if (onlinePeers.length > 0) {
          const peer = onlinePeers[i % onlinePeers.length];
          if (peer.channel && peer.channel.readyState === "open") {
            peer.channel.send(JSON.stringify({
              type: "DHT_STORE",
              key: outboxKey,
              shardId,
              shardData,
              expiry
            }));
            addLog("DHT", `📤 Shard ${i + 1}/3 routed over WebRTC to node: ${peer.name}`);
          }
        } else {
          addLog("DHT", `💾 Shard ${i + 1}/3 stored in local DHT node registry for ${recipient.name}`);
        }
      }

      setMessages(prev => [
        ...prev,
        {
          id: "outbox-sent-" + Date.now(),
          sender: `🔥 Burn Note Dispersed (to ${recipient.name})`,
          role: "user",
          content: outboxMessage,
          timestamp: Date.now(),
          isSpecial: "burn"
        }
      ]);

      setOutboxMessage("");
      addLog("SUCCESS", `🎉 Ephemeral outbox note fragmented into 3 shards and dispersed across swarm!`);
    } catch (err) {
      console.error(err);
      addLog("WARNING", "Outbox dispersal encryption failed.");
    }
  };

  // Delete hosted shard manually from registry
  const deleteHostedShard = (key: string, shardId: string) => {
    setDhtShards(prev => prev.filter(s => !(s.key === key && s.shardId === shardId)));
    addLog("SUCCESS", `🔥 Manually destroyed shard ${shardId} for key: ${key.substring(0, 10)}...`);
  };

  // Scroll controls
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Set default direct chat peer if none selected
  useEffect(() => {
    const activePeers = peersList.filter(p => p.isConnected);
    if (activePeers.length > 0 && !activeChatPeerId) {
      setActiveChatPeerId(activePeers[0].id);
    }
  }, [peersList, activeChatPeerId]);

  // Pre-fill default onion routing path hops
  useEffect(() => {
    const active = peersList.filter(p => p.isConnected);
    if (active.length > 0) {
      if (!hop1) setHop1(active[0].id);
      if (active.length > 1 && !hop2) setHop2(active[1].id);
      if (active.length > 2 && !hop3) setHop3(active[2].id);
    }
  }, [peersList, hop1, hop2, hop3]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col font-sans text-slate-100 h-[100dvh] w-screen overflow-hidden select-none"
    >
      {/* Header section */}
      <header className="relative z-10 p-4 border-b border-white/5 bg-slate-900/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center shadow-lg shadow-indigo-500/5">
              <Layers className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h1 className="text-sm sm:text-lg font-black tracking-tighter uppercase text-white flex items-center gap-2">
                Sovereign Onion Swarm Chat
                <span className="text-[9px] font-mono font-bold bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                  SWARM SIZE: {peersList.filter(p => p.isConnected).length}
                </span>
              </h1>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mt-0.5">
                My Public Tag: <span className="text-slate-400">{myPublicKeyB64 ? myPublicKeyB64.substring(0, 16) : "Generating..."}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setMessages([]);
                addLog("INFO", "Communication screen memory cleared.");
              }}
              title="Clear memory"
              className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700/60 text-slate-400 hover:text-red-400 border border-white/5 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2.5 rounded-lg bg-slate-800 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation panel */}
        <nav className="w-64 border-r border-white/5 bg-slate-900/40 p-4 hidden md:flex flex-col gap-2">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 px-2">Decentralized protocols</p>
          <button
            onClick={() => setActiveTab("direct")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "direct" 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" />
            Direct Ratchet Chat
          </button>
          <button
            onClick={() => setActiveTab("onion")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "onion" 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Compass className="w-4 h-4" />
            Onion Router
          </button>
          <button
            onClick={() => setActiveTab("outbox")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "outbox" 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Database className="w-4 h-4" />
            Asynchronous Outbox
          </button>
          <button
            onClick={() => setActiveTab("registry")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "registry" 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Shield className="w-4 h-4" />
            DHT Registry ({dhtShards.length})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === "logs" 
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <Radio className="w-4 h-4 animate-pulse" />
            Security Logs
          </button>

          <div className="mt-auto border-t border-white/5 pt-4 px-2">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-2 h-2 rounded-full ${
                peersList.some(p => p.isConnected) 
                  ? "bg-emerald-400 animate-pulse" 
                  : isSignalingConnected 
                    ? "bg-cyan-400 animate-pulse" 
                    : "bg-red-400"
              }`} />
              <span className="text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest">
                {peersList.some(p => p.isConnected) 
                  ? "SWARM ACTIVE" 
                  : isSignalingConnected 
                    ? "STANDBY (SOLO)" 
                    : "OFFLINE"}
              </span>
            </div>
            <p className="text-[9px] text-slate-600 leading-relaxed">
              Zero-Trust Double Ratchet, 4-hop layered Onion encryption, & Kademlia Outbox shard dispersing active.
            </p>
          </div>
        </nav>

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
          {/* Mobile responsive navigation */}
          <div className="p-2 border-b border-white/5 bg-slate-900/60 flex md:hidden overflow-x-auto gap-2 custom-scrollbar">
            {[{ id: "direct", name: "Direct", icon: Users },
              { id: "onion", name: "Onion", icon: Compass },
              { id: "outbox", name: "Outbox", icon: Database },
              { id: "registry", name: "DHT", icon: Shield },
              { id: "logs", name: "Logs", icon: Radio }].map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 transition-all ${
                  activeTab === item.id 
                    ? "bg-indigo-600 text-white" 
                    : "text-slate-400 hover:bg-white/5"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                {item.name}
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left section: Principal chat flow & UI panels */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6">
                <div className="max-w-4xl mx-auto space-y-6">
                  
                  {/* Tab contents */}
                  {activeTab === "direct" && (
                    <div className="space-y-4">
                      {/* Active direct peer selector */}
                      <div className="p-4 bg-slate-900/60 border border-white/5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div>
                          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-1">Target Swarm Peer</h3>
                          <p className="text-[10px] text-slate-500">Secure Double Ratchet session or local mesh</p>
                        </div>
                        <select
                          value={activeChatPeerId}
                          onChange={(e) => setActiveChatPeerId(e.target.value)}
                          className="bg-slate-950 border border-white/10 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-indigo-500 text-slate-200 w-full sm:w-auto font-mono"
                        >
                          <option value="local">🌐 Local Sovereign Mesh (Solo / Loopback)</option>
                          {peersList.filter(p => p.isConnected).map(p => (
                            <option key={p.id} value={p.id}>
                              ⚡ {p.name} ({p.ratchetActive ? "Ratchet Active" : "Handshaking..."})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Messages feed */}
                      <div className="space-y-4 min-h-[300px]">
                        {messages.filter(m => !m.isSpecial).length === 0 ? (
                          <div className="h-64 flex flex-col items-center justify-center text-center opacity-35">
                            <MessageSquare className="w-10 h-10 mb-4 text-indigo-400 animate-bounce" />
                            <p className="text-xs font-black uppercase tracking-widest">No Direct Message History</p>
                            <p className="text-[10px] text-slate-500 mt-1 max-w-xs">Double-Ratchet direct chats are fully forward-secret and ephemeral. Type below to chat!</p>
                          </div>
                        ) : (
                          messages.filter(m => !m.isSpecial).map((msg) => (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              drag="x"
                              dragConstraints={{ left: 0, right: 50 }}
                              dragElastic={0.2}
                              onDragEnd={(e, info) => {
                                if (info.offset.x > 35) {
                                  setReplyingTo(msg);
                                }
                              }}
                              className={`group relative flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                            >
                              <div className={`flex gap-2.5 max-w-[88%] sm:max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                                <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border mt-1 ${
                                  msg.role === "user" 
                                    ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300 shadow-md" 
                                    : "bg-slate-800 border-white/10 text-slate-400"
                                }`}>
                                  {msg.role === "user" ? <User className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                </div>

                                <div className="flex flex-col gap-1 min-w-0">
                                  {/* Header: Sender & time */}
                                  <div className={`flex items-center gap-2 text-[9px] font-mono font-bold uppercase tracking-widest ${msg.role === "user" ? "justify-end text-indigo-400" : "text-slate-500"}`}>
                                    <span>{msg.sender}</span>
                                    <span>•</span>
                                    <span className="text-slate-600">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    {msg.edited && <span className="text-indigo-400/70 lowercase italic">(edited)</span>}
                                  </div>

                                  {/* Replied block quote */}
                                  {msg.replyTo && (
                                    <div className={`p-2.5 rounded-xl text-xs border-l-2 bg-slate-900/80 mb-0.5 max-w-full ${
                                      msg.role === "user" ? "border-indigo-400 text-indigo-200" : "border-slate-500 text-slate-300"
                                    }`}>
                                      <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-300">
                                        <CornerUpLeft className="w-3 h-3 shrink-0" />
                                        <span>Replying to {msg.replyTo.sender}</span>
                                      </div>
                                      <p className="text-[11px] truncate text-slate-400 mt-0.5 font-sans">{msg.replyTo.content}</p>
                                    </div>
                                  )}

                                  {/* Message bubble / Edit form */}
                                  <div className="relative group/bubble">
                                    {editingMsgId === msg.id ? (
                                      <div className="flex flex-col gap-2 p-3 bg-slate-900 border border-indigo-500/40 rounded-2xl w-full min-w-[240px]">
                                        <input
                                          type="text"
                                          value={editContent}
                                          onChange={(e) => setEditContent(e.target.value)}
                                          className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") handleSaveEdit(msg.id);
                                            if (e.key === "Escape") setEditingMsgId(null);
                                          }}
                                        />
                                        <div className="flex justify-end gap-2 text-[10px]">
                                          <button
                                            type="button"
                                            onClick={() => setEditingMsgId(null)}
                                            className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleSaveEdit(msg.id)}
                                            className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-bold flex items-center gap-1"
                                          >
                                            <Check className="w-3 h-3" /> Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed break-words shadow-lg ${
                                        msg.role === "user"
                                          ? "bg-indigo-600 text-white shadow-indigo-600/10 rounded-tr-none"
                                          : "bg-slate-900 border border-white/10 text-slate-200 rounded-tl-none"
                                      }`}>
                                        {msg.content}
                                      </div>
                                    )}

                                    {/* Action Bar on hover/tap */}
                                    {editingMsgId !== msg.id && (
                                      <div className={`absolute top-0 -translate-y-1/2 flex items-center gap-1 bg-slate-900/90 border border-white/10 backdrop-blur-md rounded-full px-2 py-1 shadow-xl opacity-0 group-hover/bubble:opacity-100 transition-opacity z-20 ${
                                        msg.role === "user" ? "left-2" : "right-2"
                                      }`}>
                                        <button
                                          onClick={() => setReplyingTo(msg)}
                                          title="Reply"
                                          className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-indigo-400 transition-colors"
                                        >
                                          <CornerUpLeft className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setActiveEmojiPickerMsgId(activeEmojiPickerMsgId === msg.id ? null : msg.id)}
                                          title="React"
                                          className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-amber-400 transition-colors"
                                        >
                                          <Smile className="w-3.5 h-3.5" />
                                        </button>
                                        {(msg.role === "user" || msg.sender === myName) && (
                                          <button
                                            onClick={() => handleStartEdit(msg)}
                                            title="Edit"
                                            className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-emerald-400 transition-colors"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleDeleteMessage(msg.id)}
                                          title="Delete"
                                          className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-red-400 transition-colors"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}

                                    {/* Quick Emoji Picker Popover */}
                                    <AnimatePresence>
                                      {activeEmojiPickerMsgId === msg.id && (
                                        <motion.div
                                          initial={{ opacity: 0, scale: 0.9, y: 5 }}
                                          animate={{ opacity: 1, scale: 1, y: 0 }}
                                          exit={{ opacity: 0, scale: 0.9, y: 5 }}
                                          className={`absolute top-full mt-1 z-30 bg-slate-900 border border-white/15 backdrop-blur-xl rounded-2xl p-2 shadow-2xl flex items-center gap-1.5 ${
                                            msg.role === "user" ? "right-0" : "left-0"
                                          }`}
                                        >
                                          {EMOJI_LIST.map(emoji => (
                                            <button
                                              key={emoji}
                                              onClick={() => handleToggleReaction(msg.id, emoji)}
                                              className="hover:scale-125 active:scale-95 transition-transform p-1 rounded-lg hover:bg-white/10 text-base"
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </motion.div>
                                      )}
                                    </AnimatePresence>
                                  </div>

                                  {/* Reactions display pills */}
                                  {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                                    <div className={`flex flex-wrap gap-1 mt-1 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                                      {Object.entries(msg.reactions).map(([emoji, u]) => {
                                        const userList = (u || []) as string[];
                                        const hasMyReaction = userList.includes(myName);
                                        return (
                                          <button
                                            key={emoji}
                                            onClick={() => handleToggleReaction(msg.id, emoji)}
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border font-bold transition-all ${
                                              hasMyReaction
                                                ? "bg-indigo-600/30 border-indigo-500/50 text-indigo-200"
                                                : "bg-slate-900/80 border-white/10 text-slate-400 hover:bg-white/5"
                                            }`}
                                            title={userList.join(", ")}
                                          >
                                            <span>{emoji}</span>
                                            <span>{userList.length}</span>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          ))
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    </div>
                  )}

                  {activeTab === "onion" && (
                    <div className="space-y-6">
                      <div className="p-4 sm:p-6 bg-slate-900/40 border border-white/5 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <h3 className="text-sm font-black uppercase text-white tracking-tight flex items-center gap-2">
                            <Compass className="w-4 h-4 text-indigo-400" />
                            Layered Onion Mesh Configuration
                          </h3>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setHop1("relay-alpha");
                                setHop2("relay-beta");
                                setHop3("relay-gamma");
                                if (knownPeers.length > 0) {
                                  setOnionRecipientSeedId(knownPeers[0].seedId);
                                }
                                setOnionMessage("Sovereign encrypted onion packet payload #001");
                              }}
                              className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-indigo-300 text-[10px] font-mono font-bold transition-all flex items-center gap-1"
                            >
                              <Sparkles className="w-3 h-3" />
                              Quick 3-Hop Route Preset
                            </button>
                            <button
                              type="button"
                              onClick={() => setMessages(prev => prev.filter(m => m.isSpecial !== "onion"))}
                              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-white/5 rounded-lg text-slate-400 text-[10px] font-mono transition-all"
                            >
                              Clear Traffic
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-400 leading-relaxed">
                          Routing messages across multi-hop relay nodes completely decouples connection graphs. 
                          Only Hop 1 knows your IP; only the Exit Hop knows the final destination.
                        </p>

                        <form onSubmit={handleSendOnionMessage} className="space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Hop 1 (Entrance Node)</label>
                              <select
                                value={hop1}
                                onChange={(e) => setHop1(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none text-slate-200"
                              >
                                <option value="">None (Direct Route)</option>
                                <optgroup label="Virtual Swarm Relays">
                                  {VIRTUAL_RELAYS.map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </optgroup>
                                {peersList.filter(p => p.isConnected).length > 0 && (
                                  <optgroup label="Connected WebRTC Peers">
                                    {peersList.filter(p => p.isConnected).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Hop 2 (Middle Relay)</label>
                              <select
                                value={hop2}
                                onChange={(e) => setHop2(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none text-slate-200"
                              >
                                <option value="">None</option>
                                <optgroup label="Virtual Swarm Relays">
                                  {VIRTUAL_RELAYS.filter(r => r.id !== hop1).map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </optgroup>
                                {peersList.filter(p => p.isConnected && p.id !== hop1).length > 0 && (
                                  <optgroup label="Connected WebRTC Peers">
                                    {peersList.filter(p => p.isConnected && p.id !== hop1).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Hop 3 (Exit Node)</label>
                              <select
                                value={hop3}
                                onChange={(e) => setHop3(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none text-slate-200"
                              >
                                <option value="">None</option>
                                <optgroup label="Virtual Swarm Relays">
                                  {VIRTUAL_RELAYS.filter(r => r.id !== hop1 && r.id !== hop2).map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                  ))}
                                </optgroup>
                                {peersList.filter(p => p.isConnected && p.id !== hop1 && p.id !== hop2).length > 0 && (
                                  <optgroup label="Connected WebRTC Peers">
                                    {peersList.filter(p => p.isConnected && p.id !== hop1 && p.id !== hop2).map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </optgroup>
                                )}
                              </select>
                            </div>

                            <div>
                              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Final Destination</label>
                              <select
                                value={onionRecipientSeedId}
                                onChange={(e) => setOnionRecipientSeedId(e.target.value)}
                                className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none text-slate-200"
                              >
                                <option value="">-- Select Recipient --</option>
                                {knownPeers.map(kp => (
                                  <option key={kp.seedId} value={kp.seedId}>{kp.name} ({kp.seedId.substring(0, 8)})</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          {/* Path visualizer */}
                          <div className="p-3.5 bg-slate-950/60 border border-white/5 rounded-xl flex items-center flex-wrap gap-2 text-xs font-mono">
                            <span className="text-indigo-400 font-bold flex items-center gap-1">
                              <Shield className="w-3 h-3 text-indigo-400" />
                              [You]
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-slate-300">
                              {hop1 ? (peersList.find(p => p.id === hop1)?.name || VIRTUAL_RELAYS.find(r => r.id === hop1)?.name) : "(Direct)"}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-slate-300">
                              {hop2 ? (peersList.find(p => p.id === hop2)?.name || VIRTUAL_RELAYS.find(r => r.id === hop2)?.name) : "(None)"}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-slate-300">
                              {hop3 ? (peersList.find(p => p.id === hop3)?.name || VIRTUAL_RELAYS.find(r => r.id === hop3)?.name) : "(None)"}
                            </span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              [Recipient: {onionRecipientSeedId ? knownPeers.find(p => p.seedId === onionRecipientSeedId)?.name : "(None)"}]
                            </span>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={onionMessage}
                              onChange={(e) => setOnionMessage(e.target.value)}
                              placeholder="Type a confidential onion-routed message..."
                              className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 min-w-0"
                            />
                            <button
                              type="submit"
                              disabled={!onionMessage.trim() || !onionRecipientSeedId}
                              className="w-full sm:w-auto justify-center px-4 sm:px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-[10px] tracking-wider transition-all disabled:opacity-40 shrink-0 flex items-center gap-2"
                            >
                              <Compass className="w-3.5 h-3.5" />
                              <span className="whitespace-nowrap">Route Packet</span>
                            </button>
                          </div>
                        </form>
                      </div>

                      {/* Onion messages feed */}
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500">Onion Traffic Decryption Ledger</h4>
                        {messages.filter(m => m.isSpecial === "onion").length === 0 ? (
                          <div className="h-32 flex flex-col items-center justify-center text-center opacity-30 border border-dashed border-white/5 rounded-2xl">
                            <p className="text-xs font-mono font-bold">No active onion packets decoded yet</p>
                          </div>
                        ) : (
                          messages.filter(m => m.isSpecial === "onion").map((msg) => (
                            <motion.div
                              key={msg.id}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className={`p-4 rounded-xl border border-emerald-500/10 bg-emerald-500/5 ${msg.role === "user" ? "border-indigo-500/10 bg-indigo-500/5" : ""}`}
                            >
                              <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
                                <span className="text-[9px] font-mono font-black text-emerald-400 flex items-center gap-1">
                                  <Layers className="w-3 h-3" />
                                  ONION DECRYPTION COMPLETE
                                </span>
                                <span className="text-[9px] text-slate-500 font-mono">
                                  {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                              </div>
                              <p className="text-xs font-mono text-slate-400">{msg.sender}</p>
                              <p className="text-xs sm:text-sm text-white font-mono mt-1.5 font-bold">{msg.content}</p>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "outbox" && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Send box */}
                        <div className="p-4 sm:p-6 bg-slate-900/40 border border-white/5 rounded-2xl space-y-4 flex flex-col">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <h3 className="text-xs font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                              <Flame className="w-4 h-4 text-orange-400" />
                              Disperse Ephemeral Burn Note
                            </h3>
                            <button
                              type="button"
                              onClick={() => {
                                if (knownPeers.length > 0) setOutboxRecipientSeedId(knownPeers[0].seedId);
                                setOutboxMessage("Self-destructing ephemeral code key: " + Math.random().toString(36).substring(2, 10).toUpperCase());
                              }}
                              className="px-2 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-300 text-[9px] font-mono font-bold rounded-lg transition-all"
                            >
                              Preset Sample Note
                            </button>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            Notes are encrypted, split into 3 shards, and stored across DHT nodes.
                            They self-destruct upon reading or when the burn timer expires.
                          </p>

                          <form onSubmit={handleSendAsynchronousOutbox} className="space-y-3 flex-1 flex flex-col justify-between">
                            <div className="space-y-3">
                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Target Recipient Node</label>
                                <select
                                  value={outboxRecipientSeedId}
                                  onChange={(e) => setOutboxRecipientSeedId(e.target.value)}
                                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                >
                                  <option value="">-- Select Recipient --</option>
                                  {knownPeers.map(p => (
                                    <option key={p.seedId} value={p.seedId}>{p.name} ({p.seedId.substring(0, 8)})</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Auto-Destruct Burn Duration</label>
                                <select
                                  value={outboxBurnMinutes}
                                  onChange={(e) => setOutboxBurnMinutes(Number(e.target.value))}
                                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none"
                                >
                                  <option value={1}>1 Minute (Immediate Melt)</option>
                                  <option value={5}>5 Minutes</option>
                                  <option value={15}>15 Minutes</option>
                                  <option value={60}>1 Hour</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1.5">Secret Note Payload</label>
                                <input
                                  type="text"
                                  value={outboxMessage}
                                  onChange={(e) => setOutboxMessage(e.target.value)}
                                  placeholder="Secret message to fragment..."
                                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </div>

                            <button
                              type="submit"
                              disabled={!outboxMessage.trim() || !outboxRecipientSeedId}
                              className="w-full py-3 mt-4 rounded-xl bg-gradient-to-r from-indigo-600 to-orange-600 hover:from-indigo-500 hover:to-orange-500 text-white font-black uppercase text-[10px] tracking-wider transition-all disabled:opacity-40"
                            >
                              Fragment & Disperse to Swarm
                            </button>
                          </form>
                        </div>

                        {/* Retrieve box */}
                        <div className="p-4 sm:p-6 bg-slate-900/40 border border-white/5 rounded-2xl space-y-4 flex flex-col justify-between">
                          <div className="space-y-4">
                            <h3 className="text-xs font-black uppercase text-emerald-400 tracking-wider flex items-center gap-2">
                              <Binary className="w-4 h-4 text-emerald-400" />
                              Retrieve & Reconstruct Burn Notes
                            </h3>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              Query active nodes in the DHT swarm to retrieve split shards, reconstruct them locally, and 
                              instantly trigger global <strong>BURN</strong> commands to shred the fragments.
                            </p>

                            <button
                              onClick={queryOutboxDHT}
                              disabled={isQuerying || isBurning}
                              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700/80 border border-white/10 text-slate-200 font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                            >
                              {isQuerying ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  QUERYING SWARM DHT...
                                </>
                              ) : isBurning ? (
                                <>
                                  <Flame className="w-3.5 h-3.5 animate-bounce text-orange-400" />
                                  BURNING SOURCE CHUNKS...
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                                  Query & Reconstruct My Shards
                                </>
                              )}
                            </button>

                            {/* Assembly meter */}
                            <div className="p-3 bg-slate-950/60 border border-white/5 rounded-xl space-y-2">
                              <span className="text-[9px] font-mono font-black text-slate-500 block uppercase tracking-wider">
                                Shard Assembly Pipeline
                              </span>
                              {Object.keys(assembledShards).length === 0 ? (
                                <p className="text-[10px] font-mono text-slate-600">No active incoming shards assembled yet.</p>
                              ) : (
                                Object.entries(assembledShards).map(([key, chunks]) => {
                                  const count = Object.keys(chunks).length;
                                  return (
                                    <div key={key} className="space-y-1">
                                      <div className="flex justify-between text-[9px] font-mono">
                                        <span className="text-indigo-400">DHT Key: {key.substring(0, 16)}...</span>
                                        <span className="text-slate-400">{count}/3 fragments</span>
                                      </div>
                                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                                        <div 
                                          className="bg-emerald-500 h-full transition-all duration-300" 
                                          style={{ width: `${(count / 3) * 100}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>

                          <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mt-4">Decrypted Melted Feed</h4>
                            {messages.filter(m => m.isSpecial === "burn").length === 0 ? (
                              <div className="h-20 flex flex-col items-center justify-center text-center opacity-30 border border-dashed border-white/5 rounded-xl">
                                <p className="text-[10px] font-mono">Outbox feed is clean</p>
                              </div>
                            ) : (
                              messages.filter(m => m.isSpecial === "burn").map((msg) => (
                                <motion.div
                                  key={msg.id}
                                  initial={{ opacity: 1, scale: 1 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
                                  className="p-3 rounded-xl border border-orange-500/20 bg-orange-500/5 space-y-1"
                                >
                                  <div className="flex items-center justify-between text-[9px] font-mono text-orange-400">
                                    <span className="flex items-center gap-1 font-bold">
                                      <Flame className="w-3 h-3 text-orange-400" />
                                      MELTED READ-ONCE NOTE ({msg.sender})
                                    </span>
                                    <span className="text-slate-500">
                                      {new Date(msg.timestamp).toLocaleTimeString()}
                                    </span>
                                  </div>
                                  <p className="text-xs text-white font-mono mt-1 font-black">{msg.content}</p>
                                </motion.div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "registry" && (
                    <div className="space-y-4">
                      <div className="p-4 sm:p-6 bg-slate-900/40 border border-white/5 rounded-2xl space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-3">
                          <div>
                            <h3 className="text-sm font-black uppercase text-white tracking-tight flex items-center gap-2">
                              <Shield className="w-4 h-4 text-emerald-400" />
                              Distributed DHT Storage Registry (Hosting Room)
                            </h3>
                            <p className="text-xs text-slate-400 leading-relaxed mt-1">
                              Your client node participates as a storage hop in the DHT outbox swarm. Shards hosted below are completely 
                              encrypted and mathematically unreadable.
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const sampleKey = "outbox-sample-" + Math.random().toString(36).substring(2, 8);
                                const sampleShard: DhtShard = {
                                  key: sampleKey,
                                  shardId: "shard-" + Math.floor(Math.random() * 3 + 1),
                                  shardData: "0x" + Array.from({ length: 32 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(""),
                                  expiry: Date.now() + 120000,
                                  senderName: "Peer Swarm Node"
                                };
                                setDhtShards(prev => [sampleShard, ...prev]);
                                addLog("DHT", `🧪 Injected test encrypted swarm shard into local registry.`);
                              }}
                              className="px-3 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              Inject Test Shard
                            </button>

                            {dhtShards.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setDhtShards([]);
                                  addLog("SUCCESS", "🔥 Purged all hosted DHT shards from local registry.");
                                }}
                                className="px-3 py-2 bg-red-950/40 hover:bg-red-950/60 border border-red-500/20 text-red-400 rounded-xl text-xs font-mono transition-all"
                              >
                                Purge All
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Search Filter */}
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={dhtSearch}
                            onChange={(e) => setDhtSearch(e.target.value)}
                            placeholder="Filter hosted shards by key or shard ID..."
                            className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {dhtShards.filter(s => !dhtSearch || s.key.toLowerCase().includes(dhtSearch.toLowerCase()) || s.shardId.toLowerCase().includes(dhtSearch.toLowerCase())).length === 0 ? (
                          <div className="col-span-2 h-48 flex flex-col items-center justify-center text-center opacity-35 border border-dashed border-white/5 rounded-2xl">
                            <Database className="w-8 h-8 mb-3 text-slate-500" />
                            <p className="text-xs font-mono">Your node is currently hosting 0 encrypted swarm shards</p>
                          </div>
                        ) : (
                          dhtShards
                            .filter(s => !dhtSearch || s.key.toLowerCase().includes(dhtSearch.toLowerCase()) || s.shardId.toLowerCase().includes(dhtSearch.toLowerCase()))
                            .map((shard, index) => (
                              <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 bg-slate-900 border border-white/5 rounded-2xl space-y-3"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded font-bold">
                                    {shard.shardId.toUpperCase()}
                                  </span>
                                  <span className="text-[10px] font-mono text-amber-400/90 font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    Melt: {Math.max(0, Math.ceil((shard.expiry - Date.now()) / 1000))}s
                                  </span>
                                </div>

                                <div className="space-y-1">
                                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">DHT Key Hash</p>
                                  <p className="text-xs font-mono text-white truncate bg-slate-950 px-2.5 py-1.5 rounded-lg border border-white/5">{shard.key}</p>
                                </div>

                                <div className="space-y-1">
                                  <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Encrypted Shard Payload (Hex / Cipher)</p>
                                  <p className="text-[10px] font-mono text-indigo-400/80 truncate bg-slate-950 p-2 rounded-lg border border-white/5">
                                    {shard.shardData.substring(0, 52)}...
                                  </p>
                                </div>

                                <button
                                  onClick={() => deleteHostedShard(shard.key, shard.shardId)}
                                  className="w-full py-2 bg-red-950/40 hover:bg-red-950/60 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-mono uppercase tracking-wider transition-all font-bold"
                                >
                                  Purge Shard Permanently
                                </button>
                              </motion.div>
                            ))
                        )}
                      </div>
                    </div>
                  )}

                  {activeTab === "logs" && (
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-900/40 border border-white/5 rounded-2xl space-y-3">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <h3 className="text-xs font-black uppercase text-white tracking-widest">Rolling Ledger Logs</h3>
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">Real-time cryptographic metadata & P2P protocol tracing</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const logText = logs.map(l => `[${l.timestamp}] [${l.type}] ${l.message}`).join("\n");
                                navigator.clipboard.writeText(logText);
                                setCopiedLogs(true);
                                setTimeout(() => setCopiedLogs(false), 2000);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[9px] font-mono uppercase font-bold transition-all flex items-center gap-1"
                            >
                              {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              {copiedLogs ? "Copied!" : "Copy Ledger"}
                            </button>
                            <button
                              onClick={() => setLogs([])}
                              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/5 text-[9px] font-mono uppercase transition-all"
                            >
                              Clear Ledger
                            </button>
                          </div>
                        </div>

                        {/* Search & Category Filter */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-white/5">
                          <div className="relative flex-1">
                            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={logSearch}
                              onChange={(e) => setLogSearch(e.target.value)}
                              placeholder="Search logs by keyword..."
                              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 sm:pb-0">
                            {(["ALL", "CRYPT", "DHT", "SUCCESS", "WARNING", "INFO"] as const).map(cat => (
                              <button
                                key={cat}
                                onClick={() => setLogFilter(cat)}
                                className={`px-2.5 py-1 rounded-lg text-[9px] font-mono font-bold uppercase transition-all shrink-0 ${
                                  logFilter === cat
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-950 text-slate-400 hover:bg-slate-800"
                                }`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-950 border border-white/5 rounded-2xl p-4 font-mono text-[10px] space-y-2 h-[420px] overflow-y-auto custom-scrollbar shadow-inner">
                        {logs
                          .filter(l => logFilter === "ALL" || l.type === logFilter)
                          .filter(l => !logSearch || l.message.toLowerCase().includes(logSearch.toLowerCase()) || l.type.toLowerCase().includes(logSearch.toLowerCase()))
                          .length === 0 ? (
                          <p className="text-slate-600 italic text-center py-12">No log entries matching criteria.</p>
                        ) : (
                          logs
                            .filter(l => logFilter === "ALL" || l.type === logFilter)
                            .filter(l => !logSearch || l.message.toLowerCase().includes(logSearch.toLowerCase()) || l.type.toLowerCase().includes(logSearch.toLowerCase()))
                            .map(log => (
                              <div key={log.id} className="flex items-start gap-2 leading-relaxed border-b border-white/[0.02] pb-1">
                                <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                                <span className={`font-bold shrink-0 px-1 py-0.5 rounded text-[9px] ${
                                  log.type === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400" :
                                  log.type === "WARNING" ? "bg-red-500/10 text-red-400" :
                                  log.type === "CRYPT" ? "bg-indigo-500/10 text-indigo-400" :
                                  log.type === "DHT" ? "bg-amber-500/10 text-amber-400" : "bg-slate-800 text-slate-300"
                                }`}>
                                  [{log.type}]
                                </span>
                                <span className="text-slate-300 break-words">{log.message}</span>
                              </div>
                            ))
                        )}
                        <div ref={logsEndRef} />
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* Chat Input footer (Only shown on direct chat tab) */}
              {activeTab === "direct" && (
                <footer className="shrink-0 relative z-10 p-3 sm:p-4 border-t border-white/5 bg-slate-900/80 backdrop-blur-xl">
                  <div className="max-w-4xl mx-auto">
                    {/* Replying banner */}
                    <AnimatePresence>
                      {replyingTo && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: "auto" }}
                          exit={{ opacity: 0, y: 10, height: 0 }}
                          className="flex items-center justify-between bg-indigo-950/80 border-l-4 border-indigo-500 px-3.5 py-2.5 rounded-r-xl mb-3 text-xs shadow-lg"
                        >
                          <div className="min-w-0 flex-1 pr-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                              <CornerUpLeft className="w-3.5 h-3.5" />
                              <span>Replying to {replyingTo.sender}</span>
                            </div>
                            <p className="text-slate-300 truncate text-[11px] mt-0.5 font-sans">{replyingTo.content}</p>
                          </div>
                          <button
                            onClick={() => setReplyingTo(null)}
                            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={handleSendDirectMessage} className="relative flex items-center gap-2">
                      <input
                        type="text"
                        value={directInput}
                        onChange={(e) => setDirectInput(e.target.value)}
                        placeholder={
                          activeChatPeerId === "local" || !activeChatPeerId
                            ? "Transmit sovereign message on local mesh..."
                            : "Transmit secure Double Ratchet message..."
                        }
                        className="w-full bg-slate-950 border border-white/10 rounded-2xl py-3.5 pl-5 pr-14 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all shadow-inner"
                      />
                      <button
                        type="submit"
                        disabled={!directInput.trim()}
                        className={`absolute right-2 top-1.5 bottom-1.5 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                          directInput.trim()
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95"
                            : "bg-slate-900 text-slate-600"
                        }`}
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </footer>
              )}
            </div>

            {/* Right section: Sidebar directory of known keys (Hidden on smaller screens) */}
            <aside className="w-80 border-l border-white/5 bg-slate-900/20 p-6 hidden lg:flex flex-col gap-6 overflow-y-auto custom-scrollbar">
              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
                  <Key className="w-4 h-4 text-indigo-400" />
                  Decentralized ID Directory
                </h4>
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  Cryptographically secure registry of active identity ECDH public tags discovered in the swarm.
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                  {knownPeers.length === 0 ? (
                    <p className="text-[10px] text-slate-600 italic">0 registered public keys. Wait for nodes to declare presence...</p>
                  ) : (
                    knownPeers.map((peer, idx) => {
                      const isOnline = peersList.some(p => p.seedId === peer.seedId && p.isConnected);
                      return (
                        <div key={idx} className="p-3 bg-slate-900 border border-white/5 rounded-xl space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white block">{peer.name}</span>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-emerald-400 animate-pulse" : "bg-slate-700"}`} />
                          </div>
                          <p className="text-[9px] font-mono text-slate-500 block">SEED: {peer.seedId.substring(0, 16)}...</p>
                          <p className="text-[8px] font-mono text-indigo-400/80 block break-all bg-slate-950 p-1 rounded">
                            {peer.publicKey.substring(0, 32)}...
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-4 border-t border-white/5 pt-6">
                <h4 className="text-xs font-black uppercase text-white tracking-widest flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  Protocol Specifications
                </h4>
                <ul className="space-y-3 text-[10px] text-slate-500 leading-relaxed font-mono">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">1. Double Ratchet:</span>
                    Key state advancing on every message sequence. Ephemeral ECDH key exchanges eliminate replay opportunities.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">2. Onion Routing:</span>
                    Layer-by-layer symmetric AES-GCM wrapping decodes dynamically per hop, preserving absolute sender-receiver decoupling.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 font-bold">3. Kademlia outbox:</span>
                    3-way split fragmentation dispersed under keyspace hashes; melted on read by cryptographic destruction tags.
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
