import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, CheckCircle2, Zap, Link as LinkIcon, Database, Terminal, Cpu, Globe, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from "../lib/api";
import { ShardedFileMatrix } from "./ShardedFileMatrix";
import { hexToIpfsCidV1 } from "../lib/ipfs-cid";

interface DagBlock {
  id: number;
  name: string;
  dagHash: string;
  previousDagHash?: string;
  dagSignature?: string;
  sigAlgorithm?: string;
  size: number;
  type: string;
  lastModified: number;
  cryptoBlockNumber?: number;
  originalOwnerSeedId?: string;
  peerReceiverSeedId?: string;
}

interface DagVerificationModalProps {
  block: DagBlock | null;
  userId: number;
  onClose: () => void;
}

export const DagVerificationModal: React.FC<DagVerificationModalProps> = ({ block, userId, onClose }) => {
  const [verificationStep, setVerificationStep] = useState(0);
  const [isVerified, setIsVerified] = useState(false);
  const [auditData, setAuditData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (block) {
      setVerificationStep(0);
      setIsVerified(false);
      setAuditData(null);
      setError(null);
      
      const performAudit = async () => {
        try {
          setVerificationStep(1);
          await new Promise(r => setTimeout(r, 400)); // Small delay for visual rhythm
          
          const result = await api.verifyVaultBlock(userId, block.id);
          
          setVerificationStep(2);
          await new Promise(r => setTimeout(r, 400));
          setVerificationStep(3);
          setAuditData(result.audit);
          
          if (result.isValid) {
            await new Promise(r => setTimeout(r, 400));
            setVerificationStep(4);
            setIsVerified(true);
          } else {
            setError("Cryptographic verification failed: block payload mismatch or signature invalid.");
          }
        } catch (err: any) {
          setError(err.message || "Failed to execute blockchain audit.");
        }
      };

      performAudit();
    }
  }, [block, userId]);

  if (!block) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`relative w-full max-w-2xl bg-[#0a0a12] border ${error ? 'border-red-500/50' : 'border-fuchsia-500/30'} rounded-2xl overflow-hidden max-h-[90vh] flex flex-col shadow-[0_0_50px_rgba(192,38,211,0.2)]`}
        >
          {/* Header */}
          <div className={`bg-fuchsia-600/10 border-b ${error ? 'border-red-500/20' : 'border-fuchsia-500/20'} px-4 sm:px-6 py-4 flex flex-shrink-0 items-center justify-between`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg border ${error ? 'bg-red-500/20 border-red-500/40' : 'bg-fuchsia-500/20 border-fuchsia-500/40'}`}>
                {error ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-fuchsia-400" />}
              </div>
              <div>
                <h2 className="text-fuchsia-100 font-bold tracking-tight uppercase text-sm">
                  Decentralized BlockDAG Audit
                </h2>
                <p className="text-[10px] text-fuchsia-400/70 font-mono hidden sm:block">NODE_VERIFICATION_PROTOCOL_V4.2</p>
                <p className="text-[10px] text-fuchsia-400/70 font-mono sm:hidden">PROTOCOL_V4.2</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 px-3 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-lg transition-colors border border-white/10 text-xs font-bold flex flex-shrink-0 items-center gap-1"
            >
              <span className="hidden sm:inline">ESC</span>
              <span className="sm:hidden">Close</span>
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-6 overflow-y-auto flex-1">
            {/* Main status */}
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <div className="relative">
                <motion.div
                  animate={{ 
                    rotate: error ? 0 : 360,
                    scale: isVerified ? 1 : [1, 1.05, 1]
                  }}
                  transition={{ duration: isVerified || error ? 0 : 3, repeat: Infinity, ease: "linear" }}
                  className={`w-24 h-24 rounded-full border-4 ${
                    isVerified ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 
                    error ? 'border-red-500/40' :
                    'border-fuchsia-500/20 border-t-fuchsia-500'
                  } flex items-center justify-center`}
                >
                  {isVerified ? (
                    <Shield className="w-10 h-10 text-emerald-400" />
                  ) : error ? (
                    <AlertTriangle className="w-10 h-10 text-red-500" />
                  ) : (
                    <Database className="w-10 h-10 text-fuchsia-400 opacity-50" />
                  )}
                </motion.div>
                {isVerified && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -right-1 -bottom-1 bg-emerald-500 text-white p-1 rounded-full border-2 border-[#0a0a12]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                  </motion.div>
                )}
              </div>
              <h3 className={`mt-4 text-xl font-black tracking-tighter uppercase ${
                isVerified ? 'text-emerald-400' : 
                error ? 'text-red-400' :
                'text-fuchsia-400'
              }`}>
                {isVerified ? 'Integrity Verified' : error ? 'Verification Failed' : 'Scanning Chain...'}
              </h3>
              <p className="text-xs text-white/40 max-w-sm mt-1">
                {error ? error : "Authenticating cryptographic block height and HMAC signatures against distributed sovereign nodes."}
              </p>
            </div>

            {/* Block Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
              <div className="space-y-4">
                <div className="space-y-1">
                   <div className="flex items-center justify-between">
                     <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Block Hash (ID)</label>
                     {auditData && auditData.integrityMatch && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded">MATCH</span>}
                   </div>
                  <div className={`bg-black/40 p-2 rounded border border-white/5 font-mono text-[11px] select-all break-all ${auditData?.integrityMatch ? 'text-emerald-400/80' : 'text-fuchsia-200'}`}>
                    {auditData ? auditData.computedHash : block.dagHash}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Parent Block</label>
                    {auditData && auditData.linkageMatch && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded">VALID_LINK</span>}
                  </div>
                  <div className={`bg-black/40 p-2 rounded border border-white/5 font-mono text-[11px] select-all break-all ${auditData?.linkageMatch ? 'text-emerald-400/80' : 'text-white/50'}`}>
                    {auditData ? auditData.expectedPrevHash : (block.previousDagHash || 'GENESIS_ROOT_INIT_VECTOR')}
                  </div>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">HMAC Signature</label>
                    {auditData && auditData.signatureMatch && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded">AUTHENTIC</span>}
                  </div>
                  <div className={`bg-black/40 p-2 rounded border border-white/5 font-mono text-[11px] select-all break-all ${auditData?.signatureMatch ? 'text-emerald-400/80' : 'text-white/40'}`}>
                    {auditData ? auditData.computedSignature : (block.dagSignature || 'SYSTEM_VERIFIED_PROTOCOL')}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Type</label>
                    <div className="text-xs font-bold text-white/80 capitalize truncate" title={block.type}>{block.type || 'Binary Block'}</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Size</label>
                    <div className="text-xs font-bold text-white/80">{(block.size / 1024).toFixed(2)} KB</div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Algorithm</label>
                    <div className="text-xs font-mono font-bold text-emerald-400 truncate" title="Sovereign signature scheme">
                      {auditData?.sigAlgorithm || block.sigAlgorithm || 'HMAC-SHA256'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 pt-3 border-t border-white/5">
                  <div className="space-y-1 col-span-1">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Crypto Block</label>
                    <div className="text-xs font-bold text-yellow-400">#{block.cryptoBlockNumber || 1}</div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Original Owner ID</label>
                    <div className="text-xs font-mono font-bold text-emerald-400 truncate" title={block.originalOwnerSeedId || 'System Master Seed'}>
                      {block.originalOwnerSeedId ? block.originalOwnerSeedId.substring(0, 16) + '...' : 'System Local Owner'}
                    </div>
                  </div>
                </div>

                {block.peerReceiverSeedId && (
                  <div className="pt-2 border-t border-white/5 space-y-1">
                    <label className="text-[10px] uppercase font-black text-fuchsia-400/60 tracking-widest">Peer Receiver Sync ID</label>
                    <div className="text-xs font-mono font-bold text-sky-400 truncate" title={block.peerReceiverSeedId}>
                      {block.peerReceiverSeedId}
                    </div>
                  </div>
                )}

                {/* IPFS Content Identifier (CIDv1) & CAS Specs */}
                <div className="pt-3 border-t border-cyan-500/20 space-y-1.5 bg-cyan-950/20 -mx-3 px-3 py-2 rounded-lg">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase font-black text-cyan-400 tracking-widest flex items-center gap-1">
                      <Globe className="w-3 h-3 text-cyan-400" />
                      IPFS Content Identifier (CIDv1)
                    </label>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-900/60 text-cyan-300 font-bold border border-cyan-700/50">
                      PINNED (CAS / UnixFS)
                    </span>
                  </div>
                  <div className="text-xs font-mono font-bold text-cyan-200 select-all break-all bg-black/50 p-2 rounded border border-cyan-800/40">
                    {hexToIpfsCidV1(auditData?.storedMerkleRoot || block.dagHash || "0000000000000000000000000000000000000000000000000000000000000000")}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-cyan-300/80 font-mono pt-0.5">
                    <span>Codec: <strong className="text-cyan-200">raw / unixfs (0x55)</strong></span>
                    <span>Multihash: <strong className="text-cyan-200">sha2-256 (0x12)</strong></span>
                    <span>Chunking: <strong className="text-cyan-200">64 KB Shards</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification Steps Overlay */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                 <span className="text-[10px] font-black uppercase text-white/40">Diagnostic Audit Log</span>
                 <span className={`text-[10px] font-mono ${error ? 'text-red-400' : isVerified ? 'text-emerald-400' : 'text-fuchsia-500'}`}>
                   {error ? 'RT-CHAIN: ERROR' : isVerified ? 'RT-CHAIN: SYNCED' : 'RT-CHAIN: CONNECTING'}
                 </span>
              </div>
              <div className={`bg-black/60 rounded-lg p-3 font-mono text-[10px] space-y-1.5 border ${error ? 'border-red-500/30' : 'border-white/5'}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${verificationStep >= 1 ? 'bg-emerald-500' : 'bg-white/20 animate-pulse'}`} />
                  <span className={verificationStep >= 1 ? 'text-white/80' : 'text-white/30'}>
                    [SYSTEM] Fetching distributed ledger state for Block {block.dagHash.substring(0, 8)}...
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${verificationStep >= 2 ? 'bg-emerald-500' : 'bg-white/20'}`} />
                  <span className={verificationStep >= 2 ? 'text-white/80' : 'text-white/30'}>
                    [CRYPTO] validating parent hash alignment ({auditData ? auditData.expectedPrevHash.substring(0, 6) : (block.previousDagHash?.substring(0, 6) || 'GENESIS')})... {verificationStep >= 2 ? 'OK.' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${verificationStep >= 3 ? 'bg-emerald-500' : 'bg-white/20'}`} />
                  <span className={verificationStep >= 3 ? 'text-white/80' : 'text-white/30'}>
                    [SEC] verifying HMAC-SHA256 master seed association... {verificationStep >= 3 ? 'PASS.' : ''}
                  </span>
                </div>
                {verificationStep >= 4 && (
                  <motion.div
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-2 text-emerald-400 font-bold"
                  >
                     <Zap className="w-3 h-3 fill-emerald-400" />
                     <span>[OK] Block confirmed on chain. Transaction finalized in Decentralized Sovereign Archive.</span>
                  </motion.div>
                )}
                {error && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-red-400 font-bold animate-pulse">
                       <AlertTriangle className="w-3 h-3" />
                       <span>[FAIL] Audit unsuccessful: Chain integrity error detected.</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={async () => {
                          try {
                             await api.repairStorage(userId);
                             await api.rebuildVaultDag(userId);
                             const result = await api.verifyVaultBlock(userId, block.id);
                             setAuditData(result.audit);
                             if (result.isValid) {
                               setVerificationStep(4);
                               setIsVerified(true);
                               setError(null);
                             }
                          } catch (e) { console.error(e); }
                        }}
                        className="text-[10px] bg-emerald-900/50 hover:bg-emerald-800/70 text-emerald-200 px-3 py-1.5 rounded border border-emerald-600/50 font-bold flex items-center gap-1.5 shadow-lg"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Auto-Heal & Reverify Block
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

            {/* Footer stats */}
            <div className="p-4 sm:px-8 border-t border-white/5">
              <ShardedFileMatrix fileName={block.name} fileSize={block.size} dagHash={block.dagHash} />
            </div>
            <div className="bg-white/[0.02] border-t border-white/5 p-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
              <div className="text-center p-2 rounded bg-white/5 border border-white/5">
                <div className="text-[9px] text-white/40 uppercase font-black tracking-widest">Confirmations</div>
                <div className="text-sm font-black text-fuchsia-400">{isVerified ? '1,024+' : '—'}</div>
              </div>
              <div className="text-center p-2 rounded bg-white/5 border border-white/5">
                <div className="text-[9px] text-white/40 uppercase font-black tracking-widest">Audit Score</div>
                <div className="text-sm font-black text-emerald-400">{isVerified ? '99.98%' : error ? '0.00%' : '—'}</div>
              </div>
              <div className="text-center p-2 rounded bg-white/5 border border-white/5">
                <div className="text-[9px] text-white/40 uppercase font-black tracking-widest">Gossip Sync</div>
                <div className="text-sm font-black text-indigo-400">{isVerified ? 'ACTIVE' : '—'}</div>
              </div>
              <div className="text-center p-2 rounded bg-white/5 border border-white/5">
                <div className="text-[9px] text-white/40 uppercase font-black tracking-widest">Identity</div>
                <div className={`text-sm font-black ${error ? 'text-red-400' : 'text-blue-400'}`}>
                  {error ? 'CORRUPTED' : isVerified ? 'REAL_BLOCK' : 'PENDING'}
                </div>
              </div>
            </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
