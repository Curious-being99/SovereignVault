import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Shield, 
  Lock, 
  Unlock, 
  Users2, 
  Upload, 
  Network, 
  ChevronRight, 
  Eye, 
  EyeOff, 
  Briefcase,
  Layers,
  Zap,
  Globe,
  Database,
  ArrowRight,
  HardDrive,
  AlertTriangle,
  RotateCcw,
  Download,
  ShieldAlert,
  QrCode
} from "lucide-react";
import { UserProfile } from "../lib/db";
import { QRScannerOverlay } from "./QRScannerOverlay";

interface LandingPageProps {
  usernameInput: string;
  setUsernameInput: (val: string) => void;
  displayNameInput: string;
  setDisplayNameInput: (val: string) => void;
  passwordInput: string;
  setPasswordInput: (val: string) => void;
  showPassword: boolean;
  setShowPassword: (val: boolean) => void;
  allUsers: UserProfile[];
  handleRegister: (e: React.FormEvent) => void;
  handleLogin: (e: React.FormEvent, overrideUsername?: string) => void;
  handleQuickSwitchUser: (user: UserProfile) => void;
  handleVaultPackImport: (e: any, directText?: string) => void;
  hasBiometric?: boolean;
  handleBiometricLogin?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  usernameInput,
  setUsernameInput,
  displayNameInput,
  setDisplayNameInput,
  passwordInput,
  setPasswordInput,
  showPassword,
  setShowPassword,
  allUsers,
  handleRegister,
  handleLogin,
  handleQuickSwitchUser,
  handleVaultPackImport,
  hasBiometric,
  handleBiometricLogin,
}) => {
  const [authMode, setAuthMode] = useState<"landing" | "register" | "login">("landing");
  const [isDraggingImport, setIsDraggingImport] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const onDragOverImport = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImport(true);
  };

  const onDragLeaveImport = () => {
    setIsDraggingImport(false);
  };

  const onDropImport = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImport(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      // Find the first .vault file
      const vaultFile = Array.from(files as FileList).find((f: File) => f.name.endsWith('.vault'));
      if (vaultFile) {
        handleVaultPackImport({ target: { files: files } } as any);
      }
    }
  };

  return (
    <div 
      onDragOver={onDragOverImport}
      onDragLeave={onDragLeaveImport}
      onDrop={onDropImport}
      className={`relative w-full min-h-screen bg-slate-950 text-slate-200 selection:bg-indigo-500/30 transition-colors duration-300 ${isDraggingImport ? 'bg-indigo-950/40' : ''}`}
    >
      <AnimatePresence>
        {isDraggingImport && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none"
          >
            <div className="bg-indigo-600/90 backdrop-blur-xl p-16 rounded-[48px] border-4 border-dashed border-white/20 flex flex-col items-center gap-6 shadow-2xl">
              <Upload className="w-20 h-20 text-white animate-bounce" />
              <div className="text-center">
                <h3 className="text-3xl font-black text-white uppercase tracking-tighter">Release to Import Vault</h3>
                <p className="text-indigo-100/70 font-medium">Sovereign .vault keypack detected</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {authMode === "landing" && (
          <motion.div
            key="landing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-6xl mx-auto px-6 py-20 lg:py-32 flex flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center mb-12"
            >
              <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-center mb-4 shadow-2xl relative group">
                <div className="absolute inset-0 bg-indigo-500/10 blur-2xl group-hover:bg-indigo-500/20 transition-all rounded-full" />
                <Briefcase className="w-10 h-10 text-indigo-400 relative z-10" />
              </div>
              <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">Secure Zone</span>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-white mb-8 leading-[1.1]"
            >
              Your Data. <br />
              <span className="text-slate-500">Completely Sovereign.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-base sm:text-lg lg:text-xl text-slate-400 max-w-2xl mb-12 sm:mb-16 leading-relaxed"
            >
              A high-performance, decentralized file vault built for the future. 
              Zero-knowledge encryption, P2P Mesh synchronization, and total privacy by design.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full sm:w-auto px-4 sm:px-0"
            >
              <button
                onClick={() => setAuthMode("register")}
                className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-white text-slate-950 rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-slate-200 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] active:scale-95"
              >
                Establish Identity
              </button>
              <button
                onClick={() => setAuthMode("login")}
                className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                Unlock Vault
              </button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mt-16 sm:mt-24 lg:mt-32 grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 lg:gap-12 text-left w-full"
            >
              {[
                {
                  icon: Lock,
                  title: "E2E Encrypted",
                  sysId: "SOVEREIGN CRYPTO ENGINE",
                  desc: "Military-grade AES-256-GCM encryption handles all blocks before they leave your hardware.",
                  railColor: "border-l-emerald-500",
                  badgeClass: "bg-emerald-500/5 text-emerald-400 border-emerald-500/10",
                  iconColor: "text-emerald-400",
                  iconBg: "bg-emerald-950/10 border-emerald-500/20",
                  bullets: [
                    {
                      badge: "SEED-ISO",
                      title: "Cryptographic Seed Isolation",
                      desc: "Vault keypacks isolate secret seeds inside volatile Memory (RAM) boundaries safely."
                    },
                    {
                      badge: "PBKDF2 (600k)",
                      title: "Device-Level Encrypted Packs",
                      desc: "Master key derived via hardened PBKDF2 (600,000 iterations) encrypts storage blocks before network serialization."
                    },
                    {
                      badge: "AES-256",
                      title: "Sovereign Access Guards",
                      desc: "Integrity asserts prevent unauthorized or unauthenticated reads of on-disk assets."
                    },
                    {
                      badge: "KASPA-SEC",
                      title: "Kaspa Encryption Anchors",
                      desc: "Cryptographic state and vault identities are immutably anchored to the Kaspa BlockDAG."
                    }
                  ]
                },
                {
                  icon: Network,
                  title: "P2P Mesh",
                  sysId: "CONTENT-ADDRESSABLE LEDGER",
                  desc: "Distributed synchronization ensures your files are reachable without centralized bottlenecks.",
                  railColor: "border-l-amber-500",
                  badgeClass: "bg-amber-500/5 text-amber-400 border-amber-500/10",
                  iconColor: "text-amber-400",
                  iconBg: "bg-amber-950/10 border-amber-500/20",
                  bullets: [
                    {
                      badge: "SHA-256",
                      title: "Content-Addressable Storage (CAS)",
                      desc: "Files are broken down into granular cryptographic chunks identified and fetched solely by their SHA-256 hashes."
                    },
                    {
                      badge: "DE-DUP",
                      title: "Sovereign Chunk De-duplication",
                      desc: "Identical source chunks share the exact same content address across local and remote node boundaries, eliminating redundant transfers."
                    },
                    {
                      badge: "INDEX-DAG",
                      title: "Immutable Kaspa BlockDAG Verification",
                      desc: "Every structural block contains previous block hash links, confirming absolute chronological file history on the fast decentralized Kaspa ledger."
                    }
                  ]
                },
                {
                  icon: Database,
                  title: "Local-First",
                  sysId: "LOCAL-FIRST SQLITE DATABASE ENGINE",
                  desc: "Your primary database is an encrypted SQLite vault stored directly on your machine, integrating native meta indexing.",
                  railColor: "border-l-indigo-500",
                  badgeClass: "bg-indigo-500/5 text-indigo-400 border-indigo-500/10",
                  iconColor: "text-indigo-400",
                  iconBg: "bg-indigo-950/10 border-indigo-500/20",
                  bullets: [
                    {
                      badge: "SQLITE-ACID",
                      title: "Storage Catalog",
                      desc: "Zero-latency local SQLite mapping block hashes to partition filesystem disk offsets."
                    },
                    {
                      badge: "INDEX-DAG",
                      title: "Metadata Indexing",
                      desc: "Relational indexes mapping parent references to cryptographically validated DAG chains."
                    },
                    {
                      badge: "DB-COHESION",
                      title: "Self-Healing",
                      desc: "Automated file partition audits restoring and rebuilding SQLite integrity schemas."
                    }
                  ]
                }
              ].map((feat, i) => (
                <div 
                  key={i} 
                  className="bg-slate-950/40 border border-slate-900/80 hover:border-indigo-500/20 transition-all rounded-3xl shadow-lg backdrop-blur-sm flex flex-col overflow-hidden"
                >
                  {/* Sector Header Area */}
                  <div className="p-4 bg-slate-950/30 border-b border-white/[0.03] space-y-1">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] font-black text-indigo-400 tracking-wider">
                      <span>◈</span>
                      <span className="uppercase">{feat.sysId}</span>
                    </div>
                  </div>

                  {/* Body Details & Interactive List Area */}
                  <div className="p-6 flex-1 flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 border rounded-xl flex items-center justify-center shrink-0 ${feat.iconBg} ${feat.iconColor}`}>
                          <feat.icon className="w-5 h-5" />
                        </div>
                        <h4 className="text-lg font-black text-white tracking-tight">{feat.title}</h4>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed font-sans">{feat.desc}</p>
                    </div>

                    {feat.bullets.length > 0 && (
                      <ul className="space-y-4 pt-1">
                        {feat.bullets.map((bullet, idx) => (
                          <li 
                            key={idx} 
                            className={`pl-3 border-l-2 ${feat.railColor} ${
                              idx > 0 ? "pt-4 border-t border-white/[0.03]" : ""
                            } space-y-1.5`}
                          >
                            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              <span className={`text-[9px] font-mono tracking-wider font-extrabold uppercase border px-1.5 py-0.5 rounded shrink-0 ${feat.badgeClass}`}>
                                {bullet.badge}
                              </span>
                              <span className="text-white/[0.1] font-mono text-xs hidden sm:inline select-none">─────</span>
                              <span className="text-xs font-sans font-bold text-slate-200 tracking-tight whitespace-nowrap">
                                {bullet.title}
                              </span>
                            </div>
                            <p className="font-mono text-[10px] sm:text-[11px] text-slate-400 leading-relaxed pl-0.5">
                              {bullet.desc}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Sovereign Storage Architecture, Global P2P Mesh & System Boundaries Panel */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              className="mt-16 sm:mt-24 lg:mt-32 w-full text-left space-y-12 sm:space-y-16"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/5 border border-indigo-500/20 rounded-xl animate-pulse">
                    <Layers className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white tracking-tight uppercase">Sovereign Data Storage & Peer-to-Peer Mesh Architecture</h3>
                    <p className="text-xs text-slate-500 font-medium">How files are mapped inside the distributed vault ledger, replicated across global peers, and system operational limits.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-indigo-950/25 border border-indigo-500/10 px-3 py-1 rounded-full text-[10px] font-mono font-bold text-indigo-300">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                  <span>DECENTRALIZED WORKSPACE CORE ACTIVE</span>
                </div>

              </div>

              {/* SECTION A: Visual Storage Flow and Operational Constraints */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Visual Storage Scheme (Lefthand Column) */}
                <div className="lg:col-span-7 bg-slate-950/40 border border-white/[0.03] rounded-3xl p-6 sm:p-8 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-mono text-[10px] font-black text-indigo-400 tracking-wider">
                      <span className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                      <span>VAULT STORAGE FLOW SEGMENTATION</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600 bg-white/5 px-2 py-0.5 rounded uppercase">Encrypted Pool</span>
                  </div>

                  <div className="space-y-4">
                    {[
                      {
                        level: "L1",
                        name: "Raw Payload Input Buffer",
                        tech: "Browser Memory (RAM)",
                        desc: "Raw physical files are read as an in-memory ArrayBuffer. They never touch persistent disk storage unencrypted.",
                        indicator: "Volatile Segments",
                        indicatorColor: "bg-blue-500/10 text-blue-400 border-blue-500/20"
                      },
                      {
                        level: "L2",
                        name: "Zero-Knowledge Crypto Engine",
                        tech: "AES-256-GCM Transcoder",
                        desc: "Derived master keys encrypt raw buffers into encrypted binary blobs. The raw keys exist strictly inside volatile, isolated execution boundaries.",
                        indicator: "No-Access Shield",
                        indicatorColor: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      },
                      {
                        level: "L3",
                        name: "Relational Ledger Mapping",
                        tech: "SQLite Relational Cache",
                        desc: "Local directory metadata structures and parent/child folders are indexed securely in the relational SQLite schema.",
                        indicator: "SQLITE Schema",
                        indicatorColor: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                      },
                      {
                        level: "L4",
                        name: "Chronological Link Chains",
                        tech: "Kaspa BlockDAG Cryptographic Registry",
                        desc: "Encrypted segments are enveloped into individual chronological DAG blocks, verified and securely anchored to the decentralized public Kaspa BlockDAG network.",
                        indicator: "Kaspa Ledger",
                        indicatorColor: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/20"
                      },
                      {
                        level: "L5",
                        name: "Physical Hardware Sector",
                        tech: "W3C local filesystem sandbox",
                        desc: "The final blocks are compiled and stored safely into the localized, sandboxed database directory, bounded solely by your machine's physical disk boundaries.",
                        indicator: "Hardware Bound",
                        indicatorColor: "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      }
                    ].map((step, sIdx) => (
                      <div key={sIdx} className="relative group">
                        {sIdx < 4 && (
                          <div className="absolute left-[36px] top-[48px] bottom-[-24px] w-0.5 bg-gradient-to-b from-indigo-500/30 to-indigo-500/0 z-0" />
                        )}
                        <div className="relative z-10 flex gap-4 p-4 rounded-2xl bg-slate-900/10 border border-white/[0.02] hover:border-white/[0.05] hover:bg-slate-900/30 transition-all duration-300">
                          <div className="w-10 h-10 rounded-xl bg-slate-950/80 border border-white/5 flex items-center justify-center font-mono text-xs font-black text-indigo-300 shrink-0 shadow-inner group-hover:border-indigo-500/30 group-hover:bg-slate-950 transition-colors">
                            {step.level}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <h4 className="text-sm font-bold text-white tracking-tight">{step.name}</h4>
                              <span className={`text-[9px] font-mono tracking-wider font-extrabold uppercase border px-2 py-0.5 rounded ${step.indicatorColor}`}>
                                {step.indicator}
                              </span>
                            </div>
                            <div className="text-[10px] font-mono text-indigo-400/80">{step.tech}</div>
                            <p className="text-[11px] text-slate-500 leading-relaxed font-sans">{step.desc}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* System Limitations & Boundaries (Righthand Column) */}
                <div className="lg:col-span-5 space-y-6">
                  <div className="bg-slate-950/40 border border-white/[0.03] rounded-3xl p-6 sm:p-8 space-y-6">
                    <div className="flex items-center gap-2 font-mono text-[10px] font-black text-teal-400 tracking-wider">
                      <AlertTriangle className="w-4 h-4 text-teal-400" />
                      <span>OPERATIONAL SYSTEM LIMITATIONS</span>
                    </div>

                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      To preserve complete user sovereignty and prevent external telemetry infiltration, the system operates under strict physical and architectural boundaries:
                    </p>

                    <div className="space-y-4">
                      {[
                        {
                          title: "Zero Password Recovery Authority",
                          desc: "No key escrow services or master databases exist. If you lose your master seed password, your private encrypted file blocks represent unreadable static noise. Data recovery is physically impossible."
                        },
                        {
                          title: "Localized Space Restraints",
                          desc: "The applet stores data locally on your physical device disk. Total storage volume is strictly limited by the free capacity of your local host sectors and browser sandbox quotas."
                        },
                        {
                          title: "Boundary-Restricted Peer Discovery",
                          desc: "Direct HTTP node transfers and immediate mDNS subnet broadcasts are restricted to local networks, subnets, and active tunnel-connected networks. Nodes outside these scopes cannot synchronize."
                        }
                      ].map((limit, lIdx) => (
                        <div key={lIdx} className="p-4 rounded-2xl bg-teal-950/5 border border-teal-500/10 hover:border-teal-400/20 transition-colors space-y-1.5 pl-4.5 border-l-4 border-l-teal-500">
                          <h4 className="text-xs font-bold text-white tracking-tight font-sans uppercase">{limit.title}</h4>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-mono">{limit.desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-slate-950/40 border border-white/[0.03] rounded-3xl p-6 flex items-start gap-4">
                    <div className="p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                      <HardDrive className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-black text-white uppercase tracking-wider font-sans">Hardware Native Architecture</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
                        Rather than renting centralized servers, this device actively acts as an independent network node responsible for hosting its catalog. You command full integrity over your sectors.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION B: Global P2P Mesh Network Topologies & Replication System */}
              <div className="bg-slate-950/20 border border-white/[0.03] rounded-2xl sm:rounded-[36px] p-5 sm:p-10 space-y-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-500/[0.01] rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/[0.04] relative z-10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono text-[10px] font-black text-indigo-400 tracking-widest uppercase">
                      <Globe className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>KASPA PEER-TO-PEER GLOBAL MESH INTEGRATION</span>
                    </div>
                    <h4 className="text-xl font-bold text-white tracking-tight">Decentralized P2P Mesh Federation & Kaspa BlockDAG Gossip Replicas</h4>
                  </div>
                  <span className="text-[10px] sm:text-xs font-mono bg-indigo-500/5 text-indigo-300 border border-indigo-500/15 px-3 py-1 rounded-full uppercase font-black tracking-widest whitespace-nowrap">
                    Active Multi-Hub Protocol
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
                  {/* Layer 1: local multicast discovery */}
                  <div className="bg-slate-950/50 border border-white/[0.02] hover:border-indigo-500/20 rounded-2xl p-6 space-y-4 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-600/5 border border-indigo-500/25 rounded-xl flex items-center justify-center font-mono text-xs font-black text-indigo-400 shadow-inner">
                        01
                      </div>
                      <div>
                        <h5 className="text-sm font-extrabold text-white uppercase tracking-tight">mDNS Local Discovery</h5>
                        <p className="text-[10px] font-mono text-indigo-300 uppercase">Subnet Node Broadcasts</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Scans localized local area network interfaces dynamically. Emits zero-configuration mDNS query vectors over packet domains, allowing close physical peer nodes to auto-dial and bind instantly over direct sockets.
                    </p>

                    <div className="border-t border-white/[0.03] pt-4 flex items-center justify-between font-mono text-[9px] text-slate-500">
                      <span>SCOPE: LOCAL SUBNET LAN</span>
                      <span className="text-emerald-400 font-bold">1ms LATENCY</span>
                    </div>
                  </div>

                  {/* Layer 2: RTC Data tunnel */}
                  <div className="bg-slate-950/50 border border-white/[0.02] hover:border-indigo-500/20 rounded-2xl p-6 space-y-4 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-teal-600/5 border border-teal-500/25 rounded-xl flex items-center justify-center font-mono text-xs font-black text-teal-400 shadow-inner">
                        02
                      </div>
                      <div>
                        <h5 className="text-sm font-extrabold text-white uppercase tracking-tight">WebRTC STUN/TURN Sockets</h5>
                        <p className="text-[10px] font-mono text-teal-300 uppercase">Direct Client-to-Client Tunnels</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Establishes secure, binary-friendly direct peer-to-peer data pipes across complex NAT boundaries. Dispatches AES encrypted file slice fragments straight between browser sandboxes without intermediate cloud storage.
                    </p>

                    <div className="border-t border-white/[0.03] pt-4 flex items-center justify-between font-mono text-[9px] text-slate-500">
                      <span>SCOPE: WAN END-TO-END</span>
                      <span className="text-teal-400 font-bold">NAT TRAVERSED</span>
                    </div>
                  </div>

                  {/* Layer 3: Gun multihub */}
                  <div className="bg-slate-950/50 border border-white/[0.02] hover:border-indigo-500/20 rounded-2xl p-6 space-y-4 transition-all duration-300">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-fuchsia-600/5 border border-fuchsia-500/25 rounded-xl flex items-center justify-center font-mono text-xs font-black text-fuchsia-400 shadow-inner">
                        03
                      </div>
                      <div>
                        <h5 className="text-sm font-extrabold text-white uppercase tracking-tight">GunDB Multi-Relay Sync</h5>
                        <p className="text-[10px] font-mono text-fuchsia-300 uppercase">Distributed Gossip State</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-slate-400 leading-relaxed font-sans">
                      Integrates decentralized pub-sub message propagation to synchronize metadata registries globally. Solves split-brain events out-of-order and maps real-time index changes incrementally using CRDT consensus graphs.
                    </p>

                    <div className="border-t border-white/[0.03] pt-4 flex items-center justify-between font-mono text-[9px] text-slate-500">
                      <span>SCOPE: GLOBAL MESH STATE</span>
                      <span className="text-fuchsia-400 font-bold">CRDT MERGING</span>
                    </div>
                  </div>
                </div>

                {/* Simulated Network Flow Mechanics Legend */}
                <div className="p-6 bg-slate-900/15 border border-white/[0.03] rounded-2.5xl space-y-4">
                  <div className="flex items-center gap-2 font-mono text-[10px] font-black text-indigo-400">
                    <span>◈</span>
                    <span>GLOBAL MESH COHESION CRITERIA & REPLICATION THROTTLING</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
                    <div className="bg-slate-950/60 p-3.5 border border-white/[0.02] rounded-xl space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Consensus Verification</div>
                      <div className="text-slate-300 leading-relaxed text-[10px]">
                        Nodes continuously sign challenges with their Ed25519 localized identity private keys to verify peer authentications securely.
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-3.5 border border-white/[0.02] rounded-xl space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Bloom Filter Deduplication</div>
                      <div className="text-slate-300 leading-relaxed text-[10px]">
                        Prior to emitting Gossip Pushes across the pool, Bloom filters eliminate duplicate transmissions, reducing overhead.
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-3.5 border border-white/[0.02] rounded-xl space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Dynamic IP Fallback</div>
                      <div className="text-slate-300 leading-relaxed text-[10px]">
                        Matches external variables dynamically when resolving relative token addresses inside secure network adapters.
                      </div>
                    </div>
                    <div className="bg-slate-950/60 p-3.5 border border-white/[0.02] rounded-xl space-y-1">
                      <div className="text-[9px] text-slate-500 font-bold uppercase">Fault Tolerant Rebuilds</div>
                      <div className="text-slate-300 leading-relaxed text-[10px]">
                        Incomplete file slices can be safely restored via automatic indexing audits comparing local and distributed network logs.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION C: Backup & Recovery Mechanism */}
              <div className="mt-10 sm:mt-16 bg-slate-950/20 border border-white/[0.03] rounded-2xl sm:rounded-[36px] p-5 sm:p-10 space-y-10 relative overflow-hidden">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 pb-6 border-b border-white/[0.04] relative z-10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-mono text-[10px] font-black text-indigo-400 tracking-widest uppercase">
                      <RotateCcw className="w-4 h-4 text-indigo-400 shrink-0" />
                      <span>VAULT SAFEGUARDS & SOVEREIGN RECOVERY</span>
                    </div>
                    <h4 className="text-lg md:text-xl font-bold text-white tracking-tight">Vault Backup & Deterministic Restoration Mechanics</h4>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    {/* Backup */}
                    <div className="bg-slate-950/50 border border-white/[0.02] hover:border-indigo-500/20 rounded-2xl p-6 space-y-4 transition-all duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-600/5 border border-indigo-500/25 rounded-xl flex items-center justify-center font-mono text-xs font-black text-indigo-400">
                                <Download className="w-5 h-5"/>
                            </div>
                            <h5 className="text-sm font-extrabold text-white uppercase tracking-tight">Sovereign Keypack Export</h5>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans">
                            Users generate an encrypted .vault keypack containing the master seed material anchored to the Kaspa BlockDAG network. This file is the sole point-of-authority for your identity; when stored offline, it ensures your data remains recoverable even if the host machine experiences a catastrophic hardware failure.
                        </p>
                    </div>
                    
                    {/* Recovery */}
                    <div className="bg-slate-950/50 border border-white/[0.02] hover:border-emerald-500/20 rounded-2xl p-6 space-y-4 transition-all duration-300">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-600/5 border border-emerald-500/25 rounded-xl flex items-center justify-center font-mono text-xs font-black text-emerald-400">
                                <Upload className="w-5 h-5"/>
                            </div>
                            <h5 className="text-sm font-extrabold text-white uppercase tracking-tight">Deterministic Recovery</h5>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed font-sans">
                            Recovery initiates by importing the .vault keypack into a new instance. The system regenerates the cryptographic derivation paths deterministically, re-hydrating the local BlockDAG ledger and binding to your private sub-node identity instantly.
                        </p>
                    </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {(authMode === "register" || authMode === "login") && (
          <motion.div
            key="auth"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            className="min-h-screen flex items-center justify-center p-6"
          >
            <div className="w-full max-w-lg">
              <button
                onClick={() => setAuthMode("landing")}
                className="group mb-8 flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
              >
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                Back to overview
              </button>

              <div className="bg-slate-900/50 backdrop-blur-3xl border border-slate-800 p-5 sm:p-10 rounded-2xl sm:rounded-[40px] shadow-2xl">
                <div className="mb-10 text-center">
                  <div className="inline-flex w-16 h-16 bg-indigo-600 rounded-2xl items-center justify-center shadow-[0_0_30px_rgba(79,70,229,0.3)] mb-6">
                    <Briefcase className="w-8 h-8 text-white" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white mb-2 uppercase tracking-tighter">
                    {authMode === "register" ? "New Sovereign" : "Unlock Workspace"}
                  </h2>
                  <p className="text-slate-500 text-xs sm:text-sm font-medium">
                    {authMode === "register" 
                      ? "Establish your decentralized hardware identity."
                      : "Provide your master seed to decrypt local nodes."}
                  </p>
                </div>

                <form 
                  onSubmit={authMode === "register" ? handleRegister : (e) => handleLogin(e)} 
                  className="space-y-6"
                >
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 ml-1">
                        Vault Username
                      </label>
                      <input
                        type="text"
                        required
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="identity_node_01"
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder-slate-700 shadow-inner"
                      />
                    </div>

                    {authMode === "register" && (
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 ml-1">
                          Display Label
                        </label>
                        <input
                          type="text"
                          required
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder="Your Master Name"
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder-slate-700 shadow-inner"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 ml-1">
                        Master Seed Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder-slate-700 shadow-inner"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 sm:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm shadow-xl active:scale-95 transition-all mt-4"
                  >
                    {authMode === "register" ? "Confirm Registration" : "Unlock Identity"}
                  </button>
                  
                  {authMode === "login" && hasBiometric && (
                    <button
                      type="button"
                      onClick={() => handleBiometricLogin?.()}
                      className="w-full py-4 bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white rounded-2xl font-black uppercase tracking-widest text-xs sm:text-sm shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 mt-3"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-fingerprint"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M15 13a5 5 0 0 0-6-1.5"/><path d="M18 16a8 8 0 0 0-11-2.5"/><path d="M9 22c-1.5-1.5-2.5-4-2.5-7a8 8 0 0 1 15-2"/><path d="M9 18v2"/><path d="M15 22v-3.5"/></svg>
                      Use Biometric Unlock
                    </button>
                  )}
                </form>

                <div className="mt-8 sm:mt-10 p-4 sm:p-6 bg-slate-950 border border-slate-800 rounded-2xl sm:rounded-3xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Backup Recovery</p>
                    <p className="text-[11px] text-slate-400 leading-tight">Import .vault pack or scan key QR</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowQRScanner(true)}
                      className="px-3 py-2 sm:py-2.5 bg-indigo-600/10 hover:bg-indigo-600/25 text-indigo-400 hover:text-indigo-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border border-indigo-500/20 text-center flex items-center gap-1.5"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      Scan QR
                    </button>
                    <label className="px-4 py-2 sm:py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer border border-slate-700 text-center flex items-center gap-1.5">
                      <Upload className="w-3.5 h-3.5 text-slate-400" />
                      Upload File
                      <input type="file" accept=".vault" onChange={handleVaultPackImport} className="hidden" />
                    </label>
                  </div>
                </div>

                <AnimatePresence>
                  {showQRScanner && (
                    <QRScannerOverlay
                      onScan={(scannedText) => {
                        setShowQRScanner(false);
                        handleVaultPackImport(null as any, scannedText);
                      }}
                      onClose={() => setShowQRScanner(false)}
                    />
                  )}
                </AnimatePresence>

                <div className="mt-10 text-center">
                  <button 
                    onClick={() => setAuthMode(authMode === "register" ? "login" : "register")}
                    className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors underline decoration-slate-800 underline-offset-8 decoration-2"
                  >
                    {authMode === "register" ? "Already possess an identity? Unlock" : "New node? Establish Identity"}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
