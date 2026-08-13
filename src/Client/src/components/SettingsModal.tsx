import {Modal, Button, TextField, Label, Input, Description, Switch} from "@heroui/react";
import {useEffect, useState} from "react";
import {api} from "../api";
import {SlidersHorizontal} from "lucide-react";

import {toast} from "sonner";
import * as React from "react";

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [appVersion, setAppVersion] = useState("1.0.0");
  const [latestVersion, setLatestVersion] = useState<{
    updateAvailable: boolean,
    latest?: string,
    message?: string
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    api.getSettings().then(settings => {
      if (settings) {
        setUsername(settings.username);
        if (settings.password) {
          setPassword(settings.password);
        }
      }

      api.getVersion().then(v => {
        if (v) setAppVersion(v);
      });

      api.checkForUpdates().then(updateInfo => {
        setLatestVersion(updateInfo);
      });
    });

    const handleOpen = () => setIsOpen(true);
    window.addEventListener('open-settings', handleOpen);
    return () => window.removeEventListener('open-settings', handleOpen);
  }, []);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
  };

  const handleCheckForUpdates = () => {
    setIsChecking(true);
    if (latestVersion?.updateAvailable) {
      api.updateToLatest().then(() => {
        toast.success("Update Started", {
          description: "The application is updating to the latest version."
        });
      }).catch(err => {
        toast.error("Update Failed", {
          description: `Failed to update: ${err.message}`
        });
      }).finally(() => setIsChecking(false));
    } else {
      api.checkForUpdates().then(updateInfo => {
        setLatestVersion(updateInfo);
        if (updateInfo?.updateAvailable) {
          toast.success("Update Available", {description: `Version ${updateInfo.latest} is available.`});
        } else {
          toast.info("Up to date", {description: updateInfo?.message || "No updates found."});
        }
      }).catch(() => {
        toast.error("Error", {description: "Failed to check for updates."});
      }).finally(() => setIsChecking(false));
    }
  }

  const handleSave = () => {
    api.updateSettings({username, password: password});
    toast.success("Preferences Saved", {
      description: "Your settings have been updated successfully."
    });
    setIsOpen(false);
  };
  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
        <Modal.Backdrop className="bg-black/60 backdrop-blur-sm">
          <Modal.Container>
            <Modal.Dialog
              className="bg-zinc-900 border border-zinc-800 shadow-2xl rounded-xl overflow-hidden w-full max-w-md">
              <Modal.CloseTrigger className="text-zinc-400 hover:text-white transition-colors mt-1 mr-1"/>
              <Modal.Header className="border-b border-zinc-800 bg-zinc-900/50 p-5">
                <Modal.Heading className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-emerald-500"/>
                  Preferences
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className="flex flex-col gap-6 p-6 bg-zinc-900">
                <div className="flex items-center justify-between bg-zinc-950 p-4 rounded-lg border border-zinc-800">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-zinc-300">Keep Synq up-to-date</span>
                    <span className="text-xs text-zinc-500 mt-1">
                      Version {appVersion} {latestVersion ? (latestVersion.updateAvailable ? `-> ${latestVersion.latest}` : "(up to date)") : ""}
                    </span>
                  </div>
                  <Button onClick={handleCheckForUpdates} isDisabled={isChecking} 
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs px-3 h-8 min-w-0 transition-colors">
                    {isChecking
                      ? (latestVersion?.updateAvailable ? "Applying Update..." : "Checking for Updates...")
                      : (latestVersion?.updateAvailable ? `Update to ${latestVersion.latest}` : "Check for Updates")}
                  </Button>
                </div>

                <TextField>
                  <Label className="text-sm font-medium text-zinc-300 mb-1">Display Name</Label>
                  <Input value={username} onChange={handleUsernameChange}
                         className="bg-zinc-950 border-zinc-800 focus:border-emerald-500 transition-colors"/>
                  <Description className="text-xs text-zinc-500 mt-1.5">This name will be broadcasted to peers on the
                    local network.</Description>
                </TextField>

                <TextField>
                  <Label className="text-sm font-medium text-zinc-300 mb-1">Server Password (Optional)</Label>
                  <Input type="password" value={password} onChange={handlePasswordChange}
                         className="bg-zinc-950 border-zinc-800 focus:border-emerald-500 transition-colors"/>
                  <Description className="text-xs text-zinc-500 mt-1.5">Set a password to require it when peers connect
                    to your machine.</Description>
                </TextField>

                <TextField>
                  <Label className="text-sm font-medium text-zinc-300 mb-1">Network Port</Label>
                  <Input defaultValue="5000"
                         className="bg-zinc-950 border-zinc-800 focus:border-emerald-500 font-mono text-sm transition-colors"/>
                  <Description className="text-xs text-zinc-500 mt-1.5">The port used for local peer-to-peer SignalR
                    connections.</Description>
                </TextField>

                <div className="h-px w-full bg-zinc-800/50 my-1"></div>

                <Switch defaultSelected>
                  <Switch.Control className="bg-zinc-800 data-[selected]:bg-emerald-500">
                    <Switch.Thumb className="bg-white shadow-sm"/>
                  </Switch.Control>
                  <Switch.Content className="pl-3">
                    <Label className="text-sm font-medium text-zinc-300 cursor-pointer">Enable mDNS Discovery</Label>
                    <Description className="text-xs text-zinc-500 mt-0.5">Automatically find and connect to Synq
                      instances on the same network.</Description>
                  </Switch.Content>
                </Switch>
              </Modal.Body>
              <Modal.Footer className="border-t border-zinc-800 p-4 bg-zinc-900/50 flex justify-end">
                <Button onPress={handleSave}
                        className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-medium border-none transition-colors px-6">Done</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
