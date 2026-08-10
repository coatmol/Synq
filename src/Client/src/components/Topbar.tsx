// @ts-nocheck
import * as React from "react";
import {Button, Dropdown, Header, Separator} from "@heroui/react";
import {Minus, Square, X, FilePlus2, FolderOpen, Settings, XCircle, LogOut} from "lucide-react";
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
      <Dropdown.Popover className="bg-[#18181b] border border-zinc-800/80 shadow-2xl rounded-xl min-w-[240px] p-1.5 overflow-hidden">
        <Dropdown.Menu aria-label="File Options" className="outline-none flex flex-col gap-0.5">
          <Dropdown.Section>
            <Header className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1.5 select-none">File</Header>
            <Dropdown.Item key="new" textValue="New Document" onPress={() => window.dispatchEvent(new Event('trigger-new-file'))}
                           className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-zinc-300 data-[focused=true]:bg-zinc-800/80 data-[focused=true]:text-zinc-100 transition-colors">
              <div className="flex h-5 items-center justify-center shrink-0">
                <FilePlus2 size={16} className="text-zinc-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium truncate">New Document</span>
                <span className="text-[11px] text-zinc-500 truncate">Create a new file in workspace</span>
              </div>
            </Dropdown.Item>
            <Dropdown.Item key="open" textValue="Open Folder..." onPress={() => sendMessage("openFolder")}
                           className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-zinc-300 data-[focused=true]:bg-zinc-800/80 data-[focused=true]:text-zinc-100 transition-colors">
              <div className="flex h-5 items-center justify-center shrink-0">
                <FolderOpen size={16} className="text-zinc-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium truncate">Open Folder...</span>
                <span className="text-[11px] text-zinc-500 truncate">Open a workspace folder</span>
              </div>
            </Dropdown.Item>
          </Dropdown.Section>

          <Separator className="bg-zinc-800/60 my-1 mx-2 h-px" />

          <Dropdown.Section>
            <Header className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1.5 select-none">Preferences</Header>
            <Dropdown.Item key="settings" textValue="Settings..." onPress={() => window.dispatchEvent(new Event('open-settings'))}
                           className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-zinc-300 data-[focused=true]:bg-zinc-800/80 data-[focused=true]:text-zinc-100 transition-colors">
              <div className="flex h-5 items-center justify-center shrink-0">
                <Settings size={16} className="text-zinc-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium truncate">Settings...</span>
                <span className="text-[11px] text-zinc-500 truncate">Manage app preferences</span>
              </div>
            </Dropdown.Item>
          </Dropdown.Section>

          <Separator className="bg-zinc-800/60 my-1 mx-2 h-px" />

          <Dropdown.Section>
            <Header className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 px-2 py-1.5 select-none">Danger Zone</Header>
            <Dropdown.Item key="close" textValue="Close folder" onPress={() => {
              sendMessage("closeFolder");
              setTimeout(() => window.location.reload(), 100);
            }}
                           className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-red-400 data-[focused=true]:bg-red-500/10 data-[focused=true]:text-red-400 transition-colors">
              <div className="flex h-5 items-center justify-center shrink-0">
                <XCircle size={16} className="text-red-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium truncate">Close folder</span>
                <span className="text-[11px] text-red-400/70 truncate">Close current workspace</span>
              </div>
            </Dropdown.Item>
            <Dropdown.Item key="quit" textValue="Quit Synq" onPress={() => sendMessage("close")}
                           className="flex items-start gap-3 px-2 py-2 rounded-lg outline-none cursor-pointer text-red-400 data-[focused=true]:bg-red-500/10 data-[focused=true]:text-red-400 transition-colors">
              <div className="flex h-5 items-center justify-center shrink-0">
                <LogOut size={16} className="text-red-400" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-medium truncate">Quit Synq</span>
                <span className="text-[11px] text-red-400/70 truncate">Exit the application</span>
              </div>
            </Dropdown.Item>
          </Dropdown.Section>
        </Dropdown.Menu>
      </Dropdown.Popover>
      <SettingsModal/>
    </Dropdown>
  );
}

export function WindowControls({isNativeFrame}: { isNativeFrame?: boolean }) {
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
      {isDesktop && !isNativeFrame && (
        <div className="flex items-center h-full gap-0 ml-1">
          <button onClick={() => sendMessage("minimize")}
                  className="w-8 mt-1 aspect-square rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Minus className="w-3.5 h-3.5"/>
          </button>
          <button onClick={() => sendMessage("maximize")}
                  className="w-8 mt-1 aspect-square rounded-xl flex items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors">
            <Square className="w-3 h-3"/>
          </button>
          <button onClick={() => sendMessage("close")}
                  className="w-8 mt-1 mr-2 aspect-square rounded-xl flex items-center justify-center text-zinc-400 hover:bg-red-500 hover:text-white transition-colors">
            <X className="w-4 h-4"/>
          </button>
        </div>
      )}
    </div>
  );
}
