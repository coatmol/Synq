import { Modal, Button, TextField, Label, Input, Description, Switch } from "@heroui/react";
import { useEffect, useState } from "react";
import { api } from "../api";

import { toast } from "sonner";

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    api.getSettings().then(settings => {
      if (settings) {
        setUsername(settings.username);
        if (settings.password) {
          setPassword(settings.password);
        }
      }
    });
  }, []);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleSave = () => {
    api.updateSettings({ username, password: password || undefined });
    toast.success("Preferences Saved", {
      description: "Your settings have been updated successfully."
    });
    setIsOpen(false);
  };
  return (
    <>
      <Button onPress={() => setIsOpen(true)} variant="secondary" className="h-8 w-8 p-0 min-w-0 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-none transition-all rounded-md">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </Button>
      <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
        <Modal.Backdrop className="bg-black/60 backdrop-blur-sm">
          <Modal.Container>
          <Modal.Dialog className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden w-full max-w-md">
            <Modal.CloseTrigger className="text-zinc-400 hover:text-white transition-colors mt-1 mr-1" />
            <Modal.Header className="border-b border-zinc-800 bg-zinc-900/50 p-5">
              <Modal.Heading className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Preferences
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-6 p-6 bg-zinc-900">
              <TextField>
                <Label className="text-sm font-medium text-zinc-300 mb-1">Display Name</Label>
                <Input value={username} onChange={handleUsernameChange} className="bg-zinc-950 border-zinc-800 focus:border-emerald-500 transition-colors" />
                <Description className="text-xs text-zinc-500 mt-1.5">This name will be broadcasted to peers on the local network.</Description>
              </TextField>

              <TextField>
                <Label className="text-sm font-medium text-zinc-300 mb-1">Server Password (Optional)</Label>
                <Input type="password" value={password} onChange={handlePasswordChange} className="bg-zinc-950 border-zinc-800 focus:border-emerald-500 transition-colors" />
                <Description className="text-xs text-zinc-500 mt-1.5">Set a password to require it when peers connect to your machine.</Description>
              </TextField>

              <TextField>
                <Label className="text-sm font-medium text-zinc-300 mb-1">Network Port</Label>
                <Input defaultValue="5000" className="bg-zinc-950 border-zinc-800 focus:border-emerald-500 font-mono text-sm transition-colors" />
                <Description className="text-xs text-zinc-500 mt-1.5">The port used for local peer-to-peer SignalR connections.</Description>
              </TextField>

              <div className="h-px w-full bg-zinc-800/50 my-1"></div>

              <Switch defaultSelected>
                <Switch.Control className="bg-zinc-800 data-[selected]:bg-emerald-500">
                  <Switch.Thumb className="bg-white shadow-sm" />
                </Switch.Control>
                <Switch.Content className="pl-3">
                  <Label className="text-sm font-medium text-zinc-300 cursor-pointer">Enable mDNS Discovery</Label>
                  <Description className="text-xs text-zinc-500 mt-0.5">Automatically find and connect to Synq instances on the same network.</Description>
                </Switch.Content>
              </Switch>
            </Modal.Body>
            <Modal.Footer className="border-t border-zinc-800 p-4 bg-zinc-900/50 flex justify-end">
              <Button onPress={handleSave} className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium border-none transition-colors px-6">Done</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
    </>
  );
}
