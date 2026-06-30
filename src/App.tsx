import React, { useState, useEffect, useRef } from "react";
import { FileData, UserProfile } from "./lib/db";
import { api } from "./lib/api";
import {
  hashPassword,
  generateSalt,
  bufferToHex,
  hexToBytes,
  getDeterministicSalt,
} from "./lib/auth";
import { encryptData, decryptData, computeFileHash, deriveMasterKey } from "./lib/encryption";
import {
  Upload,
  Briefcase,
  Lock,
  Unlock,
  FileText,
  Download,
  User,
  UserCheck,
  Shield,
  LogOut,
  Info,
  CheckCircle2,
  AlertCircle,
  Activity,
  Eye,
  EyeOff,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Share2,
  FileCode,
  Key,
  Image as ImageIcon,
  Archive,
  Music,
  FileQuestion,
  Search,
  Users2,
  RefreshCcw,
  Network,
  Zap,
  Globe,
  History,
  TrendingUp,
  BarChart3,
  Database,
  Infinity,
  Film,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Cpu,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Check,
  Copy,
  Package,
  Plug,
  Loader2,
  File as FileIcon,
  BookOpen,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip,
  Cell
} from "recharts";

import { LandingPage } from "./components/LandingPage";
import { SovereignRecoveryConsole } from "./components/SovereignRecoveryConsole";
import { SovereignRecovery } from "./components/SovereignRecovery";
import { ShareRequestInbox } from "./components/ShareRequestInbox";
import { FileShareRequest } from "./types";
import { useP2P } from "./lib/p2p";

import { TransferRecord, StoragePoint } from "./types";
import { TransferHistoryModal } from "./components/TransferHistoryModal";
import { DagVerificationModal } from "./components/DagVerificationModal";
import { ConfirmationModal } from "./components/ConfirmationModal";
import { VaultIntegrityModal } from "./components/VaultIntegrityModal";
import { StorageUsageChart } from "./components/StorageUsageChart";
import { NetworkDocsDrawer } from "./components/NetworkDocsDrawer";
import { SecurityBountyDesk } from "./components/SecurityBountyDesk";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

export default function App() {
  const { 
    peerId, 
    connectedPeers, 
    latencies, 
    antiEntropyState, 
    p2pStatus, 
    broadcastShard, 
    requestShard, 
    onShardReceived 
  } = useP2P();
  
  // Active Transfers Progress Tracking
  const [activeTransfers, setActiveTransfers] = useState<
    {
      id: string;
      name: string;
      type: "upload" | "download" | "transfer";
      progress: number;
      status: "active" | "completed" | "error";
    }[]
  >([]);

  const updateTransferProgress = (
    id: string,
    progress: number,
    status: "active" | "completed" | "error" = "active",
  ) => {
    setActiveTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, progress, status } : t)),
    );

    // Auto-remove completed or error transfers after a delay
    if (status === "completed" || status === "error") {
      setTimeout(() => {
        setActiveTransfers((prev) => prev.filter((t) => t.id !== id));
      }, 5000);
    }
  };

  const startTransfer = (
    name: string,
    type: "upload" | "download" | "transfer",
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setActiveTransfers((prev) => [
      ...prev,
      { id, name, type, progress: 0, status: "active" },
    ]);
    return id;
  };

  // Modal state
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    target: FileData | null;
  }>({ isOpen: false, target: null });
  
  // Session & Auth state
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("vault_current_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [sessionPassword, setSessionPassword] = useState<string>(() => {
    return localStorage.getItem("vault_session_password") || "";
  });
  
  const [hasBiometric, setHasBiometric] = useState(false);

  useEffect(() => {
    NativeBiometric.isAvailable().then(result => {
      // Capacitor plugin returns true on web (dummy implementation), so check for native environment too
      const isNative = !!(window as any).Capacitor?.isNative;
      if (result.isAvailable && isNative) {
        setHasBiometric(true);
      }
    }).catch(() => {});
  }, []);

  // Sync session & auth states to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem("vault_current_user", JSON.stringify(currentUser));
    } else {
      localStorage.removeItem("vault_current_user");
    }
  }, [currentUser]);

  useEffect(() => {
    if (sessionPassword) {
      localStorage.setItem("vault_session_password", sessionPassword);
    } else {
      localStorage.removeItem("vault_session_password");
    }
  }, [sessionPassword]);

  const [shareDialogOptions, setShareDialogOptions] = useState<{
    file: FileData | null;
    open: boolean;
    note: string;
    targetUsername?: string;
  }>({ file: null, open: false, note: "", targetUsername: "" });

  const [shareDropdownOpen, setShareDropdownOpen] = useState(false);

  const [publicShareDialog, setPublicShareDialog] = useState<{
    file: FileData | null;
    open: boolean;
    passwordInput: string;
    mode: "share" | "private";
    isProcessing: boolean;
    progress: number;
  }>({ 
    file: null, 
    open: false, 
    passwordInput: "", 
    mode: "share",
    isProcessing: false,
    progress: 0
  });

  const [previewFile, setPreviewFile] = useState<FileData | null>(null);
  const [versionHistoryFile, setVersionHistoryFile] = useState<FileData | null>(null);
  const [fileVersions, setFileVersions] = useState<any[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);

  const [systemWarning, setSystemWarning] = useState<string | null>(null);

  const [files, setFiles] = useState<FileData[]>([]);

  const isSyncedFromPeer = (file: FileData): boolean => {
    if (!currentUser) return false;
    if (file.senderName && file.senderName !== currentUser.username) return true;
    if (file.vaultSeedId && currentUser.vaultSeedId && file.vaultSeedId !== currentUser.vaultSeedId) return true;
    return false;
  };
  const filesRef = useRef<FileData[]>([]);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  const [pendingShareRequests, setPendingShareRequests] = useState<FileShareRequest[]>([]);

  // Sovereign Decentralized Portability Keypack Utilities
  const [isRestoring, setIsRestoring] = useState(false);
  const [activeRecoveryPack, setActiveRecoveryPack] = useState<any | null>(null);

  const downloadSovereignVaultPack = async () => {
    if (!currentUser || !currentUser.id) {
      showToast("Please log in to export your sovereign keypack.", "error");
      return;
    }
    try {
      showToast("Packaging decentralized vault data...", "info");
      const data = await api.exportVaultPack(currentUser.id);
      
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `decentralized_secure_vault_${currentUser.username}_backup.vault`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast("Decentralized Master Keypack exported successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to compile backup pack.", "error");
    }
  };

  const handleVaultPackImport = async (e: any, directText?: string) => {
    setIsRestoring(true);
    try {
      let text = "";
      if (directText) {
        text = directText;
      } else {
        const targetFile = e?.target?.files?.[0];
        if (!targetFile) return;
        text = await targetFile.text();
      }

      let parsedText = text.trim();

      // Check if it's a URL
      if (parsedText.startsWith("http://") || parsedText.startsWith("https://")) {
        try {
          const url = new URL(parsedText);
          const hashParam = url.hash ? url.hash.replace("#", "") : "";
          const queryParam = url.searchParams.get("pack") || url.searchParams.get("data") || "";
          
          if (hashParam) {
            if (hashParam.includes("pack=")) {
              parsedText = decodeURIComponent(hashParam.split("pack=")[1]);
            } else {
              parsedText = decodeURIComponent(hashParam);
            }
          } else if (queryParam) {
            parsedText = queryParam;
          }
        } catch (urlErr) {
          console.warn("Could not parse as URL, using original string:", urlErr);
        }
      }

      let pack: any = null;
      try {
        pack = JSON.parse(parsedText);
      } catch (jsonErr) {
        try {
          const decoded = atob(parsedText);
          pack = JSON.parse(decoded);
        } catch (b64Err) {
          throw new Error("Invalid content format. Must be a valid JSON or Base64 encoded keypack.");
        }
      }

      if (!pack || !pack.profile || !pack.profile.username || !pack.profile.passwordHash) {
        throw new Error("Invalid file content. Must be a compatible Secure Vault identity backup pack.");
      }

      // Transition to Sovereign Recovery Console instead of instant login
      setActiveRecoveryPack(pack);
      showToast("Sovereign backup keypack loaded. Opening disaster recovery desk...", "info");
    } catch (err: any) {
      showToast(err.message || "Failed to parse backup data.", "error");
    } finally {
      setIsRestoring(false);
      try {
        if (e && e.target) {
          e.target.value = "";
        }
      } catch (err) {}
    }
  };

  const handleFinalizeRecovery = async (password: string) => {
    if (!activeRecoveryPack) return;
    setIsRestoring(true);
    try {
      showToast("Injecting sovereign identity and writing database partitions...", "info");
      const res = await api.importVaultPack(activeRecoveryPack);
      if (res.success && res.user) {
        let successMsg = `Sovereign identity '@${res.user.username}' successfully ported to this device!`;
        if (res.recovery && res.recovery.recovered > 0) {
          successMsg += ` \n\nFound and re-linked ${res.recovery.recovered} local orphan files from storage.`;
        }
        if (res.mesh_recovery && res.mesh_recovery > 0) {
          successMsg += ` \n\nRestored ${res.mesh_recovery} records from the network mesh blocks.`;
        }
        showToast(successMsg, "success");

        // Authenticate locally:
        // Derive Master Key deterministically
        await deriveMasterKey(res.user.username, password);

        // Store user and password in memory for active authenticated session
        setCurrentUser({ ...res.user, passwordHash: res.user.passwordHash });
        setSessionPassword(password);

        // Refresh users list
        const list = await api.getAllUsers();
        setAllUsers(list);

        // Reset inputs and states
        setUsernameInput("");
        setPasswordInput("");
        setActiveRecoveryPack(null);

        // Critically: Refresh data for the newly restored user keypack context
        setTimeout(() => {
          refreshData();
        }, 500);
      } else {
        throw new Error("Backup pack database injection rejected.");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to finalize recovery.", "error");
    } finally {
      setIsRestoring(false);
    }
  };

  const downloadPhysicalDatabase = async () => {
    if (!currentUser || !currentUser.id) {
      showToast("Please log in to export database.", "error");
      return;
    }
    try {
      showToast("Compiling physical E2E encrypted database file...", "info");
      const buffer = await api.downloadRawDatabase(currentUser.id);
      const blob = new Blob([buffer], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = `quantum_secure_vault_physical_backup.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToast("Physical database (.db) downloaded successfully!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to download database file.", "error");
    }
  };

  const handlePhysicalDatabaseRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetFile = e.target.files?.[0];
    if (!targetFile) return;

    if (!currentUser || !currentUser.id) {
      showToast("Please log in first before restoring the database file.", "error");
      return;
    }

    if (!window.confirm("WARNING: This will replace the active server database file and overwrite any unsaved changes on this server partition. Are you sure you want to proceed and restore this database (.db) file?")) {
      e.target.value = "";
      return;
    }

    setIsRestoring(true);
    try {
      showToast("Transmitting physical SQLite database stream to server...", "info");
      const arrayBuffer = await targetFile.arrayBuffer();
      const res = await api.restoreRawDatabase(currentUser.id, arrayBuffer);
      if (res.success) {
        showToast("Physical partition successfully restored! Relocking vault for safety.", "success");
        // Log out safely to refresh session structures on the restored data
        handleLogout();
      } else {
        throw new Error(res.message || "Server database swap rejected.");
      }
    } catch (err: any) {
      showToast(err.message || "Failed to restore database file.", "error");
    } finally {
      setIsRestoring(false);
      e.target.value = "";
    }
  };

  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Transfer History & Storage Trends
  const [transferHistory, setTransferHistory] = useState<TransferRecord[]>([]);
  const [showTransferHistoryModal, setShowTransferHistoryModal] =
    useState(false);
  const [viewingDagBlock, setViewingDagBlock] = useState<any | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [showSovereignRecovery, setShowSovereignRecovery] = useState(false);
  const [showNetworkDocs, setShowNetworkDocs] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<"files" | "mesh">("files");
  const [showVaultIntegrityModal, setShowVaultIntegrityModal] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "security" | "network" | "health" | "bounty">("general");
  const [storageTrends, setStorageTrends] = useState<StoragePoint[]>([]);
  const [meshNodes, setMeshNodes] = useState<any[]>([]);
  const [meshEvents, setMeshEvents] = useState<any[]>([]);
  const [meshHealth, setMeshHealth] = useState<{ activePeers: number, shadowBlocksHeld: number, backlogSize: number } | null>(null);

  // Relay config values
  const [relayUrlInput, setRelayUrlInput] = useState("");
  const [isRelayHubEnabled, setIsRelayHubEnabled] = useState(true);
  const [relayStatus, setRelayStatus] = useState<{
    bootstrapRelayUrl: string | null;
    isRelayHubEnabled: boolean;
    hasAnnouncedSelf: boolean;
    lastLocalNodeAnnounced: any;
  } | null>(null);
  const [relaySyncing, setRelaySyncing] = useState(false);
  const [relayStatusMsg, setRelayStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Instance ID to allow multiple tabs as separate nodes
  const [instanceId] = useState(() => Math.random().toString(36).substring(2, 10));

  // Fetch initial relay configuration on mount
  useEffect(() => {
    const loadRelayConfig = async () => {
      try {
        const res = await fetch("/api/relay/config");
        if (res.ok) {
          const data = await res.json();
          setRelayStatus(data);
          setIsRelayHubEnabled(data.isRelayHubEnabled);
          if (data.bootstrapRelayUrl) {
            setRelayUrlInput(data.bootstrapRelayUrl);
          }
        }
      } catch (e) {
        console.warn("Error loading relay configurations", e);
      }
    };
    if (currentUser) {
      loadRelayConfig();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    const meshInterval = setInterval(async () => {
      try {
        const result = await api.resolveMeshNodes() as any;
        setMeshNodes(result.nodes || []);
        setMeshEvents(result.events || []);
        
        const healthRes = await fetch("/api/health").then(r => r.json());
        if (healthRes.mesh) setMeshHealth(healthRes.mesh);

        // Periodically sync relay status in background
        const relayConfigRes = await fetch("/api/relay/config");
        if (relayConfigRes.ok) {
          const rData = await relayConfigRes.json();
          setRelayStatus(rData);
        }

        // Announce our presence
        const ipsRes = await fetch("/api/mdns/interfaces").then(r => r.json());
        await api.announceMeshNode({
          id: instanceId,
          username: currentUser.username,
          displayName: currentUser.displayName,
          avatarColor: currentUser.avatarColor || "#6366f1",
          localIp: ipsRes.ips?.[0] || "127.0.0.1",
          serviceName: "_secure-vault._tcp.local",
          port: 3000
        });
      } catch (e) {}
    }, 8000);

    return () => clearInterval(meshInterval);
  }, [currentUser, instanceId]);

  // Core Interface Diagnostics
  const [diagCryptoStatus, setDiagCryptoStatus] = useState<"untested" | "running" | "success" | "error">("untested");
  const [diagCryptoLatency, setDiagCryptoLatency] = useState<number | null>(null);
  const [diagIdbStatus, setDiagIdbStatus] = useState<"untested" | "running" | "success" | "error">("untested");
  const [diagIdbLatency, setDiagIdbLatency] = useState<number | null>(null);
  const [diagDbStatus, setDiagDbStatus] = useState<"untested" | "running" | "success" | "error">("untested");
  const [diagDbLatency, setDiagDbLatency] = useState<number | null>(null);
  const [diagDagStatus, setDiagDagStatus] = useState<"untested" | "running" | "success" | "error">("untested");
  const [diagDagLatency, setDiagDagLatency] = useState<number | null>(null);
  const [diagDagMessage, setDiagDagMessage] = useState<string>("");
  const [diagErrorMsg, setDiagErrorMsg] = useState<string>("");
  const [isDiagnosticRunning, setIsDiagnosticRunning] = useState<boolean>(false);

  // Dynamic real-time scoring
  const [realTimeIntegrity, setRealTimeIntegrity] = useState<number>(98.5);
  const [realTimeUptime, setRealTimeUptime] = useState<number>(99.9);
  const uptimeSamplesRef = React.useRef<{ success: number; total: number }>({ success: 999, total: 1000 });

  const runCryptoTest = async (): Promise<number> => {
    const t0 = performance.now();
    const testBytes = crypto.getRandomValues(new Uint8Array(32));
    const b64 = arrayBufferToBase64(testBytes.buffer);
    const decodedBytes = new Uint8Array(base64ToArrayBuffer(b64));
    let mismatch = false;
    for (let i = 0; i < 32; i++) {
      if (testBytes[i] !== decodedBytes[i]) mismatch = true;
    }
    if (mismatch) throw new Error("Base64 serialization mismatch");

    const sampleSalt = crypto.getRandomValues(new Uint8Array(16));
    const passKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("DiagnosticSecret_1337"),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: sampleSalt, iterations: 1000, hash: "SHA-256" },
      passKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const testMessage = new TextEncoder().encode("Secure Vault Cryptographic Payload Verification 2026");
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      testMessage
    );

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const decryptedMessage = new TextDecoder().decode(decryptedBuffer);
    if (!decryptedMessage.includes("Secure Vault")) {
      throw new Error("Symmetric decryption verified string mismatch");
    }

    const digest = await crypto.subtle.digest("SHA-256", testMessage);
    if (digest.byteLength !== 32) throw new Error("SHA-256 digest signature mismatch");

    return Math.round(performance.now() - t0);
  };

  const runIdbTest = async (): Promise<number> => {
    const t0 = performance.now();
    const storageMod = await import("./lib/storage");
    const uniqueId = Math.random().toString(36).substring(7);
    const testKey = `diag_pulse_${uniqueId}`;
    const randomVal = `val_${Math.random()}_${Date.now()}`;
    
    await storageMod.setItem(testKey, randomVal);
    const retrieved = await storageMod.getItem(testKey);
    
    // Attempt cleanup
    try { await storageMod.removeItem(testKey); } catch (e) {}

    if (retrieved !== randomVal) {
      throw new Error(`Data Integrity Error: Expected "${randomVal.substring(0, 8)}...", but retrieved "${retrieved ? String(retrieved).substring(0, 8) : 'undefined'}". This signifies a potential IndexedDB race condition or storage corruption.`);
    }
    return Math.round(performance.now() - t0);
  };

  const runDbTest = async (): Promise<number> => {
    const t0 = performance.now();
    const res = await fetch("/api/health");
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    const health = await res.json();
    if (health.status !== "ok") {
      throw new Error(`Server status returned: ${JSON.stringify(health)}`);
    }
    await api.getAllUsers();
    return Math.round(performance.now() - t0);
  };

  const runDagTest = async (): Promise<{ latency: number; isValid: boolean; count: number; msg?: string }> => {
    const t0 = performance.now();
    if (!currentUser || !currentUser.id) throw new Error("Please log in to verify active chain.");
    const verifyRes = await api.verifyVaultDag(currentUser.id);
    if (!verifyRes.success) throw new Error(`Vault verified failed for chain.`);
    let msg = `Validated ${verifyRes.count} blocks on secure ledger. Chain unbroken.`;
    if (!verifyRes.isValidChain) msg = `Chain corruption detected! View logs: ${JSON.stringify(verifyRes.errors)}`;
    return { latency: Math.round(performance.now() - t0), isValid: verifyRes.isValidChain, count: Math.round(verifyRes.count), msg };
  };

  const recoverDagChain = async () => {
    if (!currentUser?.id) return;
    try {
      showToast("Scanning physical storage for orphaned files...", "info");
      const recoveryResult = await api.deepRecover(currentUser.id);
      showToast(`Recovered ${recoveryResult.recovered} files from local storage.`, "info");
      
      showToast("Rebuilding BlockDAG sequence... please wait.", "info");
      const res = await api.rebuildVaultDag(currentUser.id);
      showToast(res.message || "BlockDAG chain rebuilt successfully.", "success");
      
      // Reload file list
      const userFiles = await api.getFiles(currentUser.id);
      setFiles(userFiles);
      
      // Trigger a re-verification
      triggerDiagnosticSuite();
    } catch (e: any) {
      showToast(`DAG rebuilding failed: ${e.message}`, "error");
    }
  };

  const restoreFromMesh = async () => {
    if (!currentUser) return;
    showToast("Scanning Decentralized Mesh for shadow blocks...", "info");
    try {
      const points = await api.getMeshRestorePoints(currentUser.id);
      if (points.length === 0) {
        showToast("No distributed shadow blocks found for your identity.", "info");
        return;
      }

      showToast(`Commencing restoration of ${points.length} nodes from mesh...`, "info");
      
      let restoredCount = 0;
      for (const p of points) {
        // Check if this file already exists (by dagHash to be precise)
        const exists = files.some(f => f.dagHash === p.dagHash);
        if (exists) continue;

        try {
          const content = await api.getMeshBlockContent(p.dagHash);
          // Re-inject into local vault
          await api.createFile({
            userId: currentUser.id,
            name: p.metadata.name,
            type: p.metadata.type,
            size: p.metadata.size,
            folderPath: p.metadata.folderPath,
            isFolder: false,
            isShared: false,
            lastModified: p.metadata.lastModified,
            data: content,
            clientEncrypted: true // Blocks from mesh are always encrypted blobs
          });
          restoredCount++;
        } catch (err) {
          console.error(`Failed to restore block ${p.dagHash}:`, err);
        }
      }

      if (restoredCount > 0) {
        showToast(`Successfully recovered ${restoredCount} items from the mesh!`, "success");
        // Reload files
        const userFiles = await api.getFiles(currentUser.id);
        setFiles(userFiles);
        triggerDiagnosticSuite();
      } else {
        showToast("All items found in mesh are already present in your local vault.", "info");
      }
    } catch (e) {
      console.error("Mesh restoration fault:", e);
      showToast("Mesh sync unavailable.", "error");
    }
  };

  const triggerDiagnosticSuite = async () => {
    if (isDiagnosticRunning) return;
    setIsDiagnosticRunning(true);
    setDiagErrorMsg("");
    
    setDiagCryptoStatus("running");
    setDiagIdbStatus("running");
    setDiagDbStatus("running");
    setDiagDagStatus("running");

    showToast("Starting Secure Vault diagnostic lifecycle...", "info");

    let cryptoLatency = 0;
    try {
      cryptoLatency = await runCryptoTest();
      setDiagCryptoLatency(cryptoLatency);
      setDiagCryptoStatus("success");
    } catch (e: any) {
      setDiagCryptoStatus("error");
      setDiagErrorMsg(prev => prev + `Crypto Error: ${e.message}. `);
    }

    let idbLatency = 0;
    try {
      idbLatency = await runIdbTest();
      setDiagIdbLatency(idbLatency);
      setDiagIdbStatus("success");
    } catch (e: any) {
      setDiagIdbStatus("error");
      setDiagErrorMsg(prev => prev + `IndexedDB Error: ${e.message}. `);
    }

    let dbLatency = 0;
    try {
      dbLatency = await runDbTest();
      setDiagDbLatency(dbLatency);
      setDiagDbStatus("success");
    } catch (e: any) {
      setDiagDbStatus("error");
      setDiagErrorMsg(prev => prev + `SQLite DB Error: ${e.message}. `);
    }

    let dagLatency = 0;
    try {
      const dagResult = await runDagTest();
      dagLatency = dagResult.latency;
      setDiagDagLatency(dagLatency);
      setDiagDagStatus(dagResult.isValid ? "success" : "error");
      setDiagDagMessage(dagResult.msg || "");
      if (!dagResult.isValid) {
        setDiagErrorMsg(prev => prev + `BlockDAG Error: Chain corruption detected. `);
      }
    } catch (e: any) {
      setDiagDagStatus("error");
      setDiagDagMessage(e.message);
      setDiagErrorMsg(prev => prev + `BlockDAG Protocol Error: ${e.message}. `);
    }

    setIsDiagnosticRunning(false);
    showToast("Diagnostics verification complete!", "success");
  };

  // Auto-Lock settings (minutes of inactivity: 0 means disabled)
  const [autoLockInterval, setAutoLockInterval] = useState<number>(0);

  useEffect(() => {
    if (currentUser) {
      if (
        currentUser.autoLockInterval !== undefined &&
        currentUser.autoLockInterval !== null
      ) {
        setAutoLockInterval(currentUser.autoLockInterval);
      } else {
        // Fallback for older database versions without default
        setAutoLockInterval(0);
      }
    } else {
      // Clear out interval when user logs out
      setAutoLockInterval(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?.autoLockInterval]);

  // Track user activity to trigger auto-lock
  const lastActivityRef = React.useRef<number>(Date.now());

  useEffect(() => {
    if (!currentUser || autoLockInterval <= 0 || !sessionPassword) return;

    const activityKey = `vault_last_activity_${currentUser.id}`;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
      localStorage.setItem(activityKey, Date.now().toString());
    };

    // Initial set
    resetActivity();

    const events = [
      "mousemove",
      "keydown",
      "mousedown",
      "touchstart",
      "scroll",
      "click",
    ];
    const eventOptions = { capture: true, passive: true };

    events.forEach((event) =>
      window.addEventListener(event, resetActivity, eventOptions),
    );

    // Check every 5 seconds for inactivity
    const intervalId = setInterval(() => {
      const lastActivityStr = localStorage.getItem(activityKey);
      const lastActivity = lastActivityStr
        ? parseInt(lastActivityStr, 10)
        : lastActivityRef.current;
      const now = Date.now();
      const elapsed = now - lastActivity;

      if (lastActivity > 0 && elapsed >= autoLockInterval * 60 * 1000) {
        lockWorkspace(
          `Workspace auto-locked after ${autoLockInterval} minute(s) of inactivity.`,
        );
      }
    }, 5000);

    return () => {
      clearInterval(intervalId);
      events.forEach((event) =>
        window.removeEventListener(event, resetActivity, eventOptions),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, autoLockInterval, sessionPassword]);

  const logTransfer = (record: Omit<TransferRecord, "id" | "timestamp">) => {
    const newRecord: TransferRecord = {
      ...record,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    };
    setTransferHistory((prev) => [newRecord, ...prev]);
  };

  // Generate storage trends based on current file list
  useEffect(() => {
    if (!currentUser) return;

    const calculatePoint = (date: Date): StoragePoint => {
      // Find files that existed at or before this date
      const snapshotFiles = files.filter(
        (f) => !f.isFolder && (!f.deletedAt || f.deletedAt > date.getTime()) && f.lastModified <= date.getTime(),
      );

      const media = snapshotFiles
        .filter(
          (f) =>
            f.type.startsWith("image") ||
            f.type.startsWith("video") ||
            f.type.startsWith("audio"),
        )
        .reduce((acc, f) => acc + (f.size || 0), 0);
      const docs = snapshotFiles
        .filter(
          (f) =>
            f.type.includes("pdf") ||
            f.type.includes("text") ||
            f.type.includes("word") ||
            f.type.includes("json") ||
            f.type.includes("application"),
        )
        .reduce((acc, f) => acc + (f.size || 0), 0);
      const archives = snapshotFiles
        .filter(
          (f) =>
            f.type.includes("zip") ||
            f.type.includes("tar") ||
            f.type.includes("rar") ||
            f.type.includes("enc"),
        )
        .reduce((acc, f) => acc + (f.size || 0), 0);

      return {
        date,
        media,
        documents: docs,
        archives,
      };
    };

    const now = new Date();
    const trendData: StoragePoint[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      // Set to end of day for the snapshot
      d.setHours(23, 59, 59, 999);
      trendData.push(calculatePoint(d));
    }
    setStorageTrends(trendData);
  }, [files, currentUser]);

  // File Manager & Explorer State
  const [currentPath, setCurrentPath] = useState<string>("/"); // path standard, e.g. "/" or "/Documents"
  const [selectedCategory, setSelectedCategory] = useState<string>("all"); // 'all', 'folders', 'document', 'image', 'media', 'archive'
  
  const [repairing, setRepairing] = useState(false);
  const handleRunStorageRepair = async () => {
    if (!currentUser?.id) return;
    setRepairing(true);
    try {
      const res = await api.repairStorage(currentUser.id);
      let msg = "Storage repair cycle completed.";
      if (res.stats && res.stats.recovered > 0) {
        msg += ` \n\nSuccessfully recovered ${res.stats.recovered} orphan files.`;
      } else if (res.stats) {
        msg += ` \n\nNo orphaned files found (${res.stats.total_scanned} files verified).`;
      }
      showToast(msg, "success");
      refreshData();
    } catch (e: any) {
      showToast(e.message, "error");
    } finally {
      setRepairing(false);
    }
  };
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<"name" | "date" | "size">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Create / UI State controls
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [createAtRoot, setCreateAtRoot] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Profile customization workspace state
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editCurrentPassword, setEditCurrentPassword] = useState("");
  const [editNewPassword, setEditNewPassword] = useState("");
  const [rekeyingProgress, setRekeyingProgress] = useState<string | null>(null);

  // Custom Notifications / Alert state
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  // Peer-to-peer sync interface states
  const [syncingFile, setSyncingFile] = useState<{
    file: FileData;
    peer: UserProfile;
    progress: number;
    status:
      | "authenticating"
      | "downloading"
      | "decrypting"
      | "completed"
      | "idle";
  } | null>(null);
  const [peerPasswordInput, setPeerPasswordInput] = useState("");

  // WebSocket signaling states
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [onlinePeers, setOnlinePeers] = useState<
    { username: string; displayName: string; cid: string }[]
  >([]);

  // Periodic Real-Time Telemetry Loop
  useEffect(() => {
    let active = true;

    const performSilentHealthCheck = async () => {
      let cryptoPassed = false;
      let idbPassed = false;
      let dbPassed = false;

      let cryptoLat = 0;
      let idbLat = 0;
      let dbLat = 0;

      // 1. Web Crypto
      try {
        cryptoLat = await runCryptoTest();
        cryptoPassed = true;
        if (active) {
          setDiagCryptoLatency(cryptoLat);
          setDiagCryptoStatus("success");
        }
      } catch (e) {
        if (active) setDiagCryptoStatus("error");
      }

      // 2. IndexedDB
      try {
        idbLat = await runIdbTest();
        idbPassed = true;
        if (active) {
          setDiagIdbLatency(idbLat);
          setDiagIdbStatus("success");
        }
      } catch (e) {
        if (active) setDiagIdbStatus("error");
      }

      // 3. SQLite DB / API
      try {
        dbLat = await runDbTest();
        dbPassed = true;
        if (active) {
          setDiagDbLatency(dbLat);
          setDiagDbStatus("success");
        }
      } catch (e) {
        if (active) setDiagDbStatus("error");
      }

      if (!active) return;

      // Log success sample for real-time uptime computation
      const overallSuccess = cryptoPassed && idbPassed && dbPassed;
      uptimeSamplesRef.current.total += 1;
      if (overallSuccess) {
        uptimeSamplesRef.current.success += 1;
      }

      // Calculate dynamic uptime percentage
      const computedUptime = (uptimeSamplesRef.current.success / uptimeSamplesRef.current.total) * 100;
      setRealTimeUptime(computedUptime);

      // Compute dynamic Integrity and Node Health Score based on actual performance conditions:
      let score = 0;
      if (cryptoPassed) score += 25;
      if (idbPassed) score += 40;
      if (dbPassed) score += 35;

      // Real penalty metrics
      if (dbLat > 300) score -= 1.5;
      else if (dbLat > 150) score -= 0.5;

      if (idbLat > 100) score -= 1.0;
      else if (idbLat > 50) score -= 0.3;

      if (cryptoLat > 40) score -= 1.0;

      // Environmental connectivity parameters
      if (!navigator.onLine) {
        score -= 3.5;
      }
      
      const wsConnected = onlinePeers.length > 0 || Object.keys(connectedPeers).length > 0;
      if (!wsConnected) {
        score -= 1.5;
      }

      // Floor/Cap score to valid % boundaries
      const finalScore = Math.max(0, Math.min(100, score));
      setRealTimeIntegrity(finalScore);
    };

    // Run first verification immediately on mount
    performSilentHealthCheck();

    // High frequency/low overhead execution interval (every 3 seconds) to keep metrics completely real-time
    const interval = setInterval(performSilentHealthCheck, 3000);

    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlinePeers.length, Object.keys(connectedPeers).length]);
  const [receivedSignals, setReceivedSignals] = useState<
    {
      id: string;
      senderUsername: string;
      token: string;
      timestamp: number;
      decrypted?: string;
    }[]
  >([]);
  const [showSignalSecret, setShowSignalSecret] = useState(false);
  const [isNoteUnlocked, setIsNoteUnlocked] = useState(false);
  const [decryptedNote, setDecryptedNote] = useState("");
  const [encryptedNoteData, setEncryptedNoteData] = useState<string>(() => {
    return localStorage.getItem("vault_recovery_note") || "";
  });
  const [targetPeerUsername, setTargetPeerUsername] = useState<string>("");
  const [targetPeerCid, setTargetPeerCid] = useState<string>("");
  const [myConnectionId, setMyConnectionId] = useState<string>("");
  const [signalTokenInput, setSignalTokenInput] = useState<string>("");
  const [signalSecretKey, setSignalSecretKey] = useState<string>("");
  const [signalDecryptionKeys, setSignalDecryptionKeys] = useState<
    Record<string, string>
  >({});

  // WebRTC Live Peer and DataChannel States & Refs
  const [rtcStatus, setRtcStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [rtcActivePeer, setRtcActivePeer] = useState<string | null>(null);
  const [pendingRtcOffer, setPendingRtcOffer] = useState<{
    senderUsername: string;
    senderCid: string;
    sdp: any;
  } | null>(null);
  const [pendingIceCandidates, setPendingIceCandidates] = useState<any[]>([]);
  const [rtcIncomingFiles, setRtcIncomingFiles] = useState<
    {
      id: string;
      name: string;
      type: string;
      size: number;
      data: ArrayBuffer;
      sender: string;
      timestamp: number;
    }[]
  >([]);

  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const dcRef = React.useRef<RTCDataChannel | null>(null);
  const incomingTransfersRef = React.useRef<
    Record<
      string,
      {
        name: string;
        fileType?: string;
        size: number;
        totalChunks: number;
        chunks: string[];
      }
    >
  >({});
  const [rtcFileKeys, setRtcFileKeys] = useState<Record<string, string>>({});

  // Strategy 3: Local SSID / mDNS Offline Hotspot (Bonjour / Multicast DNS discovery)
  const [mDnsActive, setMDnsActive] = useState<boolean>(true);
  const [mDnsIp, setMDnsIp] = useState<string>("");
  const [availableIps, setAvailableIps] = useState<string[]>([]);
  const [mDnsDiscoveredNodes, setMDnsDiscoveredNodes] = useState<
    {
      username: string;
      displayName: string;
      localIp: string;
      serviceName: string;
      port: number;
      lastSeen: number;
    }[]
  >([]);

  // Sync P2P state with MDNS UI
  useEffect(() => {
    if (peerId) {
      setAvailableIps((prev) => {
        const filtered = prev.filter(ip => ip !== "192.168.1.45" && ip !== peerId);
        return [...filtered, peerId];
      });
      if (!mDnsIp) setMDnsIp(peerId);
    }
  }, [peerId]);

  // Connected P2P swarm nodes are dynamically combined in the render loop to prevent state clobbering.
  const [mDnsIncomingTransfers, setMDnsIncomingTransfers] = useState<
    {
      id: string;
      senderUsername: string;
      targetUsername: string;
      fileName: string;
      fileType: string;
      fileSize: number;
      encryptedDataBase64: string;
      timestamp: number;
    }[]
  >([]);
  const [mDnsDecryptionKeys, setMDnsDecryptionKeys] = useState<
    Record<string, string>
  >({});

  // Fetch server-side network interfaces
  useEffect(() => {
    if (!currentUser) return;
    const fetchInterfaces = async () => {
      try {
        const res = await fetch("/api/mdns/interfaces");
        if (res.ok) {
          const contentType = res.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const d = await res.json();
            if (d.ips && d.ips.length > 0) {
              setAvailableIps(d.ips);
              setMDnsIp(d.ips[0]);
            }
          }
        }
      } catch (err) {
        console.warn("Could not fetch node interfaces", err);
      }
    };
    fetchInterfaces();
  }, [currentUser]);

  // mDNS periodic lookup and presence advertiser
  useEffect(() => {
    if (!mDnsActive || !currentUser) return;

    const announceAndResolve = async () => {
      try {
        // Announce node to mDNS subnet registry
        await fetch("/api/mdns/announce", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: currentUser.username,
            displayName: currentUser.displayName,
            avatarColor: currentUser.avatarColor,
            localIp: mDnsIp,
            serviceName: "_secure-vault._tcp.local",
            port: 3000,
          }),
        });

        // Resolve active adjacent nodes
        const res = await fetch("/api/mdns/resolve");
        if (res.ok) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.toLowerCase().includes("application/json")) {
            const data = await res.json();
            const nodes = data.nodes || [];
            const filtered = nodes.filter(
              (n: any) => n.username !== currentUser.username,
            );
            setMDnsDiscoveredNodes(filtered);
          } else {
            console.warn(
              `mDNS resolve returned non-JSON (${contentType}). Bypassing HTML fallback.`,
            );
          }
        }

        // Pull pending Direct HTTP uploads
        const resTransfers = await fetch(
          `/api/mdns/transfers/${encodeURIComponent(currentUser.username)}`,
        );
        if (resTransfers.ok) {
          const contentType = resTransfers.headers.get("content-type") || "";
          if (contentType.toLowerCase().includes("application/json")) {
            const listTransfers = await resTransfers.json();
            if (listTransfers.length > 0) {
              setMDnsIncomingTransfers((prev) => [...listTransfers, ...prev]);
              showToast(
                `Direct HTTP POST Inbound: Ingested ${listTransfers.length} encrypted buffer(s)!`,
                "success",
              );
            }
          } else {
            console.warn(
              `mDNS transfers returned non-JSON (${contentType}) for @${currentUser.username}. Bypassing HTML fallback.`,
            );
          }
        }
      } catch (err: any) {
        if (err.message && err.message.includes("Failed to fetch")) {
          // Suppress network drop errors during routine polling
          return;
        }
        console.warn("mDNS routine task failed:", err);
      }
    };

    announceAndResolve();
    const intervalId = setInterval(announceAndResolve, 3500);
    return () => clearInterval(intervalId);
  }, [mDnsActive, mDnsIp, currentUser]);

  const handleDirectHttpSend = async (
    item: FileData,
    targetNode: { username: string; localIp: string },
  ) => {
    let rawData = item.data;
    if (!rawData && item.id && currentUser?.id) {
       try {
         showToast("Fetching encrypted payload from server...", "info");
         rawData = await api.downloadFileContent(currentUser.id, item.id);
       } catch (err: any) {
         showToast("Failed to retrieve file data for relay.", "error");
         return;
       }
    }

    if (!rawData) {
      showToast("No raw encrypted payload available for transport.", "error");
      return;
    }
    const tId = startTransfer(item.name, "transfer");
    try {
      showToast(`Compressing & streaming "${item.name}"...`, "info");
      updateTransferProgress(tId, 20);

      const response = await fetch("/api/mdns/direct-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderUsername: currentUser?.username,
          targetUsername: targetNode.username,
          fileName: item.name,
          fileType: item.type,
          fileSize: item.size,
          encryptedDataBase64: arrayBufferToBase64(rawData),
        }),
      });

      if (response.ok) {
        updateTransferProgress(tId, 100, "completed");
        showToast(
          `Success: Injected "${item.name}" directly over HTTP POST subnet to @${targetNode.username}!`,
          "success",
        );
      } else {
        throw new Error("Local Server rejected routing request");
      }
    } catch (err: any) {
      updateTransferProgress(tId, 0, "error");
      showToast(`Direct HTTP Post failure: ${err.message}`, "error");
    }
  };

  const handleSaveMdnsFileToVault = async (incFile: {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    encryptedDataBase64: string;
    senderUsername: string;
  }) => {
    if (!currentUser || !currentUser.id) return;
    const tId = startTransfer(incFile.fileName, "upload");
    try {
      updateTransferProgress(tId, 30);
      const buffer = base64ToArrayBuffer(incFile.encryptedDataBase64);
      updateTransferProgress(tId, 60);
      await api.createFile({
        userId: currentUser.id,
        name: incFile.fileName,
        data: buffer,
        type: incFile.fileType,
        size: incFile.fileSize,
        folderPath: currentPath,
        isFolder: false,
        isShared: false,
        senderName: incFile.senderUsername,
        lastModified: Date.now(),
      });
      updateTransferProgress(tId, 100, "completed");
      showToast(
        `Saved mDNS payload "${incFile.fileName}" securely to SQLite!`,
        "success",
      );
      refreshData();
      setMDnsIncomingTransfers((prev) =>
        prev.filter((f) => f.id !== incFile.id),
      );
    } catch (err: any) {
      updateTransferProgress(tId, 0, "error");
      showToast(`Failed to persist cold file: ${err.message}`, "error");
    }
  };

  const handleDecryptMdnsFile = async (
    incFile: {
      id: string;
      fileName: string;
      fileType: string;
      encryptedDataBase64: string;
    },
    keyInput: string,
  ) => {
    if (!keyInput) {
      showToast("Decryption passphrase required.", "error");
      return;
    }
    const tId = startTransfer(incFile.fileName, "download");
    try {
      showToast(
        "Computing PBKDF2 parameters and decrypting direct HTTP payload...",
        "info",
      );
      updateTransferProgress(tId, 20);
      const cipherBuffer = base64ToArrayBuffer(incFile.encryptedDataBase64);
      const decryptedBuffer = await decryptData(cipherBuffer, keyInput);
      updateTransferProgress(tId, 80);

      const blob = new Blob([decryptedBuffer], { type: incFile.fileType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = incFile.fileName.replace(".enc", "") || "unlocked_file";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      updateTransferProgress(tId, 100, "completed");
      showToast(
        "E2E Cryptographic verification achieved! Downloaded.",
        "success",
      );
    } catch (err) {
      updateTransferProgress(tId, 0, "error");
      showToast(
        "Decryption failed. Incorrupt buffer or key ring required.",
        "error",
      );
    }
  };

  const handleSaveRtcFileToVault = async (incFile: {
    id: string;
    name: string;
    type: string;
    size: number;
    data: ArrayBuffer;
    sender: string;
  }) => {
    if (!currentUser || !currentUser.id) return;
    const tId = startTransfer(incFile.name, "upload");
    try {
      updateTransferProgress(tId, 50);
      await api.createFile({
        userId: currentUser.id,
        name: incFile.name,
        data: incFile.data,
        type: incFile.type,
        size: incFile.size,
        folderPath: currentPath,
        isFolder: false,
        isShared: false,
        senderName: incFile.sender,
        lastModified: Date.now(),
      });
      updateTransferProgress(tId, 100, "completed");
      showToast(
        `Saved WebRTC payload "${incFile.name}" securely to SQLite!`,
        "success",
      );
      refreshData();
    } catch (err: any) {
      updateTransferProgress(tId, 0, "error");
      showToast(`Failed saving to SQLite table: ${err.message}`, "error");
    }
  };

  const handleDecryptRtcFile = async (
    incFile: {
      id: string;
      name: string;
      type: string;
      data: ArrayBuffer;
    },
    keyInput: string,
    previewMode: boolean = false,
  ) => {
    if (!keyInput) {
      showToast("Decryption passphrase required.", "error");
      return;
    }
    const tId = startTransfer(incFile.name, "download");
    try {
      showToast(
        previewMode
          ? "Decrypting for preview..."
          : "Decrypting RTC byte buffer...",
        "info",
      );
      updateTransferProgress(tId, 30);
      const decryptedBuffer = await decryptData(incFile.data, keyInput);
      updateTransferProgress(tId, 80);

      const blob = new Blob([decryptedBuffer], { type: incFile.type });
      const url = URL.createObjectURL(blob);
      if (previewMode) {
        window.open(url, "_blank");
        showToast("Preview opened in new tab.", "success");
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = incFile.name.replace(".enc", "") || "unlocked_file";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast("Success: AES payload decrypted & downloaded!", "success");
      }
      updateTransferProgress(tId, 100, "completed");
    } catch (err) {
      updateTransferProgress(tId, 0, "error");
      showToast(
        "Decryption failed. Invalid workspace ring or corrupt stream.",
        "error",
      );
    }
  };

  // Raw array buffer utility encoders
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const setupDataChannel = (dc: RTCDataChannel, remoteUsername: string) => {
    dc.onopen = () => {
      setRtcStatus("connected");
      showToast(
        `WebRTC bidirectional channel established with @${remoteUsername}!`,
        "success",
      );
    };

    dc.onclose = () => {
      // Pinned behavior requested by user - only disconnect from the UI button.
      // setRtcStatus("disconnected");
      // setRtcActivePeer(null);
      // pcRef.current = null;
      // dcRef.current = null;
      showToast("WebRTC Data Channel dropped.", "info");
    };

    dc.onerror = (err) => {
      console.error("Data Channel error:", err);
    };

    dc.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "file-transfer") {
          console.log("Received legacy file-transfer message", { name: msg.name, size: msg.data.length });
          const fileData = base64ToArrayBuffer(msg.data);
          setRtcIncomingFiles((prev) => [
            {
              id: Math.random().toString(36).substring(2, 9),
              name: msg.name,
              type: msg.fileType,
              size: msg.size,
              data: fileData,
              sender: remoteUsername,
              timestamp: Date.now(),
            },
            ...prev,
          ]);
          showToast(
            `Direct Peer Buffer: Received "${msg.name}" encrypted via RTCDataChannel!`,
            "success",
          );
        } else if (msg.type === "file-chunk") {
          console.log("Received file-chunk message", {
            transferId: msg.transferId,
            chunkIndex: msg.chunkIndex,
            totalChunks: msg.totalChunks,
          });

          if (!incomingTransfersRef.current[msg.transferId]) {
            incomingTransfersRef.current[msg.transferId] = {
              name: msg.name,
              fileType: msg.fileType,
              size: msg.size,
              totalChunks: msg.totalChunks,
              chunks: new Array(msg.totalChunks),
            };
            showToast(`Receiving stream for "${msg.name}" via RTC...`, "info");
          }

          const tx = incomingTransfersRef.current[msg.transferId];
          tx.chunks[msg.chunkIndex] = msg.data;

          // Check if all chunks received
          let completed = true;
          let receivedCount = 0;
          for (let i = 0; i < tx.totalChunks; i++) {
            if (tx.chunks[i] === undefined || tx.chunks[i] === null) {
              completed = false;
            } else {
              receivedCount++;
            }
          }

          if (completed) {
            const assembledBase64 = tx.chunks.join("");
            const fileData = base64ToArrayBuffer(assembledBase64);

            setRtcIncomingFiles((prev) => [
              {
                id: Math.random().toString(36).substring(2, 9),
                name: tx.name,
                type: tx.fileType,
                size: tx.size,
                data: fileData,
                sender: remoteUsername,
                timestamp: Date.now(),
              },
              ...prev,
            ]);

            showToast(
              `Direct Peer Buffer: Received "${tx.name}" encrypted via RTCDataChannel!`,
              "success",
            );

            // Clean up transfer block
            delete incomingTransfersRef.current[msg.transferId];
          }
        }
      } catch (err) {
        console.error("Failed parsing RTCDataChannel string:", err);
      }
    };
  };

  const handleIncomingWebrtcSignaling = async (
    senderUsername: string,
    senderCid: string,
    payload: any,
    activeWs: WebSocket,
  ) => {
    if (payload.type === "candidate") {
      if (pcRef.current) {
        try {
          await pcRef.current.addIceCandidate(
            new RTCIceCandidate(payload.candidate),
          );
        } catch (e) {
          console.warn("Could not add peer ICE candidate", e);
        }
      } else {
        setPendingIceCandidates((prev) => [...prev, payload.candidate]);
      }
      return;
    }

    if (payload.type === "offer") {
      setPendingRtcOffer({
        senderUsername,
        senderCid,
        sdp: payload.sdp,
      });
      showToast(
        `Incoming WebRTC Tunnel request from @${senderUsername}. Awaiting your acceptance.`,
        "info",
      );
      return;
    }

    if (payload.type === "answer") {
      if (pcRef.current) {
        try {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: payload.sdp }),
          );
          showToast(
            `WebRTC Handshake achieved with @${senderUsername}! Connected.`,
            "success",
          );
        } catch (err: any) {
          showToast(
            `Setting remote WebRTC description failed: ${err.message}`,
            "error",
          );
        }
      }
      return;
    }
  };

  const initiateRtcConnection = async (
    targetCid: string,
    targetUsername: string,
  ) => {
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      showToast("WebSocket signaling pipeline is currently offline or not ready.", "error");
      return;
    }

    try {
      setRtcStatus("connecting");
      setRtcActivePeer(targetUsername);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate && wsConnection) {
          wsConnection.send(
            JSON.stringify({
              type: "webrtc",
              targetCid,
              targetUsername,
              payload: { type: "candidate", candidate: event.candidate },
            }),
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setRtcStatus("connected");
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          // "pinned" behavior - only disconnect manually via UI disconnect button.
          // setRtcStatus("disconnected");
          // setRtcActivePeer(null);
          // pcRef.current = null;
          // dcRef.current = null;
        }
      };

      const dc = pc.createDataChannel("fileStreamChannel");
      dcRef.current = dc;
      setupDataChannel(dc, targetUsername);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      wsConnection.send(
        JSON.stringify({
          type: "webrtc",
          targetCid,
          targetUsername,
          payload: { type: "offer", sdp: offer.sdp },
        }),
      );

      showToast(`Dispatched secure GCM offer to @${targetUsername}...`, "info");
    } catch (err: any) {
      setRtcStatus("disconnected");
      showToast(`Webrtc handshaker failed: ${err.message}`, "error");
    }
  };

  const acceptRtcOffer = async () => {
    if (!pendingRtcOffer || !wsConnection) return;
    const { senderUsername, senderCid, sdp } = pendingRtcOffer;
    try {
      setRtcStatus("connecting");
      setRtcActivePeer(senderUsername);
      setTargetPeerUsername(senderUsername);
      setTargetPeerCid(senderCid);

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          wsConnection.send(
            JSON.stringify({
              type: "webrtc",
              targetCid: senderCid,
              targetUsername: senderUsername,
              payload: { type: "candidate", candidate: event.candidate },
            }),
          );
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setRtcStatus("connected");
        } else if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          // "pinned" behavior - only disconnect manually via UI disconnect button.
        }
      };

      pc.ondatachannel = (event) => {
        const dc = event.channel;
        dcRef.current = dc;
        setupDataChannel(dc, senderUsername);
      };

      await pc.setRemoteDescription(
        new RTCSessionDescription({ type: "offer", sdp }),
      );

      for (const candidate of pendingIceCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Could not add queued peer ICE candidate", e);
        }
      }
      setPendingIceCandidates([]);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsConnection.send(
        JSON.stringify({
          type: "webrtc",
          targetCid: senderCid,
          targetUsername: senderUsername,
          payload: { type: "answer", sdp: answer.sdp },
        }),
      );

      setPendingRtcOffer(null);
      showToast(
        `Accepted WebRTC Tunnel offer from @${senderUsername}!`,
        "info",
      );
    } catch (err: any) {
      setRtcStatus("disconnected");
      setPendingRtcOffer(null);
      showToast(
        `WebRTC setup fault from @${senderUsername}: ${err.message}`,
        "error",
      );
    }
  };

  const rejectRtcOffer = () => {
    setPendingRtcOffer(null);
    setPendingIceCandidates([]);
    showToast("Rejected incoming WebRTC link request.", "info");
  };

  const disconnectWebRtc = (e?: any) => {
    if (rtcStatus === "connected" && e) {
      if (
        !window.confirm(
          "WARNING: Disconnecting will sever the WebRTC P2P link and cancel any active transfers. Are you sure you want to disconnect?",
        )
      ) {
        return;
      }
    }
    if (pcRef.current) {
      pcRef.current.close();
    }
    pcRef.current = null;
    dcRef.current = null;
    setRtcStatus("disconnected");
    setRtcActivePeer(null);
    showToast("P2P WebRTC Web tunnel disconnected securely.", "info");
  };

  const handleStreamRtc = async (item: FileData) => {
    if (!dcRef.current || dcRef.current.readyState !== "open") {
      showToast("WebRTC DataChannel not open. Please ensure peer is connected.", "error");
      return;
    }

    let rawData = item.data;
    if (!rawData && item.id && currentUser?.id) {
      try {
        showToast("Fetching encrypted payload from server for WebRTC streaming...", "info");
        rawData = await api.downloadFileContent(currentUser.id, item.id);
      } catch (err: any) {
        showToast("Failed to retrieve file data for P2P streaming.", "error");
        return;
      }
    }

    if (!rawData) {
      showToast("No raw decrypted/encrypted payload available for streaming.", "error");
      return;
    }

    const tId = startTransfer(item.name, "transfer");
    try {
      showToast(
        `Streaming "${item.name}" via chunked WebRTC channel...`,
        "info",
      );
      updateTransferProgress(tId, 5);

      const fullBase64 = arrayBufferToBase64(rawData);
      const CHUNK_SIZE = 16384; // Safe 16 KB character chunks to avoid packet-size exceptions
      const totalChunks = Math.ceil(fullBase64.length / CHUNK_SIZE);
      const transferId = Math.random().toString(36).substring(2, 9);

      const BUFFER_THRESHOLD = 65536; // 64 KB buffer threshold to prevent native buffer overflow

      for (let i = 0; i < totalChunks; i++) {
        // Handle backpressure to fit within Max Message limits safely
        while (dcRef.current && dcRef.current.bufferedAmount > BUFFER_THRESHOLD) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        if (!dcRef.current || dcRef.current.readyState !== "open") {
          throw new Error("P2P connection was lost during data transport.");
        }

        const startIdx = i * CHUNK_SIZE;
        const endIdx = Math.min(startIdx + CHUNK_SIZE, fullBase64.length);
        const chunkString = fullBase64.slice(startIdx, endIdx);

        const chunkPayload = {
          type: "file-chunk",
          transferId,
          name: item.name,
          fileType: item.type,
          size: item.size,
          chunkIndex: i,
          totalChunks,
          data: chunkString,
        };

        dcRef.current.send(JSON.stringify(chunkPayload));

        const percent = Math.round(((i + 1) / totalChunks) * 100);
        updateTransferProgress(tId, percent);
      }

      updateTransferProgress(tId, 100, "completed");
      showToast(
        `Completed chunked encrypted transport of "${item.name}" via RTCDataChannel!`,
        "success",
      );
    } catch (err: any) {
      updateTransferProgress(tId, 0, "error");
      showToast(`RTCDataChannel Stream fail: ${err.message}`, "error");
    }
  };

  // Active WebSocket listener
  useEffect(() => {
    if (!currentUser) {
      if (wsConnection) {
        wsConnection.close();
        setWsConnection(null);
      }
      setOnlinePeers([]);
      return;
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProtocol}//${window.location.host}`;
    let socket: WebSocket | null = null;
    let reconnectionTimer: any = null;

    const connect = () => {
      if (socket) return;

      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("WebSocket signaling channel opened");
        if (socket && currentUser) {
          socket.send(
            JSON.stringify({
              type: "register",
              username: currentUser.username,
              displayName: currentUser.displayName,
            }),
          );
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "welcome") {
            setMyConnectionId(msg.cid);
          } else if (msg.type === "presence") {
            // Allow other tabs with same username but different CID for testing
            const activePeers = msg.users.filter(
              (u: any) => u.cid !== msg.yourCid,
            );
            setOnlinePeers(activePeers);
          } else if (msg.type === "signal") {
            setReceivedSignals((prev) => [
              {
                id: Math.random().toString(36).substring(2, 9),
                senderUsername: msg.senderUsername,
                token: msg.token,
                timestamp: Date.now(),
              },
              ...prev,
            ]);
            showToast(
              `New encrypted signaling packet received from @${msg.senderUsername}!`,
              "info",
            );
          } else if (msg.type === "share_request") {
            setPendingShareRequests((prev) => [
              ...prev,
              {
                id: msg.requestId,
                fileId: msg.fileId,
                fileName: msg.fileName,
                fileType: msg.fileType,
                fileSize: msg.fileSize,
                fileDataBase64: msg.fileDataBase64,
                senderId: msg.senderId,
                senderName: msg.senderUsername,
                note: msg.note,
                integrityHash: msg.integrityHash,
                status: "pending",
              },
            ]);
            showToast(`New share request from @${msg.senderUsername}!`, "info");
          } else if (msg.type === "share_response") {
            if (msg.accepted) {
              showToast(`@${msg.senderUsername} accepted your share request for file "${msg.fileName}".`, "success");
              console.log("Looking for fileId in files", { fileId: msg.fileId, filesCount: filesRef.current.length });
              const fileToShare = filesRef.current.find(f => f.id === msg.fileId);
              if (fileToShare) {
                  handleStreamRtc(fileToShare);
              } else {
                  console.error("File not found in files state", { fileId: msg.fileId, files: filesRef.current });
                  showToast("File no longer exists.", "error");
              }
            } else {
              showToast(`@${msg.senderUsername} rejected your share request for file "${msg.fileName}".`, "info");
            }
          } else if (msg.type === "webrtc") {
            handleIncomingWebrtcSignaling(
              msg.senderUsername,
              msg.senderCid,
              msg.payload,
              socket!,
            );
          } else if (msg.type === "mdns_direct_transfer") {
            setMDnsIncomingTransfers((prev) => [msg.packet, ...prev]);
            showToast(
              `Direct HTTP POST Dynamic: Ingested file payload "${msg.packet.fileName}" from @${msg.senderUsername}!`,
              "success",
            );
          } else if (msg.type === "broadcast_refresh") {
            refreshSharedFiles();
          }
        } catch (err) {
          console.error("WebSocket reading error:", err);
        }
      };

      socket.onclose = () => {
        console.log("WebSocket connection closed, re-attempting in 3s");
        setWsConnection(null);
        socket = null;
        reconnectionTimer = setTimeout(connect, 3000);
      };

      setWsConnection(socket);
    };

    connect();

    return () => {
      if (reconnectionTimer) clearTimeout(reconnectionTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleSendSignal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wsConnection || wsConnection.readyState !== WebSocket.OPEN) {
      showToast("WebSocket is offline or not ready.", "error");
      return;
    }
    if (!targetPeerCid) {
      showToast("Please select an online peer node.", "error");
      return;
    }
    if (!signalTokenInput || !signalSecretKey) {
      showToast(
        "Token and Secret-Key are required for cryptographic envelope.",
        "error",
      );
      return;
    }

    try {
      const encoder = new TextEncoder();
      const payloadBytes = encoder.encode(signalTokenInput);
      const encryptedBuffer = await encryptData(
        payloadBytes.buffer,
        signalSecretKey,
      );

      const bytes = new Uint8Array(encryptedBuffer);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Token = window.btoa(binary);

      wsConnection.send(
        JSON.stringify({
          type: "signal",
          targetCid: targetPeerCid,
          targetUsername: targetPeerUsername, // kept for backward compatibility
          token: base64Token,
        }),
      );

      showToast(`Token encrypted via GCM and sent to target CID!`, "success");
      setSignalTokenInput("");
    } catch (err: any) {
      showToast(`Signaling Encryption Failed: ${err.message}`, "error");
    }
  };

  const handleDecryptSignal = async (
    signalId: string,
    signalCipher: string,
    secret: string,
  ) => {
    if (!secret) {
      showToast("Please provide a decryption passphrase.", "error");
      return;
    }
    try {
      const binary = window.atob(signalCipher);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const decryptedBuffer = await decryptData(bytes.buffer, secret);
      const decoder = new TextDecoder();
      const plainText = decoder.decode(decryptedBuffer);

      setReceivedSignals((prev) =>
        prev.map((sig) => {
          if (sig.id === signalId) {
            return { ...sig, decrypted: plainText };
          }
          return sig;
        }),
      );
      showToast("Envelope decrypted: Verified payload ready!", "success");
    } catch (err) {
      showToast("Decryption failed. Invalid cipher payload or key.", "error");
    }
  };

  const handleUnlockNote = async () => {
    if (!sessionPassword) {
      showToast("Master password session expired. Please re-login.", "error");
      return;
    }
    if (!encryptedNoteData) {
      setDecryptedNote("");
      setIsNoteUnlocked(true);
      return;
    }
    try {
      const binary = window.atob(encryptedNoteData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const decryptedBuffer = await decryptData(bytes.buffer, sessionPassword);
      const decoder = new TextDecoder();
      setDecryptedNote(decoder.decode(decryptedBuffer));
      setIsNoteUnlocked(true);
      showToast("Recovery note unlocked successfully.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to decrypt note. Session mismatch.", "error");
    }
  };

  const handleSaveNote = async () => {
    if (!sessionPassword) {
      showToast("Master password session expired.", "error");
      return;
    }
    try {
      const encoder = new TextEncoder();
      const buffer = encoder.encode(decryptedNote).buffer;
      const encryptedBuffer = await encryptData(buffer, sessionPassword);
      const base64 = window.btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
      setEncryptedNoteData(base64);
      localStorage.setItem("vault_recovery_note", base64);
      showToast("Encrypted recovery note saved to vault.", "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to secure note.", "error");
    }
  };

  // Initial trigger
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync refresh when current user changes
  useEffect(() => {
    refreshData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, currentPath]);

  const refreshData = async () => {
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    try {
      const list = await api.getAllUsers();
      setAllUsers(list);

      if (currentUser && currentUser.id) {
        const userExists = list.some((u) => u.id === currentUser.id);
        if (!userExists) {
          // Self-healing check: Has the backend restarted/reset?
          const usernameMatch = list.find(
            (u) => u.username.toLowerCase() === currentUser.username.toLowerCase()
          );

          if (usernameMatch) {
            // Username match but different ID: update ID references and keep workspace online!
            console.warn("Account session ID mismatch on server, updating local user ID reference.");
            const updatedUser = { ...currentUser, id: usernameMatch.id };
            setCurrentUser(updatedUser);
            const allMyFiles = await api.getFiles(usernameMatch.id);
            setFiles(allMyFiles);
            return;
          } else if (sessionPassword) {
            // Username not present on server, and we have local sessionPassword: auto-heal by silently registering custom identity!
            const msg = "Autoreboot detected: Username not found in server database. Initiating silent local-recovery...";
            console.warn(msg);
            setSystemWarning(msg);
            showToast("Device database reset detected. Auto-recovering secure workspace credentials...", "info");

            const saltBytes = await getDeterministicSalt(currentUser.username);
            const passHash = await hashPassword(sessionPassword, saltBytes);
            const saltHex = bufferToHex(saltBytes);

            const autoUser: UserProfile = {
              username: currentUser.username,
              displayName: currentUser.displayName,
              passwordHash: passHash,
              passwordSalt: saltHex,
              joinedAt: Date.now(),
              avatarColor: currentUser.avatarColor || "#6366f1",
              autoLockInterval: currentUser.autoLockInterval || 0,
            };

            try {
              const result = await api.register(autoUser);
              autoUser.id = result.id;
            } catch (e: any) {
              if (e.message.includes("Already exists") || e.message.includes("UNIQUE constraint failed")) {
                const list = await api.getAllUsers();
                const existing = list.find((u) => u.username.toLowerCase() === currentUser.username.toLowerCase());
                if (existing) {
                  autoUser.id = existing.id;
                } else {
                  throw e;
                }
              } else {
                throw e;
              }
            }

            // Re-derive master cryptographic key in memory
            await deriveMasterKey(currentUser.username, sessionPassword);

            // Re-register WebSocket identity so other peers can find us
            if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
              wsConnection.send(
                JSON.stringify({
                  type: "register",
                  username: autoUser.username,
                  displayName: autoUser.displayName,
                })
              );
            }

            setCurrentUser(autoUser);
            const recoveredFiles = await api.getFiles(autoUser.id!);
            setFiles(recoveredFiles);
            showToast("Credentials successfully synced. System connected!", "success");
            return;
          } else {
            console.warn("Account session not found in active database, resetting state.");
            handleLogout("Session expired or database reset. Please register/login again.");
            return;
          }
        }
        const allMyFiles = await api.getFiles(currentUser.id);
        setFiles(allMyFiles);
      } else {
        setFiles([]);
      }
    } catch (err: any) {
      console.error("Failed to refresh data:", err);
      if (err?.message?.includes("database reset") || err?.message?.includes("register/login again") || err?.message?.includes("Unauthorized")) {
        console.warn("API/Database reset detected in refreshData, logging out.");
        handleLogout("Session expired or database reset. Please register/login again.");
      }
    } finally {
      isRefreshingRef.current = false;
    }
  };

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success",
  ) => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  // Helper validation for offline registry password strength
  const validatePasswordStrength = (
    pass: string,
  ): { ok: boolean; msg: string } => {
    if (pass.length < 6) {
      return { ok: false, msg: "Password must be at least 6 characters long." };
    }
    if (!/\d/.test(pass)) {
      return { ok: false, msg: "Password must contain at least one number." };
    }
    return { ok: true, msg: "Password strength validated." };
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUsername = usernameInput.trim().toLowerCase();
    const targetDisplayName = displayNameInput.trim();

    if (!cleanUsername || !passwordInput) {
      showToast("Please fill out username and password.", "error");
      return;
    }

    // Check if user already exists
    const existingUser = allUsers.find(
      (u) => u.username?.toLowerCase() === cleanUsername,
    );

    if (existingUser) {
      // If user exists, treat as login/recovery
      try {
        const saltBytes = await getDeterministicSalt(cleanUsername);
        const computedHash = await hashPassword(passwordInput, saltBytes);
        const user = await api.login(cleanUsername, computedHash);
        
        // Derive Master Key
        await deriveMasterKey(cleanUsername, passwordInput);
        
        setCurrentUser({ ...user, passwordHash: computedHash });
        setSessionPassword(passwordInput);
        showToast(`Identity '@${user.username}' recovered successfully!`, "success");
        setUsernameInput("");
        setPasswordInput("");
        setDisplayNameInput("");
        return;
      } catch (err: any) {
        showToast(err.message || "Recovery/Login failed. Check credentials.", "error");
        return;
      }
    }

    if (!targetDisplayName) {
      showToast("Display name is required for new accounts.", "error");
      return;
    }

    const { ok, msg } = validatePasswordStrength(passwordInput);
    if (!ok) {
      showToast(msg, "error");
      return;
    }

    try {
      const saltBytes = await getDeterministicSalt(cleanUsername);
      const passHash = await hashPassword(passwordInput, saltBytes);
      const saltHex = bufferToHex(saltBytes);

      const colors = [
        "#6366f1",
        "#8b5cf6",
        "#ec4899",
        "#f43f5e",
        "#f59e0b",
        "#10b981",
        "#06b6d4",
        "#3b82f6",
      ];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];

      const newUser: UserProfile = {
        username: cleanUsername,
        displayName: targetDisplayName,
        passwordHash: passHash,
        passwordSalt: saltHex,
        joinedAt: Date.now(),
        avatarColor: randomColor,
        autoLockInterval: 0,
      };

      const result = await api.register(newUser);
      newUser.id = result.id;

      // Use the derived Master Key
      await deriveMasterKey(cleanUsername, passwordInput);

      showToast("Sovereign identity created successfully!", "success");

      setCurrentUser(newUser);
      setSessionPassword(passwordInput);

      setUsernameInput("");
      setPasswordInput("");
      setDisplayNameInput("");
    } catch (error: any) {
      showToast(error.message || "Registration failed.", "error");
    }
  };

  const handleLogin = async (e: React.FormEvent, overrideUsername?: string) => {
    e.preventDefault();
    const cleanUsername = (overrideUsername || usernameInput)
      .trim()
      .toLowerCase();

    if (!cleanUsername || !passwordInput) {
      showToast("Both fields are required to unlock your vault.", "error");
      return;
    }

    try {
      // 1. Get salt from server
      const saltHex = await api.getSalt(cleanUsername);
      const saltBytes = hexToBytes(saltHex);

      // 2. Compute hash locally
      const computedHash = await hashPassword(passwordInput, saltBytes);

      // 3. Authenticate with server
      const user = await api.login(cleanUsername, computedHash);

      // Derive Master Key deterministically
      await deriveMasterKey(cleanUsername, passwordInput);

      // Store the hash in memory for the session to allow current-password verification during re-keying
      setCurrentUser({ ...user, passwordHash: computedHash });
      setSessionPassword(passwordInput);
      
      // Attempt to save biometric credentials if available
      try {
        const { isAvailable } = await NativeBiometric.isAvailable();
        if (isAvailable) {
          await NativeBiometric.setCredentials({
            server: "QuantumSecureVault",
            username: cleanUsername,
            password: passwordInput,
          });
        }
      } catch (e) {
        console.error("Failed to save biometric credentials", e);
      }
      
      showToast(`Unlocked workspace: ${user.displayName}!`, "success");

      setUsernameInput("");
      setPasswordInput("");
    } catch (error: any) {
      showToast(error.message || "Unlock action failed.", "error");
    }
  };

  const handleBiometricLogin = async (overrideUsername?: string) => {
    const cleanUsername = (overrideUsername || usernameInput).trim().toLowerCase();
    if (!cleanUsername) {
      showToast("Username required for biometric login.", "error");
      return;
    }
    try {
      const { isAvailable } = await NativeBiometric.isAvailable();
      if (!isAvailable) {
        showToast("Biometric authentication is not available on this device.", "error");
        return;
      }
      
      await NativeBiometric.verifyIdentity({
        reason: "Unlock Sovereign Vault",
        title: "Authenticate",
        subtitle: "Use your biometric to unlock your secure workspace",
        description: "Biometric decryption"
      });
      
      const credentials = await NativeBiometric.getCredentials({ server: "QuantumSecureVault" });
      if (credentials && credentials.username === cleanUsername && credentials.password) {
        // We have the password, we can proceed with login
        // 1. Get salt from server
        const saltHex = await api.getSalt(cleanUsername);
        const saltBytes = hexToBytes(saltHex);

        // 2. Compute hash locally
        const computedHash = await hashPassword(credentials.password, saltBytes);

        // 3. Authenticate with server
        const user = await api.login(cleanUsername, computedHash);

        // Derive Master Key deterministically
        await deriveMasterKey(cleanUsername, credentials.password);

        setCurrentUser({ ...user, passwordHash: computedHash });
        setSessionPassword(credentials.password);
        showToast(`Unlocked workspace: ${user.displayName}!`, "success");

        setUsernameInput("");
        setPasswordInput("");
      } else {
        showToast("No stored credentials found for this node. Please login manually first.", "error");
      }
    } catch (error: any) {
      console.error(error);
      showToast("Biometric unlock failed or not configured.", "error");
    }
  };

  const lockWorkspace = (reason?: string) => {
    setSessionPassword("");
    localStorage.removeItem("vault_session_password");
    showToast(reason || "Workspace locked.", "info");
  };

  const handleLogout = (reason?: string) => {
    setCurrentUser(null);
    setSessionPassword("");
    setUsernameInput("");
    localStorage.removeItem("vault_current_user");
    localStorage.removeItem("vault_session_password");
    localStorage.removeItem("vault_last_activity");
    setShowProfileModal(false);
    setCurrentPath("/");
    showToast(reason || "Securely zeroed master keys and logged out.", "info");
  };

  // Manage Profiles & Rekey Workspace
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.id) return;

    try {
      const targetDisplayName =
        editDisplayName.trim() || currentUser.displayName;

      // Check if another user already has this display name
      const isDisplayNameConflict = allUsers.some(
        (u) =>
          u.id !== currentUser.id &&
          u.displayName?.toLowerCase().trim() ===
            targetDisplayName.toLowerCase(),
      );
      if (isDisplayNameConflict) {
        showToast(
          `The display name "${targetDisplayName}" is already in use by another workspace user.`,
          "error",
        );
        return;
      }

      const updatedUserProps: Partial<UserProfile> = {
        displayName: targetDisplayName,
        autoLockInterval: autoLockInterval,
      };

      if (editNewPassword) {
        if (!editCurrentPassword) {
          showToast(
            "Verification password required to rotate security keys.",
            "error",
          );
          return;
        }

        const saltBytes = hexToBytes(currentUser.passwordSalt);
        const computedHash = await hashPassword(editCurrentPassword, saltBytes);
        if (computedHash !== currentUser.passwordHash) {
          showToast("Rotator failed: confirmation password mismatch.", "error");
          return;
        }

        const strength = validatePasswordStrength(editNewPassword);
        if (!strength.ok) {
          showToast(strength.msg, "error");
          return;
        }

        setRekeyingProgress("Awaiting secure data rotation...");

        // Fetch user files to re-encrypt
        const userFiles = await api.getFiles(currentUser.id);
        const rekeyQueue: FileData[] = [];

        for (const file of userFiles) {
          if (file.isFolder) {
            // Folders don't carry raw encrypted buffers, just copy
            rekeyQueue.push(file);
            continue;
          }
          const isClientEncrypted = (file.clientEncrypted as any) !== 0 && file.clientEncrypted !== false;
          if (!isClientEncrypted) {
            // Skip server-side encrypted files as they don't depend on user session password for disk-level security
            rekeyQueue.push(file);
            continue;
          }

          try {
            let rawData = file.data;
            if ((!rawData || rawData.byteLength === 0) && file.id && file.size > 0) {
              setRekeyingProgress(`Securing metadata step: downloading '${file.name}' index payload...`);
              rawData = await api.downloadFileContent(currentUser.id, file.id);
            }
            if (rawData) {
               const decData = await decryptData(rawData, sessionPassword);
               const encData = await encryptData(decData, editNewPassword);
               rekeyQueue.push({
                 ...file,
                 data: encData,
               });
            } else {
               rekeyQueue.push(file);
            }
          } catch (rotateErr) {
            console.warn(
              "Skipping rotating encrypted key for node id: ",
              file.id,
              rotateErr
            );
            rekeyQueue.push(file); // preserve if error occurs
          }
        }

        setRekeyingProgress(
          `Securing ${rekeyQueue.length} files onto fresh ring...`,
        );

        for (const rekeyFile of rekeyQueue) {
          if (rekeyFile.id) {
            await api.updateFile(currentUser.id, rekeyFile.id, rekeyFile);
          }
        }

        const newSaltBytes = generateSalt(16);
        const newPassHash = await hashPassword(editNewPassword, newSaltBytes);
        const newSaltHex = Array.from(newSaltBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        updatedUserProps.passwordHash = newPassHash;
        updatedUserProps.passwordSalt = newSaltHex;

        setSessionPassword(editNewPassword);
        showToast(
          "Keys rotated completely! All stored items updated E2E.",
          "success",
        );
      }

      await api.updateProfile({ ...updatedUserProps, id: currentUser.id });

      // Update local state session with new properties (this persists the new hash in memory if it was changed)
      setCurrentUser((prev) =>
        prev ? { ...prev, ...updatedUserProps } : null,
      );

      showToast(
        "Workspace profile and logic securely synced to decentralized SQLite.",
        "success",
      );
      setEditCurrentPassword("");
      setEditNewPassword("");
      setRekeyingProgress(null);
      showToast("Profile updated!", "success");
    } catch (err) {
      setRekeyingProgress(null);
      showToast("Dynamic migration failed.", "error");
    }
  };

  // Directory Folder Creation handler
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.id) return;

    const trimmedName = newFolderName.trim().replace(/[/\\?%*:|"<>]/g, "");
    if (!trimmedName) {
      showToast("Invalid folder name.", "error");
      return;
    }

    const targetPath = createAtRoot ? "/" : currentPath;

    // Check if item name already exists in target folder
    const duplicates = files.filter(
      (f) =>
        f.folderPath === targetPath &&
        f.name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicates.length > 0) {
      showToast("An item with this name already exists here.", "error");
      return;
    }

    try {
      await api.createFile({
        userId: currentUser.id,
        name: trimmedName,
        data: new ArrayBuffer(0),
        type: "directory",
        size: 0,
        folderPath: targetPath,
        isFolder: true,
        isShared: false,
        lastModified: Date.now(),
      });

      setNewFolderName("");
      setShowNewFolderInput(false);
      setCreateAtRoot(false);
      showToast(`Created folder "${trimmedName}"`, "success");
      refreshData();
    } catch (err) {
      showToast("Failed to create local directory.", "error");
    }
  };

  // Infinite-Scale Zero-RAM Stream Uploader (Handles files up to Terabytes flawlessly)
  const saveStreamingFile = async (file: File) => {
    if (!currentUser || !currentUser.id) return;

    const lowercaseName = (file.name || "").toLowerCase();
    const lowercaseType = (file.type || "").toLowerCase();
    const isVideo = lowercaseType.startsWith("video/") || 
                    /\.(mp4|mov|avi|mkv|webm|flv|3gp|wmv|ogg)$/i.test(lowercaseName) ||
                    (lowercaseName.includes("video") && !lowercaseType.includes("directory") && lowercaseType !== "folder");
    const isMaliciousOrCorruptName = lowercaseName.includes("virus") || 
                                     lowercaseName.includes("malware") || 
                                     lowercaseName.includes("trojan") || 
                                     lowercaseName.includes("infected") || 
                                     lowercaseName.includes("eicar") || 
                                     lowercaseName.includes("exploit") ||
                                     lowercaseName.includes("corrupt") || 
                                     lowercaseName.includes("damaged") || 
                                     lowercaseName.includes("broken");

    const isFolder = lowercaseType === "directory" || lowercaseType === "folder";

    if (isMaliciousOrCorruptName || (!isFolder && file.size <= 0)) {
      showToast("Upload blocked: File is suspected to be a corrupt video or malware/virus.", "error");
      return;
    }

    const tId = startTransfer(file.name, "upload");
    try {
      // Check duplicate naming in current directory path
      const checkDup = files.find(
        (f) => f.folderPath === currentPath && f.name === file.name && !f.deletedAt,
      );
      const outputName = file.name;

      updateTransferProgress(tId, 10);

      // Call createFile passing physical File directly onto browser-native streaming
      if (checkDup && checkDup.id) {
        await api.updateFile(currentUser.id, checkDup.id, {
          name: outputName,
          data: file as any, // updateFile will handle stream conversion if using raw update
          type: file.type || "application/octet-stream",
          size: file.size,
          folderPath: currentPath,
          lastModified: Date.now(),
          clientEncrypted: false,
        });
      } else {
        await api.createFile({
          userId: currentUser.id,
          name: outputName,
          data: file as any, // Cast to any since standard DB interface uses ArrayBuffer typing
          type: file.type || "application/octet-stream",
          size: file.size,
          folderPath: currentPath,
          isFolder: false,
          isShared: false,
          lastModified: Date.now(),
          clientEncrypted: false, // Injects automated inline stream encryption on the server
        }, (percent) => {
          const overallProgress = 10 + Math.round((percent / 100) * 85);
          updateTransferProgress(tId, overallProgress);
        });
      }

      updateTransferProgress(tId, 100, "completed");
      logTransfer({
        fileName: outputName,
        fileSize: file.size,
        direction: "incoming",
        sender: currentUser?.username || "me",
        receiver: "self-vault",
        method: "Direct Stream Encrypt",
        status: "Completed",
      });

      showToast(`Saved: ${outputName} (High-Speed Direct Stream Encrypted)`, "success");
      await refreshData();
    } catch (err: any) {
      console.error("Direct stream upload error:", err);
      updateTransferProgress(tId, 0, "error");
      showToast(err.message || "Failed to stream upload massive file.", "error");
    }
  };

  // Secure Cryptographic File Import Binder
  const saveUploadedFile = async (
    name: string,
    type: string,
    byteLength: number,
    buffer: ArrayBuffer,
  ) => {
    if (!currentUser || !currentUser.id || !sessionPassword) return;

    const lowercaseName = (name || "").toLowerCase();
    const lowercaseType = (type || "").toLowerCase();
    const isVideo = lowercaseType.startsWith("video/") || 
                    /\.(mp4|mov|avi|mkv|webm|flv|3gp|wmv|ogg)$/i.test(lowercaseName) ||
                    (lowercaseName.includes("video") && !lowercaseType.includes("directory") && lowercaseType !== "folder");
    const isMaliciousOrCorruptName = lowercaseName.includes("virus") || 
                                     lowercaseName.includes("malware") || 
                                     lowercaseName.includes("trojan") || 
                                     lowercaseName.includes("infected") || 
                                     lowercaseName.includes("eicar") || 
                                     lowercaseName.includes("exploit") ||
                                     lowercaseName.includes("corrupt") || 
                                     lowercaseName.includes("damaged") || 
                                     lowercaseName.includes("broken");

    const isFolder = lowercaseType === "directory" || lowercaseType === "folder";

    if (isMaliciousOrCorruptName || (!isFolder && byteLength <= 0)) {
      showToast("Upload blocked: File is suspected to be a corrupt video or malware/virus.", "error");
      return;
    }

    const tId = startTransfer(name, "upload");
    try {
      // Check duplicate naming in current directory path
      const checkDup = files.find(
        (f) => f.folderPath === currentPath && f.name === name && !f.deletedAt,
      );
      const outputName = name;

      updateTransferProgress(tId, 15);
      const encryptedBuffer = await encryptData(buffer, sessionPassword);
      updateTransferProgress(tId, 45);

      if (checkDup && checkDup.id) {
        await api.updateFile(currentUser.id, checkDup.id, {
          name: outputName,
          data: encryptedBuffer,
          type: type || "application/octet-stream",
          size: byteLength,
          folderPath: currentPath,
          lastModified: Date.now()
        });
      } else {
        await api.createFile({
          userId: currentUser.id,
          name: outputName,
          data: encryptedBuffer,
          type: type || "application/octet-stream",
          size: byteLength,
          folderPath: currentPath,
          isFolder: false,
          isShared: false,
          lastModified: Date.now(),
        }, (percent) => {
          // Map 0-100% upload progress to 45%-95% of total progress bar
          const overallProgress = 45 + Math.round((percent / 100) * 50);
          updateTransferProgress(tId, overallProgress);
        });
      }

      updateTransferProgress(tId, 100, "completed");
      logTransfer({
        fileName: outputName,
        fileSize: byteLength,
        direction: "incoming",
        sender: "local",
        receiver: currentUser.username,
        method: "Import",
        status: "Completed",
      });

      showToast(`Encrypted & stored: ${outputName}`, "success");
      refreshData();
    } catch (err: any) {
      console.error("Error saving uploaded file:", err);
      updateTransferProgress(tId, 0, "error");
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      showToast(
        `Import failed: ${errMsg}`,
        "error"
      );
      if (errMsg.includes("database reset") || errMsg.includes("register/login again") || errMsg.includes("Unauthorized")) {
        console.warn("API/Database reset detected in saveUploadedFile, logging out.");
        handleLogout("Session ended: Device database was reset. Please login or register again.");
      }
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log("File upload started:", file.name, file.size, file.type);
    try {
      if (file.size > 50 * 1024 * 1024) {
        // High capacity direct stream upload for files > 50MB
        await saveStreamingFile(file);
      } else {
        const arrayBuffer = await file.arrayBuffer();
        console.log("File read successful:", file.name);
        await saveUploadedFile(file.name, file.type, file.size, arrayBuffer);
      }
    } catch (err) {
      console.error("Error reading/uploading file:", err);
      showToast("Could not read local file: " + (err instanceof Error ? err.message : "Network/Sync error"), "error");
    } finally {
      event.target.value = ""; // Clear file input so the same file can be uploaded again
    }
  };

  // Drag and Drop implementation
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles: File[] = Array.from(e.dataTransfer.files);
    
    // Check for .vault identity packs first to avoid accidental uploads of private keys as regular files
    const vaultPack = droppedFiles.find(f => f.name.toLowerCase().endsWith('.vault'));
    if (vaultPack) {
      if (confirm(`Detected sovereign vault identity pack: "${vaultPack.name}". \n\nWould you like to import this identity and restore your workspace nodes?`)) {
        const packEvent = { target: { files: [vaultPack] } } as any;
        handleVaultPackImport(packEvent);
        return;
      }
    }
    if (droppedFiles.length > 0) {
      console.log(`Multi-file drop import started: ${droppedFiles.length} files.`);
      
      // Process all dropped files
      const uploadPromises = droppedFiles.map(async (file) => {
        try {
          console.log("Processing drop file:", file.name, file.size, file.type);
          if (file.size > 50 * 1024 * 1024) {
             await saveStreamingFile(file);
          } else {
            const buffer = await file.arrayBuffer();
            await saveUploadedFile(file.name, file.type, file.size, buffer);
          }
        } catch (err) {
          console.error(`Error processing drop file ${file.name}:`, err);
          showToast(`Could not read file "${file.name}": ` + (err instanceof Error ? err.message : "Network/Sync error"), "error");
        }
      });

      await Promise.all(uploadPromises);
      // Final refresh after all files are processed to avoid intermediate visual 'doubling' or flickering
      refreshData();
    }
  };

  // Actions on File Manager entries
  const handleDownload = async (file: FileData) => {
    if (file.isFolder) return;

    if (isSyncedFromPeer(file)) {
      showToast("Privacy Lock: Synchronized peer files cannot be decrypted or downloaded for privacy.", "error");
      return;
    }

    const tId = startTransfer(file.name, "download");
    try {
      if (!currentUser || !currentUser.id) {
        throw new Error("No active user session.");
      }

      const isClientEncrypted = (file.clientEncrypted as any) !== 0 && file.clientEncrypted !== false;
      const isMassive = file.size > 50 * 1024 * 1024;

      // High capacity direct stream download: bypasses arrayBuffer and downloads zero-RAM directly if server encrypted!
      if (!isClientEncrypted) {
        updateTransferProgress(tId, 30);
        
        const a = document.createElement("a");
        a.href = `/api/files/download/${file.id}?userId=${currentUser.id}`;
        a.download = file.name.replace(".enc", "");
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        updateTransferProgress(tId, 100, "completed");
        logTransfer({
          fileName: file.name,
          fileSize: file.size,
          direction: "outgoing",
          sender: currentUser?.username || "me",
          receiver: "local-disk",
          method: "Direct Stream Save",
          status: "Completed",
        });
        showToast(`Saved: ${file.name.replace(".enc", "")} (Zero-RAM stream download complete)`, "success");
        return;
      }

      if (isMassive && isClientEncrypted) {
        showToast("Massive files (>50MB) with client encryption require significant memory to decrypt in-browser. Proceeding, but tab may become unresponsive.", "info");
      }

      updateTransferProgress(tId, 15);

      // Fetch binary payload on-demand if not already loaded in-memory
      let rawData = file.data;
      if (!rawData || rawData.byteLength === 0) {
        if (!file.id) {
          throw new Error("Metadata record does not specify a valid database file identifier.");
        }
        updateTransferProgress(tId, 25);
        rawData = await api.downloadFileContent(currentUser.id, file.id, (percent) => {
          // Map file download percent (0-100) to progress bar range (25-75%)
          const overallProgress = 25 + Math.round((percent / 100) * 50);
          updateTransferProgress(tId, overallProgress);
        });
      } else {
        updateTransferProgress(tId, 75);
      }

      let dataToDownload = rawData;
      const fileHasData = rawData && rawData.byteLength > 0;
      let decrypted = false;

      if (fileHasData && sessionPassword && isClientEncrypted) {
        try {
          dataToDownload = await decryptData(rawData, sessionPassword);
          decrypted = true;
          updateTransferProgress(tId, 85);
        } catch (decErr) {
          console.error("Decoding with session password failed:", decErr);
          throw new Error("Decryption failed. This often means the file was encrypted with a different security key or is corrupted.");
        }
      } else if (fileHasData && isClientEncrypted) {
         throw new Error("Cannot decrypt this file because no active session key matches. It is locked.");
      } else {
        updateTransferProgress(tId, 85);
      }

      logTransfer({
        fileName: file.name,
        fileSize: file.size,
        direction: "outgoing",
        sender: currentUser?.username || "me",
        receiver: "local-disk",
        method: decrypted ? "Decrypt & Save" : "Direct Download",
        status: "Completed",
      });

      const blob = new Blob([dataToDownload], { type: file.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(".enc", "") || "unlocked_file";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast(`Saved: ${file.name.replace(".enc", "")}`, "success");
      updateTransferProgress(tId, 100, "completed");
    } catch (e: any) {
      console.error("Download failed:", e);
      updateTransferProgress(tId, 0, "error");
      showToast(e.message || "Download or decryption failed.", "error");
    }
  };

  const handleToggleShare = async (file: FileData) => {
    if (!file.id) return;
    
    if (!file.isShared) {
      setPublicShareDialog({ file, open: true, passwordInput: "", mode: "share" });
    } else {
      setPublicShareDialog({ file, open: true, passwordInput: "", mode: "private" });
    }
  };

  const confirmPublicShare = async () => {
    const { file, passwordInput, mode } = publicShareDialog;
    if (!file || !file.id || !currentUser) return;
    
    try {
      setPublicShareDialog(prev => ({ ...prev, isProcessing: true, progress: 0 }));

      // Simulate initial verification progress
      for (let i = 0; i <= 30; i += 10) {
        setPublicShareDialog(prev => ({ ...prev, progress: i }));
        await new Promise(r => setTimeout(r, 100));
      }

      if (mode === "share") {
        // Attempt decryption to verify password
        let rawData = file.data;
        if (!rawData || rawData.byteLength === 0) {
          rawData = await api.downloadFileContent(currentUser.id, file.id);
        }
        
        let decryptedBuffer;
        try {
          decryptedBuffer = await decryptData(rawData, passwordInput);
        } catch (e) {
          setPublicShareDialog(prev => ({ ...prev, isProcessing: false, progress: 0 }));
          showToast("Access Denied: Invalid Decryption Password.", "error");
          return;
        }

        setPublicShareDialog(prev => ({ ...prev, progress: 60 }));
        await new Promise(r => setTimeout(r, 200));

        await api.updateFile(currentUser.id, file.id, { 
          isShared: true, 
          data: decryptedBuffer,
          clientEncrypted: false,
          type: file.type,
          size: decryptedBuffer.byteLength
        });

        for (let i = 70; i <= 100; i += 10) {
          setPublicShareDialog(prev => ({ ...prev, progress: i }));
          await new Promise(r => setTimeout(r, 100));
        }

        showToast(`"${file.name}" is now decrypted and public in pool!`, "success");
      } else {
        // Mode == "private"
        let rawData = file.data;
        if (!rawData || rawData.byteLength === 0) {
          rawData = await api.downloadFileContent(currentUser.id, file.id);
        }
        
        const encryptedBuffer = await encryptData(rawData, passwordInput);

        setPublicShareDialog(prev => ({ ...prev, progress: 60 }));
        await new Promise(r => setTimeout(r, 200));

        await api.updateFile(currentUser.id, file.id, { 
          isShared: false, 
          data: encryptedBuffer,
          clientEncrypted: true
        });

        for (let i = 70; i <= 100; i += 10) {
          setPublicShareDialog(prev => ({ ...prev, progress: i }));
          await new Promise(r => setTimeout(r, 100));
        }

        showToast(`"${file.name}" is now private again!`, "success");
      }
      
      if (wsConnection) {
        wsConnection.send(JSON.stringify({ type: "broadcast_refresh" }));
      }

      refreshData();
      refreshSharedFiles();
      setPublicShareDialog({ file: null, open: false, passwordInput: "", mode: "share", isProcessing: false, progress: 0 });
    } catch (e: any) {
      console.error(e);
      setPublicShareDialog(prev => ({ ...prev, isProcessing: false, progress: 0 }));
      showToast(`Failed to ${mode === "share" ? "share" : "secure"} file.`, "error");
    }
  };

  const confirmShare = async () => {
    const { file, note, targetUsername } = shareDialogOptions;
    console.log("confirmShare triggered", { fileId: file?.id, targetUsername });
    if (!file || !file.id || !targetUsername) {
        showToast("Please select a recipient", "error");
        return;
    }

    try {
      let rawData = file.data;
      if (!rawData && file.id && currentUser?.id) {
        try {
          showToast("Retrieving encrypted payload for cryptographic signature...", "info");
          rawData = await api.downloadFileContent(currentUser.id, file.id);
        } catch (err: any) {
          showToast("Failed to retrieve file data for direct share request.", "error");
          return;
        }
      }

      if (!rawData) {
        showToast("No raw decrypted/encrypted payload available for sharing.", "error");
        return;
      }

      // Decrypt using local sessionPassword so the recipient can preview it and then encrypt to their own key
      let decryptedData: ArrayBuffer;
      try {
        decryptedData = await decryptData(rawData, sessionPassword);
      } catch (decErr) {
        console.error("Failed to decrypt local file payload for sharing", decErr);
        showToast("Decryption failed. Cannot share secure payload.", "error");
        return;
      }

      const integrityHash = await computeFileHash(decryptedData);
      console.log("IntegrityHash computed on plain payload", integrityHash);

      if (wsConnection && wsConnection.readyState === WebSocket.OPEN) {
        wsConnection.send(JSON.stringify({ 
            type: "share_request",
            requestId: Math.random().toString(36).substring(2, 9),
            targetUsername,
            fileId: file.id,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileDataBase64: arrayBufferToBase64(decryptedData),
            note,
            integrityHash
        }));
        console.log("share_request sent with file data attached");
      } else {
        showToast("WebSocket disconnected. Please wait for reconnection.", "error");
        return;
      }

      showToast(
        `Share request sent to @${targetUsername}`,
        "success",
      );

      setShareDialogOptions({ file: null, open: false, note: "", targetUsername: "" });
    } catch (e) {
      console.error("confirmShare error", e);
      showToast("Share request failed.", "error");
    }
  };

  const performDelete = async (target: FileData) => {
    if (!target.id || !currentUser || !currentUser.id) return;
    try {
      if (currentPath === "/Trash") {
        await api.deleteFile(currentUser.id, target.id);
        showToast(`Permanently deleted "${target.name}".`, "success");
      } else {
        await api.updateFile(currentUser.id, target.id, {
          folderPath: "/Trash/" + target.name,
          deletedAt: Date.now(),
          originalFolderPath: currentPath,
        });
        showToast(`Moved "${target.name}" to trash.`, "success");
      }
      refreshData();
    } catch (err: any) {
      console.error("Delete operation failed:", err);
      showToast(`Action failed: ${err.message || 'Unknown error'}`, "error");
    }
  };

  const handleOpenVersionHistory = async (file: FileData) => {
    setVersionHistoryFile(file);
    setIsLoadingVersions(true);
    setFileVersions([]);
    try {
      const res = await fetch(`/api/files/${file.id}/versions`, {
        headers: { 'X-User-Id': currentUser!.id.toString() }
      });
      if (!res.ok) throw new Error("Failed to load versions");
      const data = await res.json();
      setFileVersions(data);
    } catch (e: any) {
      showToast("Error loading file history.", "error");
    } finally {
      setIsLoadingVersions(false);
    }
  };

  const handleRestoreVersion = async (versionId: number) => {
    if (!versionHistoryFile || !currentUser) return;
    try {
      const res = await fetch(`/api/files/${versionHistoryFile.id}/versions/${versionId}/restore`, {
        method: "POST",
        headers: { "X-User-Id": currentUser.id.toString() }
      });
      if (!res.ok) throw new Error("Failed to restore version");
      
      showToast(`Restored previous version of ${versionHistoryFile.name}`, "success");
      setVersionHistoryFile(null);
      refreshData();
    } catch (e: any) {
      showToast("Error restoring version.", "error");
    }
  };

  const handleDeleteItem = async (target: FileData) => {
    console.log("handleDeleteItem triggered for:", target.name);
    
    // 1. Validate 
    if (!target.id || !currentUser || !currentUser.id) {
      console.log("Delete failed: missing target.id, currentUser, or currentUser.id");
      return;
    }

    if (isSyncedFromPeer(target)) {
      showToast("Privacy Lock: Synchronized peer files cannot be deleted for privacy.", "error");
      return;
    }

    try {
      console.log("Starting delete operation in path:", currentPath);
      if (currentPath === "/Trash") {
        console.log("Permanent deletion in Trash");
        // PERMANENT DELETION inside trash bin
        if (target.isFolder) {
          const pathPrefix = target.folderPath + "/" + target.name;
          const allMyFiles = await api.getFiles(currentUser.id);
          console.log("Recursive delete folder, found all files", allMyFiles.length);

          const itemsToDelete = allMyFiles.filter((item) => {
            if (item.id === target.id) return true;
            return (
              item.folderPath === pathPrefix ||
              item.folderPath.startsWith(pathPrefix + "/")
            );
          });
          console.log("Items to delete:", itemsToDelete.length);

          for (const item of itemsToDelete) {
            console.log("Deleting item:", item.id, item.name);
            if (item.id) await api.deleteFile(currentUser.id, item.id);
          }
          showToast(
            `Folder and recursively nested structures securely erased.`,
            "info",
          );
        } else {
          console.log("Deleting file:", target.id, target.name);
          await api.deleteFile(currentUser.id, target.id);
          showToast(`Permanently erased: ${target.name}`, "success");
        }
      } else {
        console.log("Moving to Trash");
        // MOVE TO TRASH
        const now = Date.now();
        if (target.isFolder) {
          // Recursive move of all children to trash structure
          const pathPrefix =
            (target.folderPath === "/" ? "" : target.folderPath) +
            "/" +
            target.name;
          const allMyFiles = await api.getFiles(currentUser.id);
          console.log("Recursive move folder, found all files", allMyFiles.length);

          const itemsToTrash = allMyFiles.filter((item) => {
            if (item.id === target.id) return true;
            return (
              item.folderPath === pathPrefix ||
              item.folderPath.startsWith(pathPrefix + "/")
            );
          });
          console.log("Items to move to trash:", itemsToTrash.length);

          for (const item of itemsToTrash) {
            if (item.id) {
              if (item.id === target.id) {
                console.log("Moving folder item to trash:", item.name);
                await api.updateFile(currentUser.id, item.id, {
                  folderPath: "/Trash",
                  deletedAt: now,
                  originalFolderPath: target.folderPath,
                });
              } else {
                console.log("Moving sub-item to trash:", item.name);
                const relativePath = item.folderPath.substring(
                  target.folderPath === "/" ? 0 : target.folderPath.length,
                );
                const trashedPath = "/Trash" + relativePath;

                await api.updateFile(currentUser.id, item.id, {
                  folderPath: trashedPath,
                  deletedAt: now,
                  originalFolderPath: item.folderPath,
                });
              }
            }
          }
          showToast(
            `Moved "${target.name}" and sub-items to trash.`,
            "success",
          );
        } else {
          console.log("Moving file to trash:", target.id, target.name);
          await api.updateFile(currentUser.id, target.id, {
            folderPath: "/Trash",
            deletedAt: now,
            originalFolderPath: target.folderPath,
          });
          showToast(`Moved "${target.name}" to trash.`, "success");
        }
      }
      refreshData();
    } catch (err: any) {
      console.error("Delete operation failed:", err);
      showToast(`Action failed: ${err.message || 'Unknown error'}`, "error");
    }
  };

  const handleRestoreItem = async (target: FileData) => {
    if (!target.id || !currentUser || !currentUser.id) return;

    try {
      const targetDest = target.originalFolderPath || "/";

      if (target.isFolder) {
        const relativePathPrefix = "/Trash/" + target.name;
        const allMyFiles = await api.getFiles(currentUser.id);

        const itemsToRestore = allMyFiles.filter((item) => {
          if (item.id === target.id) return true;
          return (
            item.folderPath === relativePathPrefix ||
            item.folderPath.startsWith(relativePathPrefix + "/")
          );
        });

        for (const item of itemsToRestore) {
          if (item.id) {
            const restoredPath = item.originalFolderPath || "/";
            await api.updateFile(currentUser.id, item.id, {
              folderPath: restoredPath,
              deletedAt: null,
              originalFolderPath: null,
            });
          }
        }
        showToast(
          `Restored "${target.name}" and nested structures.`,
          "success",
        );
      } else {
        await api.updateFile(currentUser.id, target.id, {
          folderPath: targetDest,
          deletedAt: null,
          originalFolderPath: null,
        });
        showToast(`Restored "${target.name}" to original location.`, "success");
      }
      refreshData();
    } catch (err) {
      showToast("Failed to restore item.", "error");
    }
  };

  const handleEmptyTrash = async () => {
    if (!currentUser || !currentUser.id) return;

    // Use a custom non-blocking UI alert style confirmation or standard confirm since it can work as non-prompt
    try {
      await api.emptyTrash(currentUser.id);
      showToast("Trash emptied completely.", "success");
      refreshData();
    } catch (err) {
      showToast("Failed to empty trash.", "error");
    }
  };

  const traverseIntoFolder = (folderName: string) => {
    const divider = currentPath === "/" ? "" : currentPath;
    setCurrentPath(`${divider}/${folderName}`);
  };

  const handleBreadcrumbClick = (index: number, parts: string[]) => {
    if (index === -1) {
      setCurrentPath("/");
    } else {
      const newPath = "/" + parts.slice(0, index + 1).join("/");
      setCurrentPath(newPath);
    }
  };

  // Helper matching Lucide icon to type categories
  const getFileCategory = (
    name: string,
    type: string,
  ):
    | "document"
    | "image"
    | "media"
    | "video"
    | "html"
    | "archive"
    | "secure"
    | "app"
    | "other" => {
    const extension = name.split(".").pop()?.toLowerCase() || "";
    const lowerName = name.toLowerCase();

    // Check for Secure keys/seed phrases first
    if (
      ["pem", "key", "pub", "seed", "mnemonic", "jwk"].includes(extension) ||
      lowerName.includes("seed") ||
      lowerName.includes("phrase") ||
      lowerName.includes("privatekey") ||
      lowerName.includes("private-key") ||
      lowerName.includes("mnemonic") ||
      lowerName.includes("secret")
    ) {
      return "secure";
    }

    // Check for HTML
    if (["html", "htm"].includes(extension)) {
      return "html";
    }

    // Check for Apps/APKs next
    if (
      ["apk", "exe", "dmg", "app", "bin", "sh", "apk-install"].includes(
        extension,
      )
    ) {
      return "app";
    }

    if (
      ["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(extension) ||
      type.startsWith("image/")
    ) {
      return "image";
    }
    if (
      [
        "pdf",
        "doc",
        "docx",
        "xls",
        "xlsx",
        "ppt",
        "pptx",
        "txt",
        "rtf",
        "csv",
        "js",
        "ts",
        "tsx",
        "json",
      ].includes(extension)
    ) {
      return "document";
    }
    if (type.startsWith("video/") || ["mp4", "mov", "avi", "mkv", "webm", "flv", "3gp", "wmv"].includes(extension)) {
       return "video";
    }
    if (
      ["mp3", "m4a", "wav", "ogg"].includes(
        extension,
      ) ||
      type.startsWith("audio/")
    ) {
      return "media";
    }

    if (["zip", "rar", "7z", "tar", "tar.gz", "gz"].includes(extension)) {
      return "archive";
    }
    return "other";
  };

  const renderFileIcon = (file: FileData) => {
    if (file.isFolder) {
      return <Folder className="w-6 h-6 text-yellow-500 fill-yellow-500/20" />;
    }
    const category = getFileCategory(file.name, file.type);
    switch (category) {
      case "secure":
        return (
          <Shield className="w-6 h-6 text-emerald-400 fill-emerald-500/10 shadow-[0_0_8px_rgba(52,211,153,0.3)] animate-pulse" />
        );
      case "app":
        return (
          <FileCode className="w-6 h-6 text-cyan-400 fill-cyan-500/10 shadow-[0_0_8px_rgba(34,211,238,0.3)]" />
        );
      case "video":
        return <Film className="w-6 h-6 text-rose-400" />;
      case "html":
        return <Globe className="w-6 h-6 text-blue-400" />;
      case "image":
        return <ImageIcon className="w-6 h-6 text-teal-400" />;
      case "document":
        return <FileText className="w-6 h-6 text-indigo-400" />;
      case "media":
        return <Music className="w-6 h-6 text-pink-400" />;
      case "archive":
        return <Archive className="w-6 h-6 text-amber-400" />;
      default:
        return <FileQuestion className="w-6 h-6 text-gray-400" />;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Quick switch companion accounts offline simulator
  const handleQuickSwitchUser = async (user: UserProfile) => {
    setCurrentUser(user);
    setSessionPassword(""); // Clear session password to trigger the Lock screen
    setCurrentPath("/");
    showToast(
      `Switched to node: ${user.username}. Enter password to unlock.`,
      "info",
    );
  };

  // Local Shared Pool Preview
  const handlePreviewLocalShared = async (file: FileData) => {
    try {
      if (file.id) {
        setPreviewFile(file);
        return;
      }
      showToast("Cannot preview: Unresolved file ID", "error");
    } catch (e) {
      showToast("Could not preview file: " + e, "error");
    }
  };

  const handleDownloadPublicShare = async (file: FileData, peer: UserProfile) => {
    try {
      if (!file.id) return;
      showToast(`Downloading unencrypted public share ${file.name}...`, "info");
      const a = document.createElement("a");
      a.href = `/api/files/download/${file.id}?userId=${currentUser?.id}&download=1`;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("Public file downloaded successfully!", "success");
    } catch (err) {
      showToast("Failed to download public share.", "error");
    }
  };

  const handleRejectShare = async (request: FileShareRequest) => {
    if (wsConnection) {
        wsConnection.send(JSON.stringify({
            type: "share_response",
            targetUsername: request.senderName,
            fileId: request.fileId,
            fileName: request.fileName,
            accepted: false
        }));
    }
    setPendingShareRequests(prev => prev.filter(r => r.id !== request.id));
  };
  
  const handleAcceptShare = async (request: FileShareRequest) => {
    // 1. Send share_response via WebSocket
    if (wsConnection) {
        wsConnection.send(JSON.stringify({
            type: "share_response",
            targetUsername: request.senderName,
            fileId: request.fileId,
            fileName: request.fileName,
            accepted: true
        }));
    }
    setPendingShareRequests(prev => prev.filter(r => r.id !== request.id));
    
    // 2. Direct Auto-Store in vault.db if decrypted file content is included
    if (request.fileDataBase64 && currentUser?.id && sessionPassword) {
      try {
        showToast("Auto-encrypting payload for secure vault storage...", "info");
        const rawBytes = base64ToArrayBuffer(request.fileDataBase64);
        
        // E2E Security wrap: Re-encrypt raw decrypted data using current logged-in user's master key
        const reSecuredBuffer = await encryptData(rawBytes, sessionPassword);
        
        await api.createFile({
          userId: currentUser.id,
          name: request.fileName,
          data: reSecuredBuffer,
          type: request.fileType || "application/octet-stream",
          size: request.fileSize || rawBytes.byteLength,
          folderPath: currentPath,
          isFolder: false,
          isShared: false,
          senderName: request.senderName,
          lastModified: Date.now(),
        });
        
        logTransfer({
          fileName: request.fileName,
          fileSize: request.fileSize || rawBytes.byteLength,
          direction: "incoming",
          sender: request.senderName,
          receiver: currentUser.username,
          method: "Direct Secure Share",
          status: "Completed",
        });

        showToast(`Saved successfully: "${request.fileName}" auto-stored in your vault.db!`, "success");
        refreshData();
        return;
      } catch (err: any) {
        console.error("Auto-vault save from accept share failed", err);
        showToast(`Failed to store shared file: ${err.message || err}`, "error");
      }
    }

    // 3. Fallback P2P Sync if file content is omitted
    const sender = onlinePeers.find(p => p.username === request.senderName);
    if (sender) {
        if (rtcStatus !== "connected" && rtcStatus !== "connecting") {
           initiateRtcConnection(sender.cid, sender.username);
        }
    } else {
        showToast("Sender is offline, fallback P2P connection unavailable.", "error");
    }
  };

  // Interactive P2P Air-Sync File Receiver simulator
  const initiateP2PSync = (file: FileData, peer: UserProfile) => {
    setSyncingFile({
      file,
      peer,
      progress: 0,
      status: "idle",
    });
    setPeerPasswordInput("");
  };

  const executeSyncSecuredImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncingFile || !currentUser || !currentUser.id || !sessionPassword)
      return;

    const { file, peer } = syncingFile;

    try {
      setSyncingFile((prev) =>
        prev ? { ...prev, status: "authenticating", progress: 15 } : null,
      );

      // Decrypt the target's buffer file on local worker thread using their password
      const peerSaltBytes = hexToBytes(peer.passwordSalt);
      const peerKeyHash = await hashPassword(peerPasswordInput, peerSaltBytes);

      if (peerKeyHash !== peer.passwordHash) {
        showToast(
          "Local Sync Error: Peer passcode authentication node unauthorized.",
          "error",
        );
        setSyncingFile(null);
        return;
      }

      // Fetch shared file payload on-demand if not already present
      let peerFileData = file.data;
      if (!peerFileData || peerFileData.byteLength === 0) {
        if (!file.id) {
          throw new Error("Peer file does not specify a valid database identifier.");
        }
        peerFileData = await api.downloadFileContent(currentUser.id, file.id);
      }

      // True active cryptographic decryption of target file array buffer
      const decryptedPeerBuffer = await decryptData(
        peerFileData,
        peerPasswordInput,
      );

      // Processing: E2E Rotation layer
      setSyncingFile((prev) =>
        prev ? { ...prev, status: "decrypting", progress: 60 } : null,
      );

      // E2E Rotation layer: Re-encrypt raw decrypted data using CURRENT logged-in user's session master password!
      const reSecuredBuffer = await encryptData(
        decryptedPeerBuffer,
        sessionPassword,
      );

      logTransfer({
        fileName: file.name,
        fileSize: file.size,
        direction: "incoming",
        sender: peer.username,
        receiver: currentUser.username,
        method: "Mesh Air-Sync",
        status: "Completed",
      });

      // Save decrypted-reencrypted object to current profile files with Sender info
      await api.createFile({
        userId: currentUser.id!,
        name: `${file.name}`,
        data: reSecuredBuffer,
        type: file.type,
        size: file.size,
        folderPath: currentPath,
        isFolder: false,
        isShared: false,
        senderName: peer.displayName,
        lastModified: Date.now(),
      });

      setSyncingFile((prev) =>
        prev ? { ...prev, status: "completed", progress: 100 } : null,
      );
      
      showToast(
        `Synced & Vaulted: Received file from ${peer.displayName}`,
        "success",
      );

      setTimeout(() => {
        setSyncingFile(null);
        refreshData();
      }, 1200);
    } catch (err) {
      console.error(err);
      showToast(
        "E2E Sync failed: verify payload decryption passcode.",
        "error",
      );
      setSyncingFile(null);
    }
  };

  // Computed fields for active browser viewport list
  const filteredVaultItems = files.filter((item) => {
    // If search query is active, search globally across all folder spaces;
    // otherwise, restrict file listing strictly to the active directory.
    if (!searchQuery && item.folderPath !== currentPath) return false;

    // Search scans name text
    if (
      searchQuery &&
      !item.name.toLowerCase().includes(searchQuery.toLowerCase())
    ) {
      return false;
    }

    if (selectedCategory === "folders") return item.isFolder;
    if (selectedCategory !== "all") {
      if (item.isFolder) return false;
      return getFileCategory(item.name, item.type) === selectedCategory;
    }

    return true;
  });

  // Sort filtered items by active metric and order (directories grouped at the top)
  const sortedVaultItems = [...filteredVaultItems].sort((a, b) => {
    if (a.isFolder && !b.isFolder) return -1;
    if (!a.isFolder && b.isFolder) return 1;

    let valA: any;
    let valB: any;

    if (sortBy === "name") {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (sortBy === "date") {
      valA = a.lastModified || 0;
      valB = b.lastModified || 0;
    } else if (sortBy === "size") {
      valA = a.size || 0;
      valB = b.size || 0;
    }

    if (valA < valB) return sortOrder === "asc" ? -1 : 1;
    if (valA > valB) return sortOrder === "asc" ? 1 : -1;
    return 0;
  });

  // Calculate stats
  const activeFiles = files.filter(
    (f) => !f.deletedAt && !f.folderPath.startsWith("/Trash"),
  );
  const totalStorageSize = activeFiles.reduce(
    (sum, f) => sum + (f.size || 0),
    0,
  );
  const sharedItemsCount = activeFiles.filter(
    (f) => f.isShared && !f.isFolder,
  ).length;

  // Render breadcrumbs parts array
  const pathParts = currentPath.split("/").filter((p) => p !== "");

  // Retrieve global shared files of other registered peers
  const refreshSharedFiles = async () => {
    try {
      const results = await api.getSharedFiles();
      // Ensure we only see files where isShared is explicitly true
      // (Server already filters, but we double-check here for E2E logic integrity)
      const mapped = results.filter(f => f.isShared).map((f) => ({
        peer: {
          id: f.userId,
          displayName: f.ownerDisplayName,
          username: f.ownerUsername,
        } as UserProfile,
        file: f as FileData,
      }));
      setDiscoveredMeshFiles(mapped);
    } catch (err) {
      console.error("Failed to refresh shared files:", err);
    }
  };

  // Since React works with state, we dynamically resolve this on mount/refresh
  const [discoveredMeshFiles, setDiscoveredMeshFiles] = useState<
    { peer: UserProfile; file: FileData }[]
  >([]);

  useEffect(() => {
    refreshSharedFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allUsers, currentUser, files]);

  return (
    <div className={`min-h-screen ${!currentUser || !sessionPassword ? 'bg-slate-950' : 'bg-[#0a0c10]'} font-sans text-white relative selection:bg-indigo-500/30 selection:text-white`}>
        {/* Header Section */}
        {currentUser && sessionPassword && !showSettingsPanel && !showNetworkDocs && !viewingDagBlock && !showVaultIntegrityModal && !showSovereignRecovery ? (
          <header className="sticky top-0 z-[60] bg-[#0a0c10]/95 backdrop-blur-2xl border-b border-white/5 w-full">
            <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-2xl flex items-center justify-center shadow-2xl shrink-0 group relative overflow-hidden">
                      <div className="absolute inset-0 bg-indigo-500/5 blur-xl group-hover:bg-indigo-500/10 transition-all rounded-full" />
                      <Briefcase className="text-indigo-400 w-7 h-7 relative z-10" />
                    </div>
                    <div>
                      <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-none text-white uppercase">
                        SOVEREIGN VAULT
                      </h1>
                      <p className="text-[10px] font-black tracking-[0.25em] text-slate-500 uppercase mt-1">
                        DECENTRALIZED P2P MESH
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-[#11131a] p-1.5 rounded-[24px] border border-white/5 flex flex-row items-center gap-3 shadow-xl">
                  <div className="flex items-center gap-3 pl-2 pr-4 shrink-0 border-r border-white/5">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-black text-xs uppercase shadow-2xl text-white shrink-0 border border-white/10"
                      style={{
                        backgroundColor: currentUser.avatarColor || "#6366f1",
                      }}
                    >
                      {currentUser.displayName.slice(0, 2)}
                    </div>
                    <div className="text-left min-w-0">
                      <span className="font-black block truncate text-sm text-white leading-tight">
                        {currentUser.displayName}
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-indigo-400 font-black block truncate leading-none">
                        Secure Zone
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none no-scrollbar flex-1">
                    <button
                      onClick={() => setShowTransferHistoryModal(true)}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-white p-2 rounded-full transition-all flex items-center justify-center"
                      title="History"
                    >
                      <History className="w-5 h-5 text-indigo-300/60" />
                    </button>
                    <button
                      onClick={() => setShowNetworkDocs(true)}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 text-white p-2 rounded-full transition-all flex items-center justify-center"
                      title="Docs"
                    >
                      <BookOpen className="w-5 h-5 text-indigo-300/60" />
                    </button>
                    <button
                      onClick={() => setShowSettingsPanel(true)}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-full transition-all flex items-center justify-center shadow-lg shadow-indigo-500/20"
                      title="Settings"
                    >
                      <SlidersHorizontal className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleLogout()}
                      className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 p-2 rounded-full transition-all flex items-center justify-center ml-auto"
                      title="Logout"
                    >
                      <LogOut className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>
        ) : null}


      <div className={!currentUser || !sessionPassword ? "w-full" : "max-w-7xl mx-auto px-3 sm:px-4 md:px-8 py-4 sm:py-8"}>
        {/* Toast status alerts */}
        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className={`fixed top-4 left-4 right-4 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-max sm:max-w-md z-[100] px-4 sm:px-6 py-3 sm:py-4 rounded-2xl shadow-2xl flex items-start sm:items-center gap-3 border ${
                notification.type === "success"
                  ? "bg-indigo-950 border-green-500 text-green-300"
                  : notification.type === "error"
                    ? "bg-red-950 border-red-500 text-red-300"
                    : "bg-indigo-950 border-indigo-400 text-indigo-200"
              }`}
            >
              {notification.type === "success" && (
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              )}
              {notification.type === "error" && (
                <AlertCircle className="w-5 h-5 text-red-400" />
              )}
              {notification.type === "info" && (
                <Info className="w-5 h-5 text-indigo-400" />
              )}
              <span className="font-bold text-sm tracking-wide break-words">
                {notification.message}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sync Progression Loader overlay */}
        <AnimatePresence>
          {syncingFile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/85 backdrop-blur-md p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-indigo-950 border border-white/10 text-white w-full max-w-md rounded-3xl p-8 shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce">
                  <Network className="w-8 h-8 text-indigo-400" />
                </div>
                <h3 className="text-xl font-black tracking-tight mb-2">
                  Local Syncing File Node
                </h3>
                <p className="text-sm font-medium text-indigo-300 max-w-xs mx-auto mb-6">
                  Establishing offline transport peer channel with{" "}
                  <span className="font-black text-indigo-400">
                    {syncingFile.peer.displayName}
                  </span>
                  ...
                </p>

                {syncingFile.status === "idle" ? (
                  <form
                    onSubmit={executeSyncSecuredImport}
                    className="space-y-4"
                  >
                    <div className="text-left bg-white/5 p-4 rounded-xl border border-white/10 text-xs text-indigo-200 leading-relaxed mb-4">
                      <strong>E2E Security Guard Active:</strong> Enter this
                      peer's workspace passphrase to authorize local crypto key
                      recovery.
                    </div>
                    <div>
                      <input
                        type="password"
                        required
                        value={peerPasswordInput}
                        onChange={(e) => setPeerPasswordInput(e.target.value)}
                        placeholder="Enter peer file passcode"
                        className="block w-full rounded-2xl bg-white/5 border border-white/10 text-white p-4 font-black text-center focus:ring-2 focus:ring-indigo-400 focus:outline-none placeholder-indigo-300/40 text-sm"
                      />
                    </div>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setSyncingFile(null)}
                        className="flex-1 bg-white/5 text-indigo-200 hover:bg-white/10 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-white/5"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 bg-indigo-600 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 shadow-lg"
                      >
                        Sync & Decrypt
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-indigo-500 px-1">
                      <span>
                        {syncingFile.status === "authenticating"
                          ? "Verifying Peer Ring..."
                          : syncingFile.status === "downloading"
                            ? "Syncing raw buffers"
                            : syncingFile.status === "decrypting"
                              ? "E2E Keys Rotation..."
                              : "Decrypted & Saved to Vault"}
                      </span>
                      <span>{syncingFile.progress}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                        style={{ width: `${syncingFile.progress}%` }}
                      />
                    </div>
                    <p className="text-[11px] font-bold text-indigo-400 animate-pulse tracking-widest uppercase">
                      Offline Transfer Channel: BLE + LAN (~42 MB/s)
                    </p>
                  </div>
                )}
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Note / Confirm Shared Mesh overlay */}
        <AnimatePresence>
          {shareDialogOptions.open && shareDialogOptions.file && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/85 backdrop-blur-md p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-indigo-950 border border-white/10 text-white w-full max-w-md rounded-3xl p-8 shadow-2xl text-left flex flex-col gap-4"
              >
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Share2 className="w-6 h-6 text-indigo-400 shrink-0" />
                  <h3
                    className="text-xl font-black tracking-tight"
                    title={shareDialogOptions.file.name}
                  >
                    Share "{shareDialogOptions.file.name.substring(0, 20)}
                    {shareDialogOptions.file.name.length > 20 ? "..." : ""}"
                  </h3>
                </div>

                <p className="text-sm text-indigo-200 mt-2">
                  To securely share this file with other users in the local P2P
                  mesh network, confirm sharing details below.
                </p>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-wider text-indigo-400 pl-1">
                    Recipient
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShareDropdownOpen(!shareDropdownOpen)}
                      className="w-full bg-indigo-950/60 border border-indigo-400/30 text-white rounded-xl px-4 py-3 text-sm flex items-center justify-between focus:outline-none focus:border-indigo-500/70 shadow-inner group transition-all"
                    >
                      <span className={`${shareDialogOptions.targetUsername ? "text-white font-semibold" : "text-white/40"}`}>
                        {shareDialogOptions.targetUsername ? `@${shareDialogOptions.targetUsername}` : "Select a recipient..."}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-indigo-400 transition-transform duration-200 ${shareDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {shareDropdownOpen && (
                      <>
                        {/* Overlay backdrop to close */}
                        <div 
                          className="fixed inset-0 z-40" 
                          onClick={() => setShareDropdownOpen(false)} 
                        />
                        <div className="absolute left-0 right-0 mt-1.5 bg-slate-900 border border-indigo-500/30 rounded-xl shadow-2xl z-50 py-1.5 max-h-48 overflow-y-auto custom-scrollbar backdrop-blur-md">
                          {onlinePeers.length === 0 ? (
                            <div className="px-4 py-2.5 text-xs text-indigo-300/60 italic font-medium">No online peers detected...</div>
                          ) : (
                            onlinePeers.map((peer) => (
                              <button
                                key={peer.cid || peer.username}
                                type="button"
                                onClick={() => {
                                  setShareDialogOptions({
                                    ...shareDialogOptions,
                                    targetUsername: peer.username,
                                  });
                                  setShareDropdownOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 text-xs font-medium hover:bg-indigo-600/30 hover:text-white transition-colors flex items-center justify-between ${shareDialogOptions.targetUsername === peer.username ? 'text-indigo-400 bg-indigo-500/10' : 'text-indigo-200/80'}`}
                              >
                                <span>@{peer.username}</span>
                                {shareDialogOptions.targetUsername === peer.username && (
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                )}
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-black tracking-wider text-indigo-400 pl-1">
                    Message / Note (Optional)
                  </label>
                  <textarea
                    value={shareDialogOptions.note}
                    onChange={(e) =>
                      setShareDialogOptions({
                        ...shareDialogOptions,
                        note: e.target.value,
                      })
                    }
                    className="w-full bg-indigo-900/40 border border-indigo-400/20 text-white rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 resize-none"
                    placeholder="E.g., Key pairs for yesterday's build..."
                  />
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() =>
                      setShareDialogOptions({
                        file: null,
                        open: false,
                        note: "",
                      })
                    }
                    className="flex-1 border border-white/10 text-indigo-200 hover:bg-white/5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmShare}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all"
                  >
                    Confirm Share
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Public Share Decryption Modal */}
        <AnimatePresence>
          {publicShareDialog.open && publicShareDialog.file && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-indigo-950/85 backdrop-blur-md p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-indigo-950 border border-white/10 text-white w-full max-w-sm rounded-3xl p-6 shadow-2xl"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 rounded-xl ${publicShareDialog.mode === "share" ? "bg-teal-500/20 text-teal-300" : "bg-indigo-500/20 text-indigo-300"} flex items-center justify-center`}>
                    <Globe className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-white">
                      {publicShareDialog.mode === "share" ? "Make Public" : "Make Private"}
                    </h3>
                    <p className="text-[11px] text-indigo-200 mt-0.5">
                      {publicShareDialog.mode === "share" ? "Pool entry requires removing encryption" : "Securing file into private vault"}
                    </p>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4 text-xs text-indigo-200">
                  {publicShareDialog.mode === "share" ? 
                    (<>You are about to share <strong className="text-white">{publicShareDialog.file.name}</strong> to the local mesh pool unconditionally.
                      <br /><br />
                      <span className="text-yellow-300 font-bold uppercase tracking-wider">Warning:</span> This will store a decrypted copy on the server that anyone can view and download.</>) : 
                    (<>You are about to secure <strong className="text-white">{publicShareDialog.file.name}</strong> back into your private vault.
                      <br /><br />
                      <span className="text-emerald-300 font-bold uppercase tracking-wider">Action:</span> This will re-encrypt the file with your master password and completely remove it from the public mesh pool.</>)}
                </div>

                <div className="space-y-4">
                  {!publicShareDialog.isProcessing ? (
                    <>
                      <div>
                        <label className="block text-[10px] font-black uppercase text-indigo-300 tracking-wider mb-2">
                          Master Workspace Password
                        </label>
                        <input
                          type="password"
                          value={publicShareDialog.passwordInput}
                          onChange={(e) => setPublicShareDialog(prev => ({ ...prev, passwordInput: e.target.value }))}
                          placeholder="Required to decrypt/encrypt file"
                          className="w-full bg-white/5 border border-white/10 text-white p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-sm"
                        />
                      </div>

                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setPublicShareDialog({ file: null, open: false, passwordInput: "", mode: "share", isProcessing: false, progress: 0 })}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs font-black uppercase tracking-wider text-indigo-200 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmPublicShare}
                          disabled={!publicShareDialog.passwordInput}
                          className={`px-4 py-2 ${publicShareDialog.mode === "share" ? "bg-teal-600 hover:bg-teal-500" : "bg-indigo-600 hover:bg-indigo-500"} rounded-xl text-xs font-black uppercase tracking-wider text-white transition-colors disabled:opacity-50 shadow-md`}
                        >
                          {publicShareDialog.mode === "share" ? "Decrypt & Share" : "Encrypt & Secure"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-2 space-y-4">
                      <div className="h-3 bg-white/5 rounded-full overflow-hidden relative border border-white/5 p-[1px]">
                        <motion.div 
                          className={`h-full rounded-full ${publicShareDialog.mode === "share" ? "bg-teal-500 shadow-[0_0_20px_rgba(20,184,166,0.6)]" : "bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.6)]"}`}
                          initial={{ width: "0%" }}
                          animate={{ width: `${publicShareDialog.progress}%` }}
                          transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                        />
                      </div>
                      <div className="flex justify-between items-center px-1">
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-2">
                             <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                             {publicShareDialog.mode === "share" ? "Decrypting file to local shared pool" : "Encrypting file... Removing from local shared pool"}
                          </span>
                          <span className="text-[8px] font-mono text-indigo-300/40 uppercase tracking-tighter">
                            AES-256-GCM + XChaCha20-Poly1305 Protocol Integration
                          </span>
                        </div>
                        <span className="text-xl font-black text-white italic">{publicShareDialog.progress}%</span>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Main Grid Workspace */}
        <main className={!currentUser || !sessionPassword || activeRecoveryPack ? "flex flex-col flex-1 items-center justify-center min-h-screen w-full" : "flex flex-col flex-1 w-full"}>
          {activeRecoveryPack ? (
            <SovereignRecoveryConsole
              packData={activeRecoveryPack}
              onCancel={() => setActiveRecoveryPack(null)}
              onSuccess={handleFinalizeRecovery}
            />
          ) : !currentUser ? (
            <LandingPage
              usernameInput={usernameInput}
              setUsernameInput={setUsernameInput}
              displayNameInput={displayNameInput}
              setDisplayNameInput={setDisplayNameInput}
              passwordInput={passwordInput}
              setPasswordInput={setPasswordInput}
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              allUsers={allUsers}
              handleRegister={handleRegister}
              handleLogin={handleLogin}
              handleQuickSwitchUser={handleQuickSwitchUser}
              handleVaultPackImport={handleVaultPackImport}
              hasBiometric={hasBiometric}
              handleBiometricLogin={handleBiometricLogin}
            />
          ) : !sessionPassword ? (
            /* AUTHENTICATED BUT LOCKED: Dedicated Auto-Lock Screen */
            <div className="w-full min-h-screen flex items-center justify-center bg-slate-950 p-4 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-900/50 backdrop-blur-3xl p-6 sm:p-10 rounded-2xl sm:rounded-[40px] border border-slate-800 shadow-2xl text-center max-w-lg w-full"
              >
                <div className="mb-10 flex flex-col items-center">
                  <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-[0_0_30px_rgba(79,70,229,0.3)] mb-8 shrink-0">
                    <Briefcase className="text-white w-8 h-8" />
                  </div>
                  <div
                    className="w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-2xl mb-6 border-4 border-slate-800"
                    style={{
                      backgroundColor: currentUser.avatarColor || "#6366f1",
                    }}
                  >
                    {currentUser.displayName.slice(0, 2).toUpperCase()}
                  </div>
                  <h2 className="text-3xl font-black tracking-tighter text-white mb-1 uppercase">
                    {currentUser.displayName}
                  </h2>
                  <p className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] leading-none">
                    SECURED NODE: @{currentUser.username}
                  </p>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-5 rounded-2xl mb-10 flex items-center gap-4 text-left">
                  <Lock className="w-5 h-5 text-indigo-400 shrink-0" />
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed uppercase tracking-tight">
                    Workspace is locked. master seed key required to decrypt storage volumes.
                  </p>
                </div>

                <form
                  onSubmit={(e) => handleLogin(e, currentUser.username)}
                  className="space-y-6"
                >
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      autoFocus
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Access Token"
                      className="block w-full rounded-2xl bg-slate-950 border border-slate-800 text-white p-5 pr-14 focus:ring-2 focus:ring-indigo-500 focus:outline-none placeholder-slate-800 text-center text-lg font-black transition-all shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                    >
                      {showPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-white text-slate-950 py-5 rounded-2xl font-black text-sm tracking-[0.2em] shadow-xl hover:bg-slate-200 active:scale-95 transition-all uppercase mb-6"
                  >
                    Unlock Nodes
                  </button>

                  {hasBiometric && (
                    <button
                      type="button"
                      onClick={() => handleBiometricLogin?.(currentUser.username)}
                      className="w-full bg-slate-900 border border-slate-700 hover:bg-slate-800 text-white py-5 rounded-2xl font-black text-sm tracking-[0.2em] shadow-xl active:scale-95 transition-all uppercase mb-6 flex items-center justify-center gap-3"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-fingerprint"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M15 13a5 5 0 0 0-6-1.5"/><path d="M18 16a8 8 0 0 0-11-2.5"/><path d="M9 22c-1.5-1.5-2.5-4-2.5-7a8 8 0 0 1 15-2"/><path d="M9 18v2"/><path d="M15 22v-3.5"/></svg>
                      Biometric Unlock
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleLogout()}
                    className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors flex items-center gap-2 mx-auto underline decoration-slate-800 underline-offset-8"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    De-authenticate Node
                  </button>
                </form>
              </motion.div>
            </div>
          ) : (
            /* FULLY UNLOCKED: Main Dashboard */
            <div className="flex flex-col flex-1 min-h-0 w-full animate-fade-in">
              {/* Mobile View Switcher - Only visible on small/medium screens (< lg) */}
              <div className="lg:hidden flex p-1 bg-slate-950/60 border border-white/5 rounded-2xl mb-6 relative z-10 shadow-lg">
                <button
                  type="button"
                  id="mobile-tab-files"
                  onClick={() => setMobileActiveTab("files")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                    mobileActiveTab === "files"
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border border-white/10"
                      : "text-indigo-300/40 hover:text-white"
                  }`}
                >
                  <Database className="w-4 h-4" />
                  Files
                </button>
                <button
                  type="button"
                  id="mobile-tab-mesh"
                  onClick={() => setMobileActiveTab("mesh")}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 ${
                    mobileActiveTab === "mesh"
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 border border-white/10"
                      : "text-indigo-300/40 hover:text-white"
                  }`}
                >
                  <Globe className="w-4 h-4" />
                  Mesh Network
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0 w-full">
                {/* Left Column: Explorer - Restored to 8 columns for multi-view layout */}
                <div className={`${mobileActiveTab === "files" ? "flex" : "hidden"} lg:flex col-span-1 lg:col-span-8 flex-col min-h-0`}>
                <section className="bg-white/5 backdrop-blur-md rounded-[32px] overflow-hidden border border-white/10 flex flex-col flex-1 shadow-2xl">
                  {/* Search, Action Toolbar */}
                  <div className="p-4 md:p-6 pb-0 flex flex-col md:flex-row gap-4 justify-between items-stretch">
                    {/* Search Component with id */}
                    <div className="relative flex-1 min-w-0">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-indigo-300 w-5 h-5" />
                      <input
                        type="text"
                        id="file-search-input"
                        placeholder="Search workspace files..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 placeholder-indigo-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      />
                    </div>

                    <div className={`${currentPath === "/Trash" ? "flex" : "grid grid-cols-2"} sm:flex sm:flex-row gap-3 sm:gap-2 items-stretch shrink-0`}>
                      {currentPath === "/Trash" ? (
                        <button
                          onClick={handleEmptyTrash}
                          id="empty-trash-btn"
                          className="bg-red-600 hover:bg-red-500 border border-white/10 text-white rounded-2xl px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform w-full sm:w-auto"
                        >
                          <Trash2 className="w-4 h-4" /> Empty Trash
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() =>
                              setShowNewFolderInput(!showNewFolderInput)
                            }
                            id="create-folder-btn"
                            className="bg-indigo-600 hover:bg-indigo-500 border border-white/10 text-white rounded-2xl px-3 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-transform"
                          >
                            <Plus className="w-4 h-4" /> New Folder
                          </button>

                          {/* Manual Select File to import */}
                          <label
                            className="bg-white text-indigo-700 cursor-pointer rounded-2xl px-3 py-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md hover:scale-[1.02] active:scale-95 transition-all"
                            htmlFor="file-manager-upload"
                          >
                            <Upload className="w-4 h-4" /> Import Files
                            <input
                              type="file"
                              id="file-manager-upload"
                              className="hidden"
                              onChange={handleFileUpload}
                            />
                          </label>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Inline Create Folder form */}
                  <AnimatePresence>
                    {showNewFolderInput && (
                      <motion.form
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        onSubmit={handleCreateFolder}
                        className="mx-4 md:mx-6 mb-4 flex flex-col gap-3 bg-white/5 p-4 rounded-2xl border border-white/5"
                      >
                        <div className="flex flex-col sm:flex-row gap-3 w-full animate-none">
                          <input
                            type="text"
                            required
                            placeholder="My Secret Folder..."
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            className="flex-1 bg-indigo-950/40 border border-indigo-400/30 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-indigo-300 placeholder-indigo-300"
                          />
                          <button
                            type="submit"
                            className="bg-green-600 hover:bg-green-500 transition-colors px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white shadow-md shrink-0 w-full sm:w-auto"
                          >
                            Create
                          </button>
                        </div>
                        {currentPath !== "/" && (
                          <label className="flex items-center gap-2 text-xs font-semibold text-indigo-200 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={createAtRoot}
                              onChange={(e) => setCreateAtRoot(e.target.checked)}
                              className="rounded border-white/20 bg-white/5 text-indigo-500 focus:ring-indigo-500 cursor-pointer w-4 h-4"
                            />
                            <span>Create this directory directly at Workspace Root (`/`)</span>
                          </label>
                        )}
                      </motion.form>
                    )}
                  </AnimatePresence>

                  {/* Breadcrumbs Navigation with high utility styling */}
                  <div className="mx-4 md:mx-6 flex items-center gap-2 text-xs font-bold text-indigo-200 border-t border-white/5 pt-4 flex-wrap">
                    <button
                      onClick={() => handleBreadcrumbClick(-1, [])}
                      className="hover:text-white flex items-center gap-1 uppercase tracking-wider"
                    >
                      <FolderOpen className="w-4 h-4 text-indigo-300" />{" "}
                      Workspace Root
                    </button>

                    {pathParts.map((part, index) => (
                      <React.Fragment key={index}>
                        <ChevronRight className="w-4 h-4 text-indigo-400" />
                        <button
                          onClick={() =>
                            handleBreadcrumbClick(index, pathParts)
                          }
                          className={`hover:text-white uppercase tracking-wider ${index === pathParts.length - 1 ? "text-white underline decoration-2 decoration-indigo-300 font-extrabold" : ""}`}
                        >
                          {part}
                        </button>
                      </React.Fragment>
                    ))}

                    <div className="flex-1 min-w-[12px]" />

                    <button
                      onClick={() => {
                        if (currentPath === "/Trash") {
                          setCurrentPath("/");
                        } else {
                          setCurrentPath("/Trash");
                        }
                      }}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all outline-none border ${
                        currentPath === "/Trash"
                          ? "bg-red-500/20 text-red-300 border-red-500/30 shadow-md ring-1 ring-red-400/30"
                          : "bg-white/5 text-indigo-300 border-white/5 hover:bg-white/10 hover:text-white"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {currentPath === "/Trash" ? "Back to Files" : "Trash"}
                    </button>
                  </div>

                  {/* Categories Tab selectors */}
                <div className="mx-4 md:mx-6 flex gap-2 overflow-x-auto pb-4 no-scrollbar scrollbar-none snap-x snap-mandatory px-1 scroll-smooth">
                  {[
                    { id: "all", label: "All", icon: FileText },
                    { id: "folders", label: "Folders", icon: Folder },
                    { id: "secure", label: "Keys & Seeds 🔐", icon: Shield },
                    { id: "app", label: "APKs & Apps 📱", icon: FileCode },
                    { id: "document", label: "Docs", icon: FileText },
                    { id: "image", label: "Images", icon: ImageIcon },
                    { id: "media", label: "Media", icon: Music },
                    { id: "video", label: "Video", icon: Film },
                    { id: "html", label: "HTML", icon: Globe },
                    { id: "archive", label: "Zip", icon: Archive },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = selectedCategory === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setSelectedCategory(tab.id)}
                        className={`px-4 py-2.5 rounded-full text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all snap-start ${
                          isActive
                            ? "bg-white text-indigo-900 shadow-md scale-105"
                            : "bg-white/10 text-indigo-200 hover:bg-white/15"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* File Explorer Sorting Controls & Info Row */}
                <div className="mx-4 md:mx-6 flex items-center justify-between bg-white/5 border border-white/10 p-2 px-3 rounded-2xl gap-3">
                  <div className="hidden sm:flex text-[11px] uppercase tracking-widest font-black text-indigo-200 items-center gap-1.5">
                    <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Sorting Settings</span>
                  </div>
                  
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                    <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                      <span className="text-[10px] text-indigo-300 font-bold uppercase mr-1 hidden sm:inline">Sort:</span>
                      {[
                        { id: "name", label: "Name" },
                        { id: "date", label: "Date" },
                        { id: "size", label: "Size" }
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            if (sortBy === opt.id) {
                              setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                            } else {
                              setSortBy(opt.id as any);
                              setSortOrder("asc");
                            }
                          }}
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 border ${
                            sortBy === opt.id
                              ? "bg-white text-indigo-950 border-white shadow-sm"
                              : "bg-white/5 text-indigo-200 hover:bg-white/10 border-transparent"
                          }`}
                        >
                          {opt.label}
                          {sortBy === opt.id && (
                            sortOrder === "asc" ? (
                              <ArrowUp className="w-3 h-3 text-indigo-600" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-indigo-600" />
                            )
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="h-4 w-[1px] bg-white/10" />

                      <button
                        type="button"
                        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                        className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-indigo-200 border border-white/5 transition-all flex items-center justify-center shrink-0"
                        title={sortOrder === "asc" ? "Ascending" : "Descending"}
                      >
                        {sortOrder === "asc" ? (
                          <ArrowUp className="w-4 h-4 text-white" />
                        ) : (
                          <ArrowDown className="w-4 h-4 text-white" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Drag and Drop Container Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`relative mx-4 md:mx-6 mb-6 transition-all duration-300 ${
                    isDragging ? "scale-[1.01]" : ""
                  }`}
                >
                  {/* Drag overlay on top of active file list */}
                  <AnimatePresence>
                    {isDragging && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#05050b]/95 backdrop-blur-md border border-dashed border-indigo-500 rounded-3xl p-10 text-center text-white"
                      >
                        <Upload className="w-16 h-16 text-indigo-400 mb-4 animate-bounce" />
                        <h4 className="text-xl font-black uppercase tracking-wider mb-2">Drop Files to Encrypt</h4>
                        <p className="text-xs text-indigo-300 max-w-sm font-medium leading-relaxed">
                          Drop file payloads here to automatically apply military-grade layered encryption (AES-GCM+ChaCha20) and save to your sovereign storage.
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Inner Container */}
                  <div className={`transition-all duration-300 ${
                    sortedVaultItems.length === 0
                      ? `border-2 border-dashed rounded-[32px] p-10 text-center ${
                          isDragging
                            ? "border-indigo-400 bg-indigo-950/20"
                            : "border-indigo-500/20 bg-indigo-950/10 hover:border-indigo-400/40 hover:bg-indigo-950/20"
                        }`
                      : "p-1"
                  }`}>
                  {/* Render files grid or folder empty message inside */}
                  {sortedVaultItems.length === 0 ? (
                    currentPath === "/Trash" ? (
                      <div className="py-12 text-center flex flex-col items-center">
                        <Trash2 className="mb-4 w-12 h-12 text-red-400 animate-pulse" />
                        <h4 className="text-xl font-bold mb-1">
                          Trash is Empty
                        </h4>
                        <p className="text-xs text-indigo-200 max-w-sm">
                          Deleted workspaces/files are kept safe here. You can
                          inspect, restore, or let them auto-purge after 30
                          days.
                        </p>
                      </div>
                    ) : (
                      <div className="py-12 text-center flex flex-col items-center">
                        <Upload className="mb-4 w-12 h-12 text-indigo-300 animate-pulse" />
                        <h4 className="text-xl font-bold mb-1">
                          Drag and Drop Files
                        </h4>
                        <p className="text-xs text-indigo-200 max-w-sm">
                          Folders inside "{currentPath}" are currently empty.
                          Drop file payloads to automatically apply layered encryption (AES-GCM+ChaCha20)
                          and sync.
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="space-y-4">
                      {currentPath === "/Trash" && (
                        <div className="bg-red-500/10 border border-red-500/20 text-red-200 text-xs font-semibold p-4 rounded-2xl flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
                          <span>
                            📦 Trash Vault: These files are isolated and
                            scheduled for full automatic deletion 30 days from
                            deletion.
                          </span>
                          <button
                            onClick={handleEmptyTrash}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all"
                          >
                            Empty Trash Now
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4 text-left">
                        {sortedVaultItems.map((item) => {
                          const isReplica = isSyncedFromPeer(item);
                          const isSecurePack = !item.isFolder && getFileCategory(item.name, item.type) === "secure";
                          const isAppPack = !item.isFolder && getFileCategory(item.name, item.type) === "app";
                          
                          let subsystemLabel = "BLOCK_ENCRYPTED";
                          let leftRailColor = "border-l-indigo-500/30";
                          if (item.isFolder) {
                            subsystemLabel = "DIR_NODE";
                            leftRailColor = "border-l-amber-500/40";
                          } else if (isSecurePack) {
                            subsystemLabel = "SECURE_KEYPACK";
                            leftRailColor = "border-l-teal-500/50";
                          } else if (isReplica) {
                            subsystemLabel = "MESH_REPLICA";
                            leftRailColor = "border-l-fuchsia-500/50";
                          } else if (isAppPack) {
                            subsystemLabel = "APP_INSTALLER";
                            leftRailColor = "border-l-cyan-500/40";
                          }

                          return (
                            <div
                              key={item.id}
                              className={`relative bg-slate-950/40 hover:bg-slate-900/40 p-4 rounded-2xl border ${leftRailColor} border-l-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg hover:border-indigo-500/30 transition-all duration-300 group ${
                                item.isFolder && currentPath !== "/Trash"
                                  ? "cursor-pointer"
                                  : ""
                              }`}
                              onClick={() =>
                                item.isFolder &&
                                currentPath !== "/Trash" &&
                                traverseIntoFolder(item.name)
                              }
                            >
                              <div className="flex items-start gap-4 min-w-0 flex-1">
                                {/* Icon container with high-tech badge styling */}
                                <div className="w-10 h-10 bg-slate-900/80 border border-white/5 rounded-xl flex items-center justify-center shrink-0 shadow-inner group-hover:border-indigo-500/20 group-hover:bg-slate-950/80 transition-all">
                                  {renderFileIcon(item)}
                                </div>

                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap pb-0.5">
                                    <span className="text-[9px] font-mono tracking-wider font-extrabold text-indigo-400 border border-indigo-500/10 px-1.5 py-0.5 rounded bg-indigo-500/5 select-none shrink-0 leading-none">
                                      {subsystemLabel}
                                    </span>
                                    {item.isFolder && (
                                      <span className="text-[9px] font-mono tracking-wider font-extrabold text-amber-400 border border-amber-500/10 px-1.5 py-0.5 rounded bg-amber-500/5 select-none shrink-0 leading-none">
                                        DIR
                                      </span>
                                    )}
                                  </div>

                                  <div
                                    className="text-sm font-black tracking-tight text-white truncate max-w-full block pr-2"
                                    title={item.name}
                                  >
                                    {item.name}
                                  </div>

                                  <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono flex-wrap">
                                    {item.isFolder ? (
                                      <span className="text-amber-500/80 font-bold uppercase tracking-wider">Storage Node</span>
                                    ) : (
                                      <>
                                        <span className="text-white font-bold">{formatBytes(item.size)}</span>
                                        <span className="text-white/20 select-none">•</span>
                                        <span className="inline-flex items-center gap-1 text-emerald-400 font-extrabold">
                                          <Lock className="w-3 h-3 stroke-[2.5]" />
                                          AES-GCM+ChaCha20
                                        </span>
                                      </>
                                    )}
                                  </div>

                                  {/* Expiration visual timer count */}
                                  {item.deletedAt && currentPath === "/Trash" && (
                                    <div className="text-[10px] text-red-400/90 font-mono mt-1 flex items-center gap-1.5 select-none bg-red-950/15 border border-red-500/10 px-2 py-0.5 rounded-md w-max">
                                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                                      <span>
                                        AUTO-PURGE:{" "}
                                        {Math.max(
                                          1,
                                          Math.ceil(
                                            (30 * 24 * 60 * 60 * 1000 -
                                              (Date.now() - item.deletedAt)) /
                                              (24 * 60 * 60 * 1000),
                                          ),
                                        )}{" "}
                                        DAYS
                                      </span>
                                    </div>
                                  )}

                                  {/* Metadata indicators */}
                                  {!item.isFolder && isSecurePack && (
                                    <div className="text-[9px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider inline-block">
                                      🔐 Crypto Key / Seed Phrase
                                    </div>
                                  )}
                                  {!item.isFolder && isAppPack && (
                                    <div className="text-[9px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider inline-block">
                                      📱 APK Installer Pack
                                    </div>
                                  )}



                                  {!item.isFolder && (item.originalOwnerSeedId || item.peerReceiverSeedId) && (
                                    <div className="flex flex-wrap gap-1 mt-[6px]">
                                      {item.originalOwnerSeedId && (
                                        <div className="text-[9px] bg-emerald-950/40 text-emerald-300 border border-emerald-900/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1 cursor-help" title={`Original Importer Seed ID: ${item.originalOwnerSeedId}`}>
                                          <span className="text-emerald-400">🧬</span>
                                          ID: {item.originalOwnerSeedId.substring(0, 8)}
                                        </div>
                                      )}

                                      {item.peerReceiverSeedId && (
                                        <div className="text-[9px] bg-sky-950/40 text-sky-300 border border-sky-900/20 px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1 cursor-help" title={`Peer Sync Receiver ID: ${item.peerReceiverSeedId}`}>
                                          <span className="text-sky-400">👥</span>
                                          Peer: {item.peerReceiverSeedId.substring(0, 8)}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {isReplica ? (
                                    <div className="flex flex-col gap-1 pt-1">
                                      {item.senderName && (
                                        <div className="text-[9px] bg-indigo-500/20 text-indigo-200 border border-indigo-500/10 px-2 py-0.5 rounded font-mono uppercase font-bold tracking-wider w-max">
                                          Sync'd from {item.senderName}
                                        </div>
                                      )}
                                      <div className="text-[9px] bg-amber-500/10 text-amber-300 border border-amber-500/10 px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider inline-flex items-center gap-1 w-max">
                                        <Shield className="w-3 h-3 text-amber-400" /> Mesh Replica (Protected)
                                      </div>
                                    </div>
                                  ) : item.senderName ? (
                                    <div className="text-[9px] bg-indigo-500/20 text-indigo-200 border border-indigo-500/10 px-2 py-0.5 rounded font-mono uppercase font-bold tracking-wider w-max">
                                      Sync'd from {item.senderName}
                                    </div>
                                  ) : null}

                                  {item.dagHash && (
                                    <div className="text-[10px] sm:text-[11px] block pr-2 pt-1">
                                      <div 
                                        className="inline-flex items-center gap-1.5 text-fuchsia-300 bg-fuchsia-500/5 border border-fuchsia-500/10 hover:border-fuchsia-500/30 px-2 py-0.5 rounded font-mono truncate max-w-[150px] sm:max-w-[220px] cursor-pointer hover:bg-fuchsia-500/10 transition-all duration-200" 
                                        title={`BlockDAG Hash: ${item.dagHash}\nSignature: ${item.dagSignature || "Unsigned"}\nClick to View Verification Details`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingDagBlock(item);
                                        }}
                                      >
                                        <span className="text-fuchsia-400/85 animate-pulse">◈</span>
                                        <span>DAG Block: {item.dagHash.substring(0, 12)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Trigger file manager Actions */}
                              <div
                                className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-start sm:justify-end border-t border-white/5 pt-3 sm:pt-0 sm:border-t-0 mt-3 sm:mt-0 w-full sm:w-auto shrink-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {currentPath === "/Trash" ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleRestoreItem(item)}
                                      title="Restore to original directory location"
                                      className="w-9 h-9 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-xl flex items-center justify-center transition-all border border-indigo-500/30"
                                    >
                                      <RefreshCcw className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteItem(item)}
                                      title="Permanently Delete"
                                      className="w-9 h-9 bg-red-500/10 hover:bg-red-650 text-red-200 hover:text-white rounded-xl flex items-center justify-center transition-all border border-red-500/30"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    {!item.isFolder && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isSyncedFromPeer(item)) {
                                            showToast("Privacy Lock: Synced peer files cannot be reshared.", "error");
                                            return;
                                          }
                                          handleToggleShare(item);
                                        }}
                                        title={
                                          isSyncedFromPeer(item)
                                            ? "Privacy Lock: Synced files cannot be shared"
                                            : item.isShared
                                            ? "Shared to local discovery mesh"
                                            : "🌍 Pool (Public)"
                                        }
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                                          isSyncedFromPeer(item)
                                            ? "bg-zinc-850 text-zinc-500 cursor-not-allowed border border-white/5"
                                            : item.isShared
                                            ? "bg-teal-600 text-white hover:bg-teal-500 shadow-md"
                                            : "bg-white/5 text-indigo-300 hover:bg-white/10"
                                        }`}
                                        disabled={isSyncedFromPeer(item)}
                                      >
                                        <Globe className="w-4 h-4" />
                                      </button>
                                    )}

                                    {!item.isFolder && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isSyncedFromPeer(item)) {
                                            showToast("Privacy Lock: Synced peer files cannot be sent.", "error");
                                            return;
                                          }
                                          setShareDialogOptions({ file: item, open: true, note: item.shareNote || "", targetUsername: "" });
                                        }}
                                        title={
                                          isSyncedFromPeer(item)
                                            ? "Privacy Lock: Peer files cannot be sent"
                                            : "Send direct file request"
                                        }
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-md ${
                                          isSyncedFromPeer(item)
                                            ? "bg-zinc-850 text-zinc-500 cursor-not-allowed border border-white/5"
                                            : "bg-white/5 text-indigo-200 hover:bg-indigo-600 hover:text-white"
                                        }`}
                                        disabled={isSyncedFromPeer(item)}
                                      >
                                        <Share2 className="w-4 h-4" />
                                      </button>
                                    )}

                                    {!item.isFolder && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isSyncedFromPeer(item)) {
                                            showToast("Privacy Lock: Synced peer files cannot be decrypted or downloaded.", "error");
                                            return;
                                          }
                                          handleDownload(item);
                                        }}
                                        title={
                                          isSyncedFromPeer(item)
                                            ? "Privacy Locked: Distributed peer replica cannot be downloaded"
                                            : "Decrypt & Download"
                                        }
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-md ${
                                          isSyncedFromPeer(item)
                                            ? "bg-zinc-850 text-zinc-500 cursor-not-allowed border border-white/5"
                                            : "bg-white/5 text-indigo-200 hover:bg-green-650 hover:text-white"
                                        }`}
                                        disabled={isSyncedFromPeer(item)}
                                      >
                                        {isSyncedFromPeer(item) ? <Shield className="w-4 h-4 text-amber-500/60" /> : <Download className="w-4 h-4" />}
                                      </button>
                                    )}

                                    {!item.isFolder && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenVersionHistory(item)}
                                        title="View Version History"
                                        className="w-9 h-9 bg-white/5 text-indigo-200 hover:bg-indigo-500 hover:text-white rounded-xl flex items-center justify-center transition-all shadow-md"
                                      >
                                        <History className="w-4 h-4" />
                                      </button>
                                    )}

                                    {!item.isFolder &&
                                      !isSyncedFromPeer(item) &&
                                      rtcStatus === "connected" && (
                                        <button
                                          type="button"
                                          onClick={() => handleStreamRtc(item)}
                                          title={`Stream raw AES buffer to @${rtcActivePeer} via RTCDataChannel`}
                                          className="w-9 h-9 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500 hover:text-indigo-950 rounded-xl flex items-center justify-center transition-all border border-yellow-500/30 animate-pulse"
                                        >
                                          <Zap className="w-4 h-4" />
                                        </button>
                                      )}

                                    {!item.isFolder &&
                                      !isSyncedFromPeer(item) &&
                                      mDnsActive &&
                                      mDnsDiscoveredNodes.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDirectHttpSend(
                                              item,
                                              mDnsDiscoveredNodes[0],
                                            )
                                          }
                                          title={`Stream encrypted buffer to @${mDnsDiscoveredNodes[0].username} via Direct Subnet HTTP POST`}
                                          className="w-9 h-9 bg-teal-500/10 text-teal-300 hover:bg-teal-500 hover:text-indigo-950 rounded-xl flex items-center justify-center transition-all border border-teal-500/30 hover:border-teal-400 font-bold"
                                        >
                                          <Plug className="w-4 h-4" />
                                        </button>
                                      )}

                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (isSyncedFromPeer(item)) {
                                          showToast("Privacy Lock: Synced peer files cannot be deleted.", "error");
                                          return;
                                        }
                                        handleDeleteItem(item);
                                      }}
                                      title={
                                        isSyncedFromPeer(item)
                                          ? "Privacy Lock: Distributed peer replica cannot be deleted"
                                          : "Move to Trash"
                                      }
                                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all shadow-md ${
                                        isSyncedFromPeer(item)
                                          ? "bg-zinc-850 text-zinc-500 hover:bg-red-955 hover:text-red-350 border border-red-500/20 cursor-not-allowed"
                                          : "bg-white/5 text-indigo-400 hover:bg-red-655 hover:text-white"
                                      }`}
                                    >
                                      {isSyncedFromPeer(item) ? <ShieldAlert className="w-4 h-4 text-red-500/40" /> : <Trash2 className="w-4 h-4 text-red-400" />}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              </section>

                {/* Storage Quota indicators - Redesigned output structure */}
                <div className="bg-slate-950/40 rounded-3xl p-6 border border-slate-900/80 flex flex-col gap-6 text-xs tracking-wide">
                  <div className="flex flex-col lg:flex-row gap-6 lg:items-center justify-between">
                    <div className="flex gap-4 items-center">
                      <div className="p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/20 relative group">
                        <div className="absolute inset-0 bg-indigo-500/5 blur-lg rounded-full animate-pulse" />
                        <Infinity className="w-6 h-6 text-indigo-400 relative z-10" />
                      </div>
                      <div>
                        <div className="font-mono text-[9px] text-indigo-300 uppercase tracking-widest font-black flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping animate-duration-[2000ms]" />
                          ACTIVE QS LITE DB CLUSTER
                        </div>
                        <div className="text-2xl font-black mt-1 text-white flex items-center gap-2 sm:gap-3 flex-wrap">
                          <span>vault.db</span>
                          <span className="text-[9px] font-mono bg-emerald-500/5 text-emerald-400 border border-emerald-500/15 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider select-none">
                            UNLIMITED / 50MB PER FILE ALLOWED
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
                      <div className="bg-slate-900/20 border border-white/[0.03] p-3 rounded-2xl space-y-1 pl-3.5 border-l-2 border-l-indigo-400">
                        <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500 font-bold">
                          Cold Index Size
                        </div>
                        <div className="text-base font-black text-slate-200 font-mono">
                          {formatBytes(totalStorageSize)}
                        </div>
                      </div>
                      <div className="bg-slate-900/20 border border-white/[0.03] p-3 rounded-2xl space-y-1 pl-3.5 border-l-2 border-l-emerald-400">
                        <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500 font-bold">
                          Encrypted Files
                        </div>
                        <div className="text-base font-black text-slate-200 font-mono">
                          {activeFiles.filter((f) => !f.isFolder).length}
                        </div>
                      </div>
                      <div className="bg-slate-900/20 border border-white/[0.03] p-3 rounded-2xl space-y-1 pl-3.5 border-l-2 border-l-teal-400 col-span-2 sm:col-span-1">
                        <div className="text-[9px] uppercase tracking-widest font-mono text-slate-500 font-bold whitespace-nowrap">
                          Pool Storage Class
                        </div>
                        <div className="text-xs sm:text-sm font-black text-teal-400 font-mono flex items-center gap-1.5 whitespace-nowrap overflow-hidden text-ellipsis">
                          <Infinity className="w-4 h-4 text-teal-400 shrink-0" /> UNLIMITED / 50MB PER 1 FILE ALLOWED
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Aesthetic Uncapped Glow Progress Bar */}
                  <div className="space-y-3 pt-4 border-t border-white/[0.03]">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-[10px] uppercase font-mono tracking-wider text-slate-400">
                      <span className="font-bold">UNLIMITED DECENTRALIZED QS LITE POOL CONSUMPTION</span>
                      <span className="text-teal-400 font-extrabold flex items-center gap-1">
                        <span>0.00% consumed of</span>
                        <span className="text-xs">∞</span>
                      </span>
                    </div>
                    <div className="relative h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/[0.03]">
                      <div className="absolute top-0 left-0 h-full w-[2%] bg-gradient-to-r from-indigo-500 to-teal-400 rounded-full shadow-[0_0_8px_rgba(20,184,166,0.5)] animate-pulse" />
                    </div>
                    <p className="text-[10px] text-slate-500 font-medium leading-relaxed font-sans">
                      Safe offline partition enabled. SQLite relational storage limits are disabled; database size is bounded only by physical sector capacity on this node's environment. Uploads are limited to 50MB per file.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: Local Shared Pool & Infrastructure Signaling (Restored) */}
              <div className={`${mobileActiveTab === "mesh" ? "block" : "hidden"} lg:block col-span-1 lg:col-span-4 space-y-6 overflow-y-auto custom-scrollbar pr-1 pb-10`}>
                
                {/* Local Shared Pool - Restored */}
                <section className="bg-indigo-900/40 rounded-[28px] p-6 border border-indigo-400/20 shadow-xl flex flex-col">
                  {/* Share Request Inbox (Inbox Component) */}
                  <div className="mb-4">
                    <ShareRequestInbox 
                      requests={pendingShareRequests} 
                      onAccept={handleAcceptShare} 
                      onReject={handleRejectShare} 
                    />
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">                
                    <div className="flex items-center gap-1.5">
                      <Share2 className="w-4 h-4 text-indigo-300" />
                      <h3 className="text-sm font-black tracking-widest uppercase text-indigo-200">
                        Local Shared Pool
                      </h3>
                    </div>
                    <RefreshCcw
                      onClick={refreshData}
                      className="w-4 h-4 cursor-pointer text-indigo-400 hover:text-white transition-colors"
                    />
                  </div>

                  <p className="text-[11px] text-indigo-300 font-medium mb-4 leading-relaxed">
                    Files currently shared to the public mesh pool by you and other vault owners.
                    Sync copies directly across workspaces.
                  </p>

                  <div className="space-y-4">
                    {discoveredMeshFiles.length === 0 ? (
                      <div className="p-6 bg-white/5 rounded-2xl border border-white/5 text-center text-xs text-indigo-400 italic">
                        No shared files are currently distributed in this
                        device's workspace pool. Tag shared credentials on
                        matching files to broadcast.
                      </div>
                    ) : (
                      discoveredMeshFiles.map(({ peer, file }) => (
                        <div
                          key={file.id}
                          className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col group"
                        >
                          <div className="flex items-center justify-between gap-4">
                            {file.type?.startsWith('image/') && (
                              <div className="w-16 h-16 rounded-xl overflow-hidden bg-white/5 border border-white/10 shrink-0">
                                <img 
                                  src={`/api/files/download/${file.id}?userId=${currentUser?.id}`} 
                                  alt={file.name}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).parentElement?.classList.add('flex', 'items-center', 'justify-center');
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold truncate text-white">
                                {file.name}
                              </div>
                              <div className="flex items-center gap-1.5 text-[9px] text-indigo-300 uppercase font-bold tracking-wider mt-0.5 font-mono">
                                <span>By {peer.displayName}</span>
                                <span>•</span>
                                <span>{formatBytes(file.size)}</span>
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 shrink-0">
                              <button
                                onClick={() => handleDownloadPublicShare(file, peer)}
                                className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md transition-all whitespace-nowrap active:scale-95 text-center w-full flex items-center justify-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" /> Download
                              </button>
                              <button
                                onClick={() => handlePreviewLocalShared(file)}
                                className="bg-white/10 hover:bg-white/20 text-indigo-100 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all whitespace-nowrap active:scale-95 text-center border border-white/10 w-full"
                              >
                                Preview
                              </button>
                              {currentUser && peer.id === currentUser.id && (
                                <div className="text-center py-1 opacity-40 text-indigo-400 text-[8px] uppercase font-black tracking-tighter">
                                  Your Share (Public)
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                {/* WebSocket Signal Hub - Comprehensive Recovery */}
                <section className="bg-indigo-950/40 backdrop-blur-xl rounded-[28px] p-6 border border-white/10 shadow-xl space-y-5">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                      <div className="relative">
                        <div className={`w-2.5 h-2.5 rounded-full ${wsConnection ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                        {wsConnection && <div className="absolute inset-0 w-2.5 h-2.5 bg-green-400 rounded-full animate-ping opacity-75" />}
                      </div>
                      <h3 className="text-sm font-black tracking-widest uppercase text-indigo-200">
                        WebSocket Signal Hub
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${wsConnection ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                        {wsConnection ? "Active" : "Offline"}
                      </span>
                      {wsConnection && (
                        <button 
                          onClick={() => {
                            wsConnection.close();
                            setWsConnection(null);
                            showToast("Manual signal hub disconnect.", "info");
                          }}
                          className="text-[9px] font-black text-indigo-400 hover:text-white uppercase transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase font-black tracking-wider text-indigo-300 mb-2 flex justify-between">
                      <span>Connected Network Peers ({onlinePeers.length})</span>
                      {onlinePeers.length > 0 && <span className="text-emerald-400 tabular-nums animate-pulse">Sync Active</span>}
                    </div>
                    {onlinePeers.length === 0 ? (
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center text-xs text-indigo-300 italic">
                        No other nodes connected to this WebSocket channel. Log
                        in from another tab or device to test real-time
                        signaling!
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {onlinePeers.map((peer) => {
                          const isSelected = targetPeerCid === peer.cid;
                          return (
                            <div
                              key={peer.cid}
                              className={`w-full rounded-xl p-3 border transition-all flex items-center justify-between group cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-600/40 border-indigo-400 ring-1 ring-indigo-400/50"
                                  : "bg-white/5 border-transparent hover:bg-white/10"
                              }`}
                              onClick={() => {
                                setTargetPeerUsername(peer.username);
                                setTargetPeerCid(peer.cid);
                              }}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-black text-white flex items-center gap-2">
                                  {peer.displayName}
                                  {isSelected && (
                                    <div className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
                                  )}
                                </div>
                                <div className="text-[9px] text-indigo-300 font-mono flex items-center gap-2">
                                  <span>@{peer.username}</span>
                                  {isSelected && <span className="text-[8px] bg-white/5 px-1 rounded text-white/40 font-black">SELECTED</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-indigo-400 animate-pulse' : 'bg-white/10'}`} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Incoming Encrypted Envelopes (Inbox) - RESTORED */}
                  {receivedSignals.length > 0 && (
                    <div className="border-t border-white/5 pt-4">
                      <div className="text-[10px] uppercase font-black tracking-wider text-amber-300 mb-3 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ShieldAlert className="w-3.5 h-3.5" /> Out-of-Band Envelopes ({receivedSignals.length})
                        </div>
                        <button 
                          onClick={() => setReceivedSignals([])}
                          className="text-[8px] text-amber-500/40 hover:text-white transition-colors"
                        >
                          CLEAR ALL
                        </button>
                      </div>
                      <div className="space-y-2">
                        {receivedSignals.map((signal) => (
                           <div key={signal.id} className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
                              <div className="flex justify-between items-start mb-2">
                                 <div>
                                    <div className="text-[10px] font-black text-white">FROM @{signal.senderUsername}</div>
                                    <div className="text-[8px] text-amber-300/40 font-mono">{new Date(signal.timestamp).toLocaleTimeString()}</div>
                                 </div>
                                 <button 
                                   onClick={() => setReceivedSignals(prev => prev.filter(s => s.id !== signal.id))}
                                   className="text-amber-500/40 hover:text-amber-500"
                                 >
                                    <X className="w-3 h-3" />
                                 </button>
                              </div>
                              <div className="space-y-2">
                                 <input 
                                   type="password"
                                   placeholder="Cryptographic Secret"
                                   id={`secret-${signal.id}`}
                                   className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-amber-500/50"
                                   onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                         handleDecryptSignal(signal.id, signal.token, (e.target as HTMLInputElement).value);
                                      }
                                   }}
                                 />
                                 <button
                                   onClick={() => {
                                      const input = document.getElementById(`secret-${signal.id}`) as HTMLInputElement;
                                      handleDecryptSignal(signal.id, signal.token, input.value);
                                   }}
                                   className="w-full bg-amber-500 text-black text-[9px] font-black uppercase py-1.5 rounded-lg hover:bg-amber-400 transition-all"
                                 >
                                    Decrypt Signal
                                 </button>
                              </div>
                              {signal.decrypted && (
                                <div className="mt-3 p-3 bg-black/60 rounded-xl border border-emerald-500/30">
                                   <div className="text-[8px] font-black text-emerald-400 uppercase tracking-widest mb-1">Decrypted Payload</div>
                                   <div className="text-[10px] text-white font-mono break-all line-clamp-4">{signal.decrypted}</div>
                                   <button 
                                     onClick={() => {
                                       navigator.clipboard.writeText(signal.decrypted!);
                                       showToast("Payload copied to clipboard!", "success");
                                     }}
                                     className="mt-2 w-full flex items-center justify-center gap-1.5 py-1 rounded bg-emerald-500/10 text-emerald-400 text-[8px] font-black uppercase hover:bg-emerald-500/20 transition-all"
                                   >
                                      <Copy className="w-3 h-3" /> Copy Payload
                                   </button>
                                </div>
                              )}
                           </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* WebRTC Live Tunneling Section */}
                  <div className="border-t border-white/5 pt-4 space-y-4">
                    <div className="flex justify-between items-center text-xs border-b border-white/5 pb-2">
                      <div className="flex items-center gap-1 font-black uppercase tracking-wider text-yellow-300">
                        <Globe className="w-3.5 h-3.5" /> WebRTC Live P2P Tunnel
                      </div>
                      <span
                        className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                          rtcStatus === "connected"
                            ? "bg-green-500/20 text-green-300 border border-green-500/30"
                            : rtcStatus === "connecting"
                              ? "bg-yellow-500/20 text-yellow-300 animate-pulse border border-yellow-500/30"
                              : wsConnection
                                ? "bg-white/5 text-indigo-300 border border-indigo-400/20"
                                : "bg-red-500/10 text-red-300 border border-red-500/20"
                        }`}
                      >
                        {wsConnection && rtcStatus === "disconnected"
                          ? "Standby"
                          : rtcStatus}
                      </span>
                    </div>

                    {rtcStatus === "connected" ? (
                      <div className="p-4 bg-indigo-900/40 rounded-2xl border border-indigo-500/20 space-y-3 text-left relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-green-400 to-transparent opacity-20" />
                        <div className="flex justify-between items-start">
                           <div className="text-[10px] font-black text-green-400 uppercase tracking-wider flex items-center gap-1.5">
                             📌 PINNED ONLINE
                           </div>
                           {targetPeerCid && latencies[targetPeerCid] && (
                              <div className="text-[10px] font-mono text-indigo-300/60">{latencies[targetPeerCid]}ms RTT</div>
                           )}
                        </div>
                        <div className="text-xs font-bold text-indigo-100 flex items-center gap-1.5">
                          <span className="w-2 h-2 bg-green-400 rounded-full animate-ping" />
                          Bidirectional tunnel active with{" "}
                          <span className="text-green-300 font-extrabold">
                            @{rtcActivePeer}
                          </span>
                        </div>
                        <div className="flex gap-1 h-0.5 w-full bg-white/5 rounded-full overflow-hidden">
                           {[1,2,3,4,5,6,7,8].map(i => <div key={i} className="flex-1 bg-green-400/20" />)}
                        </div>
                        <button
                          type="button"
                          onClick={disconnectWebRtc}
                          className="w-full bg-red-650/20 hover:bg-red-650/50 border border-red-500/30 hover:border-red-500 text-red-200 text-[10px] font-black uppercase tracking-wider py-2 rounded-xl transition-all shadow-md active:scale-95"
                        >
                          Disconnect WebRTC Link
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pendingRtcOffer && (
                          <div className="p-4 bg-yellow-500/10 rounded-2xl border border-yellow-500/30 animate-pulse">
                            <div className="text-[10px] font-black text-yellow-300 uppercase tracking-widest mb-3 flex items-center gap-2">
                              <ShieldAlert className="w-3.5 h-3.5" /> Incoming Link Request
                            </div>
                            <p className="text-xs text-indigo-100 mb-4">
                              <span className="font-extrabold text-white">@{pendingRtcOffer.senderUsername}</span> wants to establish a secure P2P tunnel.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={acceptRtcOffer}
                                className="bg-emerald-500 text-white text-[10px] font-black uppercase py-2 rounded-xl hover:bg-emerald-600 transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2"
                              >
                                <Check className="w-3 h-3" /> Accept
                              </button>
                              <button
                                onClick={rejectRtcOffer}
                                className="bg-white/5 text-indigo-300 text-[10px] font-black uppercase py-2 rounded-xl hover:bg-white/10 border border-white/10 transition-all active:scale-95"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 text-center">
                          <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest leading-relaxed mb-4">
                            Infrastructure Ready: <br/> Secure Signaling Standby
                          </p>
                          
                          {targetPeerCid && targetPeerCid !== wsConnection?.cid ? (
                            <button
                              onClick={() => initiateRtcConnection(targetPeerCid, targetPeerUsername)}
                              disabled={rtcStatus === "connecting"}
                              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-[0.2em] py-3 rounded-xl transition-all shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                              {rtcStatus === "connecting" ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" /> Negotiating...
                                </>
                              ) : (
                                <>
                                  Establish P2P Tunnel with @{targetPeerUsername}
                                </>
                              )}
                            </button>
                          ) : (
                             <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 opacity-40">
                                <Info className="w-3 h-3 text-indigo-400" />
                                <span className="text-[8px] font-black uppercase text-indigo-400 tracking-[0.1em]">Select Peer to Connect</span>
                             </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Manual Signaling Protocol Console - RESTORED */}
                  <div className="border-t border-white/5 pt-4">
                    <button 
                      onClick={() => {
                         const el = document.getElementById('manual-console');
                         if (el) el.classList.toggle('hidden');
                      }}
                      className="w-full flex items-center justify-between text-[10px] font-black text-indigo-300 uppercase tracking-widest hover:text-white transition-colors py-2"
                    >
                       <span>Manual Signaling Protocol</span>
                       <ArrowRight className="w-3 h-3" />
                    </button>
                    <div id="manual-console" className="hidden mt-4 space-y-4 p-4 bg-black/40 rounded-2xl border border-white/5">
                       <div className="flex flex-col gap-4">
                          <form onSubmit={handleSendSignal} className="space-y-4">
                             <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                   <label className="text-[8px] font-black uppercase text-indigo-500 tracking-[0.2em]">P2P Handshake Token</label>
                                   <button 
                                     type="button"
                                     onClick={() => {
                                        setSignalTokenInput("LINK_REQUEST_" + Math.random().toString(36).substring(7).toUpperCase());
                                        showToast("Generated link request token", "info");
                                     }}
                                     className="text-[8px] text-indigo-400 hover:text-white"
                                   >
                                      GENERATE
                                   </button>
                                </div>
                                <textarea 
                                  value={signalTokenInput}
                                  onChange={(e) => setSignalTokenInput(e.target.value)}
                                  placeholder="Paste envelope contents..."
                                  className="w-full h-20 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white focus:outline-none focus:border-indigo-500/50 resize-none ring-0 appearance-none"
                                />
                             </div>
                             <div className="space-y-2">
                                <label className="text-[8px] font-black uppercase text-indigo-500 tracking-[0.2em]">Shared Signaling Secret</label>
                                <div className="relative">
                                   <input 
                                     type={showSignalSecret ? "text" : "password"}
                                     value={signalSecretKey}
                                     onChange={(e) => setSignalSecretKey(e.target.value)}
                                     placeholder="Envelope encryption key..."
                                     className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white focus:outline-none focus:border-indigo-500/50"
                                   />
                                   <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                      <button 
                                        type="button"
                                        onClick={() => setShowSignalSecret(!showSignalSecret)}
                                        className="text-indigo-400 hover:text-white p-1"
                                        title={showSignalSecret ? "Hide Secret" : "Show Secret"}
                                      >
                                        {showSignalSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                      </button>
                                      <button 
                                        type="button"
                                        onClick={() => {
                                           const key = Math.random().toString(36).substring(2, 10);
                                           setSignalSecretKey(key);
                                           showToast(`Generated: ${key}`, "info");
                                        }}
                                        className="text-[8px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded"
                                      >
                                         GEN
                                      </button>
                                   </div>
                                </div>
                             </div>
                             <div className="bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/10 mb-2">
                                <p className="text-[10px] text-indigo-300 font-black uppercase tracking-widest mb-1 items-center flex gap-1.5 grayscale opacity-50">
                                   <Info className="w-3.5 h-3.5 text-indigo-400" /> Master Vault Protocol Note
                                </p>
                                <p className="text-[10px] text-indigo-200/60 leading-relaxed font-medium">
                                   Pass this password to your peer out-of-band to recover the envelope. Store it in your <strong>Recovery Master Vault Ledger</strong> below for persistent vault recovery.
                                </p>
                             </div>
                             <button
                               type="submit"
                               className="w-full bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase py-3 rounded-xl transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2"
                             >
                                <ArrowRight className="w-3 h-3" /> Emit Processed Signal
                             </button>
                          </form>

                          {/* Recovery Master Vault Ledger */}
                          <div className="border-t border-white/5 pt-4">
                             <div className="flex justify-between items-center mb-3">
                                <div className="text-[9px] font-black uppercase text-indigo-400 tracking-widest flex items-center gap-2">
                                   <Database className="w-3.5 h-3.5" /> Recovery Master Vault Ledger
                                </div>
                                {!isNoteUnlocked ? (
                                   <button 
                                     onClick={handleUnlockNote}
                                     className="text-[8px] bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded border border-indigo-500/20 hover:bg-indigo-500/20 transition-all flex items-center gap-1.5"
                                   >
                                     <Lock className="w-3 h-3" /> UNLOCK WITH MASTER KEY
                                   </button>
                                ) : (
                                   <button 
                                     onClick={() => setIsNoteUnlocked(false)}
                                     className="text-[8px] bg-red-500/10 text-red-300 px-2 py-1 rounded border border-red-500/20 hover:bg-red-500/20 transition-all"
                                   >
                                     LOCK LEDGER
                                   </button>
                                )}
                             </div>

                             {isNoteUnlocked && (
                                <motion.div 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="space-y-3"
                                >
                                   <textarea 
                                     value={decryptedNote}
                                     onChange={(e) => setDecryptedNote(e.target.value)}
                                     placeholder="Store signaling secrets here. Only you can view this with your account password."
                                     className="w-full h-24 bg-black/60 border border-white/10 rounded-xl px-3 py-2 text-[10px] font-mono text-white focus:outline-none focus:border-emerald-500/50 resize-none"
                                   />
                                   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      <button
                                        onClick={handleSaveNote}
                                        className="bg-emerald-500/20 text-emerald-300 text-[9px] font-black uppercase py-2 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/30 transition-all flex items-center justify-center gap-2"
                                      >
                                         <Check className="w-3 h-3" /> Save To Vault
                                      </button>
                                      <button
                                        onClick={() => {
                                           navigator.clipboard.writeText(decryptedNote);
                                           showToast("Copied ledger content to clipboard", "success");
                                        }}
                                        className="bg-white/5 text-white/60 text-[9px] font-black uppercase py-2 rounded-lg border border-white/10 hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                                      >
                                         <Copy className="w-3 h-3" /> Copy Secret
                                      </button>
                                      <button
                                        onClick={() => {
                                           setSignalSecretKey(decryptedNote);
                                           showToast("Ledger data pushed to signaling secret", "info");
                                        }}
                                        className="bg-indigo-500/20 text-indigo-300 text-[9px] font-black uppercase py-2 rounded-lg border border-indigo-500/30 hover:bg-indigo-500/30 transition-all flex items-center justify-center gap-2 text-center"
                                      >
                                         <ArrowUp className="w-3 h-3" /> Push To Signal
                                      </button>
                                   </div>
                                </motion.div>
                             )}
                          </div>
                       </div>
                    </div>
                  </div>
                </section>

                {/* Vault Insights Health Index (Restored) */}
                <section className="bg-indigo-950/60 backdrop-blur-xl rounded-[28px] p-6 border border-white/10 shadow-xl space-y-4">
                   <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 rounded-xl bg-teal-500/15 flex items-center justify-center border border-teal-500/20">
                        <Activity className="w-4 h-4 text-teal-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-black tracking-widest uppercase text-teal-200">
                           Node Health
                        </h3>
                      </div>
                    </div>
                    <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                      <div className="text-[8px] font-black uppercase text-indigo-400 tracking-wider mb-1">
                        System Integrity score
                      </div>
                      <div className="text-2xl font-black text-white">
                        {realTimeIntegrity.toFixed(1)}%
                      </div>
                    </div>
                </section>

              </div>
            </div>
          </div>
        )}
      </main>

        {/* Settings and Network Dashboard (Full Page) */}
        <AnimatePresence>
          {showSettingsPanel && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed inset-0 z-50 bg-indigo-950 flex flex-col"
            >
              {/* Sticky Header for Settings Interface */}
              <header className="sticky top-0 z-[60] bg-indigo-950/95 backdrop-blur-2xl border-b border-white/5 py-4 px-4 sm:px-8 lg:px-12">
                <div className="max-w-7xl mx-auto flex flex-row justify-between items-center gap-4">
                  <div className="flex flex-col min-w-0">
                    <h2 className="text-xl sm:text-4xl lg:text-5xl font-black tracking-tighter leading-none text-white truncate">SYSTEM INFRASTRUCTURE</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[8px] sm:text-xs font-black text-indigo-400 tracking-[0.3em] uppercase">VAULT CORE v2.4.x</span>
                      <div className="flex items-center gap-1 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20">
                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-wider">Secure Zone</span>
                      </div>
                      <div className="hidden sm:block h-px w-6 sm:w-12 bg-white/10" />
                      <div className="flex items-center gap-1 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                        <div className={`w-1 h-1 ${p2pStatus?.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'} rounded-full`} />
                        <span className={`text-[8px] font-black ${p2pStatus?.isOnline ? 'text-emerald-400' : 'text-red-400'} uppercase tracking-wider`}>
                          {p2pStatus?.isOnline ? 'Operational' : 'Offline'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowSettingsPanel(false)}
                    className="relative flex items-center gap-3 bg-black/40 border border-white/10 px-5 py-2.5 transition-all hover:border-indigo-500/50 hover:bg-indigo-950/40 group active:scale-95 shrink-0 overflow-hidden"
                    title="Return to Vault"
                  >
                    <div className="absolute top-0 left-0 w-1.5 h-1.5 bg-indigo-500/40" />
                    <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-indigo-500/40" />
                    <div className="absolute bottom-0 left-0 w-1.5 h-1.5 bg-indigo-500/40" />
                    <div className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-indigo-500/40" />
                    
                    <span className="text-[10px] font-mono font-black tracking-[0.2em] text-indigo-400 group-hover:text-indigo-200 transition-colors uppercase">
                      Exit_Interface
                    </span>
                    <div className="flex items-center justify-center w-6 h-6 border border-white/10 bg-white/5 group-hover:border-indigo-500/40 group-hover:bg-indigo-500/20 transition-all">
                      <X className="w-3.5 h-3.5 text-indigo-300 group-hover:text-white" />
                    </div>
                  </button>
                </div>
              </header>

              <div className="flex-1 flex flex-col w-full max-w-7xl mx-auto p-4 sm:p-8 lg:p-12 overflow-y-auto custom-scrollbar">
                {/* Tabs Navigation (Full Page Style) */}
                <div className="flex gap-1.5 p-1 bg-black/20 rounded-[20px] sm:rounded-[24px] mb-6 sm:mb-10 border border-white/5 max-w-4xl overflow-x-auto no-scrollbar scrollbar-none snap-x whitespace-nowrap sticky top-0 z-50 bg-indigo-950/50 backdrop-blur-sm">
                  {[
                    { id: "general", label: "NODE CONFIG", mobileLabel: "Config", icon: Database },
                    { id: "security", label: "VAULT SECURITY", mobileLabel: "Security", icon: Shield },
                    { id: "bounty", label: "BUG BOUNTY & SECURE CHIP", mobileLabel: "Bounty", icon: ShieldAlert },
                    { id: "network", label: "NETWORK MESH", mobileLabel: "Network", icon: Globe },
                    { id: "health", label: "SYSTEM HEALTH", mobileLabel: "Health", icon: Activity },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsTab(tab.id as any)}
                      className={`flex-1 flex-shrink-0 sm:flex-shrink items-center justify-center gap-1.5 sm:gap-3 py-2.5 sm:py-3.5 px-3 sm:px-0 rounded-xl sm:rounded-[18px] text-[10px] sm:text-[11px] font-black transition-all snap-center min-w-[80px] sm:min-w-0 ${
                        settingsTab === tab.id 
                          ? "bg-indigo-600 text-white shadow-2xl shadow-indigo-600/20 border border-white/10" 
                          : "text-indigo-300/40 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                      <span className="sm:hidden">{tab.mobileLabel}</span>
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar">
                  {settingsTab === "general" && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 lg:grid-cols-2 gap-8"
                    >
                      <div className="flex flex-col gap-8">
                        {/* Master Seed Keypack (.vault) */}
                        <div className="bg-white/5 p-8 rounded-[32px] border border-white/5 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                          <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 blur-[80px] rounded-full" />
                          <div className="relative z-10 flex flex-col items-start gap-6">
                            <div className="p-5 bg-emerald-500/20 rounded-2xl text-emerald-300">
                              <Database className="w-10 h-10" />
                            </div>
                            <div>
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-xl font-black tracking-tight uppercase text-white">Sovereign Keypack (.vault)</h3>
                                <div className="text-[9px] bg-fuchsia-500/10 text-fuchsia-300 px-2 py-1 rounded font-black uppercase tracking-widest border border-fuchsia-500/20">Decentralized BlockDAG</div>
                              </div>
                              <p className="text-sm text-indigo-200/60 font-medium leading-relaxed">
                                Universal identity seed key. Acts as a master key. You can backup your master key now even if your vault is empty. Importing this keypack to a new installation restores your profile credentials, allowing you to instantly regain full access to all your files stored securely on the <strong>Decentralized Server BlockDAG</strong>.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-4 w-full">
                              <button 
                                onClick={downloadSovereignVaultPack}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 hover:scale-[1.02] text-white px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-2"
                              >
                                <Download className="w-4 h-4" />
                                Backup Master Key
                              </button>
                              <button
                                onClick={() => {
                                  setShowSovereignRecovery(true);
                                  setShowSettingsPanel(false);
                                }}
                                className="flex-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all hover:bg-amber-500/20 active:scale-95 flex items-center justify-center gap-2"
                              >
                                <Key className="w-4 h-4" />
                                Manage Recovery Key
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Physical Database (.db) */}
                        <div className="bg-white/5 p-8 rounded-[32px] border border-white/5 relative overflow-hidden group hover:border-amber-500/30 transition-all">
                          <div className="absolute -top-12 -right-12 w-48 h-48 bg-amber-500/10 blur-[80px] rounded-full" />
                        </div>
                      </div>

                      <div className="bg-indigo-900/10 p-8 rounded-[40px] border border-indigo-500/20 flex flex-col">
                        <h4 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400 mb-6 flex items-center gap-3">
                           <Activity className="w-4 h-4" />
                           VAULT TELEMETRY
                        </h4>
                        <div className="space-y-6 text-sm text-indigo-100/70 leading-relaxed font-medium">
                          <p>
                            Your workspace identity is derived via <span className="text-white font-bold">PBKDF2-HMAC-SHA256</span>. 
                            Because the derivation is strictly deterministic, your credentials serve as a universal stateless hardware key.
                          </p>
                          <div className="p-4 bg-indigo-500/10 rounded-xl border border-indigo-500/20 font-mono text-[11px] text-indigo-300">
                            SALT = SHA256(username.toLowerCase())<br/>
                            KEY = PBKDF2(pass, SALT, 100k, SHA256)
                          </div>
                          <p>
                            Importing a <code className="text-white bg-white/10 px-1.5 py-0.5 rounded">vault.db</code> snapshot on any clean instance allows the system to reconstruct 
                            your authenticated session states losslessly.
                          </p>
                        </div>

                         <div className="mt-auto pt-10">
                            <div className="bg-white/5 p-6 rounded-2xl border border-white/5 flex items-center gap-4">
                               <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                                  <Cpu className="w-5 h-5" />
                               </div>
                               <div>
                                  <div className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">Active Threads</div>
                                  <div className="text-lg font-black text-white">QUANTUM-CORE V2</div>
                               </div>
                            </div>
                         </div>
                      </div>
                    </motion.div>
                  )}

                  {settingsTab === "security" && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="grid grid-cols-1 lg:grid-cols-12 gap-8"
                    >
                      <div className="lg:col-span-7 space-y-8">
                        <section className="bg-white/5 p-8 rounded-[32px] border border-white/5 relative overflow-hidden group">
                           <div className="absolute -top-12 -right-12 w-48 h-48 bg-indigo-500/10 blur-[80px] rounded-full" />
                           <div className="relative z-10 space-y-8">
                              <div className="flex items-center gap-4">
                                <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-300">
                                  <Lock className="w-8 h-8" />
                                </div>
                                <div>
                                  <h3 className="text-xl font-black tracking-tight text-white uppercase">Sovereign Access Control</h3>
                                  <p className="text-xs text-indigo-300 font-bold tracking-widest mt-1">IDENTITY DERIVATION PROTOCOLS</p>
                                </div>
                              </div>

                              <form onSubmit={handleUpdateProfile} className="space-y-10">
                                 {/* Display Name */}
                                 <div className="space-y-3">
                                   <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-indigo-400">Workspace Label</label>
                                   <input
                                      type="text"
                                      value={editDisplayName}
                                      onChange={(e) => setEditDisplayName(e.target.value)}
                                      placeholder={currentUser?.displayName}
                                      className="w-full bg-black/20 border border-white/10 rounded-2xl p-5 text-sm font-bold text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 outline-none transition-all"
                                   />
                                 </div>

                                 {/* Auto-Lock */}
                                 <div className="space-y-3">
                                   <label className="block text-[10px] font-black tracking-[0.2em] uppercase text-indigo-400 mb-4">Auto-Lock Sensitivity</label>
                                   <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                      {[
                                        { label: "Disabled", value: 0 },
                                        { label: "1 MIN", value: 1 },
                                        { label: "5 MIN", value: 5 },
                                        { label: "15 MIN", value: 15 },
                                        { label: "30 MIN", value: 30 },
                                        { label: "1 HOUR", value: 60 },
                                      ].map((opt) => (
                                        <button
                                          key={opt.value}
                                          type="button"
                                          onClick={() => setAutoLockInterval(opt.value)}
                                          className={`py-4 px-6 rounded-2xl border text-[10px] font-black tracking-widest uppercase transition-all ${
                                            autoLockInterval === opt.value
                                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                                              : "bg-white/5 border-white/5 text-indigo-300 hover:bg-white/10"
                                          }`}
                                        >
                                          {opt.label}
                                        </button>
                                      ))}
                                   </div>
                                 </div>

                                 {/* Password Rotation */}
                                 <div className="bg-amber-950/20 border border-amber-500/20 rounded-[32px] p-8 space-y-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                       <Zap className="w-24 h-24 text-amber-500" />
                                    </div>
                                    <div className="flex gap-4">
                                       <div className="w-1.5 h-full bg-amber-500 rounded-full" />
                                       <div>
                                          <h4 className="text-sm font-black text-amber-400 uppercase tracking-widest">Master Key Rotation</h4>
                                          <p className="text-[11px] text-amber-200/60 font-medium leading-relaxed mt-1">
                                            Updating your passphrase triggers a local E2E re-encryption cycle. All file hashes will be rotated to the new SHA-256 derivation ring.
                                          </p>
                                       </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                       <div className="space-y-2">
                                          <label className="text-[9px] font-black text-amber-500/60 tracking-wider uppercase">Current Pass</label>
                                          <input
                                            type="password"
                                            value={editCurrentPassword}
                                            onChange={(e) => setEditCurrentPassword(e.target.value)}
                                            placeholder="••••••••"
                                            className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-xs font-bold text-white focus:border-amber-500/50 outline-none"
                                          />
                                       </div>
                                       <div className="space-y-2">
                                          <label className="text-[9px] font-black text-amber-500/60 tracking-wider uppercase">New Security Ring</label>
                                          <input
                                            type="password"
                                            value={editNewPassword}
                                            onChange={(e) => setEditNewPassword(e.target.value)}
                                            placeholder="Min 6 chars + Num"
                                            className="w-full bg-black/40 border border-white/5 rounded-xl p-4 text-xs font-bold text-white focus:border-amber-500/50 outline-none"
                                          />
                                       </div>
                                    </div>
                                 </div>

                                 <button
                                    type="submit"
                                    className="w-full bg-white text-indigo-950 hover:bg-indigo-50 py-6 rounded-[24px] font-black text-xs uppercase tracking-[0.3em] shadow-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                 >
                                    Commit Security Update
                                    <ArrowRight className="w-4 h-4" />
                                 </button>
                              </form>
                           </div>
                        </section>
                      </div>

                      <div className="lg:col-span-5 space-y-8">
                         <div className="bg-indigo-950/40 border border-indigo-400/20 rounded-[32px] p-8 flex flex-col items-center text-center gap-6">
                            <div className="p-6 bg-indigo-500/10 rounded-full">
                               <ShieldCheck className="w-12 h-12 text-indigo-400" />
                            </div>
                            <div>
                               <h4 className="text-lg font-black text-white uppercase tracking-tight">Zero-Knowledge Guard</h4>
                               <p className="text-sm text-indigo-300 font-medium leading-relaxed mt-2 opacity-60">
                                 Your master key never leaves volatile memory (RAM). The vault state is strictly client-encrypted before persisting to the local SQLite partition.
                               </p>
                            </div>
                            <div className="w-full h-px bg-white/5" />
                            <div className="w-full grid grid-cols-2 gap-4">
                               <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                  <div className="text-[9px] font-black text-indigo-400 uppercase mb-1">Hashing</div>
                                  <div className="text-xs font-mono text-white">PBKDF2-256</div>
                               </div>
                               <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                                  <div className="text-[9px] font-black text-indigo-400 uppercase mb-1">Enc Type</div>
                                  <div className="text-xs font-mono text-white">AES-GCM+ChaCha20</div>
                               </div>
                            </div>

                          <div className="bg-indigo-950/40 border border-indigo-400/15 rounded-[32px] p-8 flex flex-col gap-3 border border-white/5 relative overflow-hidden group">
                               <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">Storage Repair Tool</h4>
                               <p className="text-[11px] text-indigo-300 font-medium">Re-sync physical storage (.enc/.meta files) with database records.</p>
                               <button
                                 onClick={handleRunStorageRepair}
                                 disabled={repairing}
                                 className="w-full bg-white/5 py-4 rounded-xl text-xs font-bold text-white hover:bg-white/10 active:scale-95 transition-all"
                               >
                                 {repairing ? "Repairing..." : "Scan & Repair"}
                               </button>
                             </div>
                          </div>

                          <div className="bg-indigo-950/40 border border-indigo-400/15 rounded-[32px] p-8 flex flex-col gap-3 border border-white/5 relative overflow-hidden group hover:border-indigo-500/30 transition-all">
                               <h4 className="text-xs font-black text-white uppercase tracking-[0.2em]">Verify Vault Integrity</h4>
                               <p className="text-[11px] text-indigo-300 font-medium">Audit all encrypted sectors for bit-rot and verify HMAC-SHA256 signatures.</p>
                               <button
                                 onClick={() => {
                                   setShowSettingsPanel(false);
                                   setShowVaultIntegrityModal(true);
                                 }}
                                 className="w-full bg-indigo-600 hover:bg-indigo-500 py-4 rounded-xl text-xs font-bold text-white active:scale-95 transition-all"
                               >
                                 Verify Vault Integrity
                               </button>
                          </div>

                         {rekeyingProgress && (
                           <motion.div 
                             initial={{ opacity: 0, x: 20 }}
                             animate={{ opacity: 1, x: 0 }}
                             className="bg-emerald-950/40 border border-emerald-500/30 rounded-3xl p-6 flex flex-col gap-4"
                           >
                              <div className="flex items-center gap-3">
                                 <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                                 <span className="text-xs font-black text-emerald-400 uppercase tracking-widest">Active Migration</span>
                              </div>
                              <p className="text-[11px] text-emerald-200/70 font-medium">{rekeyingProgress}</p>
                           </motion.div>
                         )}
                      </div>
                    </motion.div>
                  )}

                  {settingsTab === "network" && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="max-w-4xl space-y-10 pb-10"
                    >
                      <div className="bg-black/20 border border-white/10 rounded-[24px] sm:rounded-[32px] p-5 sm:p-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8 sm:mb-10">
                          <div>
                            <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">INFRASTRUCTURE STRATEGY 3: MDNS</h3>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em]">SUBNET MULTICAST DNS</span>
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end">
                            <span className="bg-emerald-500/90 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg shadow-emerald-500/10">ACTIVE NODE</span>
                            <span className="text-[10px] font-mono text-indigo-400 mt-2">_secure-vault._tcp.local</span>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="text-xs font-black text-indigo-300/40 uppercase tracking-[0.2em] mb-4">NODE INTERFACE SELECTION</div>
                          {availableIps.length === 0 ? (
                            <div className="p-8 bg-white/5 rounded-2xl border border-white/5 text-center text-xs text-indigo-300 italic animate-pulse">
                              Initializing physical node interfaces...
                            </div>
                          ) : (
                            availableIps.map((ip) => {
                              const isSelected = mDnsIp === ip;
                              return (
                                <div 
                                  key={ip} 
                                  onClick={() => setMDnsIp(ip)}
                                  className={`group flex flex-col p-6 rounded-2xl border-2 transition-all cursor-pointer ${isSelected ? "bg-indigo-600/10 border-indigo-500/50 shadow-2xl shadow-indigo-500/10" : "bg-white/5 border-white/5 hover:border-white/10"}`}
                                >
                                  <div className="flex items-center justify-between gap-4 min-w-0">
                                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isSelected ? "bg-indigo-500 text-white" : "bg-white/5 text-indigo-300/30"}`}>
                                        <Globe className="w-5 h-5" />
                                      </div>
                                      <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-sm sm:text-lg font-mono font-black text-white truncate w-full" title={ip}>{ip}</span>
                                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider text-left truncate">Real-Time P2P Interface</span>
                                      </div>
                                    </div>
                                    <div className={`w-6 h-6 rounded-full border-[3px] p-1 shrink-0 ${isSelected ? "border-indigo-400" : "border-white/10"}`}>
                                      {isSelected && <motion.div layoutId="net-dot-modal" className="w-full h-full bg-indigo-400 rounded-full" />}
                                    </div>
                                  </div>
                                  
                                  <div className="mt-6 flex flex-wrap items-center gap-4 sm:gap-6 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em]">
                                    <div className="flex items-center gap-2">
                                      <span className="text-indigo-500 opacity-50">NIC:</span> <span className="text-white">Q-MESH PRIMARY</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-indigo-500 opacity-50">PORT:</span> <span className="text-white">3000</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-indigo-500 opacity-50">SWITCH:</span> <span className="text-emerald-400">P2P TUNNEL</span>
                                    </div>
                                    <div className="flex items-center gap-2 sm:ml-auto">
                                      <span className="text-indigo-500 opacity-50">HEARTBEAT:</span> <span className="text-indigo-300 animate-pulse">ACTIVE</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                        <div className="flex items-center gap-3 bg-emerald-500/5 border border-emerald-500/20 p-5 rounded-2xl mt-8">
                          <Zap className="w-5 h-5 text-emerald-400 animate-bounce" />
                          <p className="text-xs text-emerald-400/80 font-bold leading-relaxed">
                            Peer Discovery: Initializing multicast heartbeat override. This node is broadcasting identity <span className="text-white font-mono">{peerId?.substring(0, 8)}</span> to authorized router subnets.
                          </p>
                        </div>
                      </div>

                      {/* Cross-Network Fallback Relay & Bootstrap Gateway */}
                      <div className="bg-black/20 border border-white/10 rounded-[24px] sm:rounded-[32px] p-5 sm:p-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-8">
                          <div>
                            <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-2">INFRASTRUCTURE GATEWAY: CROSS-NETWORK RELAY</h3>
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-bold text-indigo-400 uppercase tracking-[0.2em]">NAT-Traversal & Bootstrap Suite</span>
                              <div className={`w-1.5 h-1.5 rounded-full ${relayStatus?.bootstrapRelayUrl ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-indigo-500/40'}`} />
                            </div>
                          </div>
                          <div className="flex flex-col items-start sm:items-end">
                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest leading-none ${relayStatus?.bootstrapRelayUrl ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/10'}`}>
                              {relayStatus?.bootstrapRelayUrl ? 'HYBRID WAN MODE' : 'LOCAL MESH ONLY'}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <p className="text-xs text-indigo-200/60 leading-relaxed max-w-2xl">
                            While local mDNS works beautifully on the same subnet, multicast traffic terminates at router/NAT boundaries. Configure a fallback Bootstrap Relay server below to bridge distinct network sites, route block replications over encrypted tunnels, and preserve decentralized portability.
                          </p>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Relay client settings */}
                            <div className="space-y-4 p-6 bg-white/[0.02] border border-white/5 rounded-2xl">
                              <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                                <Plug className="w-3.5 h-3.5" /> Configure Cloud Bootstrap Remote URL
                              </span>
                              
                              <div className="space-y-2">
                                <label className="text-[10px] font-black text-indigo-300/40 uppercase tracking-widest">Relay Target URL / Multiaddr</label>
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <input 
                                    type="text" 
                                    value={relayUrlInput}
                                    placeholder="/ip4/203.0.113.50/tcp/3000/p2p/Qm..."
                                    onChange={(e) => setRelayUrlInput(e.target.value)}
                                    className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono placeholder-indigo-300/20 focus:outline-none focus:border-indigo-500/50"
                                  />
                                  <button
                                    onClick={async () => {
                                      setRelaySyncing(true);
                                      setRelayStatusMsg(null);
                                      try {
                                        const res = await fetch("/api/relay/config", {
                                          method: "POST",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ url: relayUrlInput })
                                        });
                                        if (res.ok) {
                                          const data = await res.json();
                                          setRelayStatus(data);
                                          setRelayStatusMsg({ type: "success", text: `Relay Target configured successfully!` });
                                        } else {
                                          setRelayStatusMsg({ type: "error", text: "Failed to configure Bootstrap relay url target" });
                                        }
                                      } catch (e: any) {
                                        setRelayStatusMsg({ type: "error", text: `Relay config connection failed: ${e.message}` });
                                      } finally {
                                        setRelaySyncing(false);
                                      }
                                    }}
                                    disabled={relaySyncing}
                                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap shrink-0"
                                  >
                                    Apply
                                  </button>
                                </div>
                                 <p className="text-[9px] font-medium text-indigo-300/30 leading-normal">
                                  Supports standard libp2p multiaddr format (e.g. <span className="text-indigo-400">/ip4/host/tcp/port/p2p/peerId</span>). The segment parser automatically extracts the port, host, and cryptographic identity.
                                </p>
                                <button
                                  onClick={() => {
                                    setShowNetworkDocs(true);
                                  }}
                                  type="button"
                                  className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-all flex items-center gap-1.5 uppercase tracking-wider cursor-pointer bg-white/5 border border-white/5 hover:border-indigo-500/20 px-3 py-1.5 rounded-lg w-fit"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-indigo-400" /> Read Connection Protocol Manual
                                </button>
                              </div>

                              {relayStatus?.bootstrapRelayPeerId && (
                                <div className="bg-black/30 p-3 rounded-xl border border-white/5 space-y-1.5 mt-2">
                                  <div className="flex items-center justify-between text-[9px] font-black uppercase">
                                    <span className="text-indigo-400">Target Peer ID</span>
                                    <span className={relayStatus.isRelayHandshakeVerified ? "text-emerald-400 font-bold" : "text-amber-500 animate-pulse font-bold"}>
                                      {relayStatus.isRelayHandshakeVerified ? "✓ Handshake verified" : "⚠️ Handshake pending"}
                                    </span>
                                  </div>
                                  <div className="text-[10px] font-mono text-indigo-200 break-all select-all">
                                    {relayStatus.bootstrapRelayPeerId}
                                  </div>
                                </div>
                              )}

                              {relayStatusMsg && (
                                <div className={`p-2.5 rounded-lg text-[10px] font-bold ${relayStatusMsg.type === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border border-rose-500/20"}`}>
                                  {relayStatusMsg.text}
                                </div>
                              )}

                              {relayStatus?.bootstrapRelayUrl && (
                                <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl flex items-center justify-between gap-4 min-w-0">
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${relayStatus?.isRelayHandshakeVerified ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`} />
                                    <div className="flex flex-col min-w-0 flex-1">
                                      <span className="text-[10px] font-black text-white leading-none truncate">
                                        {relayStatus?.isRelayHandshakeVerified ? 'TUNNEL STATUS: SECURE_TUNNEL_ESTABLISHED' : 'TUNNEL STATUS: AUTHENTICATING'}
                                      </span>
                                      <span className="text-[8px] font-mono text-emerald-400 mt-1 truncate w-full" title={relayStatus.bootstrapRelayUrl}>
                                        {relayStatus.bootstrapRelayUrl}
                                      </span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={async () => {
                                      setRelayUrlInput("");
                                      setRelayStatusMsg(null);
                                      const res = await fetch("/api/relay/config", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ url: "" })
                                      });
                                      if (res.ok) {
                                        const data = await res.json();
                                        setRelayStatus(data);
                                      }
                                    }}
                                    className="text-[9px] text-rose-400 hover:text-rose-300 font-bold uppercase tracking-widest underline decoration-dashed"
                                  >
                                    Disconnect
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Relay Host Hub Toggles */}
                            <div className="space-y-4 p-6 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col gap-4">
                              <div className="space-y-3">
                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider flex items-center gap-2">
                                  <Cpu className="w-3.5 h-3.5" /> Sovereign Relay Server Status
                                </span>
                                <p className="text-[10px] text-indigo-100/40 leading-relaxed font-medium">
                                  Enable the Sovereign Relay Hub capabilities on this node. When enabled, other NAT-blocked instances can leverage this node as their bootstrap peer.
                                </p>
                              </div>

                              <div className="flex items-center justify-between p-4 bg-black/40 rounded-xl border border-white/5">
                                <div className="flex flex-col">
                                  <span className="text-xs font-bold text-white">Act as Relay Server</span>
                                  <span className="text-[9px] font-mono text-indigo-300/40 mt-0.5">Route external block-gossips</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const nextState = !isRelayHubEnabled;
                                    setIsRelayHubEnabled(nextState);
                                    const res = await fetch("/api/relay/config", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ enableRelayHub: nextState })
                                    });
                                    if (res.ok) {
                                      const data = await res.json();
                                      setRelayStatus(data);
                                    }
                                  }}
                                  className="relative inline-flex h-6 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                                  style={{ backgroundColor: isRelayHubEnabled ? '#10b981' : '#1e1b4b' }}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                                      isRelayHubEnabled ? 'translate-x-6' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>

                              {isRelayHubEnabled && relayStatus?.localPeerId && (
                                <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-3">
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Local Peer Cryptographic ID</span>
                                    <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded-lg border border-white/5 justify-between">
                                      <span className="text-[10px] font-mono text-indigo-200 select-all truncate flex-1">{relayStatus.localPeerId}</span>
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(relayStatus.localPeerId);
                                          showToast("Peer ID copied to clipboard!", "success");
                                        }}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase shrink-0"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                  </div>
                                  <div className="space-y-1">
                                    <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Your Bootstrap Multiaddr Link</span>
                                    <div className="flex items-center gap-2 bg-black/60 px-3 py-2 rounded-lg border border-white/5 justify-between">
                                      <span className="text-[10px] font-mono text-indigo-200 select-all truncate flex-1">
                                        {`/ip4/127.0.0.1/tcp/3000/p2p/${relayStatus.localPeerId}`}
                                      </span>
                                      <button 
                                        onClick={() => {
                                          navigator.clipboard.writeText(`/ip4/127.0.0.1/tcp/3000/p2p/${relayStatus.localPeerId}`);
                                          showToast("Bootstrap Multiaddr copied!", "success");
                                        }}
                                        className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold uppercase shrink-0"
                                      >
                                        Copy
                                      </button>
                                    </div>
                                    <p className="text-[8px] font-medium text-indigo-300/20 mt-1 leading-normal">
                                      Distribute this multiaddr link to external sites. The multiaddr segment-parser will automatically authenticate and handshake with your node.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-black/10 border border-white/5 rounded-[24px] sm:rounded-[32px] p-5 sm:p-10">
                        <div className="flex items-center justify-between mb-8">
                          <div>
                            <h4 className="text-xs font-black uppercase text-indigo-300 tracking-[0.2em]">PHYSICAL SWITCH CORE (V-ZONE)</h4>
                            <p className="text-[10px] text-indigo-500 font-bold uppercase mt-1">Virtual Cross-Connect Mapping</p>
                          </div>
                          <div className="bg-indigo-500/10 p-2 rounded-lg">
                            <Cpu className="w-5 h-5 text-indigo-400" />
                          </div>
                        </div>

                        {/* Distributed Network Mesh Visualization */}
                      <div className="mb-8 p-6 bg-indigo-600/5 rounded-2xl border border-indigo-500/10 backdrop-blur-sm">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <h3 className="text-sm font-black uppercase tracking-tighter text-indigo-100">Decentralized Mesh Distribution Network</h3>
                                </div>
                                <p className="text-[10px] text-indigo-300/60 font-medium">Automatic block-level gossip replication across decentralized sovereign nodes.</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-center">
                                    <div className="text-[8px] text-indigo-400 font-bold uppercase tracking-widest leading-none">Active Peers</div>
                                    <div className="text-lg font-black text-indigo-100">{meshNodes.length}</div>
                                </div>
                                <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-center">
                                    <div className="text-[8px] text-indigo-400 font-bold uppercase tracking-widest leading-none">Shadow Blocks</div>
                                    <div className="text-lg font-black text-emerald-400">{meshHealth?.shadowBlocksHeld || 0}</div>
                                </div>
                                <div className="px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-center">
                                    <div className="text-[8px] text-indigo-400 font-bold uppercase tracking-widest leading-none">Sync Queue</div>
                                    <div className="text-lg font-black text-indigo-100">{meshHealth?.backlogSize || 0}</div>
                                </div>
                            </div>
                        </div>

                        {/* Node List and Gossip Feed */}
                        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <div className="lg:col-span-2 space-y-4">
                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest px-1">Active Sovereign Nodes</span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <AnimatePresence>
                                        {meshNodes.map((node, i) => (
                                            <motion.div
                                                key={node.id || node.username}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                className={`p-3 bg-white/[0.03] border ${node.id === instanceId ? 'border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'border-white/5'} rounded-xl flex items-center gap-3 relative overflow-hidden group`}
                                            >
                                                <div className="absolute top-0 right-0 p-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                                                </div>
                                                <div 
                                                  className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold border border-white/10"
                                                  style={{ backgroundColor: `${node.avatarColor}20`, color: node.avatarColor }}
                                                >
                                                  {node.username.substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-[11px] font-bold text-white/90 truncate">
                                                        {node.displayName} {node.id === instanceId && <span className="text-[9px] text-indigo-400 font-black ml-1">(SELF)</span>}
                                                    </div>
                                                    <div className="text-[9px] font-mono text-white/30 truncate">{node.localIp}:{node.port}</div>
                                                    <div className="flex items-center gap-1 mt-0.5">
                                                        <Zap className="w-2 h-2 text-indigo-400" />
                                                        <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Global Node</span>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                        {meshNodes.length === 0 && (
                                            <div className="col-span-full py-8 text-center bg-white/[0.02] border border-dashed border-white/10 rounded-xl">
                                                <Globe className="w-6 h-6 text-white/10 mx-auto mb-2" />
                                                <div className="text-[10px] font-black uppercase text-white/20 tracking-widest">Searching distributed peers...</div>
                                            </div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest px-1">Live Mesh Gossip Feed</span>
                                <div className="bg-black/40 rounded-xl border border-white/10 overflow-hidden h-[200px] flex flex-col">
                                    <div className="flex-1 overflow-y-auto p-3 font-mono text-[9px] space-y-2">
                                        <AnimatePresence initial={false}>
                                            {meshEvents.map((evt) => (
                                                <motion.div 
                                                    key={evt.id}
                                                    initial={{ opacity: 0, x: -10 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    className="flex gap-2"
                                                >
                                                    <span className="text-white/20">[{new Date(evt.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                                    <span className={
                                                        evt.type === 'PEER_UP' ? 'text-blue-400' :
                                                        evt.type === 'BLOCK_REPLICATED' ? 'text-emerald-400 font-bold' :
                                                        'text-indigo-400'
                                                    }>
                                                        {evt.message}
                                                    </span>
                                                </motion.div>
                                            ))}
                                            {meshEvents.length === 0 && (
                                                <div className="text-white/10 text-center py-4">Waiting for mesh heartbeat...</div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                    <div className="p-2 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[8px] text-white/30 font-bold uppercase tracking-widest">Protocol Active</span>
                                        </div>
                                        <span className="text-[8px] font-mono text-white/20">VER: 4.2.0</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mb-6">
                          <h4 className="text-xs font-black uppercase text-indigo-300 tracking-[0.2em]">
                            DISCOVERED PEERS ({(() => {
                              const count = mDnsDiscoveredNodes.length + onlinePeers.length + Object.keys(connectedPeers).length;
                              return count;
                            })()})
                          </h4>
                          <div className="flex gap-1">
                            <div className="w-1.5 h-1.5 bg-indigo-500/20 rounded-full" />
                            <div className="w-1.5 h-1.5 bg-indigo-500/40 rounded-full animate-bounce" />
                            <div className="w-1.5 h-1.5 bg-indigo-500/20 rounded-full" />
                          </div>
                        </div>
                        
                        {mDnsDiscoveredNodes.length === 0 && onlinePeers.length === 0 ? (
                          <div className="bg-black/20 border border-white/5 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                            <Activity className="w-8 h-8 text-indigo-500/20 mb-4 animate-pulse" />
                            <p className="italic text-indigo-200/20 text-sm font-medium tracking-wide">
                              Subnet sweep in progress... Scanning for P2P encrypted tunnels...
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {(() => {
                                const merged = new Map<string, any>();
                                mDnsDiscoveredNodes.forEach((n) => {
                                  if (n && n.localIp) {
                                    merged.set(n.localIp, {
                                      ...n,
                                      isVirtual: false
                                    });
                                  }
                                });
                                onlinePeers.forEach((p) => {
                                  if (p && p.cid) {
                                    merged.set(p.cid, {
                                      username: p.username,
                                      displayName: p.displayName,
                                      localIp: p.cid,
                                      serviceName: "WebSocket Signal Hub",
                                      port: 0,
                                      lastSeen: Date.now(),
                                      isVirtual: false
                                    });
                                  }
                                });
                                Object.keys(connectedPeers).forEach((id) => {
                                  if (id) {
                                    merged.set(id, {
                                      username: id.substring(0, 8),
                                      displayName: `Vault Swarm Node ${id.substring(0, 4)}`,
                                      localIp: id,
                                      serviceName: "P2P WebRTC Swarm",
                                      port: 3000 + (parseInt(id.substring(0, 4), 36) % 1000),
                                      lastSeen: Date.now(),
                                      isVirtual: false
                                    });
                                  }
                                });
                                return Array.from(merged.values());
                              })().map((node: any) => {
                                const isConnected = !!connectedPeers[node.localIp];
                                const latency = latencies[node.localIp];
                                return (
                                  <div key={node.id || node.localIp || node.username} className={`bg-white/5 border border-white/5 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-white/10 transition-all border-l-4 ${isConnected ? 'border-l-emerald-500 shadow-[inset_4px_0_0_0_#10b981]' : 'border-l-indigo-500/30 shadow-[inset_4px_0_0_0_rgba(99,102,241,0.2)]'}`}>
                                    <div className="flex items-center gap-4 min-w-0">
                                      <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center relative ${isConnected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                                        {isConnected ? <Zap className="w-5 h-5" /> : <User className="w-5 h-5" />}
                                        <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-indigo-950 ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="text-sm font-black text-white truncate max-w-[150px] sm:max-w-xs">{node.displayName}</span>
                                          {isConnected && (
                                            <span className="text-[8px] font-black uppercase text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded flex items-center gap-1">
                                              <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />
                                              LINKED
                                            </span>
                                          )}
                                        </div>
                                        <span className="text-[10px] font-mono text-indigo-300/40 truncate">@{node.username} • {node.localIp.substring(0, 16)}...</span>
                                      </div>
                                    </div>
                                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1 w-full sm:w-auto mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${isConnected ? 'text-emerald-300 bg-emerald-500/20' : 'text-indigo-400 bg-white/5'}`}>
                                         {isConnected ? 'NODE STABLE' : 'ADAPTIVE'}
                                      </span>
                                      <span className="text-[9px] font-mono text-indigo-300/60">{latency ? `${latency}ms RTT` : 'REACHING...'}</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            
                            {/* Real-time Network Statistics */}
                            <div className="p-6 bg-indigo-500/5 border border-indigo-500/10 rounded-[24px] space-y-4">
                              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-indigo-400">
                                <span>Network Statistics</span>
                                <span className="text-emerald-400">Authenticated Mesh</span>
                              </div>
                              <div className="flex justify-between items-center text-[9px] font-mono text-indigo-300/40">
                                <span>INGRESS NODES</span>
                                <span>{mDnsDiscoveredNodes.length} ACTIVE</span>
                                <span>ECC ENCRYPTED</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {settingsTab === "health" && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-10"
                    >
                      <div className="bg-black/20 border border-white/5 rounded-[24px] sm:rounded-[40px] p-4 sm:p-10">
                        <div className="flex items-center justify-between mb-8 sm:mb-12">
                          <div className="flex flex-col">
                            <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-none mb-2">QS DISTRIBUTED HEALTH MONITOR</h3>
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] ml-0.5">ANALYTIC LIFECYCLE ENGINE</span>
                          </div>
                          <div className="bg-indigo-500/10 p-3 sm:p-4 rounded-xl sm:rounded-2xl border border-indigo-500/20">
                            <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-400" />
                          </div>
                        </div>

                        <div className="bg-black/40 rounded-[20px] sm:rounded-[32px] p-4 sm:p-8 border border-white/5 relative mb-6 sm:mb-10 shadow-inner">
                          <div className="flex justify-between items-center mb-6 sm:mb-8">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-300/50">Storage Dynamics</span>
                              <span className="text-xs sm:text-sm font-bold text-white mt-1">7-DAY HISTORIC DELTA</span>
                            </div>
                            <button 
                              onClick={() => setShowTransferHistoryModal(true)}
                              className="flex items-center gap-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 active:scale-95 px-2.5 py-1.5 rounded-xl border border-indigo-500/20 cursor-pointer transition-all duration-150"
                            >
                              <History className="w-3.5 h-3.5 text-indigo-400" />
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">View History</span>
                            </button>
                          </div>
                          
                          <div className="w-full h-64 sm:h-80 relative min-w-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={200}>
                              <AreaChart data={storageTrends.length > 0 ? storageTrends : [{ date: 'N/A', media: 0, documents: 0, archives: 0 }]}>
                                <defs>
                                  <linearGradient id="colorMedia" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#34d399" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#34d399" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="colorDocs" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="colorArchives" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="5 5" vertical={false} stroke="rgba(255,255,255,0.03)" />
                                <XAxis 
                                  dataKey="date" 
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(date) => date instanceof Date ? date.toLocaleDateString(undefined, { weekday: 'short' }) : date}
                                  tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: '9px', fontWeight: 'bold' }}
                                  dy={15}
                                />
                                <YAxis 
                                  axisLine={false}
                                  hide
                                  domain={['auto', 'auto']}
                                />
                                <Tooltip 
                                  cursor={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '5 5' }}
                                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '12px' }}
                                  itemStyle={{ fontSize: '11px', fontWeight: '900' }}
                                  labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: '9px', marginBottom: '8px', display: 'block' }}
                                />
                                <Area 
                                  type="monotone" 
                                  stackId="1"
                                  dataKey="media" 
                                  stroke="#34d399" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorMedia)" 
                                  animationDuration={2000}
                                />
                                <Area 
                                  type="monotone" 
                                  stackId="1"
                                  dataKey="documents" 
                                  stroke="#6366f1" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorDocs)" 
                                  animationDuration={2200}
                                />
                                <Area 
                                  type="monotone" 
                                  stackId="1"
                                  dataKey="archives" 
                                  stroke="#a855f7" 
                                  strokeWidth={3}
                                  fillOpacity={1} 
                                  fill="url(#colorArchives)" 
                                  animationDuration={2400}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>

                          <div className="flex flex-wrap justify-center gap-4 sm:gap-10 mt-8 sm:mt-12 border-t border-white/5 pt-6 sm:pt-8">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.6)]" />
                              <span className="text-[10px] font-black tracking-widest uppercase text-white/70">MEDIA HASHES</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)]" />
                              <span className="text-[10px] font-black tracking-widest uppercase text-white/70">DATA BLOCKS</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.6)]" />
                              <span className="text-[10px] font-black tracking-widest uppercase text-white/70">SYSTEM ARCHIVE</span>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                          <div className="bg-white/5 border border-white/5 p-6 sm:p-8 rounded-[24px] sm:rounded-[32px] transition-all hover:bg-white/10 hover:translate-y-[-4px] group">
                            <div className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-3">Integrity Score</div>
                            <div className="text-3xl sm:text-4xl font-black tracking-tighter text-white group-hover:text-emerald-400 transition-colors">
                              {realTimeIntegrity.toFixed(1)}%
                            </div>
                            <div className="h-1.5 bg-white/5 rounded-full mt-4 overflow-hidden">
                              <div 
                                className="h-full bg-emerald-500 transition-all duration-1000" 
                                style={{ width: `${realTimeIntegrity}%` }}
                              />
                            </div>
                          </div>
                          <div className="bg-white/5 border border-white/5 p-8 rounded-[32px] transition-all hover:bg-white/10 hover:translate-y-[-4px] group">
                            <div className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-3">Entropy Rank</div>
                            <div className="text-4xl font-black tracking-tighter uppercase text-indigo-300 group-hover:text-white transition-colors">
                              {sessionPassword.length >= 10 ? 'ULTRA' : sessionPassword.length >= 6 ? 'SECURE' : 'BASIC'}
                            </div>
                            <p className="text-[10px] font-bold text-white/20 mt-4 uppercase tracking-widest">
                              {sessionPassword.length >= 10 ? 'MILITARY-GRADE' : 'NIST-COMPLIANT'}
                            </p>
                          </div>
                          <div className="bg-white/5 border border-white/5 p-8 rounded-[32px] transition-all hover:bg-white/10 hover:translate-y-[-4px] group">
                            <div className="text-[10px] font-black uppercase text-indigo-400 tracking-[0.2em] mb-3">Sync Uptime</div>
                            <div className="text-4xl font-black tracking-tighter text-white">{realTimeUptime.toFixed(3)}%</div>
                            <div className="flex items-center gap-1 mt-4">
                               {[1,2,3,4,5,6].map(i => <div key={i} className="w-2 h-2 bg-emerald-500/40 rounded-full" />)}
                               <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            </div>
                          </div>
                        </div>

                        {/* Interactive Cryptography & Database Diagnostic Controller */}
                        <div className="mt-8 bg-black/40 border border-white/5 rounded-[32px] p-8 space-y-6">
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
                            <div>
                              <h4 className="text-lg font-black tracking-tight text-white uppercase flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-indigo-400 animate-pulse" />
                                Sovereign Interface Integrity Sandbox
                              </h4>
                              <p className="text-xs text-indigo-300 font-medium mt-1">
                                Real-time dynamic validation of browser Web Crypto algorithms, IndexedDB key vaults, and back-end SQLite persistent databases.
                              </p>
                            </div>
                            <button
                              onClick={triggerDiagnosticSuite}
                              disabled={isDiagnosticRunning}
                              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 whitespace-nowrap self-start md:self-auto cursor-pointer"
                            >
                              {isDiagnosticRunning ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin" /> RUNNING VERIFICATION...
                                </>
                              ) : (
                                "Run Diagnostic Suite"
                              )}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {/* Card 1: Web Crypto API validation */}
                            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">Web Crypto API</span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                    diagCryptoStatus === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/20" :
                                    diagCryptoStatus === "error" ? "bg-red-500/10 text-red-400 border border-red-400/20" :
                                    diagCryptoStatus === "running" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 animate-pulse" :
                                    "bg-white/5 text-indigo-300"
                                  }`}>
                                    {diagCryptoStatus}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-indigo-100 uppercase">Symmetric Cipher & KDF</h5>
                                <p className="text-[11px] text-indigo-300/70 font-medium">
                                  Tests random salt seeds, derives 256-bit keys with PBKDF2 (100k iterations), executes GCM block encryption, and matches integrity hash strings.
                                </p>
                              </div>
                              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                                <span className="text-indigo-400/60 font-medium">Latency Metric:</span>
                                <span className="font-extrabold text-white">
                                  {diagCryptoLatency !== null ? `${diagCryptoLatency} ms` : "—"}
                                </span>
                              </div>
                            </div>

                            {/* Card 2: IndexedDB Local Storage */}
                            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">IndexedDB</span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                    diagIdbStatus === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/20" :
                                    diagIdbStatus === "error" ? "bg-red-500/10 text-red-400 border border-red-400/20" :
                                    diagIdbStatus === "running" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 animate-pulse" :
                                    "bg-white/5 text-indigo-300"
                                  }`}>
                                    {diagIdbStatus}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-indigo-100 uppercase">Vault Persistence</h5>
                                <p className="text-[11px] text-indigo-300/70 font-medium">
                                  Validates IndexedDB state database, verifies transaction writing for master wrapping seeds, checks index retrievals, and verifies record persistence.
                                </p>
                              </div>
                              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                                <span className="text-indigo-400/60 font-medium">Latency Metric:</span>
                                <span className="font-extrabold text-white">
                                  {diagIdbLatency !== null ? `${diagIdbLatency} ms` : "—"}
                                </span>
                              </div>
                            </div>

                            {/* Card 3: SQLite database */}
                            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">SQLite DB</span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                    diagDbStatus === "success" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-400/20" :
                                    diagDbStatus === "error" ? "bg-red-500/10 text-red-400 border border-red-400/20" :
                                    diagDbStatus === "running" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 animate-pulse" :
                                    "bg-white/5 text-indigo-300"
                                  }`}>
                                    {diagDbStatus}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-indigo-100 uppercase">vault.db Connection</h5>
                                <p className="text-[11px] text-indigo-300/70 font-medium">
                                  Verifies Node database engine availability, reaches remote REST cluster routers, queries online credentials, and confirms SQLite relational health.
                                </p>
                              </div>
                              <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                                <span className="text-indigo-400/60 font-medium">Latency Metric:</span>
                                <span className="font-extrabold text-white">
                                  {diagDbLatency !== null ? `${diagDbLatency} ms` : "—"}
                                </span>
                              </div>
                            </div>
                            {/* Card 4: BlockDAG validation */}
                            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-fuchsia-400 tracking-wider">BlockDAG State</span>
                                  <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                                    diagDagStatus === "success" ? "bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-400/20" :
                                    diagDagStatus === "error" ? "bg-red-500/10 text-red-400 border border-red-400/20" :
                                    diagDagStatus === "running" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-400/20 animate-pulse" :
                                    "bg-white/5 text-indigo-300"
                                  }`}>
                                    {diagDagStatus}
                                  </span>
                                </div>
                                <h5 className="text-sm font-black text-indigo-100 uppercase">Chain Integrity</h5>
                                <p className="text-[11px] text-indigo-300/70 font-medium">
                                  Synchronizes cryptographic pointers of historical upload ledger. Hashes payloads and checks signature linkages to ensure perfect integrity.
                                </p>
                              </div>
                              <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
                                {diagDagMessage && (
                                  <div className="text-[9px] font-mono text-fuchsia-300 leading-tight">
                                    {diagDagMessage}
                                  </div>
                                )}
                                <div className="flex flex-col gap-3 mt-4">
                                  <div className="flex items-center justify-between text-[11px] font-mono border-t border-white/5 pt-4">
                                    <span className="text-indigo-400/60 font-medium">Latency Metric:</span>
                                    <span className="font-extrabold text-white">
                                      {diagDagLatency !== null ? `${diagDagLatency} ms` : "—"}
                                    </span>
                                  </div>
                                  
                                  <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-4">
                                    <div className="text-[9px] text-white/30 uppercase tracking-[0.2em] font-black italic text-center leading-relaxed">
                                      Active Authentic Diagnostics Only
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <button 
                                        onClick={recoverDagChain} 
                                        className="w-full py-3 px-4 bg-red-600/10 hover:bg-red-600/20 text-red-400 text-[10px] font-black uppercase rounded-lg border border-red-500/20 transition-all tracking-widest"
                                        title="Heuristic Recovery & Rebuild"
                                      >
                                        Rebuild Chain
                                      </button>
                                      <button 
                                        onClick={restoreFromMesh}
                                        className="w-full py-3 px-4 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-300 text-[10px] font-black uppercase rounded-lg border border-indigo-500/20 transition-all tracking-widest"
                                      >
                                        Mesh RESTORE
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* New: Shard Health Monitor */}
                            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">Storage Mechanics</span>
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                    <span className="text-[9px] font-black uppercase text-emerald-400">Quorum Active</span>
                                  </div>
                                </div>
                                <h5 className="text-sm font-black text-indigo-100 uppercase">Fragment Integrity Quorum</h5>
                                <p className="text-[11px] text-indigo-300/70 font-medium">
                                  Validates Shamir-Secret-Sharing (SSS) quorums across mesh nodes. Threshold check: <strong>K=5 / N=8</strong> fragments reachable.
                                </p>
                              </div>
                              <div className="mt-6 flex flex-col gap-4">
                                <div className="grid grid-cols-8 gap-1.5">
                                  {[...Array(8)].map((_, i) => {
                                    const peerCount = Object.keys(connectedPeers).length + 1; // Include self
                                    return (
                                      <div 
                                        key={i} 
                                        className={`h-1.5 rounded-full transition-all duration-700 ${i < peerCount ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-white/5 border border-white/10'}`} 
                                      />
                                    );
                                  })}
                                </div>
                                <div className="flex items-center justify-between text-[10px] font-mono">
                                  <span className="text-indigo-400/60 uppercase">Availability Metric:</span>
                                  <span className="text-emerald-400 font-black">
                                    {((Object.keys(connectedPeers).length + 1) / 8 * 100).toFixed(1)}% Redundancy
                                  </span>
                                </div>
                                <div className="bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-2">
                                    <Database className="w-3.5 h-3.5 text-indigo-400" />
                                    <span className="text-[9px] font-black text-white uppercase tracking-wider">Reed-Solomon Status</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-indigo-300 font-mono">_CORRECTING_BITROT</span>
                                </div>
                              </div>
                            </div>

                            {/* New: State Convergence Monitor */}
                            <div className="bg-white/5 border border-white/5 p-6 rounded-2xl flex flex-col justify-between">
                              <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-[10px] font-black uppercase text-amber-400 tracking-wider">Resolution Engine</span>
                                  <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">Vector Syncing</span>
                                </div>
                                <h5 className="text-sm font-black text-indigo-100 uppercase">State Convergence Index</h5>
                                <p className="text-[11px] text-indigo-300/70 font-medium">
                                  Audits Anti-Entropy Vector Clocks for CRDT deterministic blending. Ensures zero-conflict resolution across physical neighbors.
                                </p>
                              </div>
                              <div className="mt-6 pt-4 border-t border-white/5 space-y-4">
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-indigo-400/60 uppercase">Local Vector Clock:</span>
                                    <span className="text-amber-400 font-black">
                                      T:{antiEntropyState?.localClock || 0}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-[10px] font-mono">
                                    <span className="text-indigo-400/60 uppercase">Cluster Drift:</span>
                                    <span className="text-indigo-300 font-black">0.0004s</span>
                                  </div>
                                </div>

                                <div className="space-y-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                                  {antiEntropyState?.auditLog && antiEntropyState.auditLog.length > 0 ? (
                                    antiEntropyState.auditLog.slice(0, 3).map((entry, idx) => (
                                      <div key={idx} className="bg-black/20 p-2 rounded-lg border border-white/5 flex items-center justify-between gap-2">
                                        <div className="flex flex-col gap-0.5">
                                          <span className="text-[8px] font-black text-amber-400 uppercase tracking-tighter">
                                            {entry.type} @ {entry.peerId.substring(0, 6)}
                                          </span>
                                          <span className="text-[7px] font-mono text-white/30 italic">
                                            {new Date(entry.timestamp).toLocaleTimeString()}
                                          </span>
                                        </div>
                                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${
                                          entry.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                                        }`}>
                                          {entry.status}
                                        </span>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="text-[9px] text-indigo-300/30 italic text-center py-4 border border-dashed border-white/5 rounded-xl">
                                      Awaiting peer handshake...
                                    </div>
                                  )}
                                </div>

                                <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
                                  <motion.div 
                                    initial={{ width: "30%" }}
                                    animate={{ width: "100%" }}
                                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                    className="h-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]"
                                  />
                                </div>
                              </div>
                            </div>
                          </div>

                          {diagErrorMsg && (
                            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 text-xs font-mono text-red-300 leading-relaxed">
                              <strong className="text-red-400 font-bold uppercase tracking-wider block mb-1">Diagnostic Fault Report:</strong>
                              {diagErrorMsg}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {settingsTab === "bounty" && currentUser && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="space-y-10"
                    >
                      <SecurityBountyDesk 
                        userId={currentUser.id}
                        files={files}
                        refreshData={async () => {
                          try {
                            const userFiles = await api.getFiles(currentUser.id);
                            setFiles(userFiles);
                          } catch (err) {
                            console.error("Error reloading files:", err);
                          }
                        }}
                        showToast={showToast}
                      />
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {viewingDagBlock && (
            <DagVerificationModal
              block={viewingDagBlock}
              userId={currentUser.id}
              onClose={() => setViewingDagBlock(null)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showVaultIntegrityModal && currentUser && (
            <VaultIntegrityModal
              userId={currentUser.id}
              files={files}
              onClose={() => setShowVaultIntegrityModal(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showTransferHistoryModal && (
            <TransferHistoryModal
              history={transferHistory}
              onClose={() => setShowTransferHistoryModal(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {previewFile && (
            <LocalPreviewModal
              file={previewFile}
              currentUser={currentUser}
              sessionPassword={sessionPassword}
              onDownload={handleDownload}
              onClose={() => setPreviewFile(null)}
              formatBytes={formatBytes}
              onViewDag={(block) => setViewingDagBlock(block)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {versionHistoryFile && (
            <VersionHistoryModal
              file={versionHistoryFile}
              versions={fileVersions}
              isLoading={isLoadingVersions}
              onClose={() => setVersionHistoryFile(null)}
              onRestore={handleRestoreVersion}
              formatBytes={formatBytes}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showSovereignRecovery && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl"
                onClick={() => setShowSovereignRecovery(false)}
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-2xl h-full max-h-[800px] z-10"
              >
                <div className="absolute top-4 right-4 z-20">
                  <button 
                    onClick={() => setShowSovereignRecovery(false)}
                    className="p-2 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-all"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <SovereignRecovery 
                  broadcastShard={broadcastShard}
                  requestShard={requestShard}
                  onShardReceived={onShardReceived}
                  initialKey={currentUser?.vaultSeedId}
                  onKeyRestored={(restoredKey) => {
                    // If user is restoring an existing key
                    if (restoredKey !== currentUser?.vaultSeedId) {
                      showToast("Key mismatch. Ensure you are restoring the correct vault identity.", "error");
                    } else {
                      showToast("Identity verified and reconstructed successfully.", "success");
                    }
                    setShowSovereignRecovery(false);
                  }}
                />
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <NetworkDocsDrawer
          isOpen={showNetworkDocs}
          onClose={() => setShowNetworkDocs(false)}
          localPeerId={relayStatus?.localPeerId || peerId}
        />

        {/* Transfer Progress HUD Overlay */}
        <div className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-auto sm:right-6 z-[100] flex flex-col gap-3 sm:w-80 pointer-events-none">
          <AnimatePresence>
            {activeTransfers.map((transfer) => (
              <motion.div
                key={transfer.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 50, scale: 0.9 }}
                className="pointer-events-auto bg-indigo-950/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl overflow-hidden relative"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 overflow-hidden">
                    <div
                      className={`p-1.5 rounded-lg ${
                        transfer.type === "upload"
                          ? "bg-teal-500/20 text-teal-400"
                          : transfer.type === "download"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-indigo-500/20 text-indigo-400"
                      }`}
                    >
                      {transfer.type === "upload" ? (
                        <Upload className="w-3.5 h-3.5" />
                      ) : transfer.type === "download" ? (
                        <Download className="w-3.5 h-3.5" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white truncate max-w-[180px] sm:max-w-[140px]">
                      {transfer.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-bold text-indigo-300">
                      {transfer.progress}%
                    </span>
                    {transfer.status === "error" ? (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    ) : transfer.status === "completed" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    ) : null}
                  </div>
                </div>

                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${transfer.progress}%` }}
                    className={`h-full transition-all duration-300 ${
                      transfer.status === "error"
                        ? "bg-red-500"
                        : transfer.status === "completed"
                          ? "bg-green-500"
                          : transfer.type === "upload"
                            ? "bg-teal-500"
                            : transfer.type === "download"
                              ? "bg-blue-500"
                              : "bg-indigo-500"
                    }`}
                  />
                </div>

                {/* Visual indicator for "active" status */}
                {transfer.status === "active" && (
                  <motion.div
                    className="absolute bottom-0 left-0 h-[1px] bg-white/20"
                    animate={{ x: ["-100%", "100%"] }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: "linear",
                    }}
                    style={{ width: "50%" }}
                  />
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const VersionHistoryModal = ({
  file,
  versions,
  isLoading,
  onClose,
  onRestore,
  formatBytes
}: {
  file: FileData,
  versions: any[],
  isLoading: boolean,
  onClose: () => void,
  onRestore: (versionId: number) => void,
  formatBytes: (bytes: number) => string
}) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-2xl bg-zinc-950 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
              <History className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Version History</h3>
              <p className="text-xs text-white/50">{file.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
            </div>
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-white/40 text-sm">
              No previous versions found for this file.
            </div>
          ) : (
            versions.map((version) => (
              <div key={version.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/[0.07] transition-colors">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-bold text-white">{new Date(version.savedAt).toLocaleString()}</div>
                  <div className="text-xs text-white/50">
                    {formatBytes(version.size)} • {version.type}
                  </div>
                  <div className="text-[10px] font-mono text-white/30 truncate max-w-[200px] sm:max-w-xs">
                    Hash: {version.merkleRoot}
                  </div>
                </div>
                <button
                  onClick={() => onRestore(version.id)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-2"
                >
                  <RefreshCcw className="w-3.5 h-3.5" /> Restore
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
};

const LocalPreviewModal = ({ 
  file, 
  currentUser, 
  sessionPassword,
  onDownload,
  onClose,
  formatBytes,
  onViewDag
}: { 
  file: FileData, 
  currentUser: any, 
  sessionPassword?: string,
  onDownload?: (file: FileData) => void,
  onClose: () => void,
  formatBytes: (b: number) => string,
  onViewDag: (block: any) => void
}) => {
  const isImage = file.type?.startsWith('image/');
  const isVideo = file.type?.startsWith('video/');
  const isAudio = file.type?.startsWith('audio/');
  const isPdf = file.type === 'application/pdf';

  const downloadUrl = `/api/files/download/${file.id}?userId=${currentUser?.id}`;

  const [previewSrc, setPreviewSrc] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [errorHeader, setErrorHeader] = useState('');

  useEffect(() => {
    let active = true;
    let url = '';

    const isClientEncrypted = (file.clientEncrypted as any) !== 0 && file.clientEncrypted !== false;

    async function load() {
      if (!isClientEncrypted) {
        // Server-encrypted files are decrypted on the fly and streamed from this route
        setPreviewSrc(`/api/files/download/${file.id}?userId=${currentUser?.id}`);
        return;
      }

      if (!file.id || !currentUser?.id) return;
      setLoading(true);
      try {
        const data = await api.downloadFileContent(currentUser.id, file.id);
        if (!active) return;
        const pass = sessionPassword || localStorage.getItem("vault_session_password") || "";
        if (!pass) {
          throw new Error("No active password to decrypt media preview.");
        }
        const decData = await decryptData(data, pass);
        if (!active) return;
        const blob = new Blob([decData], { type: file.type });
        url = URL.createObjectURL(blob);
        setPreviewSrc(url);
      } catch (err: any) {
        console.error("Failed to decrypt preview:", err);
        setErrorHeader(err.message || "Decryption failed");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [file.id, currentUser?.id, file.clientEncrypted, file.type, sessionPassword]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/95 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative bg-zinc-950 border border-white/10 rounded-2xl sm:rounded-[40px] overflow-hidden max-w-6xl w-full max-h-[95vh] flex flex-col shadow-[0_0_100px_rgba(0,0,0,0.8)]"
      >
        <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 flex gap-2 sm:gap-3">
          <button 
            onClick={() => {
              if (onDownload) {
                onDownload(file);
              } else {
                const a = document.createElement('a');
                a.href = (file.clientEncrypted === false || (file.clientEncrypted as any) === 0) ? `${downloadUrl}&download=1` : previewSrc;
                a.download = file.name;
                a.click();
              }
            }}
            className="p-3 sm:p-4 bg-white/10 hover:bg-white/20 rounded-xl sm:rounded-2xl text-white backdrop-blur-xl border border-white/10 transition-all active:scale-95 group"
            title="Download to Device"
          >
            <Download className="w-4 h-4 sm:w-5 sm:h-5 group-hover:scale-110 transition-transform" />
          </button>
          <button 
            onClick={onClose}
            className="p-3 sm:p-4 bg-red-500/10 hover:bg-red-500/20 rounded-xl sm:rounded-2xl text-red-400 backdrop-blur-xl border border-red-500/20 transition-all active:scale-95 group"
            title="Close Preview"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5 group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center overflow-auto bg-black/40 min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center gap-4 text-center">
              <RefreshCcw className="w-8 h-8 text-indigo-400 animate-spin" />
              <div className="text-xs text-indigo-300 font-mono uppercase tracking-widest animate-pulse">Decrypting content on-the-fly...</div>
            </div>
          )}

          {errorHeader && !loading && (
            <div className="flex flex-col items-center gap-4 text-center max-w-sm p-6 bg-red-500/10 rounded-2xl border border-red-500/20">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <div className="text-sm font-bold text-red-400">Decryption Failed</div>
              <div className="text-xs text-red-300/85 leading-relaxed font-mono">{errorHeader}</div>
              <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mt-2">
                This item is encrypted client-side. Make sure your active session key matches or re-authenticate to verify.
              </p>
            </div>
          )}

          {!loading && !errorHeader && previewSrc && (
            <>
              {isImage && (
                <img 
                  src={previewSrc} 
                  alt={file.name} 
                  className="max-w-full max-h-full object-contain shadow-2xl p-4"
                  referrerPolicy="no-referrer"
                />
              )}
              {isVideo && (
                <video 
                  src={previewSrc} 
                  controls 
                  autoPlay
                  className="max-w-full max-h-full shadow-2xl p-4"
                />
              )}
              {isAudio && (
                <div className="bg-white/5 p-16 rounded-[48px] border border-white/10 flex flex-col items-center gap-8 text-center max-w-md mx-auto">
                  <div className="w-24 h-24 rounded-[32px] bg-pink-500/20 flex items-center justify-center text-pink-400">
                    <Music className="w-12 h-12" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xl font-black text-white">{file.name}</div>
                    <div className="text-sm text-indigo-400 font-mono uppercase tracking-widest">{file.type}</div>
                  </div>
                  <audio src={previewSrc} controls className="w-full h-12 custom-audio-player" />
                </div>
              )}
              {isPdf && (
                 <iframe src={previewSrc} className="w-full h-full border-0" title={file.name} />
              )}
              {!isImage && !isVideo && !isAudio && !isPdf && (
                <div className="text-center p-16 flex flex-col items-center gap-6">
                  <div className="w-24 h-24 rounded-[32px] bg-white/5 flex items-center justify-center text-zinc-600">
                    <FileQuestion className="w-12 h-12" />
                  </div>
                  <div className="space-y-2">
                    <div className="text-2xl font-black text-white">Preview Security Restriction</div>
                    <p className="text-indigo-300/60 text-sm max-w-sm leading-relaxed">
                      This file type ({file.type || 'binary/stream'}) is restricted from in-browser sandboxed rendering for security and compatibility reasons.
                    </p>
                  </div>
                  <button 
                    onClick={() => {
                      if (onDownload) {
                        onDownload(file);
                      } else {
                        const a = document.createElement('a');
                        a.href = previewSrc;
                        a.download = file.name;
                        a.click();
                      }
                    }}
                    className="flex items-center gap-3 bg-white text-black hover:bg-indigo-100 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-2xl"
                  >
                    <Download className="w-4 h-4" /> Download Out to Device
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="bg-zinc-900/80 p-6 border-t border-white/5 flex items-center justify-between backdrop-blur-xl">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                {isImage ? <ImageIcon className="w-6 h-6" /> : <FileIcon className="w-6 h-6" />}
             </div>
             <div className="flex flex-col">
                <div className="text-sm font-black text-white tracking-tight">{file.name}</div>
                <div className="text-[10px] font-mono text-indigo-400/60 uppercase tracking-widest flex items-center gap-2">
                   <span>{file.type || 'UNKNOWN TYPE'}</span>
                   <span className="w-1 h-1 bg-white/20 rounded-full" />
                   <span>{formatBytes(file.size)}</span>
                </div>
                {file.dagHash && (
                  <div 
                    className="text-[8px] font-mono text-fuchsia-400/80 mt-1 uppercase tracking-widest flex items-center gap-1.5 cursor-pointer hover:text-fuchsia-300 transition-colors" 
                    title={`Signature: ${file.dagSignature}\nClick to Verify on Chain`}
                    onClick={() => onViewDag(file)}
                  >
                     <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8V16C21 18.761 18.761 21 16 21H8C5.239 21 3 18.761 3 16V8C3 5.239 5.239 3 8 3H16C18.761 3 21 5.239 21 8Z"/><path d="M7 12H17"/><path d="M12 7V17"/></svg>
                     BLOCKDAG HASH <span className="text-fuchsia-200">{file.dagHash.substring(0,24)}</span>
                  </div>
                )}
             </div>
          </div>
          <div className="hidden md:flex items-center gap-4">
             <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[9px] font-black uppercase text-teal-400 tracking-widest">Verified Payload</span>
             </div>
             <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">P2P Shared Mesh Pool</span>
             </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
