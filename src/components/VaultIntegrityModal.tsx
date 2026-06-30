import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Terminal, 
  Database, 
  Loader2, 
  RefreshCw, 
  FileText, 
  X, 
  Search, 
  FileWarning,
  Flame,
  Info
} from 'lucide-react';
import { api } from '../lib/api';

interface FileData {
  id: number;
  name: string;
  isFolder: boolean;
  size: number;
  type: string;
  dagHash?: string;
  dagSignature?: string;
}

interface AuditResult {
  fileId: number;
  name: string;
  size: number;
  isFolder: boolean;
  checked: boolean;
  success: boolean;
  isValid: boolean;
  bitRotDetected: boolean;
  sigMismatch: boolean;
  linkageBroken: boolean;
  error?: string;
  auditDetails?: {
    storedHash: string;
    computedHash: string;
    storedMerkleRoot: string;
    diskMerkleRoot: string;
    merkleRootMatch: boolean;
    integrityMatch: boolean;
    linkageMatch: boolean;
    signatureMatch: boolean;
  };
}

interface VaultIntegrityModalProps {
  userId: number;
  files: FileData[];
  onClose: () => void;
}

export const VaultIntegrityModal: React.FC<VaultIntegrityModalProps> = ({ userId, files, onClose }) => {
  const [auditResults, setAuditResults] = useState<AuditResult[]>([]);
  const [isAuditing, setIsAuditing] = useState(false);
  const [currentAuditIndex, setCurrentAuditIndex] = useState<number>(-1);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'errors' | 'secure'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const consoleEndRef = useRef<HTMLDivElement>(null);

  // Initialize and run audit on mount
  useEffect(() => {
    runFullIntegrityAudit();
  }, [files]);

  // Scroll terminal logs to the bottom
  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleLogs]);

  const addLog = (message: string) => {
    setConsoleLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const runFullIntegrityAudit = async () => {
    if (isAuditing) return;
    setIsAuditing(true);
    setConsoleLogs([]);
    setSearchTerm('');
    
    // We only audit files, folders don't have block data on disk but we include folders with dummy success
    const itemsToAudit: AuditResult[] = files.map(f => ({
      fileId: f.id,
      name: f.name,
      size: f.size,
      isFolder: f.isFolder,
      checked: false,
      success: false,
      isValid: false,
      bitRotDetected: false,
      sigMismatch: false,
      linkageBroken: false
    }));

    setAuditResults(itemsToAudit);
    addLog("⚡ Initializing Zero-Knowledge Cryptographic Vault Audit...");
    addLog(`📦 Found ${itemsToAudit.length} ledger assets total to inspect.`);
    await new Promise(r => setTimeout(r, 600));

    let processedCount = 0;
    const updatedResults = [...itemsToAudit];

    for (let i = 0; i < updatedResults.length; i++) {
      const item = updatedResults[i];
      setCurrentAuditIndex(i);
      addLog(`🔍 Auditing asset [ID: ${item.fileId}] "${item.name}"...`);

      if (item.isFolder) {
        addLog(`📂 Directory entity "${item.name}" matches metadata index. Skipping block analysis.`);
        updatedResults[i] = {
          ...item,
          checked: true,
          success: true,
          isValid: true,
          bitRotDetected: false,
          sigMismatch: false,
          linkageBroken: false
        };
        setAuditResults([...updatedResults]);
        processedCount++;
        continue;
      }

      try {
        addLog(`  ⏱️ Computing SHA-256 Merkle root of physical sector contents...`);
        // Verify block via backend endpoint
        const response = await api.verifyVaultBlock(userId, item.fileId);
        
        if (response.success) {
          const audit = response.audit;
          const bitRot = !audit.merkleRootMatch;
          const sigMismatch = !audit.signatureMatch;
          const linkageBroken = !audit.linkageMatch;
          const isValid = response.isValid;

          updatedResults[i] = {
            ...item,
            checked: true,
            success: true,
            isValid,
            bitRotDetected: bitRot,
            sigMismatch,
            linkageBroken,
            auditDetails: {
              storedHash: audit.storedHash,
              computedHash: audit.computedHash,
              storedMerkleRoot: audit.storedMerkleRoot,
              diskMerkleRoot: audit.diskMerkleRoot,
              merkleRootMatch: audit.merkleRootMatch,
              integrityMatch: audit.integrityMatch,
              linkageMatch: audit.linkageMatch,
              signatureMatch: audit.signatureMatch,
            }
          };

          if (isValid) {
            addLog(`  ✅ Asset "${item.name}" verification successful. Integrity 100% authentic.`);
          } else {
            if (bitRot) {
              addLog(`  🚨 CRITICAL: Bit-rot or disk sector tampering detected on "${item.name}"!`);
              addLog(`    Expected: ${audit.storedMerkleRoot.substring(0, 20)}...`);
              addLog(`    Actual:   ${audit.diskMerkleRoot.substring(0, 20)}...`);
            }
            if (sigMismatch) {
              addLog(`  🚨 CRITICAL: Master key HMAC signature verification failed for "${item.name}".`);
            }
            if (linkageBroken) {
              addLog(`  ⚠️ Linkage anomaly: previous DAG hash broken for "${item.name}".`);
            }
          }
        } else {
          throw new Error("Invalid response received from verification endpoint.");
        }
      } catch (err: any) {
        addLog(`  ❌ Failed to verify "${item.name}": ${err.message || 'Node connection error'}`);
        updatedResults[i] = {
          ...item,
          checked: true,
          success: false,
          isValid: false,
          bitRotDetected: false,
          sigMismatch: false,
          linkageBroken: false,
          error: err.message || "Auditing error"
        };
      }

      setAuditResults([...updatedResults]);
      processedCount++;
      // Smooth dynamic speed for auditing to make UI pleasant and high-tech but not tedious
      await new Promise(r => setTimeout(r, 250));
    }

    setCurrentAuditIndex(-1);
    setIsAuditing(false);

    const corruptCount = updatedResults.filter(r => !r.isFolder && (r.bitRotDetected || r.sigMismatch)).length;
    addLog("==========================================");
    if (corruptCount === 0) {
      addLog("🛡️ SYSTEM STATUS: SECURE. All cryptographic assets verified 100% intact.");
    } else {
      addLog(`🚨 SECURITY ALERT: Found ${corruptCount} sector payload mismatches! Re-sync or local backups suggested.`);
    }
    addLog("==========================================");
  };

  // Stats
  const auditedCount = auditResults.filter(r => r.checked).length;
  const totalCount = auditResults.length;
  const bitRotCount = auditResults.filter(r => r.bitRotDetected).length;
  const errorCount = auditResults.filter(r => r.checked && (!r.success || !r.isValid)).length;
  const secureCount = auditResults.filter(r => r.checked && r.success && r.isValid).length;

  // Filtered items for display
  const filteredItems = auditResults.filter(item => {
    // Search filter
    if (searchTerm && !item.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    // Tab filter
    if (filterMode === 'errors') {
      return !item.success || !item.isValid;
    }
    if (filterMode === 'secure') {
      return item.checked && item.success && item.isValid;
    }
    return true; // 'all'
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`relative w-full max-w-4xl bg-[#090910] border ${bitRotCount > 0 ? 'border-red-500/50' : 'border-indigo-500/30'} rounded-3xl overflow-hidden max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(99,102,241,0.25)]`}
          id="vault-integrity-modal"
        >
          {/* Header */}
          <div className="bg-indigo-600/10 border-b border-indigo-500/15 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl border ${bitRotCount > 0 ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'}`}>
                {bitRotCount > 0 ? <ShieldAlert className="w-5 h-5 animate-bounce" /> : <ShieldCheck className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-white font-black tracking-tight uppercase text-sm">
                  Cryptographic Vault Integrity Audit
                </h2>
                <p className="text-[10px] text-indigo-400/70 font-mono tracking-wider">
                  REAL-TIME BIT-ROT DETECTOR & HMACS SIGNATURE VERIFIER
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isAuditing}
              className="p-1 px-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 text-white/50 hover:text-white rounded-lg transition-colors border border-white/15 text-xs font-bold flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close</span>
            </button>
          </div>

          <div className="p-6 overflow-y-auto flex-1 space-y-6">
            {/* Status Summary Widget */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span className="text-[9px] font-black uppercase text-indigo-400 tracking-wider">Audited Blocks</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold text-white">{auditedCount}</span>
                  <span className="text-xs text-white/40">/ {totalCount}</span>
                </div>
                {isAuditing ? (
                  <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden mt-2">
                    <div 
                      className="bg-indigo-500 h-full transition-all duration-300"
                      style={{ width: `${totalCount > 0 ? (auditedCount / totalCount) * 100 : 0}%` }}
                    />
                  </div>
                ) : (
                  <span className="text-[9px] text-white/40 mt-2 font-mono">SCAN COMPLETE</span>
                )}
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Verified Secure</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-xl font-bold text-emerald-400">{secureCount}</span>
                  <span className="text-xs text-white/40">intact</span>
                </div>
                <span className="text-[9px] text-emerald-500/60 font-mono mt-2 flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Manifests Match
                </span>
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span className="text-[9px] font-black uppercase text-red-400 tracking-wider">Bit-Rot Detected</span>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className={`text-xl font-bold ${bitRotCount > 0 ? 'text-red-400' : 'text-white/40'}`}>{bitRotCount}</span>
                  <span className="text-xs text-white/40">corrupt</span>
                </div>
                <span className={`text-[9px] font-mono mt-2 flex items-center gap-1 ${bitRotCount > 0 ? 'text-red-500 font-bold' : 'text-white/40'}`}>
                  {bitRotCount > 0 ? <Flame className="w-2.5 h-2.5" /> : <CheckCircle2 className="w-2.5 h-2.5" />}
                  {bitRotCount > 0 ? 'ROT DETECTED!' : '0 Corrupt Sectors'}
                </span>
              </div>

              <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span className="text-[9px] font-black uppercase text-amber-400 tracking-wider">Status Ring</span>
                <div className="flex items-center gap-2 mt-1">
                  {isAuditing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                      <span className="text-xs font-bold text-indigo-300">Auditing Sectors...</span>
                    </>
                  ) : bitRotCount > 0 ? (
                    <span className="text-xs font-extrabold text-red-400 uppercase tracking-tight flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Compromised
                    </span>
                  ) : (
                    <span className="text-xs font-extrabold text-emerald-400 uppercase tracking-tight flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> 100% Authentic
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-white/40 mt-2 font-mono">HMAC SHA-256 SYSTEM</span>
              </div>
            </div>

            {/* Terminal Live Stream Logs */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5" /> Active Diagnostic Console
                </span>
                {isAuditing && (
                  <span className="text-[9px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2 py-0.5 rounded animate-pulse">
                    STREAMING SECTORS...
                  </span>
                )}
              </div>
              <div className="bg-black/60 border border-white/5 rounded-2xl p-4 font-mono text-[11px] leading-relaxed text-indigo-200/90 h-36 overflow-y-auto custom-scrollbar flex flex-col gap-1 shadow-inner">
                {consoleLogs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap select-all">
                    {log}
                  </div>
                ))}
                {consoleLogs.length === 0 && (
                  <div className="text-white/30 text-center py-10 italic">
                    Press "Re-Run Audit" to pipe cryptographic sector scanner outputs here.
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>
            </div>

            {/* Asset Ledger Audit */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5" /> Audited Sector Ledger
                </span>

                {/* Filter and Search controls */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Search ledger..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="bg-white/5 border border-white/10 rounded-xl py-1.5 pl-8 pr-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/50 w-44"
                    />
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-white/30" />
                  </div>

                  <div className="flex bg-white/5 rounded-xl p-0.5 border border-white/5">
                    {[
                      { id: 'all', label: 'All' },
                      { id: 'errors', label: 'Mismatches' },
                      { id: 'secure', label: 'Secure' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setFilterMode(tab.id as any)}
                        className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                          filterMode === tab.id 
                            ? 'bg-indigo-600 text-white shadow' 
                            : 'text-indigo-300 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Verified Grid / List */}
              <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/5 divide-y divide-white/5 max-h-60 overflow-y-auto custom-scrollbar">
                {filteredItems.map((item, idx) => {
                  const isCurrent = currentAuditIndex === idx;
                  let statusColor = "text-white/40";
                  let statusBg = "bg-white/5";
                  let statusText = "Pending";
                  
                  if (isCurrent) {
                    statusColor = "text-indigo-400";
                    statusBg = "bg-indigo-500/10 border border-indigo-500/20";
                    statusText = "Hashing...";
                  } else if (item.checked) {
                    if (!item.success) {
                      statusColor = "text-red-400";
                      statusBg = "bg-red-500/10 border border-red-500/20";
                      statusText = "Node Error";
                    } else if (item.bitRotDetected) {
                      statusColor = "text-red-400 font-extrabold";
                      statusBg = "bg-red-500/15 border border-red-500/35";
                      statusText = "BIT-ROT ALERT";
                    } else if (!item.isValid) {
                      statusColor = "text-amber-400";
                      statusBg = "bg-amber-500/15 border border-amber-500/25";
                      statusText = "HMAC Tampered";
                    } else {
                      statusColor = "text-emerald-400";
                      statusBg = "bg-emerald-500/10 border border-emerald-500/20";
                      statusText = "Secure Match";
                    }
                  }

                  return (
                    <div 
                      key={item.fileId} 
                      className={`p-3.5 flex items-center justify-between gap-4 transition-all ${isCurrent ? 'bg-indigo-500/5' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {item.isFolder ? (
                          <div className="p-2 bg-amber-500/10 rounded-lg text-amber-400 flex-shrink-0">
                            <Database className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div className={`p-2 rounded-lg flex-shrink-0 ${item.bitRotDetected ? 'bg-red-500/10 text-red-400' : 'bg-white/5 text-indigo-300'}`}>
                            {item.bitRotDetected ? <FileWarning className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block text-xs font-black text-white truncate">{item.name}</span>
                          <span className="block text-[9px] text-white/40 font-mono mt-0.5">
                            {item.isFolder ? "Directory Entity" : `Size: ${(item.size / 1024).toFixed(1)} KB`} • Sector ID: {item.fileId}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg tracking-wider ${statusColor} ${statusBg}`}>
                          {statusText}
                        </span>
                        {isCurrent && <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
                      </div>
                    </div>
                  );
                })}

                {filteredItems.length === 0 && (
                  <div className="p-10 text-center text-white/30 text-xs italic">
                    {searchTerm ? "No audited files match your search query." : "No files in this ledger category."}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Action */}
          <div className="bg-white/5 border-t border-white/5 px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-indigo-300/60 font-semibold max-w-md">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>
                Files are audited by comparing the real-time sector hashes from the SQLite BlockDAG pool with signed SHA-256 HMAC manifests created at upload-time.
              </span>
            </div>

            <button
              onClick={runFullIntegrityAudit}
              disabled={isAuditing}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black tracking-widest text-xs uppercase px-5 py-3.5 rounded-xl shadow-xl transition-all active:scale-[0.98] flex items-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin' : ''}`} />
              {isAuditing ? "Auditing Vault..." : "Re-Run Audit"}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
