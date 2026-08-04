// @ts-nocheck
import { useState, useEffect } from "react";
import type {ReactNode} from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Tooltip, Button, Dropdown } from "@heroui/react";
import { toast } from "sonner";
import { Topbar } from "./Topbar";
import { ConnectModal } from "./ConnectModal";
import * as React from "react";
import { api } from "../api";
import { useDocumentStore, useDocumentHub } from "../hooks/useDocumentHub";
import { FileTree } from "./FileTree";
import { DeletedFileBanner } from "./DeletedFileBanner";
import { X, FileText, Users } from "lucide-react";

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

  const closeFile = (e: React.MouseEvent | null, file: string) => {
    if (e) e.stopPropagation();
    const newOpen = openFiles.filter(f => f !== file);
    setOpenFiles(newOpen);
    if (deletedOpenFiles.includes(file)) {
      setDeletedOpenFiles(deletedOpenFiles.filter(f => f !== file));
    }
    if (activeFile === file) {
      setActiveFile(newOpen.length > 0 ? newOpen[newOpen.length - 1] : null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (openFiles.length > 1) {
          const currentIndex = openFiles.indexOf(activeFile || '');
          const nextIndex = e.shiftKey 
            ? (currentIndex - 1 + openFiles.length) % openFiles.length 
            : (currentIndex + 1) % openFiles.length;
          setActiveFile(openFiles[nextIndex]);
        }
      } else if (e.ctrlKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        if (activeFile) {
          closeFile(null, activeFile);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openFiles, activeFile]);

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
                    onMouseUp={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        closeFile(e, file);
                      }
                    }}
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
                      <X className="w-3 h-3" />
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
              <FileText className="w-16 h-16 mb-4 text-zinc-800" strokeWidth={1} />
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
            <Users className="w-3.5 h-3.5" />
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
