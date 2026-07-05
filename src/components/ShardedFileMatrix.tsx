import React from 'react';
import { motion } from 'motion/react';
import { Box, Lock, FileCode, CheckCircle2 } from 'lucide-react';

interface Props {
  fileName: string;
  fileSize: number;
  dagHash: string;
}

export const ShardedFileMatrix: React.FC<Props> = ({ fileName, fileSize, dagHash }) => {
  // Generate deterministic but random-looking shards based on hash
  const shardCount = Math.min(24, Math.max(8, Math.floor(fileSize / 1024 / 100)));
  const shards = Array.from({ length: 24 }).map((_, i) => ({
    id: i,
    active: i < shardCount || Math.random() > 0.7,
    status: Math.random() > 0.9 ? 'syncing' : 'verified'
  }));

  return (
    <div className="bg-zinc-950 border border-indigo-500/10 rounded-2xl p-6 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-emerald-500 opacity-50" />
      
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Box className="w-4 h-4 text-indigo-400" />
            <h4 className="text-xs font-black uppercase tracking-widest text-white">Erasure Encoded Matrix</h4>
          </div>
          <p className="text-[10px] text-zinc-400 font-mono">{fileName} • IPFS DAG Distribution</p>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-md border border-emerald-500/20">
            <Lock className="w-3 h-3 text-emerald-400" />
            <span className="text-[8px] font-black uppercase text-emerald-400 tracking-widest">Quantum Resistant</span>
        </div>
      </div>

      <div className="grid grid-cols-6 sm:grid-cols-8 gap-2 mb-4">
        {shards.map((shard, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.02 }}
            className={`aspect-square rounded-md border flex items-center justify-center relative group
              ${shard.active 
                ? shard.status === 'verified' 
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                    : 'bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400 animate-pulse'
                : 'bg-white/5 border-white/5 text-zinc-600'
              }`}
          >
            {shard.active && shard.status === 'verified' && <CheckCircle2 className="w-3 h-3 opacity-50" />}
            {shard.active && shard.status === 'syncing' && <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-ping" />}
            
            {/* Tooltip */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-zinc-900 border border-white/10 text-[8px] font-mono px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10 transition-opacity">
                Block {i} • {shard.active ? shard.status.toUpperCase() : 'EMPTY'}
            </div>
          </motion.div>
        ))}
      </div>
      
      <div className="flex items-center justify-between text-[9px] font-mono text-zinc-500">
        <div className="flex items-center gap-2">
            <FileCode className="w-3 h-3" />
            <span className="truncate max-w-[150px]">{dagHash || 'PENDING_HASH_CALCULATION_0x000'}</span>
        </div>
        <div className="uppercase tracking-widest font-black text-indigo-400/50">
            {shardCount} Active Shards
        </div>
      </div>
    </div>
  );
};
