import React from 'react';
import { motion } from 'motion/react';
import { TransferRecord } from '../types';
import { X, CheckCircle2, XCircle, Clock, ArrowUpRight, ArrowDownLeft } from 'lucide-react';

interface Props {
  history: TransferRecord[];
  onClose: () => void;
}

export const TransferHistoryModal: React.FC<Props> = ({ history, onClose }) => {
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-indigo-950/80 backdrop-blur-md"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl bg-indigo-900/90 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/20 rounded-xl">
              <Clock className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-white">Transfer Audit Log</h2>
              <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest leading-none mt-1">E2E Session Transfer History</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin">
          {history.length === 0 ? (
            <div className="text-center py-12 space-y-3 opacity-50">
              <div className="text-sm font-bold text-indigo-200">No transfers recorded in this session.</div>
              <p className="text-[10px] text-indigo-400 uppercase tracking-widest">Perform a secure sync or direct transfer to populate.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {[...history].sort((a, b) => b.timestamp - a.timestamp).map((record) => (
                <div key={record.id} className="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4 group hover:bg-white/[0.07] transition-all">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={`p-3 rounded-xl flex-shrink-0 ${record.direction === 'outgoing' ? 'bg-orange-500/10 text-orange-400' : 'bg-teal-500/10 text-teal-400'}`}>
                      {record.direction === 'outgoing' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white truncate max-w-full" title={record.fileName}>{record.fileName}</span>
                        <span className="text-[8px] bg-white/10 px-1.5 py-0.5 rounded uppercase font-black tracking-widest text-indigo-300 flex-shrink-0">{record.method}</span>
                      </div>
                      <div className="text-[10px] text-indigo-300 font-medium flex flex-wrap items-center gap-2 mt-1">
                        <span>{record.direction === 'outgoing' ? `To @${record.receiver}` : `From @${record.sender}`}</span>
                        <span className="opacity-30">•</span>
                        <span>{formatBytes(record.fileSize)}</span>
                        <span className="opacity-30">•</span>
                        <span>{new Date(record.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {record.status === 'Completed' ? (
                      <div className="flex items-center gap-1.5 text-teal-400">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Success</span>
                      </div>
                    ) : record.status === 'Failed' ? (
                      <div className="flex items-center gap-1.5 text-red-400">
                        <XCircle className="w-4 h-4" />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline" title={record.errorMessage}>Failed</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-indigo-400 animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Active</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-white/5 border-t border-white/5 text-center">
          <p className="text-[9px] text-indigo-400 uppercase font-black tracking-widest opacity-60">Audit logs are persistent across the current session.</p>
        </div>
      </motion.div>
    </motion.div>
  );
};
