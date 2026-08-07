// @ts-nocheck
import * as React from "react";
import { Button, Dropdown } from "@heroui/react";
import { Minus, Square, X } from "lucide-react";
import { LanPeersPanel } from "./LanPeersPanel";
import { SettingsModal } from "./SettingsModal";

export function Topbar() {
  const sendMessage = (action: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action }));
    }
  };

  return (
    <div 
      className="h-10.5 shrink-0 bg-[#1e1e1e] flex items-center justify-between pl-2 select-none z-50 border-b border-[#202020]"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      <div className="flex items-center gap-6" style={{ WebkitAppRegion: "no-drag" } as any}>
        <div className="flex items-center gap-4 pl-2">
          <Dropdown placement="bottom-start">
            <Dropdown.Trigger>
              <Button 
                variant="light"
                disableRipple
                className="min-w-0 px-3 h-7 text-[11px] font-medium tracking-wide text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50 rounded transition-colors focus:outline-none"
              >
                File
              </Button>
            </Dropdown.Trigger>
            <Dropdown.Popover className="dark bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl v3 '/min-w-50">
              <Dropdown.Menu aria-label="File Options" className="p-1">
                <Dropdown.Item key="new" onPress={() => window.dispatchEvent(new Event('trigger-new-file'))} className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
                  New Document
                </Dropdown.Item>
                <Dropdown.Item key="open" onPress={() => sendMessage("openFolder")} className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
                  Open Folder...
                </Dropdown.Item>
                {/*<SettingsModal />*/}
                <Dropdown.Item key="close" onPress={() => { sendMessage("closeFolder"); setTimeout(() => window.location.reload(), 100); }} className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-red-950/50 transition-colors">
                  Close folder
                </Dropdown.Item>
                <Dropdown.Item key="quit" onPress={() => sendMessage("close")} className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-red-950/50 transition-colors">
                  Quit Synq
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center h-full gap-2" style={{ WebkitAppRegion: "no-drag" } as any}>
        <div className="flex items-center gap-3 pr-2 border-r border-zinc-800/80 h-full">
          <LanPeersPanel />
          <SettingsModal />
        </div>
        <div className="flex items-center h-full gap-0 ml-1">
          <button onClick={() => sendMessage("minimize")} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => sendMessage("maximize")} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Square className="w-3 h-3" />
          </button>
          <button onClick={() => sendMessage("close")} className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-red-500 hover:text-white transition-colors rounded-tr-md">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
