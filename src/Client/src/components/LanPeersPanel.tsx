import { Avatar, Tooltip, Button } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { WanTokenModal } from "./WanTokenModal";
import { PlusCircle } from "lucide-react";

export function LanPeersPanel() {
  const [wanPeers, setWanPeers] = useState<any[]>([]);
  const [self, setSelf] = useState<any>(null);
  const [isWanModalOpen, setIsWanModalOpen] = useState(false);

  useEffect(() => {
    const fetchSelf = async () => {
      const settings = await api.getSettings();
      if (settings) {
        setSelf({
          id: 'self',
          name: settings.username + ' (YOU)',
          ip: 'localhost',
          port: 'local',
          status: 'online',
          init: settings.username.substring(0, 2).toUpperCase()
        });
      }
    };
    fetchSelf();

    const fetchPeers = async () => {
      const wanData = await api.getWanPeers();
      setWanPeers(wanData);
    };
    fetchPeers();
    const interval = setInterval(fetchPeers, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 pr-2">
      <div className="flex items-center -space-x-1.5 overflow-hidden px-2 py-1">
        {[self, ...wanPeers.map(p => ({...p, isWan: true}))].filter(Boolean).map(peer => (
          <Tooltip key={peer.id} delay={0} closeDelay={0}>
            <Tooltip.Trigger>
              <div 
                className={`relative inline-block rounded-full ring-2 ring-[#1e1e1e] transition-transform hover:-translate-y-0.5 hover:z-10 cursor-default ${peer.status === 'offline' ? 'opacity-50 grayscale' : ''}`}
              >
                <Avatar size="sm" color={peer.id === 'self' ? 'accent' : peer.isWan ? 'default' : peer.status === 'online' ? 'success' : 'default'} className={peer.id === 'self' ? 'bg-indigo-600 text-white' : peer.isWan ? 'bg-blue-600 text-white' : 'bg-zinc-800 text-zinc-300'}>
                  <Avatar.Fallback>{peer.init || peer.id.substring(0,2).toUpperCase()}</Avatar.Fallback>
                </Avatar>
                {peer.status === 'online' && (
                  <span className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-2 ring-[#1e1e1e] ${peer.id === 'self' ? 'bg-indigo-400' : peer.isWan ? 'bg-blue-400' : 'bg-emerald-500'}`} />
                )}
              </div>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom" className="bg-zinc-900 border border-zinc-800 text-zinc-200">
              <div className="flex flex-col gap-0.5 p-1">
                <span className="text-sm font-semibold">{peer.name || peer.id} {peer.isWan ? '(WAN)' : ''}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{peer.ip ? `${peer.ip}:${peer.port}` : 'Local Client'}</span>
              </div>
            </Tooltip.Content>
          </Tooltip>
        ))}
      </div>
      
      {/* Network / Connect Buttons */}
      <div className="flex items-center border-zinc-800/50 pl-2 gap-1">
        <Tooltip delay={0} closeDelay={0}>
          <Tooltip.Trigger>
            <Button isIconOnly size="sm" variant="secondary" onPress={() => setIsWanModalOpen(true)} className="rounded-full w-8 h-8 min-w-8 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 transition-all" aria-label="Add WAN Peer">
              <PlusCircle className="w-4 h-4" />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom" className="bg-zinc-900 border border-zinc-800 text-zinc-200 p-1 px-2 text-xs">
            Connect via WAN (WebRTC)
          </Tooltip.Content>
        </Tooltip>
      </div>

      <WanTokenModal isOpen={isWanModalOpen} onClose={() => setIsWanModalOpen(false)} />
    </div>
  );
}
