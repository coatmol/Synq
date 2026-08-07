import { Button, Avatar, Spinner } from "@heroui/react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { api } from "../api";
import { ConnectModal } from "./ConnectModal";
import { ArrowRight, MoreVertical, Minus, Square, X } from "lucide-react";
import { Dropdown } from "@heroui/react";

interface WelcomeScreenProps {
  onOpenEditor: (path?: string) => void;
}

export function WelcomeScreen({ onOpenEditor }: WelcomeScreenProps) {
  const [showPeers, setShowPeers] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [peers, setPeers] = useState<any[]>([]);
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [pendingPeer, setPendingPeer] = useState<{ ip: string, port: number, name: string, password?: string } | null>(null);
  const [connectModalInitialPeer, setConnectModalInitialPeer] = useState<any>(null);
  const [appVersion, setAppVersion] = useState("1.0.0");

  const verifyAndSetPendingPeer = async (peer: { ip: string, port: number, name: string, password?: string }) => {
    try {
      const success = await api.connectManualPeer({ ip: peer.ip, port: peer.port, password: peer.password });
      if (success) {
        setPendingPeer(peer);
      } else {
        toast.error("Failed to connect to peer", {
            description: "Please check the password or ensure the peer is online."
        });
        setConnectModalInitialPeer(peer);
        setShowConnectModal(true);
      }
    } catch (e) {
      console.error(e);
      toast.error("An error occurred while connecting.");
    }
  };

  useEffect(() => {
    api.getSettings().then(settings => {
      if (settings && settings.recentFolders) {
        setRecentFolders(settings.recentFolders);
      }
    });
    api.getVersion().then(v => {
      if (v) setAppVersion(v);
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

  const handleNewProject = async (peerOverride?: { ip: string, port: number, name: string, password?: string }) => {
    try {
      const targetPeer = peerOverride || pendingPeer;
      if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
        (window as any).external.sendMessage(JSON.stringify({ action: "openFolder", peer: targetPeer }));
      } else {
        if (targetPeer) {
            await api.connectManualPeer({ ip: targetPeer.ip, port: targetPeer.port, password: targetPeer.password });
        }
        // Fallback for web browser testing
        onOpenEditor();
      }
    } catch (e) {
      console.error(e);
      onOpenEditor();
    }
  };

  const handleOpenRecent = async (path: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action: "openRecent", path, peer: pendingPeer }));
    } else {
      onOpenEditor();
      if (pendingPeer) {
        await api.connectManualPeer({ ip: pendingPeer.ip, port: pendingPeer.port, password: pendingPeer.password });
      }
    }
  };

  const handleRemoveRecent = (path: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action: "removeRecent", path }));
      setRecentFolders(recentFolders.filter(f => f !== path));
    }
  };

  return (
    <div className="flex w-full h-screen bg-[#18181b] text-zinc-300 overflow-hidden font-sans">
      
      {/* Left Sidebar - Recent Vaults */}
      <div className="w-64 bg-[#18181b] border-r border-zinc-800/60 flex flex-col pt-2 select-none" style={{ WebkitAppRegion: "drag" } as any}>
        <div style={{ WebkitAppRegion: "no-drag" } as any} className="flex-1 flex flex-col">
          <div className="px-4 py-2 text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 mt-2">
            Recent Notebooks
          </div>
        {recentFolders.length > 0 ? (
          recentFolders.map((folder, i) => {
            const folderName = folder.split(/[\\/]/).pop() || folder;
            return (
              <div 
                key={i} 
                onClick={() => handleOpenRecent(folder)}
                className="group flex items-start justify-between px-4 py-3 cursor-pointer hover:bg-zinc-800/40 transition-colors mx-2 rounded-md"
              >
                <div className="flex flex-col overflow-hidden pr-2">
                  <span className="text-sm font-medium text-zinc-200 truncate">{folderName}</span>
                  <span className="text-[11px] text-zinc-500 truncate mt-1">{folder}</span>
                </div>
                <Dropdown>
                  <Dropdown.Trigger>
                    <button onClick={(e) => e.stopPropagation()} className="text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-zinc-300 transition-all p-1 rounded hover:bg-zinc-700/50 mt-0.5">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </Dropdown.Trigger>
                  <Dropdown.Popover className="dark bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl">
                    <Dropdown.Menu aria-label="Recent Options" className="p-1">
                      <Dropdown.Item key="remove" onPress={() => handleRemoveRecent(folder)} className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 outline-none cursor-pointer">
                        Remove from Recents
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown.Popover>
                </Dropdown>
              </div>
            )
          })
        ) : (
          <div className="px-6 py-4 text-xs text-zinc-500">No recent notebooks</div>
        )}
        </div>
      </div>

      {/* Right Main Area */}
      <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center relative" style={{ WebkitAppRegion: "drag" } as any}>
        
        {/* Window Controls for Chromeless */}
        <div className="absolute top-0 right-0 flex items-center h-10.5" style={{ WebkitAppRegion: "no-drag" } as any}>
          <button onClick={() => { if (typeof window !== 'undefined' && (window as any).external) (window as any).external.sendMessage(JSON.stringify({ action: "minimize" })); }} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => { if (typeof window !== 'undefined' && (window as any).external) (window as any).external.sendMessage(JSON.stringify({ action: "maximize" })); }} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Square className="w-3 h-3" />
          </button>
          <button onClick={() => { if (typeof window !== 'undefined' && (window as any).external) (window as any).external.sendMessage(JSON.stringify({ action: "close" })); }} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-red-500 hover:text-white transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-col items-center max-w-md w-full" style={{ WebkitAppRegion: "no-drag" } as any}>
          
          {/* Logo & Title */}
          <div className="flex flex-col items-center mb-10 select-none">
            <div className="w-24 h-24 mb-4 relative flex items-center justify-center">
              <img src="/Synq3.png" alt="Synq Logo" className="w-20 h-20 object-contain drop-shadow-md" />
            </div>
            <h1 className="text-3xl font-bold text-zinc-100 tracking-tight">Synq</h1>
            <p className="text-zinc-400 mt-2 text-sm font-medium">Version {appVersion}</p>
          </div>

          {/* Options List */}
          <div className="w-full flex flex-col bg-[#27272a] rounded-xl border border-zinc-700/80 p-1.5 shadow-2xl">
            
            {!showPeers && !pendingPeer ? (
              <>
                <div className="flex items-center justify-between p-4 border-b border-zinc-700/80">
                  <div className="flex flex-col pr-4">
                    <span className="text-[14px] font-semibold text-zinc-100">Open folder as notebook</span>
                    <span className="text-xs text-zinc-400 mt-1">Choose an existing folder of Markdown files.</span>
                  </div>
                  <Button 
                    onPress={() => handleNewProject()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-6 rounded-md shadow-sm h-8"
                  >
                    Open
                  </Button>
                </div>

                <div className="flex items-center justify-between p-4 border-zinc-700/80">
                  <div className="flex flex-col pr-4">
                    <span className="text-[14px] font-semibold text-zinc-100">Connect to Synq Peer</span>
                    <span className="text-xs text-zinc-400 mt-1">Set up a synced notebook with a remote peer.</span>
                  </div>
                  <Button 
                    onPress={() => setShowPeers(true)}
                    className="bg-zinc-600 hover:bg-zinc-500 text-zinc-100 font-medium text-xs px-6 rounded-md shadow-sm h-8"
                  >
                    Connect
                  </Button>
                </div>
              </>
            ) : pendingPeer ? (
              <div className="flex flex-col w-full p-4">
                <span className="text-[13px] font-medium text-zinc-200 mb-2">Select a local folder to sync with {pendingPeer.name}</span>
                <Button 
                  onPress={() => handleNewProject()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-md shadow-sm h-10 w-full mb-3"
                >
                  Browse Local Folder
                </Button>
                <Button 
                  onPress={() => setPendingPeer(null)}
                  className="bg-zinc-700/50 hover:bg-zinc-700 text-zinc-200 font-medium text-xs rounded-md shadow-sm h-10 w-full"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="flex flex-col w-full p-2 min-h-[250px]">
                <div className="flex justify-between items-center px-2 py-2 border-b border-zinc-800/50 mb-2">
                  <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Local Network Peers</span>
                  {peers.length === 0 && <Spinner size="sm" color="current" />}
                </div>
                
                <div className="flex-1 overflow-y-auto flex flex-col gap-1 custom-scrollbar max-h-48 px-1">
                  {peers.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-zinc-600 text-xs italic py-4">
                      Searching for peers...
                    </div>
                  ) : (
                    peers.map(peer => (
                      <div 
                        key={peer.id}
                        onClick={() => verifyAndSetPendingPeer({ ip: peer.ip, port: peer.port, name: peer.name })}
                        className={`flex items-center gap-3 p-2 rounded-md hover:bg-zinc-800 transition-colors cursor-pointer group ${peer.status === 'offline' ? 'opacity-50 grayscale' : ''}`}
                      >
                        <div className="relative">
                          <Avatar size="sm" className="bg-zinc-800 text-zinc-300 w-8 h-8 text-xs">
                            <Avatar.Fallback>{peer.init}</Avatar.Fallback>
                          </Avatar>
                          {peer.status === 'online' && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#1e1e1e]" />
                          )}
                        </div>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-[13px] font-medium text-zinc-200 truncate group-hover:text-emerald-400 transition-colors">{peer.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono truncate">{peer.ip}:{peer.port}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors mr-2" />
                      </div>
                    ))
                  )}
                </div>
                
                <div className="flex gap-2 mt-2 pt-2 border-t border-zinc-800/50 px-1">
                  <Button 
                    onPress={() => {
                      setConnectModalInitialPeer(null);
                      setShowConnectModal(true);
                    }}
                    className="flex-1 bg-zinc-700/50 hover:bg-zinc-700 text-zinc-200 font-medium text-xs rounded-md shadow-sm h-8"
                  >
                    Manual IP
                  </Button>
                  <Button 
                    onPress={() => setShowPeers(false)}
                    className="flex-1 bg-transparent hover:bg-zinc-800 text-zinc-400 font-medium text-xs rounded-md h-8 border border-transparent hover:border-zinc-700"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
          
        </div>
      </div>
      
      <ConnectModal 
        isOpen={showConnectModal} 
        onClose={() => setShowConnectModal(false)}
        initialPeer={connectModalInitialPeer}
        onPendingConnect={(peer) => {
          verifyAndSetPendingPeer(peer);
          setShowConnectModal(false);
        }}
      />
    </div>
  );
}
