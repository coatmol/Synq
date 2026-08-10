import {Tooltip} from "@heroui/react";
import {useEffect, useState} from "react";
import {api} from "../api";
import {WanTokenModal} from "./WanTokenModal";
import {PlusCircle} from "lucide-react";
import {UserAvatar} from "./UserAvatar";

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
      const lanData = await api.getPeers();
      setWanPeers([...lanData.map((p: any) => ({...p, isWan: false})), ...wanData.map((p: any) => ({
        ...p,
        isWan: true
      }))]);
    };
    fetchPeers();
    const interval = setInterval(fetchPeers, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-2 pr-2">
      <div className="flex items-center -space-x-1.5 overflow-hidden px-2 py-1">
        {[self, ...wanPeers].filter(Boolean).map(peer => (
          <div
            key={peer.id}
            className={`relative inline-block rounded-full ring-2 ring-[#1e1e1e] transition-transform hover:-translate-y-0.5 hover:z-10 cursor-default ${peer.status === 'offline' ? 'opacity-50 grayscale' : ''}`}
          >
            <UserAvatar
              size="sm"
              name={peer.name || peer.id}
              tooltipContent={
                <div className="flex flex-col gap-0.5 p-1 text-center">
                  <span className="text-[12px] font-semibold">{peer.name || peer.id} {peer.isWan ? '(WAN)' : ''}</span>
                  <span
                    className="text-[10px] text-zinc-400 font-mono">{peer.ip ? `${peer.ip}:${peer.port}` : 'Local Client'}</span>
                </div>
              }
            />
            {peer.status === 'online' && (
              <span
                className={`absolute bottom-0 right-0 w-2 h-2 rounded-full ring-2 ring-[#1e1e1e] ${peer.id === 'self' ? 'bg-green-600' : peer.isWan ? 'bg-blue-400' : 'bg-emerald-500'}`}/>
            )}
          </div>
        ))}
      </div>

      {/* Network / Connect Buttons */}
      <div className="flex items-center border-zinc-800/50 pl-2 gap-1">
        <Tooltip delay={0} closeDelay={0}>
          <Tooltip.Trigger>
            <button onClick={() => setIsWanModalOpen(true)}
                    className="flex items-center justify-center rounded-full w-8 h-8 min-w-8 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 transition-all"
                    aria-label="Add WAN Peer">
              <PlusCircle className="w-4 h-4"/>
            </button>
          </Tooltip.Trigger>
          <Tooltip.Content placement="bottom" showArrow={true}
                           className="dark bg-zinc-800 text-zinc-100 text-[11px] px-2 py-1 rounded shadow-xl">
            Connect via WAN (WebRTC)
          </Tooltip.Content>
        </Tooltip>
      </div>

      <WanTokenModal isOpen={isWanModalOpen} onClose={() => setIsWanModalOpen(false)}/>
    </div>
  );
}
