import React, { useState } from "react";
import { 
  X, 
  BookOpen, 
  Cpu, 
  ShieldCheck, 
  Check, 
  ExternalLink, 
  Lock, 
  Unlock, 
  ArrowRight, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  Network, 
  Activity, 
  FileText, 
  Database,
  Terminal,
  HelpCircle,
  HardDrive
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface NetworkDocsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  localPeerId?: string;
}

export function NetworkDocsDrawer({ isOpen, onClose, localPeerId }: NetworkDocsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"architecture" | "multiaddr" | "handshake" | "dag" | "storage" | "recovery">("architecture");
  
  // Interactive Sandbox state: Multiaddr parsing
  const [testMultiaddr, setTestMultiaddr] = useState("/ip4/192.168.1.100/tcp/3000/p2p/QmTEkTbZuDXxCrC3vSrJniQZVkrCt74bemuhKS1EtRdPW");
  
  // Parse utility mimicking the server logic
  const parseResult = (() => {
    try {
      const parts = testMultiaddr.split("/").filter(Boolean);
      const tcpIdx = parts.indexOf("tcp");
      const p2pIdx = parts.indexOf("p2p");
      
      if (tcpIdx === -1 || tcpIdx === 0) {
        return { error: "Requires 'tcp' segment in multiaddr link" };
      }
      
      const hostLayer = parts[tcpIdx - 2] || "unknown";
      const hostAddress = parts[tcpIdx - 1];
      const port = parts[tcpIdx + 1];
      
      if (!hostAddress || !port) {
        return { error: "Malformed host address or port designation" };
      }
      
      const peerId = p2pIdx !== -1 ? parts[p2pIdx + 1] : null;
      const isSecure = port === "443" || parts.includes("https") || parts.includes("wss");
      const protocol = isSecure ? "https" : "http";
      
      return {
        success: true,
        protocol,
        hostLayer,
        hostAddress,
        port,
        peerId,
        url: `${protocol}://${hostAddress}:${port}`
      };
    } catch (e: any) {
      return { error: e.message };
    }
  })();

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop and blur */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-indigo-950/80 backdrop-blur-md cursor-pointer"
            id="docs-drawer-backdrop"
          />

          {/* Sliding sheet */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="relative w-full max-w-2xl bg-[#090b16] border-l border-indigo-500/15 shadow-2xl h-full flex flex-col z-10 overflow-hidden text-left"
            id="docs-drawer-sheet"
          >
            {/* Header */}
            <div className="p-6 border-b border-indigo-500/15 flex items-center justify-between bg-black/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase text-white tracking-widest">Connection Blueprint</h2>
                  <p className="text-[10px] font-bold text-indigo-400/80">AUTHENTIC MULTIADDR & HANDSHAKE SPECIFICATION</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="group relative flex items-center gap-3 px-4 py-2 bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/20 rounded-xl transition-all duration-300 overflow-hidden"
                title="Secure Session Termination"
                id="close-docs-btn"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <span className="text-[9px] font-black text-indigo-300 uppercase tracking-[0.2em] relative z-10">Secure Exit</span>
                <div className="flex items-center gap-1 bg-black/40 px-1.5 py-1 rounded-md border border-white/5 relative z-10">
                  <span className="text-[8px] font-bold text-white/40">ESC</span>
                </div>
                <X className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-90 transition-transform duration-300 relative z-10" />
              </button>
            </div>

            {/* Tab navigation */}
            <div className="flex border-b border-indigo-500/15 bg-black/10 p-2 gap-1 overflow-x-auto scrollbar-none">
              <button
                onClick={() => setActiveTab("architecture")}
                className={`text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === "architecture" ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
              >
                1. System Topology
              </button>
              <button
                onClick={() => setActiveTab("multiaddr")}
                className={`text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === "multiaddr" ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
              >
                2. Multiaddr Parser
              </button>
              <button
                onClick={() => setActiveTab("handshake")}
                className={`text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === "handshake" ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
              >
                3. Handshake Security
              </button>
              <button
                onClick={() => setActiveTab("dag")}
                className={`text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === "dag" ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
              >
                4. Merkle BlockDAG Sync
              </button>
              <button
                onClick={() => setActiveTab("storage")}
                className={`text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === "storage" ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
              >
                5. Advanced Offline Mechanics
              </button>
              <button
                onClick={() => setActiveTab("recovery")}
                className={`text-[10px] font-black uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all whitespace-nowrap shrink-0 ${activeTab === "recovery" ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/20" : "text-white/40 hover:text-white/60 hover:bg-white/5"}`}
              >
                6. Sovereign Recovery
              </button>
            </div>

            {/* Document Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* Architecture Tab */}
              {activeTab === "architecture" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-gradient-to-tr from-indigo-500/5 to-transparent p-5 rounded-2xl border border-indigo-500/10 space-y-3">
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Overview Design</span>
                    <h3 className="text-lg font-black text-white leading-tight">Hybrid LAN/WAN Decentralized Network Mesh</h3>
                    <p className="text-xs text-indigo-200/60 leading-relaxed">
                      Your files are cryptographically protected and sliced. On local subnets (LAN), discovery occurs instantly via multicast <strong className="text-white font-semibold">mDNS parameters</strong>. To traverse network boundaries, cellular connections, or firewalled networks (WAN), nodes establish encrypted sessions routed via a hybrid HTTP pipeline using standard <strong className="text-white font-semibold">libp2p formatted Multiaddrs</strong>.
                    </p>
                  </div>

                  {/* WebRTC Multi-Channel Mesh */}
                  <div className="bg-gradient-to-r from-fuchsia-500/10 to-indigo-500/10 border border-fuchsia-500/20 p-5 rounded-2xl space-y-3">
                    <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Network className="w-3.5 h-3.5 text-fuchsia-400" /> Secure Transport Protocol
                    </span>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">WebRTC Multi-Channel Mesh & GunJS Handshake</h4>
                    <p className="text-[11px] text-indigo-200/60 leading-relaxed">
                      To move data efficiently without relying on centralized intermediaries, the system establishes fully private peer-to-peer data tunnels:
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                        <strong className="text-[10px] font-black text-white uppercase tracking-wider block">Direct Connections</strong>
                        <p className="text-[11px] text-indigo-200/40 leading-relaxed">
                          Nodes establish encrypted, peer-to-peer UDP/TCP connections directly with each other via browser-native WebRTC DataChannels.
                        </p>
                      </div>
                      <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                        <strong className="text-[10px] font-black text-white uppercase tracking-wider block">Dynamic handshaking</strong>
                        <p className="text-[11px] text-indigo-200/40 leading-relaxed">
                          A lightweight discovery graph (decentralized GunJS) is used solely to exchange initial connection handshakes. Data flows exclusively peer-to-peer.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Flow Steps */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-indigo-300/50 tracking-wider">Topology Sequence</h4>
                    
                    <div className="relative border-l border-indigo-500/20 pl-6 ml-3 space-y-6">
                      <div className="relative">
                        <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-indigo-950 border-2 border-indigo-400 flex items-center justify-center font-black text-[8px]">1</div>
                        <div className="space-y-1">
                          <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <Terminal className="w-3.5 h-3.5 text-indigo-400" /> Multiaddr Parsing
                          </h5>
                          <p className="text-xs text-indigo-200/50 leading-relaxed">
                            A uniform routing string representing coordinates like network interface type (IPv4/IPv6/DNS), transport layer port (TCP/HTTP), and the cryptographic validator index (Sovereign Peer ID) is dynamically analyzed.
                          </p>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-indigo-950 border-2 border-indigo-400 flex items-center justify-center font-black text-[8px]">2</div>
                        <div className="space-y-1">
                          <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" /> Cryptographic Challenge-Response Handshake
                          </h5>
                          <p className="text-xs text-indigo-200/50 leading-relaxed">
                            Before establishing connection or transferring fragments, nodes execute a cryptographically protected verification handshake. The receiving node signs a secure block challenge using its localized Ed25519 private key.
                          </p>
                        </div>
                      </div>

                      <div className="relative">
                        <div className="absolute -left-[31px] top-0 w-4 h-4 rounded-full bg-indigo-950 border-2 border-indigo-400 flex items-center justify-center font-black text-[8px]">3</div>
                        <div className="space-y-1">
                          <h5 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                            <Activity className="w-3.5 h-3.5 text-indigo-400" /> BlockDAG Merkle Fallback Cache Sync
                          </h5>
                          <p className="text-xs text-indigo-200/50 leading-relaxed">
                            Once authenticated, behind-NAT nodes poll the relay server to query cached multi-segmented 64KB virtual Merkle tree blocks. Synchronization of out-of-sync block ranges takes place natively without UDP hole punching.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-black/30 p-4 rounded-xl border border-white/5 text-[11px] text-indigo-200/60 leading-relaxed flex items-start gap-3">
                    <HelpCircle className="w-5 h-5 shrink-0 text-indigo-400" />
                    <div>
                      <strong className="text-white block mb-0.5">Physical WAN Transport Note</strong>
                      The infrastructure leverages standard HTTP tunneling pipelines but maintains full sovereign decentralized identity models by parsing p2p protocols on both ends.
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Multiaddr Parser Tab */}
              {activeTab === "multiaddr" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h3 className="text-sm font-black uppercase text-indigo-300">Resilient Multiaddr Segment Parser</h3>
                    <p className="text-xs text-indigo-200/60 leading-relaxed">
                      Standard implementations break when encountering alternative configurations (such as local subnets vs DNS host names, secure port bindings like SSL/443, or varying token positions). The segment matching logic scans positions dynamically inside relative token indexes:
                    </p>
                  </div>

                  {/* Sandbox playground */}
                  <div className="bg-black/40 border border-indigo-500/10 p-5 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Multiaddr Sandbox Playground</span>
                      <span className="text-[9px] font-mono text-indigo-300/50">Edit string to test parser</span>
                    </div>

                    <input 
                      type="text"
                      className="w-full bg-[#05060b] border border-white/10 rounded-xl px-4 py-3 text-xs text-indigo-200 font-mono placeholder-indigo-300/10 focus:outline-none focus:border-indigo-500/50"
                      value={testMultiaddr}
                      onChange={(e) => setTestMultiaddr(e.target.value)}
                    />

                    {/* Parser output details */}
                    <div className="bg-[#05060b] border border-white/5 rounded-xl p-4 text-xs font-mono space-y-3">
                      {parseResult.error ? (
                        <div className="flex items-center gap-2 text-rose-400">
                          <AlertTriangle className="w-4 h-4 shrink-0" />
                          <span>Parser Error: {parseResult.error}</span>
                        </div>
                      ) : (
                        <div className="space-y-2 text-indigo-200">
                          <div className="flex items-center gap-2 text-emerald-400 text-xs font-black uppercase pb-1 border-b border-indigo-500/15">
                            <Check className="w-4 h-4" /> Syntactically Valid String Struct
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-1 border-b border-indigo-500/5">
                            <span className="text-white/40">Protocol Scheme:</span>
                            <span className="col-span-2 text-indigo-300">{parseResult.protocol}://</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-1 border-b border-indigo-500/5">
                            <span className="text-white/40">Host Designator:</span>
                            <span className="col-span-2 text-indigo-300">{parseResult.hostLayer} ({parseResult.hostAddress})</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-1 border-b border-indigo-500/5">
                            <span className="text-white/40">TCP Binding Port:</span>
                            <span className="col-span-2 text-indigo-300">{parseResult.port}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-1 border-b border-indigo-500/5">
                            <span className="text-white/40">Secure Tunnel:</span>
                            <span className="col-span-2 text-white font-bold">{parseResult.protocol === "https" ? "✓ SECURE (SSL/TLS Upgrade Enabled)" : "⚠️ PLAIN (Upgrade Disabled)"}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 py-1 border-b border-indigo-500/5">
                            <span className="text-white/40">Cryptological Peer ID:</span>
                            <span className="col-span-2 text-white font-bold truncate tracking-tighter" title={parseResult.peerId || "None"}>
                              {parseResult.peerId || "Not specified in multiaddr"}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <span className="text-white/40">Output API Proxy URL:</span>
                            <span className="col-span-2 text-emerald-400">{parseResult.url}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider">Example Compatible Formats Supported</h4>
                    <div className="text-[10px] font-mono space-y-2 bg-black/20 p-4 rounded-xl border border-white/5">
                      <div className="text-indigo-200">
                        <span className="text-white font-bold block mb-0.5">IPv4 Simple Local Address:</span>
                        /ip4/127.0.0.1/tcp/3000/p2p/QmTEkTbZuDXx
                      </div>
                      <div className="text-indigo-200 border-t border-indigo-500/5 pt-2">
                        <span className="text-white font-bold block mb-0.5">IPv6 Global Transport Address:</span>
                        /ip6/2001:db8::1/tcp/3000/p2p/QmTEkTbZuDXx
                      </div>
                      <div className="text-indigo-200 border-t border-indigo-500/5 pt-2">
                        <span className="text-white font-bold block mb-0.5">Domain-Name based Secure Gateway:</span>
                        /dns4/bootstrap.site.com/tcp/443/https/p2p/QmTEkTbZuDXx
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Handshake Security Tab */}
              {activeTab === "handshake" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <h3 className="text-sm font-black uppercase text-indigo-300">Identity Verification & Secure Signatures</h3>
                    <p className="text-xs text-indigo-200/60 leading-relaxed">
                      To prevent <strong className="text-white font-semibold">man-in-the-middle (MitM) attacks</strong> across public WAN boundaries, the identity of bootstrap servers or relayed nodes is cryptographically validated at link-level using ephemeral challenge authentication:
                    </p>
                  </div>

                  {/* Protocol Specification */}
                  <div className="bg-black/40 border border-indigo-500/10 p-5 rounded-2xl space-y-4">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">Cryptographic Handshake Protocol</span>
                    
                    <div className="space-y-4">
                      <p className="text-xs text-indigo-200/60 leading-relaxed italic">
                        The sovereign handshake protocol is non-simulated and executes real-time Ed25519 signature verification during peer establishment.
                      </p>
                      
                      <div className="bg-[#05060b] border border-white/5 rounded-2xl p-4 font-mono text-[11px] space-y-3">
                        <div className="text-indigo-300 space-y-2">
                          <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase">
                            <ShieldCheck className="w-4 h-4" /> AUTHENTICATION READY
                          </div>
                          <div className="border-t border-white/5 pt-2">
                            1. Dispatch 128-bit Challenge Block<br/>
                            2. Relay Node Sovereign Signing<br/>
                            3. Ed25519 Public Key Verification<br/>
                            4. Secure Tunnel Finalization
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-indigo-950/40 p-4 border border-indigo-500/10 rounded-xl space-y-2">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">Cryptographic Primitives Map</span>
                    <p className="text-xs text-indigo-200/50 leading-relaxed">
                      Sovereign ID generation derives a standard Base58-encoded multihash. First, we construct the SHA-256 digested output of the public key's DER byte encoding, prepend the multihash prefixes (e.g. <span className="text-indigo-300 font-mono">0x12 0x20</span> for SHA-256 with 32-byte digest size), and translate it to Base58 format to yield a unique peerId payload (e.g., <span className="text-indigo-300 font-mono">Qm...</span>).
                    </p>
                  </div>
                </motion.div>
              )}

              {/* DAG Block Sync Tab */}
              {activeTab === "dag" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase text-indigo-300">Mesh Healing: Anti-Entropy Syncing & Audits</h3>
                    <p className="text-xs text-indigo-200/60 leading-relaxed">
                      To guarantee long-term data persistence even when peers disconnect or turn off their devices, connected nodes continuously run real background gossip and reconstruction protocols.
                    </p>
                  </div>

                  {/* Flow grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <FileText className="w-4 h-4" />
                      </div>
                      <strong className="text-xs text-white uppercase tracking-wider block">Merkle Tree Auditing</strong>
                      <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                        Nodes periodically compile their local Origin Private File System (OPFS) shard hashes into a deterministic Merkle Tree, comparing roots with neighbors to quickly locate directory deltas.
                      </p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                      <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                        <Database className="w-4 h-4" />
                      </div>
                      <strong className="text-xs text-white uppercase tracking-wider block">Self-Healing Swarm</strong>
                      <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                        If a shard's replication factor falls below the threshold (e.g., $N=5$), available peers cooperatively fetch $K=3$ remaining shards, decode and rebuild the original chunk, and re-distribute new shards.
                      </p>
                    </div>
                  </div>

                  <div className="bg-black/30 border border-indigo-500/10 rounded-2xl p-5 space-y-3">
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider block">Decentralized Merkle Root Construction</span>
                    <div className="font-mono text-[10px] text-indigo-200/80 space-y-1 bg-black/40 p-4 rounded-xl border border-white/5 leading-normal">
                      <div>Deterministic Leaves: sorted( local_shard_hashes )</div>
                      <div className="pl-4 text-white/40">└── Merkle Root = SHA256( SHA256(H1 + H2) + SHA256(H3 + H4) )</div>
                      <div className="pt-2">Cooperative Swarm Reconstruction:</div>
                      <div className="pl-4 text-white/40">└── Decode( K=3 Shards ) ➔ Re-encode( N=5 Shards ) ➔ Re-distribute missing replicas.</div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Advanced Storage Tab */}
              {activeTab === "storage" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-gradient-to-tr from-fuchsia-500/5 to-transparent p-5 rounded-2xl border border-fuchsia-500/10 space-y-3">
                    <span className="text-[10px] font-black text-fuchsia-400 uppercase tracking-widest">Protocol Evolution</span>
                    <h3 className="text-lg font-black text-white leading-tight">Advanced Offline Storage & P2P Mesh Mechanics</h3>
                    <p className="text-xs text-indigo-200/60 leading-relaxed">
                      Sovereign data integrity is maintained even in physical isolation. The system executes a three-layer pipeline: <strong className="text-white font-semibold">Local Encryption</strong> → <strong className="text-white font-semibold">Cryptographic Sharding</strong> → <strong className="text-white font-semibold">Content-Addressed DB Persistence</strong>.
                    </p>
                  </div>

                  {/* Sharding Logic */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-fuchsia-300/50 tracking-wider">1. Zero-Knowledge Cryptographic Sharding</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Database className="w-4 h-4 text-fuchsia-400" />
                          <span className="text-xs font-black text-white uppercase tracking-wider">Reed-Solomon Erasure Coding</span>
                        </div>
                        <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                          Files are split into <strong className="text-indigo-300">N=5 shards</strong>. Reconstruction requires a quorum of any <strong className="text-indigo-300">K=3 shards</strong>. This delivers mathematically optimized storage efficiency while assuring absolute offline resilience.
                        </p>
                      </div>
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <ShieldCheck className="w-4 h-4 text-fuchsia-400" />
                          <span className="text-xs font-black text-white uppercase tracking-wider">Shamir's Secret Sharing (SSS)</span>
                        </div>
                        <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                          Reserved for high-security key orchestration and social recovery. Splits master keys into cryptographic pieces, guaranteeing mathematical isolation without a threshold consensus of trusted guardians.
                        </p>
                      </div>
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Lock className="w-4 h-4 text-fuchsia-400" />
                          <span className="text-xs font-black text-white uppercase tracking-wider">Privacy by Design</span>
                        </div>
                        <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                          No single peer holds a complete set of shards, and all shards are encrypted with client-side keys before transmission, rendering the data mathematically unreadable to everyone else.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* OPFS Storage Foundation */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-fuchsia-300/50 tracking-wider">2. The Storage Foundation: OPFS (Origin Private File System)</h4>
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <HardDrive className="w-4 h-4 text-fuchsia-400" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">Browser-Native Private Sandbox</span>
                      </div>
                      <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                        Instead of relying on restricted third-party cloud storage or localStorage (which caps at 5MB), the system utilizes <strong className="text-indigo-300">OPFS</strong>. This is a highly performant, browser-native storage sandbox that reads and writes gigabytes of encrypted shards directly to the user's hard drive via fast, low-latency binary streams. Peers act as physical storage nodes with absolute offline resilience.
                      </p>
                    </div>
                  </div>

                  {/* State Management */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-indigo-300/50 tracking-wider">3. State & Conflict Resolution</h4>
                    <div className="bg-black/30 p-5 rounded-2xl border border-indigo-500/10 space-y-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                          <Activity className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-black text-white uppercase tracking-wider block">CRDT Convergence</span>
                          <p className="text-[11px] text-indigo-200/60 leading-relaxed">
                            Nodes leverage <strong className="text-indigo-300">Conflict-Free Replicated Data Types</strong> and <strong className="text-indigo-300">Vector Clocks</strong> to resolve concurrent edits deterministically without a central server.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                   {/* Custom DHT (Kademlia XOR Metric) */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-amber-400/50 tracking-wider">4. Custom Distributed Hash Table (DHT)</h4>
                    <div className="bg-amber-400/[0.02] border border-amber-400/10 p-5 rounded-2xl flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Terminal className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">Kademlia XOR Metric</span>
                      </div>
                      <p className="text-[11px] text-indigo-200/60 leading-relaxed">
                        To scale data discovery and lookup without index servers, the system executes a real <strong className="text-amber-400">Kademlia DHT</strong>.
                      </p>
                      <div className="grid grid-cols-1 gap-2 pt-1 text-[11px]">
                        <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                          <span className="text-white font-bold block mb-1">256-bit Node IDs & CIDs</span>
                          Every node is assigned a random 256-bit ID. Every file shard is given a 256-bit Content Identifier (CID) based on its cryptographic hash.
                        </div>
                        <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                          <span className="text-white font-bold block mb-1">Smart XOR Distance Placement</span>
                          Shards are stored on nodes whose Node IDs are mathematically closest (using an XOR distance calculation: <code className="text-amber-300">d(x,y) = x ⊕ y</code>) to the shard's CID.
                        </div>
                        <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                          <span className="text-white font-bold block mb-1">Iterative Multi-hop Routing</span>
                          When requesting a file, nodes locate the shard by querying the mathematically closest nodes first, finding and fetching the shard in <code className="text-amber-300">log(N)</code> hops.
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* DTN Mechanics */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-emerald-300/50 tracking-wider">5. Opportunistic Networking (DTN)</h4>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-2xl flex flex-col gap-3">
                      <div className="flex items-center gap-3">
                        <Network className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">Store-and-Forward Mesh</span>
                      </div>
                      <p className="text-[11px] text-emerald-200/60 leading-relaxed">
                        Nodes use BLE and Wi-Fi Direct to pass encrypted segments hop-by-hop. Anti-Entropy protocols silently audit hashes with physical neighbors to sync missing blocks in the background.
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-mono text-emerald-400 uppercase tracking-widest">BLE Interface</div>
                        <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] font-mono text-emerald-400 uppercase tracking-widest">LoRa Bridge</div>
                      </div>
                    </div>
                  </div>

                  {/* Hardware Security */}
                  <div className="bg-black/40 p-5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                      <Lock className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-black text-white uppercase tracking-wider">Hardware-Level Security (TEE)</span>
                    </div>
                    <p className="text-[11px] text-indigo-200/40 leading-relaxed">
                      All root keys remain isolated within the device's <strong className="text-indigo-300/60">Trusted Execution Environment</strong> (Apple Secure Enclave / ARM TrustZone). Self-destruct triggers purge master keys if physical tampering or prolonged isolation is detected.
                    </p>
                  </div>
                </motion.div>
              )}
              
              {/* Sovereign Recovery Tab */}
              {activeTab === "recovery" && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="bg-gradient-to-tr from-amber-500/5 to-transparent p-5 rounded-2xl border border-amber-500/10 space-y-3">
                    <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Resilience Engineering</span>
                    <h3 className="text-lg font-black text-white leading-tight">Decentralized Offline File Recovery</h3>
                    <p className="text-xs text-indigo-200/60 leading-relaxed">
                      In a sovereign mesh, file recovery does not rely on central backup servers. It leverages <strong className="text-white font-semibold">deterministic derivation</strong>, <strong className="text-white font-semibold">social sharding</strong>, and <strong className="text-white font-semibold">analog steganography</strong>.
                    </p>
                  </div>

                  {/* Identity & Key Reconstruction */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-amber-300/50 tracking-wider">1. Identity & Key Reconstruction</h4>
                    <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-3">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">Deterministic BIP-39 Seed</span>
                      </div>
                      <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                        The entire cryptographic key infrastructure is mathematically calculated from a single 12-24 word mnemonic. Re-entering this seed recreates the exact vault environment without external data.
                      </p>
                      <div className="bg-black/30 p-3 rounded-lg border border-amber-500/10">
                        <span className="text-[9px] font-black text-amber-400 uppercase block mb-1">Social Recovery Protocol</span>
                        <p className="text-[10px] text-indigo-300/40">
                          Shred the master key into <strong className="text-indigo-300/60">K-of-N shards</strong>. Distribute shards to trusted "Guardians". Proximity via BLE allows quorum reconstruction.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Shard Discovery */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-indigo-300/50 tracking-wider">2. Shard Discovery & Collection</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex gap-4">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                          <Network className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-black text-white uppercase tracking-wider block">Content-Addressed Requests (CID)</span>
                          <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                            The client hashes file metadata to generate a CID, then broadcasts this request via Wi-Fi Direct/BLE.
                          </p>
                        </div>
                      </div>
                      <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl flex gap-4">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                          <Database className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div className="space-y-1">
                          <span className="text-xs font-black text-white uppercase tracking-wider block">Zero-Knowledge Response</span>
                          <p className="text-[11px] text-indigo-200/50 leading-relaxed">
                            Neighboring nodes return matching encrypted blocks without knowing their actual content.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Analog Backups */}
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-emerald-300/50 tracking-wider">3. Analog & Steganographic Backups</h4>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center gap-3">
                        <RefreshCw className="w-4 h-4 text-emerald-400" />
                        <span className="text-xs font-black text-white uppercase tracking-wider">Cold Storage Redundancy</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold text-white block">Hardware Cold Storage</span>
                          <p className="text-[9px] text-indigo-200/40">Convert seed phrases into encrypted hardware enclave backup tokens for physical storage.</p>
                        </div>
                        <div className="bg-black/20 p-3 rounded-lg border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold text-white block">Steganography</span>
                          <p className="text-[9px] text-indigo-200/40">Hide encrypted chunks inside the metadata of harmless digital media.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Repair Mechanics */}
                  <div className="bg-black/40 p-5 rounded-2xl border border-white/5">
                    <div className="flex items-center gap-3 mb-3">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-black text-white uppercase tracking-wider">Mathematical Reassembly & Repair</span>
                    </div>
                    <p className="text-[11px] text-indigo-200/40 leading-relaxed">
                      Once threshold <strong className="text-white">K</strong> is met, <strong className="text-indigo-300">Reed-Solomon</strong> error correction repairs packet drops on-the-fly. Final decryption occurs natively within the <strong className="text-white">Secure Enclave</strong>.
                    </p>
                  </div>
                </motion.div>
              )}

            </div>

            {/* Footer containing local peer ID */}
            {localPeerId && (
              <div className="p-4 bg-black/50 border-t border-indigo-500/15 flex flex-col sm:flex-row items-center justify-between text-[10px] text-white/40 gap-2 font-mono shrink-0">
                <span className="uppercase text-[9px] text-indigo-400/80 font-black tracking-widest">Active System ID</span>
                <span className="break-all text-white font-bold tracking-tight select-all">{localPeerId}</span>
              </div>
            )}

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
