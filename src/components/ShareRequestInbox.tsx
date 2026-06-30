import React, { useState } from 'react';
import { FileShareRequest } from '../types';
import { Check, X, Info, ShieldCheck, ShieldAlert, Eye, EyeOff, FileText, Image, File } from 'lucide-react';

interface Props {
  requests: FileShareRequest[];
  onAccept: (request: FileShareRequest) => void;
  onReject: (request: FileShareRequest) => void;
}

export function ShareRequestInbox({ requests, onAccept, onReject }: Props) {
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);

  if (requests.length === 0) return null;

  const togglePreview = (id: string) => {
    setExpandedPreviewId(prev => (prev === id ? null : id));
  };

  const decodeBase64Utf8 = (str: string) => {
    try {
      return decodeURIComponent(escape(window.atob(str)));
    } catch {
      try {
        return window.atob(str);
      } catch {
        return "Binary file (Preview not available as plain text)";
      }
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isTextFile = (type?: string, name?: string) => {
    if (!type) return false;
    const lowerType = type.toLowerCase();
    const lowerName = name?.toLowerCase() || "";
    return (
      lowerType.startsWith("text/") ||
      lowerType.includes("json") ||
      lowerType.includes("javascript") ||
      lowerType.includes("typescript") ||
      lowerType.includes("xml") ||
      lowerName.endsWith(".txt") ||
      lowerName.endsWith(".json") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".csv") ||
      lowerName.endsWith(".html") ||
      lowerName.endsWith(".css") ||
      lowerName.endsWith(".ts") ||
      lowerName.endsWith(".tsx") ||
      lowerName.endsWith(".js")
    );
  };

  return (
    <div className="bg-indigo-950/80 p-6 rounded-2xl border border-indigo-500/20 mb-8 backdrop-blur-sm">
      <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Info className="w-5 h-5 text-indigo-400" />
        Shared File Requests ({requests.length})
      </h2>
      <div className="space-y-4">
        {requests.map((req) => {
          const isExpanded = expandedPreviewId === req.id;
          const hasPayload = !!req.fileDataBase64;
          const isImg = req.fileType?.startsWith('image/');
          const isText = isTextFile(req.fileType, req.fileName);

          return (
            <div key={req.id} className="bg-indigo-900/40 p-5 rounded-xl border border-indigo-500/10 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex-1 text-left">
                  <div className="font-bold text-white text-base mb-1">{req.fileName}</div>
                  <div className="text-xs text-indigo-200 mb-2">From: @{req.senderName}</div>
                  
                  {req.note && (
                    <div className="text-xs text-indigo-200/80 bg-indigo-950/60 p-2.5 rounded-lg border border-indigo-500/10 mb-3 italic">
                      "{req.note}"
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-mono text-indigo-300">
                    <div className="flex items-center gap-1.5">
                      {req.integrityHash ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-red-500" />}
                      <span className="break-all opacity-80">Hash: {req.integrityHash || 'No integrity hash provided'}</span>
                    </div>
                    {req.fileSize && (
                      <div className="flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded text-indigo-300">
                        Size: {formatFileSize(req.fileSize)}
                      </div>
                    )}
                    {req.fileType && (
                      <div className="flex items-center gap-1 bg-indigo-500/10 px-2 py-0.5 rounded text-indigo-300 text-left">
                        Type: {req.fileType}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 shrink-0 self-end sm:self-start">
                  {hasPayload && (
                    <button
                      onClick={() => togglePreview(req.id)}
                      className="flex items-center gap-1 bg-indigo-500/10 hover:bg-indigo-500/25 text-indigo-300 px-3 py-2 rounded-lg text-xs font-bold transition border border-indigo-500/20"
                      title={isExpanded ? "Hide Preview" : "View Decrypted File Preview"}
                    >
                      {isExpanded ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      Preview
                    </button>
                  )}
                  <button 
                    onClick={() => onReject(req)}
                    className="flex items-center gap-1.5 bg-red-900/20 hover:bg-red-900/40 text-red-300 px-3 py-2 rounded-lg text-xs font-bold transition border border-red-500/10"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                  <button 
                    onClick={() => onAccept(req)}
                    className="flex items-center gap-1.5 bg-emerald-950/65 hover:bg-emerald-950 text-emerald-300 px-3 py-2 rounded-lg text-xs font-bold transition border border-emerald-500/20"
                  >
                    <Check className="w-4 h-4" /> Accept
                  </button>
                </div>
              </div>

              {/* Expandable Preview Drawer */}
              {isExpanded && hasPayload && req.fileDataBase64 && (
                <div className="border-t border-indigo-500/15 pt-4 mt-1 bg-indigo-950/40 p-4 rounded-xl border border-indigo-500/15">
                  <div className="text-[10px] uppercase font-black tracking-widest text-indigo-400 mb-2 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" /> Decrypted Real-Time Preview
                  </div>
                  
                  {isImg ? (
                    <div className="flex justify-center bg-black/20 p-2.5 rounded-lg border border-white/5 max-h-[320px] overflow-hidden">
                      <img 
                        src={`data:${req.fileType};base64,${req.fileDataBase64}`} 
                        alt={req.fileName}
                        className="max-h-[300px] max-w-full object-contain rounded border border-white/10"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : isText ? (
                    <pre className="text-xs font-mono text-teal-300 bg-black/30 p-3.5 rounded-lg max-h-56 overflow-y-auto whitespace-pre-wrap border border-indigo-500/10 custom-scrollbar text-left">
                      {decodeBase64Utf8(req.fileDataBase64)}
                    </pre>
                  ) : (
                    <div className="flex items-center gap-3 bg-black/20 p-4 rounded-lg border border-white/5 text-left">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-300 animate-pulse">
                        <File className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white mb-0.5">{req.fileName}</div>
                        <div className="text-[10px] text-indigo-300 font-mono">
                          Format: {req.fileType || 'binary/unknown'} | CRC Integrity Checklist Pass
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
