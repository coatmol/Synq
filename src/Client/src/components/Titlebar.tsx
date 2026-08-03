import * as React from "react";
import { Minus, Square, X } from "lucide-react";

export function Titlebar() {
  const sendMessage = (action: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action }));
    }
  };

  return (
    <div 
      className="h-8 shrink-0 bg-zinc-950 flex items-center justify-between select-none z-[100] w-full"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="pl-4 text-xs font-semibold text-zinc-400 tracking-wider flex items-center gap-2">
        <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        SYNQ
      </div>
      
      <div className="flex h-full" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <button 
          onClick={() => sendMessage("minimize")}
          className="h-full px-4 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors focus:outline-none"
        >
          <Minus size={14} />
        </button>
        <button 
          onClick={() => sendMessage("maximize")}
          className="h-full px-4 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors focus:outline-none"
        >
          <Square size={12} />
        </button>
        <button 
          onClick={() => sendMessage("close")}
          className="h-full px-4 hover:bg-red-500 hover:text-white text-zinc-400 transition-colors focus:outline-none"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
