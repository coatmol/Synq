import { Button, Avatar, Spinner } from "@heroui/react";
import { useState, useEffect } from "react";
import { api } from "../api";

interface WelcomeScreenProps {
  onOpenEditor: (path?: string) => void;
}

export function WelcomeScreen({ onOpenEditor }: WelcomeScreenProps) {
  const [showPeers, setShowPeers] = useState(false);
  const [peers, setPeers] = useState<any[]>([]);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [pendingPeer, setPendingPeer] = useState<{ ip: string, port: number, name: string } | null>(null);

  useEffect(() => {
    api.getSettings().then(settings => {
      if (settings && settings.recentFolders) {
        setRecentFolders(settings.recentFolders);
      }
    });
  }, []);

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
      } else {
        // Fallback for web browser testing
        onOpenEditor();
      }
      
      if (pendingPeer) {
        // Queue the connection right after the folder is picked
        await api.connectManualPeer({ ip: pendingPeer.ip, port: pendingPeer.port });
      }
      // Note: We intentionally do not call onOpenEditor() here if in native app!
      // The native backend will pop a blocking folder picker dialog.
      // Once the user selects a folder, the backend sends a "folderOpened" web message.
      // App.tsx intercepts that message and switches the view.
    } catch (e) {
      console.error(e);
      onOpenEditor();
    }
  };

  const handleOpenRecent = async (path: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action: "openRecent", path }));
    } else {
      onOpenEditor();
    }
    
    if (pendingPeer) {
      await api.connectManualPeer({ ip: pendingPeer.ip, port: pendingPeer.port });
    }
    // Similar to handleNewProject, we wait for "folderOpened" message which will trigger reload in native mode
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
            {pendingPeer ? "Sync Destination" : (
              <>Welcome to <span className="font-semibold text-emerald-400">Synq</span></>
            )}
          </h1>
          <p className="text-zinc-500 text-sm">
            {pendingPeer 
              ? `Select a local folder to synchronize with ${pendingPeer.name}.`
              : showPeers 
                ? "Select a remote peer to connect and sync with." 
                : "Get started by opening a local folder or connecting to a remote peer to collaborate in real-time."}
          </p>
        </div>

        {pendingPeer ? (
          <div className="flex flex-col w-full gap-3 mt-4">
            
            {recentFolders.length > 0 && (
              <div className="flex flex-col w-full gap-2 mb-4">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Recent Workspaces</span>
                {recentFolders.map((folder, i) => (
                  <Button 
                    key={i}
                    onPress={() => handleOpenRecent(folder)}
                    variant="ghost"
                    className="w-full justify-start text-left bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 font-mono text-xs py-3 h-auto rounded-lg border border-zinc-800/50 transition-all truncate"
                  >
                    <svg className="w-4 h-4 mr-2 shrink-0 text-emerald-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="truncate">{folder}</span>
                  </Button>
                ))}
              </div>
            )}

            <Button 
              onPress={handleNewProject}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium py-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
            >
              Browse Local Folder
            </Button>

            <Button 
              onPress={() => setPendingPeer(null)}
              variant="ghost"
              className="w-full text-zinc-500 mt-2 hover:bg-zinc-800 border-none"
            >
              Cancel
            </Button>
          </div>
        ) : !showPeers ? (
          <div className="flex flex-col w-full gap-3 mt-4">
            
            {recentFolders.length > 0 && (
              <div className="flex flex-col w-full gap-2 mb-4">
                <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Recent Workspaces</span>
                {recentFolders.map((folder, i) => (
                  <Button 
                    key={i}
                    onPress={() => handleOpenRecent(folder)}
                    variant="ghost"
                    className="w-full justify-start text-left bg-zinc-900/50 hover:bg-zinc-800 text-zinc-300 font-mono text-xs py-3 h-auto rounded-lg border border-zinc-800/50 transition-all truncate"
                  >
                    <svg className="w-4 h-4 mr-2 shrink-0 text-emerald-500/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                    <span className="truncate">{folder}</span>
                  </Button>
                ))}
              </div>
            )}

            <Button 
              onPress={handleNewProject}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium py-6 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.2)] transition-all"
            >
              Browse Local Folder
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
                    onClick={() => setPendingPeer({ ip: peer.ip, port: peer.port, name: peer.name })}
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
      </div>
    </div>
  );
}
