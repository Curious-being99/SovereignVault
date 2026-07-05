import React from "react";
import { motion } from "motion/react";
import { AlertTriangle, Clock, Server, Download, FilePlus2 } from "lucide-react";

export interface SyncConflict {
  fileId: string;
  fileName: string;
  localLastModified: number;
  remoteLastModified: number;
  remotePeerId: string;
}

export function SyncConflictModal({
  conflict,
  onResolve,
}: {
  conflict: SyncConflict;
  onResolve: (action: 'keep-local' | 'keep-remote' | 'merge') => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-slate-900 border border-amber-500/30 p-8 rounded-[32px] w-full max-w-lg shadow-2xl relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-amber-500" />
        
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white uppercase tracking-widest">Sync Conflict Detected</h2>
            <p className="text-sm text-amber-200/70 font-medium mt-1">Divergent edits found for <span className="text-amber-400 font-mono">{conflict.fileName}</span></p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-indigo-400">
              <Server className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Local Version</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-mono">{new Date(conflict.localLastModified).toLocaleString()}</span>
            </div>
            <button
              onClick={() => onResolve('keep-local')}
              className="mt-2 w-full py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Keep Local
            </button>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-emerald-400">
              <Download className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Remote Version</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-slate-500" />
              <span className="text-xs font-mono">{new Date(conflict.remoteLastModified).toLocaleString()}</span>
            </div>
            <button
              onClick={() => onResolve('keep-remote')}
              className="mt-2 w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
            >
              Keep Remote
            </button>
          </div>
        </div>

        <button
          onClick={() => onResolve('merge')}
          className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white rounded-2xl px-4 py-4 font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg"
        >
          <FilePlus2 className="w-5 h-5" />
          Keep Both (Create Copy)
        </button>
      </motion.div>
    </div>
  );
}
