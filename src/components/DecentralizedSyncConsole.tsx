import React, { useState, useEffect } from "react";
import {
  Globe,
  Database,
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  Check,
  Loader2,
  RefreshCw,
  Download,
  Upload,
  Activity,
  FileText,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Key,
  Fingerprint,
  ArrowRight,
  History,
  Cpu,
  Server,
  CloudLightning,
  Network,
  Zap,
  Layers
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { decentralizedSync, KaspaSession, OneDBSession, DecentralizedSyncLog } from "../lib/decentralizedSync";

interface DecentralizedSyncConsoleProps {
  currentUser: { id: string; username: string } | null;
  onRestoreDatabase: (dbHex: string) => Promise<void>;
  onGetEncryptedDatabaseHex: () => Promise<string>;
  showToast: (message: string, type: "success" | "error" | "info" | "warning") => void;
}

export function DecentralizedSyncConsole({
  currentUser,
  onRestoreDatabase,
  onGetEncryptedDatabaseHex,
  showToast
}: DecentralizedSyncConsoleProps) {
  const [kaspaSession, setKaspaSession] = useState<KaspaSession>(() => decentralizedSync.getKaspaSession());
  const [onedbSession, setOnedbSession] = useState<OneDBSession>(() => decentralizedSync.getOneDBSession());
  const [logs, setLogs] = useState<DecentralizedSyncLog[]>(() => decentralizedSync.getLogs());
  const [activeEngine, setActiveEngine] = useState<'kaspa' | 'onedb'>('kaspa');
  
  // Interactive UI states
  const [connectingKaspa, setConnectingKaspa] = useState(false);
  const [connectingOneDB, setConnectingOneDB] = useState(false);
  const [onedbProvider, setOnedbProvider] = useState<'github'>('github');
  const [onedbInstanceUrl, setOnedbInstanceUrl] = useState('https://api.github.com');
  
  // Real credentials state
  const [githubToken, setGithubToken] = useState(() => localStorage.getItem('sovereign_github_token') || '');
  const [githubRepo, setGithubRepo] = useState(() => localStorage.getItem('sovereign_github_repo') || '');
  const [githubPath, setGithubPath] = useState(() => localStorage.getItem('sovereign_github_path') || 'sovereign_vault_backup.json');

  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncAction, setSyncAction] = useState<'PUSH' | 'PULL' | null>(null);

  // Load logs on update event
  useEffect(() => {
    const handleLogsUpdate = () => {
      setLogs(decentralizedSync.getLogs());
    };
    window.addEventListener('decentralized_logs_updated', handleLogsUpdate);
    return () => window.removeEventListener('decentralized_logs_updated', handleLogsUpdate);
  }, []);

  const [manualKaspaAddress, setManualKaspaAddress] = useState(() => {
    return decentralizedSync.getKaspaSession().kaspaAddress || '';
  });

  // Automatically connect to Kaspa BlockDAG on component mount or user change only if an address was already stored/saved!
  useEffect(() => {
    const saved = decentralizedSync.getKaspaSession();
    if (saved && saved.kaspaAddress) {
      const autoConnectKaspa = async () => {
        setConnectingKaspa(true);
        try {
          const session = await decentralizedSync.connectKaspaNode(currentUser?.id, saved.kaspaAddress);
          setKaspaSession(session);
        } catch (e) {
          console.warn("Kaspa auto-connection failed on load:", e);
        } finally {
          setConnectingKaspa(false);
        }
      };
      autoConnectKaspa();
    }
  }, [currentUser]);

  // Update sessions
  const refreshSessions = () => {
    setKaspaSession(decentralizedSync.getKaspaSession());
    const sess = decentralizedSync.getOneDBSession();
    setOnedbSession(sess);
  };

  const handleConnectKaspa = async () => {
    setConnectingKaspa(true);
    try {
      const session = await decentralizedSync.connectKaspaNode(currentUser?.id);
      setKaspaSession(session);
      setManualKaspaAddress(session.kaspaAddress);
      showToast("Kaspa Wallet Connected! Cryptographic BlockDAG anchoring is active.", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to connect to Web3 Kasware Wallet.", "error");
    } finally {
      setConnectingKaspa(false);
    }
  };

  const handleLinkManualAddress = async () => {
    const trimmed = manualKaspaAddress.trim();
    if (!trimmed) {
      showToast("Please enter a valid Kaspa address.", "error");
      return;
    }
    if (!trimmed.startsWith('kaspa:')) {
      showToast("Kaspa addresses must start with 'kaspa:'.", "warning");
    }
    setConnectingKaspa(true);
    try {
      const session = await decentralizedSync.connectKaspaNode(currentUser?.id, trimmed);
      setKaspaSession(session);
      showToast("Successfully linked your custom on-chain Kaspa address!", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to link address", "error");
    } finally {
      setConnectingKaspa(false);
    }
  };

  const handleDisconnectKaspa = async () => {
    await decentralizedSync.disconnectKaspa();
    refreshSessions();
    showToast("Kaspa node connection closed.", "info");
  };

  const handleConnectOneDB = async () => {
    setConnectingOneDB(true);
    try {
      // Save credentials locally for convenience (E2E in user's browser storage only!)
      if (onedbProvider === 'github') {
        localStorage.setItem('sovereign_github_token', githubToken);
        localStorage.setItem('sovereign_github_repo', githubRepo);
        localStorage.setItem('sovereign_github_path', githubPath);
      }
 
       const session = await decentralizedSync.connectOneDB(onedbProvider, onedbInstanceUrl, {
         githubToken,
         githubRepo,
         githubPath,
       });
       setOnedbSession(session);
       showToast(`OneDB adapter successfully linked via ${onedbProvider.toUpperCase()}!`, "success");
     } catch (e: any) {
      showToast(e.message || "Failed to link OneDB adapter.", "error");
    } finally {
      setConnectingOneDB(false);
    }
  };

  const handleDisconnectOneDB = async () => {
    await decentralizedSync.disconnectOneDB();
    refreshSessions();
    showToast("OneDB adapter disconnected.", "info");
  };

  const handleKaspaPush = async () => {
    if (!currentUser) {
      showToast("Please log into your vault to back up database.", "error");
      return;
    }
    setSyncing(true);
    setSyncProgress(0);
    setSyncAction('PUSH');
    try {
      const dbHex = await onGetEncryptedDatabaseHex();
      if (!dbHex) {
        throw new Error("Could not extract encrypted local database stream.");
      }
      
      const { txHash, blockHeight } = await decentralizedSync.anchorToKaspaDAG(
        currentUser.id,
        dbHex,
        (p) => setSyncProgress(p)
      );
      
      refreshSessions();
      showToast(`Sovereign database successfully anchored to Kaspa BlockDAG! Block #${blockHeight}`, "success");
    } catch (e: any) {
      showToast(e.message || "Failed to anchor database state to Kaspa.", "error");
    } finally {
      setSyncing(false);
      setSyncAction(null);
    }
  };

  const handleKaspaPull = async () => {
    if (!currentUser) {
      showToast("Please log into your vault to restore.", "error");
      return;
    }
    if (!window.confirm("WARNING: Pulling from Kaspa BlockDAG will replace your active browser-partition database with the encrypted backup. Are you sure?")) {
      return;
    }
    setSyncing(true);
    setSyncProgress(0);
    setSyncAction('PULL');
    try {
      const dbHex = await decentralizedSync.retrieveFromKaspaDAG(currentUser.id, (p) => setSyncProgress(p));
      await onRestoreDatabase(dbHex);
      refreshSessions();
      showToast("Encrypted database restored from Kaspa BlockDAG successfully!", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to retrieve database state from Kaspa.", "error");
    } finally {
      setSyncing(false);
      setSyncAction(null);
    }
  };

  const handleOneDBSync = async () => {
    if (!currentUser) {
      showToast("Please log into your vault to sync.", "error");
      return;
    }
    setSyncing(true);
    setSyncProgress(0);
    setSyncAction('PUSH');
    try {
      const dbHex = await onGetEncryptedDatabaseHex();
      setSyncProgress(30);
      await decentralizedSync.syncWithOneDB(currentUser.id, dbHex);
      setSyncProgress(100);
      refreshSessions();
      showToast(`OneDB storage synchronized successfully!`, "success");
    } catch (e: any) {
      showToast(e.message || "Failed to sync with OneDB.", "error");
    } finally {
      setSyncing(false);
      setSyncAction(null);
    }
  };

  const handleOneDBPull = async () => {
    if (!currentUser) {
      showToast("Please log into your vault to pull.", "error");
      return;
    }
    if (!window.confirm("WARNING: Pulling from OneDB will replace your active database with the backup stored in your personal cloud. Do you want to continue?")) {
      return;
    }
    setSyncing(true);
    setSyncProgress(0);
    setSyncAction('PULL');
    try {
      setSyncProgress(40);
      const dbHex = await decentralizedSync.pullFromOneDB(currentUser.id);
      setSyncProgress(70);
      await onRestoreDatabase(dbHex);
      setSyncProgress(100);
      refreshSessions();
      showToast("Database restored successfully from OneDB!", "success");
    } catch (e: any) {
      showToast(e.message || "Failed to pull from OneDB.", "error");
    } finally {
      setSyncing(false);
      setSyncAction(null);
    }
  };

  const handleClearLogs = () => {
    decentralizedSync.clearLogs();
    showToast("Decentralized synchronization logs cleared.", "info");
  };

  return (
    <div className="flex flex-col gap-8 text-white w-full max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-fuchsia-950/40 via-purple-900/30 to-fuchsia-950/40 p-8 rounded-[32px] border border-fuchsia-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-fuchsia-500/10 blur-[80px] rounded-full pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-fuchsia-500/15 border border-fuchsia-400/30 text-xs font-bold text-fuchsia-300">
              <Layers className="w-3.5 h-3.5 animate-pulse" />
              KASPA-SEC BLOCKDAG CONSOLE
            </div>
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
              Free Forever Persistent Sync
            </h2>
            <p className="text-sm text-fuchsia-200/60 max-w-2xl leading-relaxed">
              Skip paid server-side disks entirely! Anchor your fully E2E encrypted database on-chain using 
              <strong> Kaspa BlockDAG Ledger proofing</strong> or link your own <strong>OneDB personal adapter</strong>.
            </p>
          </div>
          
          <div className="flex gap-2.5 p-1 bg-black/20 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveEngine('kaspa')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeEngine === 'kaspa'
                  ? "bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20 border border-white/10"
                  : "text-fuchsia-300/60 hover:text-white"
              }`}
            >
              Kaspa Ledger
            </button>
            <button
              onClick={() => setActiveEngine('onedb')}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeEngine === 'onedb'
                  ? "bg-fuchsia-600 text-white shadow-lg shadow-fuchsia-600/20 border border-white/10"
                  : "text-fuchsia-300/60 hover:text-white"
              }`}
            >
              OneDB Personal Storage
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Connection & Actions - Left Area */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {activeEngine === 'kaspa' ? (
            /* --- KASPA ENGINE SECTION --- */
            <div className="bg-white/5 p-8 rounded-[32px] border border-white/5 flex flex-col gap-6 relative overflow-hidden group hover:border-fuchsia-500/20 transition-all">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-fuchsia-500/10 blur-[80px] rounded-full pointer-events-none" />
              
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-fuchsia-500/10 rounded-2xl border border-fuchsia-500/20 text-fuchsia-400">
                    <Zap className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Kaspa BlockDAG Anchorage</h3>
                    <p className="text-xs text-fuchsia-300/50">Immutably anchor encrypted database state to BlockDAG ledger</p>
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  kaspaSession.status === 'connected'
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${kaspaSession.status === 'connected' ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                  {kaspaSession.status}
                </div>
              </div>

              {kaspaSession.status === 'disconnected' || !kaspaSession.kaspaAddress ? (
                /* Disconnected State */
                <div className="flex flex-col items-center justify-center py-6 text-center gap-6">
                  <div className="w-16 h-16 rounded-full bg-fuchsia-500/5 border border-fuchsia-500/10 flex items-center justify-center text-fuchsia-400">
                    <Fingerprint className="w-8 h-8" />
                  </div>
                  <div className="flex flex-col gap-1.5 max-w-md">
                    <h4 className="font-bold text-white text-base">Unlinked Ledger Link</h4>
                    <p className="text-xs text-fuchsia-200/50">
                      Link your cryptographic vault to a decentralized Kaspa peer node. Connect your active Kasware Wallet Web3 extension or paste your real on-chain Kaspa address below to enable persistent anchorage.
                    </p>
                  </div>

                  {/* Real Address Setup Options */}
                  <div className="w-full max-w-md flex flex-col gap-3 p-4 bg-black/35 rounded-2xl border border-white/5">
                    <div className="flex flex-col text-left gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">Paste On-Chain Kaspa Address</label>
                      <input
                        type="text"
                        placeholder="kaspa:qp..."
                        value={manualKaspaAddress}
                        onChange={(e) => setManualKaspaAddress(e.target.value)}
                        className="w-full px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:border-fuchsia-500/50 transition-all"
                      />
                    </div>
                    <button
                      onClick={handleLinkManualAddress}
                      disabled={connectingKaspa}
                      className="w-full py-2.5 bg-fuchsia-600/20 hover:bg-fuchsia-600/30 disabled:opacity-50 border border-fuchsia-500/30 text-fuchsia-300 rounded-xl font-bold text-xs uppercase tracking-widest transition-all"
                    >
                      {connectingKaspa ? "Linking Address..." : "Link Custom Address"}
                    </button>

                    <div className="flex items-center my-1">
                      <div className="flex-grow border-t border-white/5"></div>
                      <span className="px-3 text-[10px] uppercase font-bold text-white/25 tracking-widest">or</span>
                      <div className="flex-grow border-t border-white/5"></div>
                    </div>

                    <button
                      onClick={handleConnectKaspa}
                      disabled={connectingKaspa}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-fuchsia-600/40 text-white rounded-xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-fuchsia-600/10"
                    >
                      {connectingKaspa ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Connecting Kasware...
                        </>
                      ) : (
                        <>
                          <Key className="w-4 h-4" />
                          Connect Kasware Wallet
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Connected State with Metrics & Controls */
                <div className="flex flex-col gap-6">
                  {/* Account detail plates */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/25 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">Kaspa Vault Address</span>
                      <span className="text-xs font-mono text-white/95 truncate select-all">{kaspaSession.kaspaAddress}</span>
                    </div>
                    <div className="bg-black/25 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">Target Node</span>
                      <span className="text-xs font-mono text-white/95 truncate select-all">{kaspaSession.peerNode}</span>
                    </div>
                  </div>

                  {/* Blockchain Live Dashboard Metrics */}
                  <div className="bg-black/40 p-5 rounded-2xl border border-white/5 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-fuchsia-300/40 font-black uppercase tracking-wider">Storage Fees</span>
                      <span className="text-sm font-black text-emerald-400 flex items-center gap-1">
                        0 KAS
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-fuchsia-300/40 font-black uppercase tracking-wider">Network Hashrate</span>
                      <span className="text-xs font-black text-fuchsia-300 leading-tight">{kaspaSession.hashRate}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-fuchsia-300/40 font-black uppercase tracking-wider">DAG Block Height</span>
                      <span className="text-sm font-black text-white">{kaspaSession.blockHeight.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] text-fuchsia-300/40 font-black uppercase tracking-wider">State Consensus</span>
                      <span className="text-sm font-black text-fuchsia-300 flex items-center gap-1">
                        SYNCHRONIZED
                      </span>
                    </div>
                  </div>

                  {/* Sync progress bar */}
                  {syncing && syncAction && (
                    <div className="bg-fuchsia-950/20 p-4 rounded-2xl border border-fuchsia-500/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold flex items-center gap-1.5 text-fuchsia-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                          {syncAction === 'PUSH' ? 'Transmitting encrypted shards to Kaspa ledger index...' : 'Rebuilding block sequences from Kaspa BlockDAG gossip ledger...'}
                        </span>
                        <span className="font-mono text-fuchsia-400 font-bold">{Math.round(syncProgress)}%</span>
                      </div>
                      <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                          className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${syncProgress}%` }}
                          transition={{ duration: 0.1 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Trigger actions */}
                  <div className="flex flex-col sm:flex-row gap-3 mt-2">
                    <button
                      onClick={handleKaspaPush}
                      disabled={syncing}
                      className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-fuchsia-600/40 text-white rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-fuchsia-600/10"
                    >
                      <Upload className="w-4 h-4" />
                      Anchor to Kaspa DAG
                    </button>
                    <button
                      onClick={handleKaspaPull}
                      disabled={syncing}
                      className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 disabled:opacity-50 text-purple-300 rounded-2xl font-black text-xs tracking-widest uppercase transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Retrieve from Kaspa DAG
                    </button>
                  </div>

                  <div className="flex justify-between items-center border-t border-white/5 pt-4 text-xs text-fuchsia-300/40">
                    <span>A secure mathematical link verifies peer identity without disclosing secrets.</span>
                    <button
                      onClick={handleDisconnectKaspa}
                      disabled={syncing}
                      className="text-red-400 hover:text-red-300 font-bold tracking-wider uppercase text-xs hover:underline"
                    >
                      Disconnect Address
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* --- ONEDB ENGINE SECTION --- */
            <div className="bg-white/5 p-8 rounded-[32px] border border-white/5 flex flex-col gap-6 relative overflow-hidden group hover:border-fuchsia-500/20 transition-all">
              <div className="absolute -top-12 -right-12 w-48 h-48 bg-fuchsia-500/10 blur-[80px] rounded-full pointer-events-none" />
              
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-fuchsia-500/10 rounded-2xl border border-fuchsia-500/20 text-fuchsia-400">
                    <Network className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">OneDB Storage Adapter</h3>
                    <p className="text-xs text-fuchsia-300/50">Bring-Your-Own-Database: Connect Secure GitHub Repository</p>
                  </div>
                </div>

                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                  onedbSession.connected
                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${onedbSession.connected ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                  {onedbSession.connected ? 'ACTIVE' : 'DISCONNECTED'}
                </div>
              </div>

              {!onedbSession.connected ? (
                /* Connection Setup */
                <div className="flex flex-col gap-5">
                  <div className="flex flex-col gap-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">GitHub Personal Access Token (PAT)</label>
                      <input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        className="bg-black/35 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder:text-fuchsia-300/20 focus:outline-none focus:border-fuchsia-500 transition-all w-full"
                      />
                      <p className="text-[10px] text-white/40">Requires "repo" scope. This token remains strictly client-side.</p>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">GitHub Repository (owner/name)</label>
                      <input
                        type="text"
                        value={githubRepo}
                        onChange={(e) => setGithubRepo(e.target.value)}
                        placeholder="e.g. yourusername/sovereign-vault-data"
                        className="bg-black/35 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder:text-fuchsia-300/20 focus:outline-none focus:border-fuchsia-500 transition-all w-full"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">Backup File Path</label>
                      <input
                        type="text"
                        value={githubPath}
                        onChange={(e) => setGithubPath(e.target.value)}
                        placeholder="sovereign_vault_backup.json"
                        className="bg-black/35 border border-white/10 rounded-xl px-4 py-3 text-xs text-white font-mono placeholder:text-fuchsia-300/20 focus:outline-none focus:border-fuchsia-500 transition-all w-full"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleConnectOneDB}
                    disabled={connectingOneDB}
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-fuchsia-600/40 text-white rounded-2xl font-black text-xs tracking-widest uppercase transition-all mt-2"
                  >
                    {connectingOneDB ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Authorizing Cloud Handshake...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin-slow" />
                        Connect to OneDB Adapter
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Logged in with active adapter */
                <div className="flex flex-col gap-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-black/25 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">Connected Provider</span>
                      <span className="text-xs font-black capitalize text-white flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-fuchsia-400" />
                        {onedbSession.provider?.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="bg-black/25 p-4 rounded-2xl border border-white/5 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase tracking-wider text-fuchsia-400">OneDB Handle ID</span>
                      <span className="text-xs font-mono text-white truncate select-all">{onedbSession.userId}</span>
                    </div>
                  </div>

                  {/* Provider Specific Details */}
                  {onedbSession.provider === 'github' && (
                    <div className="bg-black/35 p-4 rounded-2xl border border-white/5 flex flex-col gap-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-white/40">Target Repository:</span>
                        <span className="font-mono text-fuchsia-300 select-all font-bold">{onedbSession.githubRepo}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-white/40">Path:</span>
                        <span className="font-mono text-fuchsia-300 select-all font-bold">{onedbSession.githubPath}</span>
                      </div>
                    </div>
                  )}

                  {syncing && syncAction && (
                    <div className="bg-fuchsia-950/20 p-4 rounded-2xl border border-fuchsia-500/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold flex items-center gap-1.5 text-fuchsia-300">
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-fuchsia-400" />
                          Synchronizing with {onedbSession.provider?.toUpperCase()} container...
                        </span>
                        <span className="font-mono text-fuchsia-400 font-bold">{Math.round(syncProgress)}%</span>
                      </div>
                      <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden border border-white/5">
                        <motion.div
                          className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${syncProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={handleOneDBSync}
                      disabled={syncing}
                      className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:bg-fuchsia-600/40 text-white rounded-2xl font-black text-xs tracking-widest uppercase transition-all shadow-xl shadow-fuchsia-600/10"
                    >
                      <Upload className="w-4 h-4" />
                      Backup database to OneDB
                    </button>
                    <button
                      onClick={handleOneDBPull}
                      disabled={syncing}
                      className="flex-1 flex items-center justify-center gap-2.5 px-6 py-4 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 disabled:opacity-50 text-purple-300 rounded-2xl font-black text-xs tracking-widest uppercase transition-all"
                    >
                      <Download className="w-4 h-4" />
                      Restore from OneDB
                    </button>
                  </div>

                  <div className="flex justify-between items-center border-t border-white/5 pt-4 text-xs text-fuchsia-300/40">
                    <span>Decentralized backup stored in your personal isolated vault path.</span>
                    <button
                      onClick={handleDisconnectOneDB}
                      disabled={syncing}
                      className="text-red-400/70 hover:text-red-400 font-bold tracking-wider"
                    >
                      Disconnect Adapter
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Info Block */}
          <div className="bg-fuchsia-950/20 p-6 rounded-3xl border border-fuchsia-500/10 flex gap-4 items-start">
            <CloudLightning className="w-6 h-6 text-fuchsia-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-xs text-fuchsia-200/60 leading-relaxed">
              <strong className="text-white">Why use Decentralized Sync?</strong>
              By using these protocols, your data is written direct from your local browser to peer networks. 
              Even if Render servers shut down or are rebuilt, your secure vault is always retrievable using your identity credential. 
              <strong>No server costs, no database limits, 100% private and resilient.</strong>
            </div>
          </div>
        </div>

        {/* Audit Log & Consensus Activity - Right Area */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white/5 p-6 rounded-[32px] border border-white/5 flex flex-col h-[520px] relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-fuchsia-400" />
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Blockchain Sync Logs</h3>
              </div>
              
              {logs.length > 0 && (
                <button
                  onClick={handleClearLogs}
                  className="text-[10px] font-bold text-red-400 hover:text-red-300 tracking-wider uppercase"
                >
                  Clear Logs
                </button>
              )}
            </div>

            {/* Logs List scroll wrapper */}
            <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 custom-scrollbar">
              <AnimatePresence initial={false}>
                {logs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                    <Activity className="w-8 h-8 text-fuchsia-300/10" />
                    <span className="text-xs text-fuchsia-300/30">No consensus operations recorded.</span>
                  </div>
                ) : (
                  logs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="bg-black/20 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono">
                        <span className={`px-2 py-0.5 rounded font-black ${
                          log.type.startsWith('KASPA') ? 'bg-fuchsia-500/10 text-fuchsia-400' : 'bg-indigo-500/10 text-indigo-400'
                        }`}>
                          {log.type}
                        </span>
                        
                        <span className={`${
                          log.status === 'SUCCESS' ? 'text-emerald-400' : log.status === 'FAILED' ? 'text-red-400' : 'text-fuchsia-400 animate-pulse'
                        } font-black`}>
                          ● {log.status}
                        </span>
                      </div>

                      <p className="text-xs text-fuchsia-100/75 select-text leading-relaxed">
                        {log.details}
                      </p>

                      <div className="flex items-center justify-between text-[9px] text-fuchsia-300/30 border-t border-white/5 pt-1.5 font-mono">
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        {log.sizeBytes !== undefined && (
                          <span>Partition: {(log.sizeBytes / 1024).toFixed(2)} KB</span>
                        )}
                      </div>

                      {log.txHash && (
                        <div className="bg-black/35 px-2.5 py-1.5 rounded-lg border border-white/5 font-mono text-[9px] text-fuchsia-300/50 truncate flex items-center justify-between select-all">
                          <span className="shrink-0 text-[8px] text-fuchsia-400/40 uppercase font-bold mr-2">TX Hash:</span>
                          <span className="truncate select-all">{log.txHash}</span>
                        </div>
                      )}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
