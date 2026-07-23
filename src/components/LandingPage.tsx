import React, { useState, useEffect, useRef } from "react";
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
  Globe,
  Database,
  ArrowRight,
  HardDrive,
  AlertTriangle,
  RotateCcw,
  Download,
  Key,
  Fingerprint,
  ShieldAlert,
  ShieldCheck,
  X,
  Github,
  Link as LinkIcon
} from "lucide-react";
import { UserProfile } from "../lib/db";
import { SovereignRecovery } from "./SovereignRecovery";

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
  handleMnemonicOrMasterKeyRecovery?: (username: string, mnemonicOrKey: string, pinOrPass: string) => Promise<void>;
  hasBiometric?: boolean;
  handleBiometricSign?: (username?: string) => void;
  onLinkBackend?: () => void;
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
  handleMnemonicOrMasterKeyRecovery,
  hasBiometric,
  handleBiometricSign,
  onLinkBackend,
}) => {
  const [authMode, setAuthMode] = useState<"landing" | "register" | "login">("landing");
  const [isDraggingImport, setIsDraggingImport] = useState(false);
  const [showRecoveryDesk, setShowRecoveryDesk] = useState(false);
  const [recoveryTab, setRecoveryTab] = useState<"upload" | "paste" | "seed" | "sovereign">("upload");
  const [pastedPackText, setPastedPackText] = useState("");
  const [recoverUsername, setRecoverUsername] = useState("");
  const [recoverMnemonic, setRecoverMnemonic] = useState("");
  const [recoverPin, setRecoverPin] = useState("");
  const [isProcessingRecovery, setIsProcessingRecovery] = useState(false);

  const hasAutoChallengedRef = useRef(false);

  // Auto-login biometric trigger on authMode change to login
  useEffect(() => {
    if (authMode !== "login") {
      hasAutoChallengedRef.current = false;
    } else if (authMode === "login" && !hasAutoChallengedRef.current && handleBiometricSign) {
      let targetUser = usernameInput;
      if (!targetUser && allUsers.length > 0) {
        targetUser = allUsers[0].username;
        setUsernameInput(targetUser);
      }
      
      if (targetUser) {
        hasAutoChallengedRef.current = true;
        const timer = setTimeout(() => {
          handleBiometricSign(targetUser);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [authMode, handleBiometricSign, allUsers, usernameInput, setUsernameInput]);

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
      className={`relative w-full flex flex-col flex-1 bg-slate-950 text-slate-200 selection:bg-indigo-500/30 transition-colors duration-300 ${isDraggingImport ? 'bg-indigo-950/40' : ''} ${authMode !== 'landing' ? 'fixed inset-0 overflow-y-auto z-[100] bg-slate-950 flex flex-col items-center justify-start' : ''}`}
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center mb-12"
            >
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
              className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full sm:w-auto px-4 sm:px-0 mb-8"
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 w-full sm:w-auto px-4 sm:px-0"
            >
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-xs font-black uppercase tracking-widest px-4 py-2 bg-slate-900/50 border border-slate-800 rounded-xl hover:bg-slate-800"
              >
                <Github className="w-4 h-4" />
                Source on GitHub
              </a>
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
                    },
                    {
                      badge: "PRIVACY",
                      title: "Privacy by Design",
                      desc: "No single peer holds a complete set of shards, and all shards are encrypted with client-side keys before transmission, rendering the data mathematically unreadable to everyone else."
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

                {/* Active Decentralized Network Flow Mechanics Legend */}
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
            className="w-full flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-screen"
          >
            <div className="w-full max-w-lg h-auto flex flex-col py-10 sm:py-0">
              <button
                onClick={() => setAuthMode("landing")}
                className="group mb-8 flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-xs font-black uppercase tracking-widest"
              >
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                Back to overview
              </button>

              <div className="flex-1 sm:flex-none bg-slate-900/80 backdrop-blur-md border-0 sm:border border-slate-800 pt-16 p-6 sm:p-10 rounded-none sm:rounded-[40px] shadow-none sm:shadow-2xl flex flex-col">
                <div className="mb-8 sm:mb-10 text-center">
                  <h2 className="text-xl sm:text-3xl font-black text-white mb-1.5 sm:mb-2 uppercase tracking-tighter">
                    {authMode === "register" ? "New Sovereign" : "Unlock Vault"}
                  </h2>
                  <p className="text-slate-500 text-[10px] sm:text-sm font-medium">
                    {authMode === "register" 
                      ? "Establish decentralized hardware identity."
                      : "Provide master seed to decrypt nodes."}
                  </p>
                </div>

                <form 
                  onSubmit={authMode === "register" ? handleRegister : (e) => handleLogin(e)} 
                  className="space-y-4 sm:space-y-6"
                >
                  <div className="space-y-3 sm:space-y-4">
                    {authMode === "login" && allUsers.length > 0 && (
                      <div className="mb-4 p-4 bg-slate-950/60 rounded-2xl border border-slate-800">
                        <label className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2.5 ml-1">
                          Select Identity Node (Auto Biometric)
                        </label>
                        <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-800">
                          {allUsers.map((user) => (
                            <button
                              key={user.id || user.username}
                              type="button"
                              onClick={() => {
                                setUsernameInput(user.username);
                                if (handleBiometricSign) {
                                  setTimeout(() => {
                                    handleBiometricSign(user.username);
                                  }, 100);
                                }
                              }}
                              className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800 hover:border-indigo-500 hover:bg-slate-800/40 transition-all text-left group cursor-pointer"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0"
                                  style={{ backgroundColor: user.avatarColor || "#6366f1" }}
                                >
                                  {user.displayName?.slice(0, 2).toUpperCase() || "UN"}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-bold text-white uppercase truncate group-hover:text-indigo-400 transition-colors">
                                    {user.displayName}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono truncate">
                                    @{user.username}
                                  </div>
                                </div>
                              </div>
                              
                              <div className="flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all text-[9px] font-mono font-black uppercase px-2 py-1 rounded-md">
                                <Fingerprint className="w-3.5 h-3.5" />
                                <span>Sign</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5 sm:mb-2 ml-1">
                        Username
                      </label>
                      <input
                        type="text"
                        required
                        value={usernameInput}
                        onChange={(e) => setUsernameInput(e.target.value)}
                        placeholder="identity_node_01"
                        className="w-full h-12 sm:h-auto bg-slate-950 border border-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder-slate-700 shadow-inner"
                      />
                    </div>

                    {authMode === "register" && (
                      <div>
                        <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5 sm:mb-2 ml-1">
                          Display Name
                        </label>
                        <input
                          type="text"
                          required
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder="Your Master Name"
                          className="w-full h-12 sm:h-auto bg-slate-950 border border-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder-slate-700 shadow-inner"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[9px] sm:text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-1.5 sm:mb-2 ml-1">
                        Seed Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={passwordInput}
                          onChange={(e) => setPasswordInput(e.target.value)}
                          placeholder="••••••••••••"
                          className="w-full h-12 sm:h-auto bg-slate-950 border border-slate-800 rounded-xl sm:rounded-2xl px-4 sm:px-5 py-3 sm:py-4 text-white text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-bold placeholder-slate-700 shadow-inner"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full py-4 sm:py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[11px] sm:text-sm shadow-xl active:scale-95 transition-all mt-4"
                  >
                    {authMode === "register" ? "Confirm" : "Unlock Identity"}
                  </button>

                  {authMode === "login" && hasBiometric && (
                    <button
                      type="button"
                      onClick={() => handleBiometricSign && handleBiometricSign(usernameInput)}
                      className="w-full py-4 sm:py-5 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-xl sm:rounded-2xl font-black uppercase tracking-widest text-[11px] sm:text-sm shadow-xl active:scale-95 transition-all mt-2 flex items-center justify-center gap-2 border border-slate-700 hover:border-indigo-500/30"
                    >
                      <Fingerprint className="w-4 h-4 sm:w-5 sm:h-5" />
                      Sign Biometric Hardware
                    </button>
                  )}

                  {authMode === "login" && (
                    <div className="pt-2">
                      <p className="text-[10px] text-slate-500 text-center font-medium opacity-50 italic">
                        Biometric hardware signature will activate automatically if available.
                      </p>
                    </div>
                  )}
                </form>

                <div className="mt-8 sm:mt-10 p-5 sm:p-8 bg-slate-950 border border-slate-800 rounded-2xl sm:rounded-[32px] flex flex-col gap-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
                  
                  <div className="relative z-10 space-y-2">
                    <h4 className="text-xs sm:text-sm font-black text-white uppercase tracking-tighter flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-indigo-400" />
                      Files not showing?
                    </h4>
                    <p className="text-[10px] sm:text-xs text-slate-500 leading-relaxed font-medium">
                      If your session timed out or files are missing, your encrypted data may need to be re-synced. Use your master seed or .vault pack to restore them instantly.
                    </p>
                  </div>

                  <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryTab("upload");
                        setShowRecoveryDesk(true);
                      }}
                      className="w-full sm:flex-1 px-4 py-3 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-indigo-500/20 flex items-center justify-center gap-2 group/btn"
                    >
                      <Upload className="w-3.5 h-3.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                      Restore via .vault
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRecoveryTab("seed");
                        setShowRecoveryDesk(true);
                      }}
                      className="w-full sm:flex-1 px-4 py-3 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-slate-800 flex items-center justify-center gap-2"
                    >
                      <Key className="w-3.5 h-3.5" />
                      Restore via Seed
                    </button>
                  </div>
                </div>

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

      {/* Sovereign Recovery Desk Modal */}
      <AnimatePresence>
        {showRecoveryDesk && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm"
              onClick={() => setShowRecoveryDesk(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="relative w-full sm:max-w-lg h-full sm:h-auto bg-slate-900 border-0 sm:border border-slate-800 rounded-none sm:rounded-[40px] overflow-hidden shadow-none sm:shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col z-10 mx-auto sm:max-h-[90vh]"
            >
              <div className="pt-12 pb-4 px-4 sm:p-10 border-b border-white/5 sm:border-slate-800 flex items-center justify-between bg-slate-900 sm:bg-slate-900/50 sticky top-0 z-20 backdrop-blur-xl">
                <div className="flex items-center gap-3 sm:gap-5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-[12px] sm:rounded-[20px] bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                    <RotateCcw className="w-5 h-5 sm:w-7 sm:h-7" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-xl font-black text-white uppercase tracking-tight leading-none mb-1">Recovery Hub</h3>
                    <div className="text-[8px] sm:text-[9px] font-black text-indigo-500 uppercase tracking-[0.2em]">Disaster Restore</div>
                  </div>
                </div>
                <button
                  onClick={() => setShowRecoveryDesk(false)}
                  className="w-10 h-10 sm:w-12 sm:h-12 rounded-full sm:rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-90"
                >
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="flex border-b border-slate-800 p-2 sm:p-4 bg-slate-950/40 gap-1.5 sm:gap-2">
                {[
                  { id: "upload", label: "Pack", icon: Upload },
                  { id: "paste", label: "Paste", icon: Globe },
                  { id: "seed", label: "Key", icon: Fingerprint },
                  { id: "sovereign", label: "Sovereign", icon: ShieldCheck }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRecoveryTab(tab.id as any)}
                    className={`flex-1 py-3 sm:py-4 rounded-xl sm:rounded-2xl flex flex-col items-center justify-center gap-1 sm:gap-1.5 transition-all active:scale-95 border ${
                      recoveryTab === tab.id 
                        ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 border-indigo-500" 
                        : "text-slate-500 hover:text-slate-300 hover:bg-white/5 border-transparent"
                    }`}
                  >
                    <tab.icon className="w-4 h-4 sm:w-5 sm:h-5 mb-0.5" />
                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em]">{tab.label}</span>
                  </button>
                ))}
              </div>

              <div className="p-6 sm:p-10 overflow-y-auto max-h-[70vh] space-y-8">
                {recoveryTab === "upload" && (
                  <div className="space-y-6 text-center py-4">
                    <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto animate-pulse">
                      <Upload className="w-10 h-10" />
                    </div>
                    <div className="space-y-3">
                      <h4 className="text-lg font-black text-white uppercase tracking-tight">Restore via .vault keypack</h4>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto font-sans font-medium px-4">
                        Select your previously exported <code className="text-indigo-300 font-black bg-indigo-500/10 px-1.5 py-0.5 rounded">.vault</code> container to re-establish your identity and re-link blocks.
                      </p>
                    </div>
                    <div className="pt-4">
                      <label className="inline-flex w-full px-8 py-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase tracking-[0.15em] transition-all cursor-pointer shadow-xl shadow-indigo-600/20 active:scale-95 items-center justify-center gap-3">
                        <Upload className="w-5 h-5 text-white" />
                        Select .vault Backup
                        <input
                          type="file"
                          accept=".vault"
                          onChange={(e) => {
                            handleVaultPackImport(e);
                            setShowRecoveryDesk(false);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}

                {recoveryTab === "paste" && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Vault JSON / Base64 Ciphertext</label>
                      <textarea
                        value={pastedPackText}
                        onChange={(e) => setPastedPackText(e.target.value)}
                        placeholder='{"version": "2.0", "profile": {...}, "files": [...]}'
                        className="w-full h-48 bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 text-xs font-mono text-indigo-200 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-800"
                      />
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-slate-950/50 border border-slate-800 rounded-2xl">
                      <div className="p-2 bg-indigo-500/10 rounded-lg shrink-0">
                        <Globe className="w-4 h-4 text-indigo-400" />
                      </div>
                      <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
                        Ideal for mobile browsers and standalone PWA environments where local file discovery might be constrained by sandbox policies.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!pastedPackText.trim() || isProcessingRecovery}
                      onClick={async () => {
                        setIsProcessingRecovery(true);
                        try {
                          await handleVaultPackImport(null, pastedPackText);
                          setShowRecoveryDesk(false);
                        } catch (e) {}
                        setIsProcessingRecovery(false);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:scale-100 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
                    >
                      {isProcessingRecovery ? "Analyzing Keypack..." : "Verify & Import Ciphertext"}
                    </button>
                  </div>
                )}

                {recoveryTab === "seed" && (
                  <div className="space-y-6 text-left">
                    <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-[24px] flex gap-4 items-start shadow-inner">
                      <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1.5">
                        <h5 className="text-[11px] font-black text-amber-500 uppercase tracking-widest">Master Key Reconstruction</h5>
                        <p className="text-[10px] text-amber-200/50 leading-relaxed font-sans font-medium">
                          The system will reconstruct your identity from the seed and perform a <span className="text-amber-400 font-bold uppercase">Deep BlockDAG Scan</span> to recover orphaned files automatically.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4 font-sans">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Username Reference</label>
                        <input
                          type="text"
                          value={recoverUsername}
                          onChange={(e) => setRecoverUsername(e.target.value)}
                          placeholder="e.g. alice"
                          className="w-full h-14 bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-800"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">12-Word Mnemonic or Master Seed</label>
                        <textarea
                          value={recoverMnemonic}
                          onChange={(e) => setRecoverMnemonic(e.target.value)}
                          placeholder="abandon ability able about above absent absorb abstract absurd abuse access account..."
                          className="w-full h-24 bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 py-4 text-xs text-white font-mono placeholder:text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">New Unlock Password / PIN</label>
                        <input
                          type="password"
                          value={recoverPin}
                          onChange={(e) => setRecoverPin(e.target.value)}
                          placeholder="Secure local storage context"
                          className="w-full h-14 bg-slate-950 border-2 border-slate-800 rounded-2xl px-5 text-sm text-white focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 transition-all placeholder:text-slate-800"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!recoverUsername.trim() || !recoverMnemonic.trim() || !recoverPin.trim() || isProcessingRecovery}
                      onClick={async () => {
                        setIsProcessingRecovery(true);
                        try {
                          if (handleMnemonicOrMasterKeyRecovery) {
                            await handleMnemonicOrMasterKeyRecovery(recoverUsername, recoverMnemonic, recoverPin);
                            setShowRecoveryDesk(false);
                          }
                        } catch (e) {}
                        setIsProcessingRecovery(false);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:scale-100 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-[0.15em] transition-all shadow-xl shadow-indigo-600/20 active:scale-95"
                    >
                      {isProcessingRecovery ? "Deriving Credentials..." : "Reconstruct & Scan BlockDAG"}
                    </button>
                  </div>
                )}

                {recoveryTab === "sovereign" && (
                  <div className="space-y-6 text-left">
                    <SovereignRecovery
                      onKeyRestored={(restoredKey) => {
                        setRecoverMnemonic(restoredKey);
                        setRecoveryTab("seed");
                      }}
                    />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
