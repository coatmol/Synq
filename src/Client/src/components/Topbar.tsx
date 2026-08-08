// @ts-nocheck
import * as React from "react";
import {Button, Dropdown} from "@heroui/react";
import {Minus, Square, X} from "lucide-react";
import {LanPeersPanel} from "./LanPeersPanel";
import {SettingsModal} from "./SettingsModal";

export function FileMenu() {
  const sendMessage = (action: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({action}));
    }
  };

  return (
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
      <Dropdown.Popover className="dark bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl min-w-50">
        <Dropdown.Menu aria-label="File Options" className="p-1">
          <Dropdown.Item key="new" onPress={() => window.dispatchEvent(new Event('trigger-new-file'))}
                         className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
            New Document
          </Dropdown.Item>
          <Dropdown.Item key="open" onPress={() => sendMessage("openFolder")}
                         className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
            Open Folder...
          </Dropdown.Item>
          <Dropdown.Item key="settings" onPress={() => window.dispatchEvent(new Event('open-settings'))}
                         className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
            Settings...
          </Dropdown.Item>
          <Dropdown.Item key="close" onPress={() => {
            sendMessage("closeFolder");
            setTimeout(() => window.location.reload(), 100);
          }}
                         className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-red-950/50 transition-colors">
            Close folder
          </Dropdown.Item>
          <Dropdown.Item key="quit" onPress={() => sendMessage("close")}
                         className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-red-950/50 transition-colors">
            Quit Synq
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
      <SettingsModal/>
    </Dropdown>
  );
}

export function WindowControls() {
  const isDesktop = typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage;

  const sendMessage = (action: string) => {
    if (isDesktop) {
      (window as any).external.sendMessage(JSON.stringify({action}));
    }
  };

  return (
    <div className="flex items-center h-full gap-2 shrink-0" style={{WebkitAppRegion: "no-drag"} as any}>
      <div className="flex items-center gap-3 pr-2 border-r border-zinc-800/80 h-full">
        <LanPeersPanel/>
      </div>
      {isDesktop && (
        <div className="flex items-center h-full gap-0 ml-1">
          <button onClick={() => sendMessage("minimize")}
                  className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Minus className="w-[14px] h-[14px]"/>
          </button>
          <button onClick={() => sendMessage("maximize")}
                  className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Square className="w-3 h-3"/>
          </button>
          <button onClick={() => sendMessage("close")}
                  className="w-10 h-full flex items-center justify-center text-zinc-400 hover:bg-red-500 hover:text-white transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>
      )}
    </div>
  );
}
