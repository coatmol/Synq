import { Modal, Button, Spinner, Input } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "../api";
import { toast } from "sonner";
import { Check } from "lucide-react";

export function WanTokenModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [step, setStep] = useState<"preflight" | "generate" | "wait" | "connected">("preflight");
  const [natInfo, setNatInfo] = useState<any>(null);
  const [tokenA, setTokenA] = useState("");
  const [tokenB, setTokenB] = useState("");
  const [pendingId, setPendingId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep("preflight");
      setNatInfo(null);
      setTokenA("");
      setTokenB("");
      setPendingId("");
      
      const checkStun = async () => {
        try {
          const status = await api.getStunStatus();
          setNatInfo(status);
        } catch (e) {
          console.error(e);
        }
      };
      checkStun();
    }
  }, [isOpen]);

  const generateOffer = async () => {
    setLoading(true);
    try {
      const res = await api.createWanOffer();
      setTokenA(res.token);
      setPendingId(res.pendingId);
      
      navigator.clipboard.writeText(res.token);
      toast.success("Token copied to clipboard!");
      setStep("wait");
    } catch (e) {
      toast.error("Failed to generate token");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    try {
      if (step === "preflight") {
        // Guest path
        const res = await api.acceptWanOffer(tokenB);
        navigator.clipboard.writeText(res.token);
        toast.success("Answer token copied! Send it back to the host.");
        onClose();
      } else if (step === "wait") {
        // Host path
        await api.completeWanHandshake(tokenB, pendingId); 
        toast.success("WAN connection established!");
        setStep("connected");
        setTimeout(onClose, 1500);
      }
    } catch (e) {
      toast.error("Handshake failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop className="bg-black/60 backdrop-blur-sm">
        <Modal.Container>
          <Modal.Dialog className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden min-w-[400px]">
            <Modal.CloseTrigger className="text-zinc-400 hover:text-white transition-colors" />
            <Modal.Header className="border-b border-zinc-800 bg-zinc-900/50 p-4">
              <Modal.Heading className="text-lg font-bold text-zinc-100">🌐 WAN Peer Connection</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="p-6">
              {!natInfo ? (
                <div className="flex justify-center p-4"><Spinner /></div>
              ) : (
                <div className="flex flex-col gap-5">
                  <div className="bg-zinc-950 p-4 rounded-lg text-sm border border-zinc-800">
                    <p className="font-semibold mb-2 text-zinc-300">Network Status:</p>
                    <p className="text-zinc-400 mb-1">NAT Type: <span className="text-zinc-200">{natInfo.natType === "Symmetric" ? "⚠️ Symmetric" : `✅ ${natInfo.natType}`}</span></p>
                    <p className="text-zinc-400 mb-1">STUN Servers: <span className="text-zinc-200">{natInfo.servers?.filter((s: any) => s.reachable).length || 0}/{natInfo.servers?.length || 0} reachable</span></p>
                    <p className="text-zinc-400">Hole-punching: <span className="text-zinc-200">{natInfo.canHolePunch ? "Supported" : "NOT supported"}</span></p>
                    {natInfo.natType === "Symmetric" && (
                      <p className="text-amber-500 text-xs mt-2 bg-amber-500/10 p-2 rounded">You may need port-forwarding to connect.</p>
                    )}
                  </div>

                  {step === "preflight" && (
                    <div className="flex flex-col gap-4">
                      <p className="text-sm text-zinc-400">To connect, either generate an invite token, or paste an invite you received.</p>
                      <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium" onPress={generateOffer} isDisabled={loading}>
                        {loading ? "Generating..." : "Generate Invite Token"}
                      </Button>
                      <div className="flex items-center gap-3 my-1">
                        <hr className="flex-1 border-zinc-800" />
                        <span className="text-xs font-semibold text-zinc-600 tracking-wider">OR</span>
                        <hr className="flex-1 border-zinc-800" />
                      </div>
                      <Input 
                        placeholder="Paste invite token here..." 
                        value={tokenB}
                        onChange={(e) => setTokenB(e.target.value)}
                        className="bg-zinc-950 border-zinc-800 focus:border-emerald-500"
                      />
                      <Button 
                        variant="secondary"
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-none"
                        isDisabled={!tokenB || loading} 
                        onPress={handleConnect}
                      >
                        {loading ? "Accepting..." : "Accept Invite"}
                      </Button>
                    </div>
                  )}

                  {step === "wait" && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2">
                        <p className="text-sm font-medium text-zinc-300">Step 1: Send this token to your peer</p>
                        <div className="flex gap-2">
                          <Input readOnly value={tokenA} className="bg-zinc-950 border-zinc-800 font-mono text-xs" />
                          <Button onPress={() => navigator.clipboard.writeText(tokenA)} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-none shrink-0 px-4">Copy</Button>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2 mt-2">
                        <p className="text-sm font-medium text-zinc-300">Step 2: Paste their response token below</p>
                        <Input 
                          placeholder="Paste response token here..." 
                          value={tokenB}
                          onChange={(e) => setTokenB(e.target.value)}
                          className="bg-zinc-950 border-zinc-800 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {step === "connected" && (
                    <div className="flex justify-center p-6 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                      <p className="text-emerald-400 font-semibold flex items-center gap-2">
                        <Check className="w-5 h-5" />
                        Connection Established!
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Modal.Body>
            <Modal.Footer className="border-t border-zinc-800 p-4 bg-zinc-900/50 flex justify-end gap-3">
              <Button variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-none" onPress={onClose}>
                {step === "connected" ? "Close" : "Cancel"}
              </Button>
              {step === "wait" && (
                <Button className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-[0_0_15px_rgba(16,185,129,0.3)] px-6" isDisabled={!tokenB || loading} onPress={handleConnect}>
                  {loading ? "Connecting..." : "Connect"}
                </Button>
              )}
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
