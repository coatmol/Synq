import { Button, Avatar, Spinner } from "@heroui/react";
import { useState, useEffect } from "react";
import { api } from "../api";

interface WelcomeScreenProps {
  onOpenEditor: (path?: string) => void;
}

export function WelcomeScreen({ onOpenEditor }: WelcomeScreenProps) {
  const [showPeers, setShowPeers] = useState(false);
  const [peers, setPeers] = useState<any[]>([]);

  useEffect(() => {
    if (!showPeers) return;
    
    const fetchPeers = async () => {
      const data = await api.getPeers();
      setPeers(data);
    };
    
    fetchPeers();
    const interval = setInterval(fetchPeers, 3000);
    return () => clearInterval(interval);
  }, [showPeers]);

  const handleNewProject = async () => {
    try {
      if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
        (window as any).external.sendMessage(JSON.stringify({ action: "openFolder" }));
      }
      onOpenEditor();
    } catch (e) {
      console.error(e);
      onOpenEditor();
    }
  };

  const handleConnectToPeer = async (ip: string, port: number) => {
    try {
      const success = await api.connectPeer(ip, port);
      if (success) {
        onOpenEditor();
      } else {
        alert("Failed to connect to peer");
      }
    } catch (e) {
      console.error("Connection failed", e);
    }
  };

  return (
    <div 
      className="w-full h-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-300 relative overflow-hidden"
    >
      <div 
        className="max-w-md w-full flex flex-col items-center gap-8 z-10"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-light tracking-tight text-white">
            Welcome to <span className="font-semibold text-emerald-400">Synq</span>
          </h1>
          <p className="text-zinc-500 text-sm">
            {showPeers 
              ? "Select a remote peer to connect and sync with." 
              : "Get started by opening a local folder or connecting to a remote peer to collaborate in real-time."}
          </p>
        </div>

        {!showPeers ? (
          <div className="flex flex-col w-full gap-3 mt-4">
            <Button 
              onPress={handleNewProject}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium py-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
            >
              Open Folder
            </Button>
            
            <Button 
              onPress={() => setShowPeers(true)}
              variant="ghost"
              className="w-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-medium py-6 rounded-xl border border-zinc-800/50 transition-all"
            >
              Connect to Peer
            </Button>
          </div>
        ) : (
          <div className="flex flex-col w-full gap-3 mt-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4 min-h-[250px]">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Local Network</span>
              {peers.length === 0 && <Spinner size="sm" color="success" />}
            </div>
            
            <div className="flex-1 overflow-y-auto flex flex-col gap-2 custom-scrollbar">
              {peers.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm italic">
                  Searching for peers...
                </div>
              ) : (
                peers.map(peer => (
                  <div 
                    key={peer.id}
                    onClick={() => handleConnectToPeer(peer.ip, peer.port)}
                    className={`flex items-center gap-4 p-3 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 hover:border-emerald-500/50 transition-all cursor-pointer group ${peer.status === 'offline' ? 'opacity-50 grayscale' : ''}`}
                  >
                    <div className="relative">
                      <Avatar size="sm" color={peer.status === 'online' ? 'success' : 'default'} className="bg-zinc-800 text-zinc-300">
                        <Avatar.Fallback>{peer.init}</Avatar.Fallback>
                      </Avatar>
                      {peer.status === 'online' && (
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-zinc-900" />
                      )}
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="text-sm font-semibold text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">{peer.name}</span>
                      <span className="text-[10px] text-zinc-500 font-mono truncate">{peer.ip}:{peer.port}</span>
                    </div>
                    <svg className="w-5 h-5 text-zinc-600 group-hover:text-emerald-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                ))
              )}
            </div>
            
            <Button 
              onPress={() => setShowPeers(false)}
              variant="ghost"
              className="w-full text-zinc-500 mt-2 hover:bg-zinc-800 border-none"
            >
              Cancel
            </Button>
          </div>
        )}

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
