import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users,
  Send, 
  User, 
  X, 
  Zap, 
  Shield, 
  MessageSquare,
  Globe,
  Trash2,
  RefreshCw,
  Radio
} from "lucide-react";
import io, { Socket } from "socket.io-client";

interface Message {
  id: string;
  sender: string;
  role: "user" | "peer";
  content: string;
  timestamp: number;
}

interface SovereignChatProps {
  onClose: () => void;
  userSeedId?: string;
  userName?: string;
}

export const SovereignChat: React.FC<SovereignChatProps> = ({ onClose, userSeedId, userName }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const socketUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const newSocket = io(socketUrl, { transports: ["websocket"] });
    setSocket(newSocket);
    socketRef.current = newSocket;
    
    newSocket.on("connect", () => {
      console.log("Socket connected:", newSocket.id);
      // Automatically announce presence so any waiting peer can initiate
      newSocket.emit("ready");
    });
    
    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
    });

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' }
      ]
    });
    setPeerConnection(pc);
    pcRef.current = pc;

    const doInitiateConnection = async () => {
      try {
        console.log("Auto-initiating WebRTC PeerConnection...");
        const channel = pc.createDataChannel("chat");
        setupDataChannel(channel);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        newSocket.emit("offer", offer);
      } catch (err) {
        console.error("Failed to auto-initiate connection:", err);
      }
    };

    // When we hear that another peer is "ready", automatically connect to them!
    newSocket.on("ready", () => {
      console.log("Peer ready event received, initiating handshake...");
      doInitiateConnection();
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        newSocket.emit("candidate", event.candidate);
      }
    };

    pc.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    const iceCandidateQueue: RTCIceCandidate[] = [];

    newSocket.on("offer", async (offer) => {
      await pc.setRemoteDescription(offer);
      iceCandidateQueue.forEach(c => pc.addIceCandidate(c));
      iceCandidateQueue.length = 0;
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      newSocket.emit("answer", answer);
    });

    newSocket.on("answer", async (answer) => {
      await pc.setRemoteDescription(answer);
      iceCandidateQueue.forEach(c => pc.addIceCandidate(c));
      iceCandidateQueue.length = 0;
    });

    newSocket.on("candidate", (candidate) => {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        pc.addIceCandidate(candidate);
      } else {
        iceCandidateQueue.push(candidate);
      }
    });

    pc.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", pc.iceConnectionState);
    };

    // Auto-initiate connection after 1.5 seconds just in case the other peer is already there and we missed their ready signal
    const timer = setTimeout(() => {
      if (newSocket.connected && pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
        doInitiateConnection();
      }
    }, 1500);

    return () => {
      clearTimeout(timer);
      newSocket.disconnect();
      pc.close();
    };
  }, []);

  const setupDataChannel = (channel: RTCDataChannel) => {
    channel.onopen = () => setIsConnected(true);
    channel.onclose = () => setIsConnected(false);
    channel.onmessage = (event) => {
      const peerMessage: Message = {
        id: Date.now().toString(),
        sender: "Peer",
        role: "peer",
        content: event.data,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, peerMessage]);
    };
    setDataChannel(channel);
  };

  const initiateConnection = async () => {
    const pc = pcRef.current;
    const socket = socketRef.current;
    if (!pc || !socket) return;
    try {
      const channel = pc.createDataChannel("chat");
      setupDataChannel(channel);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", offer);
    } catch (err) {
      console.error("Failed to initiate manual connection:", err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim()) return;
    
    if (!dataChannel || dataChannel.readyState !== 'open') {
      const systemMessage: Message = {
        id: Date.now().toString(),
        sender: "System",
        role: "peer",
        content: "Cannot send message. You are not connected to a peer.",
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, systemMessage]);
      return;
    }

    dataChannel.send(input);

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: userName || "Self",
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 100 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col font-sans"
    >
      <header className="relative z-10 p-4 sm:p-6 border-b border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${isConnected ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-slate-800 text-slate-500 border border-white/5"}`}>
              <Globe className={`w-5 h-5`} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white uppercase tracking-tighter">Real-Time P2P Chat</h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-700"}`} />
                <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                  {isConnected ? "Connected • P2P" : "Disconnected"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isConnected && (
              <button 
                onClick={initiateConnection}
                className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all border bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
              >
                Connect
              </button>
            )}
            <button 
              onClick={() => setMessages([])}
              className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-red-400 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button 
              onClick={onClose}
              className="p-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10">
        <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-10 opacity-30">
              <MessageSquare className="w-12 h-12 mb-4" />
              <p className="text-sm font-bold uppercase tracking-widest">No communication history</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`flex gap-3 sm:gap-4 max-w-[85%] sm:max-w-[75%] ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center border ${
                    msg.role === "user" 
                      ? "bg-indigo-500/20 border-indigo-500/30 text-indigo-300" 
                      : "bg-slate-800 border-white/5 text-slate-400"
                  }`}>
                    {msg.role === "user" ? <User className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-1 ${msg.role === "user" ? "text-right text-indigo-400" : "text-left text-slate-500"}`}>
                      {msg.sender}
                    </span>
                    <div className={`p-4 rounded-2xl text-sm sm:text-base leading-relaxed ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/10"
                        : "bg-slate-900 border border-white/5 text-slate-200"
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <footer className="relative z-10 p-4 sm:p-6 border-t border-white/5 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto">
          {!isConnected && (
            <div className="mb-4 p-3 bg-red-500/5 border border-red-500/10 rounded-xl text-center">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center justify-center gap-2">
                <Radio className="w-3 h-3" />
                Connect P2P to chat
              </p>
            </div>
          )}
          <form 
            onSubmit={handleSendMessage}
            className="relative"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isConnected ? "Broadcast to peer..." : "Type a message (Connect first)..."}
              className={`w-full bg-slate-900 border border-white/10 rounded-2xl py-4 pl-6 pr-14 text-white placeholder:text-slate-700 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all shadow-inner ${!isConnected ? "opacity-70" : ""}`}
            />
            <button
              type="submit"
              disabled={!input.trim() || !isConnected}
              className={`absolute right-2 top-2 bottom-2 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                input.trim() && isConnected
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:scale-105 active:scale-95"
                  : "bg-slate-800 text-slate-600"
              }`}
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      </footer>
    </motion.div>
  );
};
