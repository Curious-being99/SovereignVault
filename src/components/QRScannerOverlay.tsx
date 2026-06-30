import React, { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  X, 
  Camera, 
  CameraOff, 
  QrCode, 
  RefreshCw, 
  AlertCircle, 
  Sparkles, 
  Loader2,
  ShieldCheck,
  CheckCircle,
  HelpCircle
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

interface QRScannerOverlayProps {
  onScan: (scannedText: string) => void;
  onClose: () => void;
}

export const QRScannerOverlay: React.FC<QRScannerOverlayProps> = ({ onScan, onClose }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanSuccess, setScanSuccess] = useState<boolean>(false);

  const qrCodeInstanceRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerId = "qr-scanner-viewport";

  interface CameraDevice {
    id: string;
    label: string;
  }

  // Request permission and enumerate cameras
  useEffect(() => {
    let active = true;

    const initScanner = async () => {
      try {
        setIsInitializing(true);
        setErrorMsg("");

        // Check if camera is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Your browser or connection does not support camera access.");
        }

        // Request camera permission
        await navigator.mediaDevices.getUserMedia({ video: true });
        
        if (!active) return;
        setHasPermission(true);

        // Enumerate devices
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          const formatted = devices.map(d => ({
            id: d.id,
            label: d.label || `Camera ${devices.indexOf(d) + 1}`
          }));
          if (active) {
            setCameras(formatted);
            // Default to back camera or first device
            const backCam = formatted.find(c => c.label.toLowerCase().includes("back") || c.label.toLowerCase().includes("environment"));
            setSelectedCameraId(backCam ? backCam.id : formatted[0].id);
          }
        } else {
          throw new Error("No camera devices found on this hardware.");
        }
      } catch (err: any) {
        console.error("Camera init error:", err);
        if (active) {
          setHasPermission(false);
          setErrorMsg(err.message || "Failed to initialize camera. Please check permissions.");
        }
      } finally {
        if (active) {
          setIsInitializing(false);
        }
      }
    };

    initScanner();

    return () => {
      active = false;
      stopScanner();
    };
  }, []);

  // Start scanning when camera is selected and permissions granted
  useEffect(() => {
    if (hasPermission && selectedCameraId && !scanSuccess && !isInitializing) {
      startScanner(selectedCameraId);
    }
    return () => {
      stopScanner();
    };
  }, [hasPermission, selectedCameraId, scanSuccess, isInitializing]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const startScanner = async (cameraId: string) => {
    try {
      setIsScanning(false);
      await stopScanner();

      const html5QrCode = new Html5Qrcode(scannerContainerId);
      qrCodeInstanceRef.current = html5QrCode;

      setIsScanning(true);
      await html5QrCode.start(
        cameraId,
        {
          fps: 10,
          qrbox: (width, height) => {
            const minDim = Math.min(width, height);
            const boxSize = Math.floor(minDim * 0.7);
            return { width: boxSize, height: boxSize };
          }
        },
        (decodedText) => {
          handleSuccessfulScan(decodedText);
        },
        (errorMessage) => {
          // Verbose qr code parsing errors are normal while scanning, safe to ignore
        }
      );
    } catch (err: any) {
      console.error("Failed to start QR scanner:", err);
      setErrorMsg(`Failed to start camera feed: ${err.message || err}`);
      setIsScanning(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsInitializing(true);
      const html5QrCode = new Html5Qrcode(scannerContainerId);
      const decodedText = await html5QrCode.scanFile(file, true);
      handleSuccessfulScan(decodedText);
    } catch (err: any) {
      console.error("Failed to scan file:", err);
      setErrorMsg(`Failed to scan image: ${err.message || err}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const stopScanner = async () => {
    if (qrCodeInstanceRef.current && qrCodeInstanceRef.current.isScanning) {
      try {
        await qrCodeInstanceRef.current.stop();
      } catch (err) {
        console.warn("Error stopping scanner:", err);
      }
    }
    qrCodeInstanceRef.current = null;
    setIsScanning(false);
  };

  const handleSuccessfulScan = async (text: string) => {
    setScanSuccess(true);
    await stopScanner();
    onScan(text);
  };

  const switchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
  };

  return (
    <div id="qr-scanner-overlay" className="fixed inset-0 bg-slate-950/90 backdrop-blur-2xl z-50 flex items-center justify-center p-4 sm:p-6 select-none">
      <style>
        {`
          #qr-scanner-viewport video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
            border-radius: 1rem;
          }
          #qr-scanner-viewport {
            overflow: hidden;
          }
        `}
      </style>
      {/* Dynamic ambient lines */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent animate-pulse" />
        <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent animate-pulse" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <QrCode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">Device Lens</h3>
              <p className="text-[10px] text-slate-500 font-mono uppercase">Instant Keypack Recovery</p>
            </div>
          </div>

          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport & Alerts */}
        <div className="relative aspect-square sm:aspect-[4/3] bg-slate-950 flex items-center justify-center overflow-hidden">
          {/* The Actual Scanner Container (Crucial ID) */}
          <div id={scannerContainerId} className="absolute inset-0 w-full h-full object-cover" />

          {/* Sci-fi scanning overlay frame when scanning is active */}
          {isScanning && !scanSuccess && (
            <div className="absolute inset-0 pointer-events-none z-10 flex flex-col justify-between p-6">
              <div className="flex justify-between">
                <div className="w-6 h-6 border-t-2 border-l-2 border-emerald-400 rounded-tl-md" />
                <div className="w-6 h-6 border-t-2 border-r-2 border-emerald-400 rounded-tr-md" />
              </div>
              
              {/* Dynamic Scanning Line */}
              <div className="w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-bounce" />

              <div className="flex justify-between">
                <div className="w-6 h-6 border-b-2 border-l-2 border-emerald-400 rounded-bl-md" />
                <div className="w-6 h-6 border-b-2 border-r-2 border-emerald-400 rounded-br-md" />
              </div>
            </div>
          )}

          {/* Loading or status states */}
          <AnimatePresence mode="wait">
            {isInitializing && (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-4 text-center p-6"
              >
                <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Accessing Optic Lens...</p>
                  <p className="text-[10px] text-slate-500 font-mono">Initializing local media hardware safely.</p>
                </div>
              </motion.div>
            )}

            {hasPermission === false && (
              <motion.div 
                key="no-permission"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-4 text-center p-6"
              >
                <CameraOff className="w-10 h-10 text-red-400" />
                <div className="space-y-1.5 max-w-xs">
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Camera Access Blocked</p>
                  <p className="text-[10px] text-slate-500 font-sans leading-relaxed">
                    Please grant camera permissions to this window to scan printed QR codes or physical screen backups instantly.
                  </p>
                </div>
              </motion.div>
            )}

            {errorMsg && !isInitializing && (
              <motion.div 
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-4 text-center p-6"
              >
                <AlertCircle className="w-10 h-10 text-rose-500" />
                <div className="space-y-1.5 max-w-xs">
                  <p className="text-xs font-bold text-white uppercase tracking-wider">Scanner Failure</p>
                  <p className="text-[10px] text-rose-300 font-mono leading-relaxed bg-rose-950/20 border border-rose-900/30 px-3 py-2 rounded-xl">
                    {errorMsg}
                  </p>
                  <button 
                    onClick={() => startScanner(selectedCameraId)}
                    className="mt-2 text-[10px] bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all flex items-center gap-2 mx-auto"
                  >
                    <RefreshCw className="w-3 h-3" /> Retry
                  </button>
                </div>
              </motion.div>
            )}

            {scanSuccess && (
              <motion.div 
                key="success"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/95 z-20 flex flex-col items-center justify-center space-y-4 text-center p-6"
              >
                <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 animate-bounce">
                  <ShieldCheck className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Payload Scanned!</p>
                  <p className="text-[10px] text-slate-500 font-mono">Verifying signature block offline...</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer info & toggle controls */}
        <div className="p-4 bg-slate-900 border-t border-slate-800/80 flex flex-col gap-3">
          {cameras.length > 1 && (
            <button 
              onClick={switchCamera}
              className="w-full bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 rounded-xl py-2 px-3 text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Switch Lens ({cameras.find(c => c.id === selectedCameraId)?.label || "Active"})
            </button>
          )}
          <input 
            type="file" 
            ref={fileInputRef} 
            accept="image/*" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-slate-950/60 hover:bg-slate-950 border border-slate-800 text-slate-300 rounded-xl py-2 px-3 text-[10px] font-mono uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            Upload QR Image
          </button>

          <div className="flex items-start gap-3 bg-slate-950/40 p-3 rounded-2xl border border-slate-800/60 text-left">
            <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5 animate-pulse" />
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-white uppercase tracking-wider">How to restore?</p>
              <p className="text-[9px] text-slate-500 font-sans leading-relaxed">
                Scan a printed QR code of your <code className="text-indigo-400 font-mono font-bold">.vault</code> file text, or point the lens directly at a backup mnemonic displayed on your secondary offline hardware device.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
