import React, { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";

export function QRColdStorage({ data, title, onClose }: { data: string; title: string; onClose: () => void }) {
  const qrRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    try {
      const svgNode = qrRef.current?.querySelector('svg');
      const svgOuterHTML = svgNode ? svgNode.outerHTML : '';

      // 1. Try to open a new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Print QR Code</title>
              <style>
                body { font-family: sans-serif; text-align: center; margin-top: 40px; }
                .qr-container { display: inline-block; padding: 20px; border: 2px solid black; border-radius: 10px; margin-top: 20px; }
                p { font-size: 12px; color: #555; margin-top: 20px; }
              </style>
            </head>
            <body>
              <h2>${title}</h2>
              <div class="qr-container">
                ${svgOuterHTML}
              </div>
              <p>High-density QR generated for physical etching.<br/>Store securely offline.</p>
              <script>
                setTimeout(() => { window.print(); window.close(); }, 500);
              </script>
            </body>
          </html>
        `);
        printWindow.document.close();
      } else {
        // 2. Fallback: Download SVG if popup is blocked
        downloadSVG(svgOuterHTML);
      }
    } catch (e) {
      console.error("Printing failed:", e);
      // Fallback
      const svgNode = qrRef.current?.querySelector('svg');
      if (svgNode) downloadSVG(svgNode.outerHTML);
    }
  };

  const downloadSVG = (svgString: string) => {
    try {
      const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vault-seed-${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("SVG Download failed:", e);
      window.print(); // Last resort
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl flex flex-col items-center gap-6 print:bg-white print:p-0 w-full max-w-lg shadow-2xl">
      <h3 className="text-xl font-black text-black uppercase tracking-widest">{title}</h3>
      <div ref={qrRef} className="p-4 bg-white border border-black rounded-xl">
        <QRCodeSVG 
          value={data}
          size={200}
          level="H" // High error correction for etching
          includeMargin={true}
        />
      </div>

      <p className="text-xs text-black/60 text-center max-w-xs font-mono print:hidden">
        High-density QR generated for physical etching. Store securely offline.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 print:hidden">
        <button 
          type="button"
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 bg-black text-white px-6 py-3 rounded-full font-black uppercase text-sm hover:bg-black/80 transition-all cursor-pointer"
        >
          <Printer className="w-4 h-4" />
          Print / Save SVG
        </button>
        <button 
          type="button"
          onClick={onClose}
          className="flex items-center justify-center gap-2 bg-slate-200 text-black px-6 py-3 rounded-full font-black uppercase text-sm hover:bg-slate-300 transition-all cursor-pointer"
        >
          Exit
        </button>
      </div>
    </div>
  );
}
