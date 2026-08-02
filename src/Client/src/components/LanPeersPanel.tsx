import { Avatar, Tooltip } from "@heroui/react";
import { ConnectModal } from "./ConnectModal";

export function LanPeersPanel() {
  const peers = [
    { id: 1, name: "You", ip: "192.168.1.14", status: "online", init: "You" },
    { id: 2, name: "TestUser1", ip: "192.168.1.55", status: "online", init: "TU" },
    { id: 3, name: "TestUser2", ip: "192.168.1.102", status: "offline", init: "TU" }
  ];

  return (
    <div className="flex items-center gap-2 pr-2">
      <div className="flex items-center -space-x-1.5 overflow-hidden px-2 py-1">
        {peers.map(peer => (
          <Tooltip key={peer.id} delay={0} closeDelay={0}>
            <Tooltip.Trigger>
              <div className={`relative inline-block rounded-full ring-2 ring-zinc-950 transition-transform hover:-translate-y-0.5 hover:z-10 cursor-pointer ${peer.status === 'offline' ? 'opacity-50 grayscale' : ''}`}>
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
                <span className="text-[10px] text-zinc-500 font-mono">{peer.ip}</span>
              </div>
            </Tooltip.Content>
          </Tooltip>
        ))}
      </div>
      
      <div className="flex items-center">
        <ConnectModal />
      </div>
    </div>
  );
}
