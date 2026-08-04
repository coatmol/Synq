import { Modal, Button, Avatar } from "@heroui/react";
import { api } from "../api";
import { toast } from "sonner";

export function LanConnectModal({ isOpen, onClose, peers }: { isOpen: boolean, onClose: () => void, peers: any[] }) {
  const handleConnect = async (peer: any) => {
    try {
      const success = await api.connectManualPeer({ ip: peer.ip, port: peer.port, password: peer.password });
      if (success) {
        toast.success(`Connected to ${peer.name}`);
        onClose();
      } else {
        toast.error(`Failed to connect to ${peer.name}`);
      }
    } catch (e) {
      toast.error("Connection error");
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop className="bg-black/60 backdrop-blur-sm">
        <Modal.Container>
          <Modal.Dialog className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden min-w-[400px]">
            <Modal.CloseTrigger className="text-zinc-400 hover:text-white transition-colors" />
            <Modal.Header className="border-b border-zinc-800 bg-zinc-900/50 p-4">
              <Modal.Heading className="text-lg font-bold text-zinc-100">📡 Discovered LAN Peers</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
              {peers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-zinc-500">
                  <p>No other Synq instances discovered on this network.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {peers.map(peer => (
                    <div 
                      key={peer.id}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border border-zinc-800 bg-zinc-950/50 hover:bg-zinc-800 hover:border-emerald-500/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar size="sm" className="bg-zinc-800 text-zinc-300">
                          <Avatar.Fallback>{peer.init}</Avatar.Fallback>
                        </Avatar>
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-sm font-semibold text-zinc-200 group-hover:text-emerald-400 transition-colors">{peer.name}</span>
                          <span className="text-[10px] text-zinc-500 font-mono">{peer.ip}:{peer.port}</span>
                        </div>
                      </div>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-sm" onPress={() => handleConnect(peer)}>
                        Connect
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="border-t border-zinc-800 p-4 bg-zinc-900/50 flex justify-end">
              <Button variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-none" onPress={onClose}>
                Close
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
