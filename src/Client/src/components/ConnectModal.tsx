import {Modal, Button, TextField, Label, Input, Description} from "@heroui/react";
import {toast} from "sonner";
import {useState} from "react";
import {api} from "../api";

import {useEffect} from "react";

export function ConnectModal({isOpen: externalIsOpen, onClose, onPendingConnect, initialPeer}: {
  isOpen?: boolean,
  onClose?: () => void,
  onPendingConnect?: (peer: any) => void,
  initialPeer?: any
} = {}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const setIsOpen = (val: boolean) => {
    if (externalIsOpen === undefined) setInternalIsOpen(val);
    if (!val && onClose) onClose();
  };
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("5000");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (initialPeer) {
      setIp(initialPeer.ip);
      setPort(initialPeer.port.toString());
      setPassword(initialPeer.password || "");
    }
  }, [initialPeer]);

  const handleConnect = async () => {
    if (onPendingConnect) {
      onPendingConnect({ip, port: parseInt(port, 10), name: "Manual IP", password: password});
      setIsOpen(false);
      return;
    }
    const success = await api.connectManualPeer({ip, port: parseInt(port, 10), password: password});
    if (success) {
      toast.success("Connected", {
        description: `Successfully connected to peer at ${ip}:${port}`
      });
      setIsOpen(false);
    } else {
      toast.error("Connection Failed", {
        description: `Failed to connect to peer at ${ip}:${port}`
      });
    }
  };

  return (
    <>
      {externalIsOpen === undefined && (
        <Button onPress={() => setIsOpen(true)} variant="secondary"
                className="text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 transition-all px-3 h-7 rounded-md shadow-sm"
                size="sm">
          Connect via IP
        </Button>
      )}
      <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
        <Modal.Backdrop className="bg-black/60 backdrop-blur-sm">
          <Modal.Container>
            <Modal.Dialog className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden">
              <Modal.CloseTrigger className="text-zinc-400 hover:text-white transition-colors"/>
              <Modal.Header className="border-b border-zinc-800 bg-zinc-900/50 p-4">
                <Modal.Heading className="text-lg font-semibold text-zinc-100">Connect to Peer</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-5 p-6 bg-zinc-900">
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Enter the IP address and port of the peer you want to connect to manually if mDNS discovery failed.
                </p>

                <TextField>
                  <Label className="text-zinc-300 font-medium mb-1">IP Address</Label>
                  <Input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.x"
                         className="bg-zinc-950 border-zinc-800 focus:border-emerald-500"/>
                </TextField>

                <TextField>
                  <Label className="text-zinc-300 font-medium mb-1">Port</Label>
                  <Input value={port} onChange={(e) => setPort(e.target.value)} placeholder="5000"
                         className="bg-zinc-950 border-zinc-800 focus:border-emerald-500"/>
                  <Description className="text-xs text-zinc-500 mt-1">Default is 5000 for Synq clients.</Description>
                </TextField>

                <TextField>
                  <Label className="text-zinc-300 font-medium mb-1">Password (Optional)</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder=""
                         className="bg-zinc-950 border-zinc-800 focus:border-emerald-500"/>
                </TextField>
              </Modal.Body>
              <Modal.Footer className="border-t border-zinc-800 p-4 bg-zinc-900/50 flex justify-end gap-3">
                <Modal.CloseTrigger>
                  <Button onPress={() => setIsOpen(false)} variant="secondary"
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-none">Cancel</Button>
                </Modal.CloseTrigger>
                <Button onPress={handleConnect}
                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-[0_0_15px_rgba(16,185,129,0.3)]">Connect</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
