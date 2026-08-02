import { Button } from "@heroui/react";
import * as React from "react";

interface WelcomeScreenProps {
  onOpenEditor: (path?: string) => void;
}

export function WelcomeScreen({ onOpenEditor }: WelcomeScreenProps) {
  const handleNewProject = async () => {
    try {
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        onOpenEditor(dirHandle.name);
      } else {
        onOpenEditor();
      }
    } catch (e) {
      // User cancelled picker
    }
  };

  const handleConnect = () => {
    onOpenEditor();
  };

  return (
    <div 
      className="w-full h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 relative overflow-hidden"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div 
        className="max-w-md w-full flex flex-col items-center gap-8 z-10"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-light tracking-tight text-white">
            Welcome to <span className="font-semibold text-emerald-400">Synq</span>
          </h1>
          <p className="text-zinc-500 text-sm">
            Get started by opening a local folder or connecting to a remote peer to collaborate in real-time.
          </p>
        </div>

        <div className="flex flex-col w-full gap-3 mt-4">
          <Button 
            onPress={handleNewProject}
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium py-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
          >
            Open Folder
          </Button>
          
          <Button 
            onPress={handleConnect}
            variant="ghost"
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium py-6 rounded-xl border border-zinc-800/50 transition-all"
          >
            Connect to Peer
          </Button>
        </div>

        <div className="mt-8 flex items-center justify-center gap-2 text-xs text-zinc-600">
          <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded font-mono text-[10px]">Ctrl</kbd>
          <span>+</span>
          <kbd className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded font-mono text-[10px]">O</kbd>
          <span className="ml-2">to open a file</span>
        </div>
      </div>
    </div>
  );
}
