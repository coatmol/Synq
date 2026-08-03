import { Avatar, Tooltip } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "../api";

export function LanPeersPanel() {
  const [peers, setPeers] = useState<any[]>([]);

  useEffect(() => {
    const fetchPeers = async () => {
      const data = await api.getPeers();
      setPeers(data);
    };
    fetchPeers();
    const interval = setInterval(fetchPeers, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 pr-2">
      <div className="flex items-center -space-x-1.5 overflow-hidden px-2 py-1">
        {peers.length === 0 && <span className="text-[10px] text-zinc-500 mr-2">No peers found</span>}
        {peers.map(peer => (
          <Tooltip key={peer.id} delay={0} closeDelay={0}>
            <Tooltip.Trigger>
              <div 
                onClick={() => api.connectPeer(peer.ip, peer.port).then(ok => { if(ok) alert("Connected successfully!"); })}
                className={`relative inline-block rounded-full ring-2 ring-zinc-950 transition-transform hover:-translate-y-0.5 hover:z-10 cursor-pointer ${peer.status === 'offline' ? 'opacity-50 grayscale' : ''}`}
              >
                <Avatar size="sm" color={peer.status === 'online' ? 'success' : 'default'} className="bg-zinc-800 text-zinc-300">
                  <Avatar.Fallback>{peer.init}</Avatar.Fallback>
                </Avatar>
                {peer.status === 'online' && (
                  <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-zinc-950" />
                )}
              </div>
            </Tooltip.Trigger>
            <Tooltip.Content placement="bottom" className="bg-zinc-900 border border-zinc-800 text-zinc-200">
              <div className="flex flex-col gap-0.5 p-1">
                <span className="text-sm font-semibold">{peer.name}</span>
                <span className="text-[10px] text-zinc-500 font-mono">{peer.ip}:{peer.port}</span>
              </div>
            </Tooltip.Content>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
