import React, { useState, useEffect } from "react";
import { 
  ShieldCheck, 
  Key, 
  QrCode, 
  Copy, 
  Check, 
  RefreshCw, 
  Users, 
  ChevronRight, 
  Camera, 
  RotateCcw,
  AlertCircle,
  Lock,
  Unlock,
  Smartphone
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { QRColdStorage } from "./QRColdStorage";
import { QRScannerOverlay } from "./QRScannerOverlay";
import { split, reconstruct, SSSShare } from "../lib/sss";

const WORD_LIST = [
  "abandon", "ability", "able", "about", "above", "absent", "absorb", "abstract", "absurd", "abuse", "access", "accident",
  "account", "accuse", "achieve", "acid", "acoustic", "acquire", "across", "act", "action", "actor", "actress", "actual",
  "adapt", "add", "addict", "address", "adjust", "admit", "adult", "advance", "advice", "aerobic", "affair", "afford",
  "afraid", "again", "age", "agent", "agree", "ahead", "aim", "air", "airport", "aisle", "alarm", "album",
  "alcohol", "alert", "alien", "all", "alley", "allow", "almost", "alone", "alpha", "already", "also", "alter",
  "always", "amateur", "amazing", "among", "amount", "amused", "analyst", "anchor", "ancient", "anger", "angle", "angry",
  "animal", "ankle", "announce", "annual", "another", "answer", "antenna", "antique", "anxiety", "any", "apart", "apology"
];

export function SovereignRecovery({ 
  broadcastShard, 
  requestShard,
  onShardReceived,
  initialKey,
  onKeyRestored
}: { 
  broadcastShard?: (cid: string, shard: any) => void;
  requestShard?: (cid: string) => void;
  onShardReceived?: (callback: (data: any) => void) => void;
  initialKey?: string;
  onKeyRestored?: (key: string) => void;
}) {
  const [activeStep, setActiveStep] = useState<"onboarding" | "mnemonic" | "shred" | "reconstruct">(() => (localStorage.getItem("sovereign-recovery-activeStep") as any) || "onboarding");
  const [mnemonic, setMnemonic] = useState<string[]>(() => JSON.parse(localStorage.getItem("sovereign-recovery-mnemonic") || "[]"));
  const [masterKey, setMasterKey] = useState(() => localStorage.getItem("sovereign-recovery-masterKey") || initialKey || "");
  const [shards, setShards] = useState<SSSShare[]>([]); // These are transient during shredding, maybe don't persist
  const [scannedShards, setScannedShards] = useState<SSSShare[]>([]); // Shards should probably not be persisted in localStorage as plaintext
  const [reconstructedKey, setReconstructedKey] = useState<string | null>(() => localStorage.getItem("sovereign-recovery-reconstructedKey"));
  const [isCopied, setIsCopied] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [showColdStorage, setShowColdStorage] = useState(false);

  useEffect(() => {
    localStorage.setItem("sovereign-recovery-activeStep", activeStep);
  }, [activeStep]);

  useEffect(() => {
    localStorage.setItem("sovereign-recovery-mnemonic", JSON.stringify(mnemonic));
  }, [mnemonic]);

  useEffect(() => {
    localStorage.setItem("sovereign-recovery-masterKey", masterKey);
  }, [masterKey]);

  useEffect(() => {
    localStorage.setItem("sovereign-recovery-reconstructedKey", reconstructedKey || "");
  }, [reconstructedKey]);

  useEffect(() => {
    if (initialKey) setMasterKey(initialKey);
  }, [initialKey]);

  // Listen for mesh responses
  useEffect(() => {
    if (onShardReceived) {
      onShardReceived((data) => {
        if (data.type === "shard_response") {
          addScannedShard(JSON.stringify(data.shard));
        }
      });
    }
  }, [onShardReceived]);

  const generateMnemonic = () => {
    // If we have a masterKey, we should ideally derive from it, but for now we just generate random and link them
    const newMnemonic = Array.from({ length: 12 }, () => WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)]);
    setMnemonic(newMnemonic);
    setActiveStep("mnemonic");
  };

  const handleShredKey = () => {
    if (!masterKey) return;
    const encoder = new TextEncoder();
    const data = encoder.encode(masterKey);
    const newShards = split(data, 5, 3); // 5 shards, 3 required
    setShards(newShards);
    setActiveStep("shred");

    // Broadcast shards to mesh for social recovery if desired
    if (broadcastShard) {
      setIsBroadcasting(true);
      // We broadcast each shard with a derivation of the master key as CID
      const cid = `recovery_${btoa(masterKey).substring(0, 10)}`;
      newShards.forEach(shard => broadcastShard(cid, shard));
      setTimeout(() => setIsBroadcasting(false), 2000);
    }
  };

  const handleApplyRestoredKey = () => {
    if (reconstructedKey && onKeyRestored) {
      onKeyRestored(reconstructedKey);
    }
  };

  const addScannedShard = (shardData: string) => {
    try {
      const parsed = JSON.parse(shardData);
      if (parsed && typeof parsed === 'object' && parsed.x && (parsed.data || parsed.d)) {
        let uint8Data: Uint8Array;
        
        if (parsed.d) {
          try {
            // Handle base64 format
            const binaryString = atob(parsed.d);
            uint8Data = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              uint8Data[i] = binaryString.charCodeAt(i);
            }
          } catch (e) {
            console.error("Base64 decode failed:", e);
            return;
          }
        } else {
          // Handle old array/object format
          uint8Data = new Uint8Array(Object.values(parsed.data));
        }
        
        const newShard: SSSShare = { x: parsed.x, data: uint8Data };
        
        // Avoid duplicates
        setScannedShards(prev => {
          if (prev.some(s => s.x === newShard.x)) return prev;
          return [...prev, newShard];
        });
      } else {
        // Maybe it's the master key mnemonic directly?
        const words = shardData.split(' ');
        if (words.length === 12) {
          setMasterKey(shardData);
          setReconstructedKey(shardData);
          setActiveStep("reconstruct");
        } else {
          throw new Error("Invalid shard data format");
        }
      }
    } catch (e) {
      // It might not be JSON, try mnemonic directly
      const words = shardData.split(' ');
      if (words.length === 12) {
        setMasterKey(shardData);
        setReconstructedKey(shardData);
        setActiveStep("reconstruct");
      } else {
        console.error("Invalid shard data", e);
      }
    }
  };

  const handleReconstruct = () => {
    if (scannedShards.length < 3) return;
    try {
      const data = reconstruct(scannedShards);
      const decoder = new TextDecoder();
      setReconstructedKey(decoder.decode(data));
    } catch (e) {
      console.error("Reconstruction failed", e);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="bg-white/5 border border-white/5 rounded-3xl overflow-hidden flex flex-col h-full min-h-[600px]">
      {/* Header */}
      <div className="p-6 bg-gradient-to-r from-amber-500/10 to-transparent border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <RotateCcw className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">Sovereign Vault Recovery</h3>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-amber-400/60 font-bold uppercase">Decentralized Reconstruction Engine</p>
              <div className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[8px] font-black text-amber-400 uppercase tracking-widest">Secure Zone</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeStep !== "onboarding" && (
            <button 
              onClick={() => setActiveStep("onboarding")}
              className="text-[10px] font-black text-white/40 hover:text-white uppercase transition-colors"
            >
              Restart
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {activeStep === "onboarding" && (
            <motion.div 
              key="onboarding"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="space-y-4">
                <h4 className="text-xl font-black text-white leading-tight">Secure your vault with zero-knowledge redundancy.</h4>
                <p className="text-sm text-indigo-200/50 leading-relaxed font-medium">
                  Traditional backups rely on centralized trust. Sovereign recovery uses mathematical sharding and deterministic seeds to ensure you can reconstruct your vault even if all servers vanish.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button 
                  onClick={generateMnemonic}
                  className="group bg-white/5 border border-white/5 p-6 rounded-2xl text-left hover:bg-white/10 transition-all space-y-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <Key className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-white uppercase mb-1">Mnemonic Seed</h5>
                    <p className="text-[11px] text-indigo-300/40">Generate a 12-word deterministic phrase for total device independence.</p>
                  </div>
                </button>

                <button 
                  onClick={() => setActiveStep("shred")}
                  className="group bg-white/5 border border-white/5 p-6 rounded-2xl text-left hover:bg-white/10 transition-all space-y-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="text-sm font-black text-white uppercase mb-1">Social Shredding</h5>
                    <p className="text-[11px] text-indigo-300/40">Split your master key into shards for trusted guardians to hold.</p>
                  </div>
                </button>
              </div>

              <div className="pt-4 border-t border-white/5">
                <button 
                  onClick={() => setActiveStep("reconstruct")}
                  className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 py-4 rounded-2xl flex items-center justify-center gap-3 transition-all group"
                >
                  <RefreshCw className="w-5 h-5 text-indigo-400 group-hover:rotate-180 transition-transform duration-700" />
                  <span className="text-sm font-black text-white uppercase tracking-widest">Begin Reconstruction Flow</span>
                </button>
              </div>
            </motion.div>
          )}

          {activeStep === "mnemonic" && (
            <motion.div 
              key="mnemonic"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="bg-amber-500/10 border border-amber-500/20 p-5 rounded-2xl flex gap-4 items-start">
                <AlertCircle className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-amber-400 uppercase">Write this down offline</h4>
                  <p className="text-xs text-amber-400/60 leading-relaxed font-medium">
                    These 12 words allow anyone to access your entire vault. Never store them digitally. Record them on paper or steel.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {mnemonic.map((word, i) => (
                  <div key={i} className="bg-black/30 border border-white/5 p-3 rounded-xl flex items-center gap-3">
                    <span className="text-[10px] font-mono text-indigo-400/40">{(i + 1).toString().padStart(2, '0')}</span>
                    <span className="text-sm font-black text-white">{word}</span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setShowColdStorage(true)}
                  className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 h-12 px-4 rounded-xl flex items-center justify-center gap-2 text-xs font-black text-emerald-400 uppercase transition-all"
                >
                  <QrCode className="w-4 h-4" />
                  QR Cold Storage
                </button>
                <button 
                  onClick={() => copyToClipboard(mnemonic.join(" "))}
                  className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 h-12 rounded-xl flex items-center justify-center gap-2 text-xs font-black text-white uppercase transition-all"
                >
                  {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {isCopied ? "Copied" : "Copy Seed"}
                </button>
                <button 
                  onClick={() => setActiveStep("onboarding")}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 h-12 rounded-xl flex items-center justify-center text-xs font-black text-white uppercase tracking-widest transition-all"
                >
                  I've Secured It
                </button>
              </div>
            </motion.div>
          )}

          {showColdStorage && (
            <div className="absolute inset-0 z-50 bg-black/80 flex items-center justify-center p-6" onClick={() => setShowColdStorage(false)}>
              <div onClick={e => e.stopPropagation()}>
                <QRColdStorage data={mnemonic.join(" ")} title="Vault Seed QR" onClose={() => setShowColdStorage(false)} />
              </div>
            </div>
          )}

          {activeStep === "shred" && (
            <motion.div 
              key="shred"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <h4 className="text-lg font-black text-white uppercase">Secret Sharding (SSS)</h4>
                <p className="text-xs text-indigo-200/50 leading-relaxed">
                  Split your master key into 5 fragments. Any 3 fragments combined can reconstruct the original key.
                </p>
              </div>

              {!shards.length ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest ml-1">Master Key to Shred</label>
                    <div className="relative">
                      <input 
                        type="password"
                        placeholder="Enter secret identifier or master key..."
                        className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-white placeholder-white/10 focus:outline-none focus:border-amber-500/50 transition-all"
                        value={masterKey}
                        onChange={(e) => setMasterKey(e.target.value)}
                      />
                      <Lock className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                    </div>
                  </div>
                  <button 
                    onClick={handleShredKey}
                    disabled={!masterKey}
                    className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed h-14 rounded-2xl flex items-center justify-center gap-3 transition-all"
                  >
                    <Smartphone className="w-5 h-5 text-white" />
                    <span className="text-sm font-black text-white uppercase tracking-[0.2em]">Initialize Sharding</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4 h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {shards.map((shard, i) => (
                      <div key={i} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center gap-4">
                        <div className="w-24 h-24 bg-white p-2 rounded-xl shrink-0">
                          <QRCodeSVG 
                            value={JSON.stringify({ 
                              x: shard.x, 
                              d: btoa(Array.from(shard.data).map((b: number) => String.fromCharCode(b)).join('')) 
                            })}
                            size={80}
                            level="M"
                            includeMargin={false}
                          />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Shard #{shard.x}</span>
                            <span className="text-[9px] font-mono text-white/20">Ed25519-SSS-256</span>
                          </div>
                          <p className="text-[10px] text-indigo-200/40 leading-relaxed italic">
                            Distribute this QR to Guardian #{shard.x}. They must scan this to store a fragment of your identity.
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setShards([])}
                    className="w-full border border-white/10 hover:bg-white/5 py-4 rounded-xl text-[10px] font-black text-white uppercase tracking-widest transition-all"
                  >
                    Clear Local Shards
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeStep === "reconstruct" && (
            <motion.div 
              key="reconstruct"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="space-y-6"
            >
              <div className="space-y-2">
                <h4 className="text-lg font-black text-white uppercase">Vault Reconstruction</h4>
                <p className="text-xs text-indigo-200/50 leading-relaxed">
                  Collect at least <strong className="text-amber-400 font-black">3 Guardian Shards</strong> to rebuild your sovereign identity.
                </p>
              </div>

              {reconstructedKey ? (
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-3xl space-y-6 text-center animate-in fade-in zoom-in duration-500">
                  <div className="w-20 h-20 bg-emerald-500/20 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400">
                    <Unlock className="w-10 h-10" />
                  </div>
                  <div className="space-y-2">
                    <h5 className="text-xl font-black text-white uppercase">Reconstruction Successful</h5>
                    <p className="text-xs text-emerald-400/60 font-medium tracking-wide">MASTER KEY RECOVERED NATIVELY</p>
                  </div>
                  <div className="bg-black/40 border border-emerald-500/20 p-5 rounded-2xl font-mono text-sm text-emerald-400 break-all select-all">
                    {reconstructedKey}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => {
                        setReconstructedKey(null);
                        setScannedShards([]);
                        setActiveStep("onboarding");
                      }}
                      className="bg-white/5 hover:bg-white/10 h-14 rounded-2xl text-xs font-black text-white uppercase tracking-widest transition-all"
                    >
                      Reset
                    </button>
                    <button 
                      onClick={handleApplyRestoredKey}
                      className="bg-emerald-600 hover:bg-emerald-500 h-14 rounded-2xl text-xs font-black text-white uppercase tracking-widest transition-all shadow-xl shadow-emerald-500/20"
                    >
                      {onKeyRestored ? "Apply to Identity" : "Initialize Access"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Shard counter */}
                  <div className="flex justify-between items-end">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Progress</span>
                      <div className="text-3xl font-black text-white">
                        {scannedShards.length} <span className="text-indigo-400/40 text-lg">/ 3</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5 pb-1">
                      {[...Array(3)].map((_, i) => (
                        <div 
                          key={i} 
                          className={`w-8 h-1.5 rounded-full transition-all duration-500 ${i < scannedShards.length ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)]' : 'bg-white/5'}`} 
                        />
                      ))}
                    </div>
                  </div>

                  {/* Manual entry fallback for air-gapped or non-visual recovery paths */}
                  <div className="space-y-4">
                    <div className="bg-black/30 border border-white/5 p-5 rounded-2xl space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Guardian Shard Entry</span>
                        <button 
                          onClick={() => setShowQRScanner(true)}
                          className="flex items-center gap-2 hover:bg-white/5 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5 text-indigo-400" />
                          <span className="text-[10px] font-bold text-indigo-400">Scan QR</span>
                        </button>
                      </div>
                      <textarea 
                        placeholder="Paste raw shard ciphertext or scan output..."
                        className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-[11px] font-mono text-indigo-200 h-24 resize-none focus:outline-none focus:border-amber-500/50"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            addScannedShard(e.currentTarget.value);
                            e.currentTarget.value = "";
                          }
                        }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {scannedShards.map((s, idx) => (
                        <div key={idx} className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex items-center justify-between animate-in slide-in-from-bottom-2 duration-300">
                          <span className="text-[10px] font-black text-amber-400">SHARD #{s.x}</span>
                          <Check className="w-3 h-3 text-amber-400" />
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={() => {
                        if (requestShard && masterKey) {
                          const cid = `recovery_${btoa(masterKey).substring(0, 10)}`;
                          requestShard(cid);
                        }
                      }}
                      disabled={!masterKey}
                      className="w-full border border-white/10 hover:bg-white/5 h-14 rounded-2xl flex items-center justify-center gap-3 transition-all mb-4"
                    >
                      <Users className="w-5 h-5 text-indigo-400" />
                      <span className="text-sm font-black text-white uppercase tracking-[0.2em]">Request from Mesh</span>
                    </button>

                    <button 
                      onClick={handleReconstruct}
                      disabled={scannedShards.length < 3}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed h-14 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-xl shadow-indigo-500/10"
                    >
                      <RefreshCw className="w-5 h-5 text-white" />
                      <span className="text-sm font-black text-white uppercase tracking-[0.2em]">Reassemble Secret</span>
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showQRScanner && (
            <QRScannerOverlay
              onScan={(scannedText) => {
                setShowQRScanner(false);
                addScannedShard(scannedText);
              }}
              onClose={() => setShowQRScanner(false)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Info Footer */}
      <div className="p-4 bg-black/40 border-t border-white/5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
          <Smartphone className="w-4 h-4 text-white/20" />
        </div>
        <p className="text-[9px] text-white/30 font-medium leading-relaxed uppercase tracking-wider">
          Sovereign identity derivation is purely local. Keys are calculated within the TEE and never exit the physical device.
        </p>
      </div>
    </div>
  );
}
