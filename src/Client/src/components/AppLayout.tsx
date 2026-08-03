// @ts-nocheck
import { useState, useEffect } from "react";
import type {ReactNode} from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Tooltip, Button, Dropdown } from "@heroui/react";
import { toast } from "sonner";
import { SettingsModal } from "./SettingsModal";
import { LanPeersPanel } from "./LanPeersPanel";
import * as React from "react";
import { api } from "../api";
import { useDocumentStore, useDocumentHub } from "../hooks/useDocumentHub";
import { FileTree } from "./FileTree";
import { DeletedFileBanner } from "./DeletedFileBanner";

function Topbar() {
  const sendMessage = (action: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action }));
    }
  };

  return (
    <div 
      className="h-[42px] shrink-0 bg-[#09090b] flex items-center justify-between px-2 select-none z-50"
    >
      <div className="flex items-center gap-6">
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
            <Dropdown.Popover className="dark bg-zinc-900 border border-zinc-800 rounded-md shadow-2xl v3 \'/min-w-50">
              <Dropdown.Menu aria-label="File Options" className="p-1">
                <Dropdown.Item key="new" className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
                  New Document
                </Dropdown.Item>
                <Dropdown.Item key="open" onPress={() => sendMessage("openFolder")} className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
                  Open Folder...
                </Dropdown.Item>
                <Dropdown.Item key="save" className="text-xs text-zinc-300 hover:bg-zinc-800 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-zinc-800 transition-colors">
                  Save
                </Dropdown.Item>
                <Dropdown.Item key="close" className="text-xs text-red-400 hover:bg-red-950/30 rounded px-2 py-1.5 outline-none cursor-pointer data-[hover=true]:bg-red-950/50 transition-colors">
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

      {/* Right Side  */}
      <div className="flex items-center h-full gap-2">
        <div className="flex items-center gap-3 pr-4 border-zinc-800/80 h-full">
          <LanPeersPanel />
          <div className="w-px h-5 bg-zinc-800 mx-1"></div>
          <SettingsModal />
          <Button 
            onPress={async () => {
              const info = await api.getShareInfo();
              if (info) {
                const ips = info.ips.join(", ");
                toast.success("Peer Discovery Broadcasted", {
                  description: `Tell your peers to connect to:\nIP(s): ${ips}\nPort: ${info.port}`,
                });
              }
            }}
            className="bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 hover:border-emerald-500 transition-all h-7 text-xs font-medium px-4 rounded-md shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]"
          >
            Share
          </Button>
        </div>

      </div>
    </div>
  );
}

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [peers, setPeers] = useState<any[]>([]);
  const { activeFile, setActiveFile, openFiles, setOpenFiles, deletedOpenFiles, setDeletedOpenFiles, isConnected, documentStats } = useDocumentStore();
  const { fetchDocument } = useDocumentHub();

  const fetchPeers = async () => {
    const fetchedPeers = await api.getPeers();
    setPeers(fetchedPeers);
  };

  useEffect(() => {
    fetchPeers();
    const interval = setInterval(fetchPeers, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeFile) fetchDocument();
  }, [activeFile]);

  const closeFile = (e: React.MouseEvent, file: string) => {
    e.stopPropagation();
    const newOpen = openFiles.filter(f => f !== file);
    setOpenFiles(newOpen);
    if (deletedOpenFiles.includes(file)) {
      setDeletedOpenFiles(deletedOpenFiles.filter(f => f !== file));
    }
    if (activeFile === file) {
      setActiveFile(newOpen.length > 0 ? newOpen[newOpen.length - 1] : null);
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-50 dark selection:bg-emerald-500/30 font-sans">
      <Topbar />
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Sidebar */}
        <Panel defaultSize="20" minSize="15" maxSize="40" className="flex flex-col bg-zinc-900/30 backdrop-blur-md">
          <FileTree />
        </Panel>

        {/* Resizer */}
        <PanelResizeHandle className="w-1 hover:bg-emerald-500/50 active:bg-emerald-500 transition-colors cursor-col-resize z-50" />

        {/* Main Workspace */}
        <Panel defaultSize="80" className="flex flex-col overflow-hidden relative bg-[#09090b]">
          {openFiles.length > 0 && (
            <div className="flex bg-[#09090b] border-b border-zinc-800/60 overflow-x-auto overflow-y-hidden custom-scrollbar shrink-0 min-h-[38px] pt-1 px-2 gap-1.5 items-end">
              {openFiles.map(file => {
                const isActive = activeFile === file;
                return (
                  <div 
                    key={file} 
                    onClick={() => setActiveFile(file)}
                    className={`group/tab flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium cursor-pointer transition-all duration-200 ease-out select-none
                      ${isActive 
                        ? 'bg-zinc-950 text-emerald-400 border-t-2 border-t-emerald-500 border-x border-x-zinc-800/60 rounded-t-lg relative -mb-[1px] shadow-[0_-4px_12px_rgba(16,185,129,0.03)] z-10' 
                        : 'bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 rounded-t-lg border-t-2 border-t-transparent border-x border-x-transparent'}
                    `}
                  >
                    <span className="truncate max-w-[150px]">{file.split('/').pop()}</span>
                    <button 
                      onClick={(e) => closeFile(e, file)} 
                      className={`rounded-full p-0.5 transition-colors shrink-0 
                        ${isActive ? 'text-zinc-400 hover:bg-zinc-800 hover:text-red-400' : 'text-zinc-600 opacity-0 group-hover/tab:opacity-100 hover:bg-zinc-800 hover:text-red-400'}
                      `}
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {activeFile ? (
            <div key={activeFile} className="flex-1 overflow-hidden relative flex flex-col">
              {deletedOpenFiles.includes(activeFile) && <DeletedFileBanner />}
              {children}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
              <svg className="w-16 h-16 mb-4 text-zinc-800" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <p>Select a file to start editing</p>
            </div>
          )}
        </Panel>
      </PanelGroup>

      {/* Status Bar */}
      <footer className="h-7 border-t border-zinc-800/80 bg-zinc-900 flex items-center justify-between px-4 text-[11px] font-medium text-zinc-500 tracking-wide select-none z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 group cursor-pointer hover:text-zinc-300 transition-colors">
            <div className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'animate-ping bg-emerald-400' : 'bg-red-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}></span>
            </div>
            {isConnected ? 'SignalR Connected' : 'Disconnected'}
          </div>
          <div className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            {peers.filter(p => p.status === 'online').length} Peers Online
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hover:text-zinc-300 transition-colors">Ln {documentStats.line}, Col {documentStats.col}</div>
          <div className="w-px h-3 bg-zinc-800"></div>
          <div className="hover:text-zinc-300 transition-colors">{documentStats.words.toLocaleString()} Words</div>
          <div className="hover:text-zinc-300 transition-colors">{documentStats.chars.toLocaleString()} Chars</div>
        </div>
      </footer>
    </div>
  );
}
