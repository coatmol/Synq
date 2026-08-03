// @ts-nocheck
import { useState, useEffect } from "react";
import type {ReactNode} from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Tooltip, Button, Dropdown } from "@heroui/react";
import { SettingsModal } from "./SettingsModal";
import { LanPeersPanel } from "./LanPeersPanel";
import * as React from "react";
import { api } from "../api";
import { useDocumentStore, useDocumentHub } from "../hooks/useDocumentHub";

function Topbar() {
  const sendMessage = (action: string) => {
    if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
      (window as any).external.sendMessage(JSON.stringify({ action }));
    }
  };

  const tools = [
    { icon: "B", label: "Bold", shortcut: "Ctrl+B" },
    { icon: "I", label: "Italic", shortcut: "Ctrl+I" },
    { icon: "H", label: "Heading", shortcut: "Ctrl+H" },
    { icon: "</>", label: "Code Block", shortcut: "Ctrl+Alt+C" },
    { icon: "☑", label: "Task List", shortcut: "Ctrl+Shift+T" },
  ];

  return (
    <div 
      className="h-12 shrink-0 bg-zinc-900 border-b border-zinc-800/80 flex items-center justify-between px-2 select-none z-50 backdrop-blur-md"
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
        
        {/* Formatting Tools */}
        <div className="flex items-center gap-1.5 border-l border-zinc-800/80 pl-6">
          {tools.map(tool => (
            <Tooltip key={tool.label}>
              <Tooltip.Trigger>
                <Button 
                  variant="secondary" 
                  className="w-8 h-8 p-0 min-w-0 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-none transition-all font-medium rounded-md" 
                  aria-label={tool.label}
                >
                  {tool.icon}
                </Button>
              </Tooltip.Trigger>
              <Tooltip.Content className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1.5 text-xs shadow-xl rounded-md">
                <Tooltip.Arrow className="fill-zinc-800" />
                {tool.label} <span className="text-zinc-500 ml-2 font-mono text-[10px]">{tool.shortcut}</span>
              </Tooltip.Content>
            </Tooltip>
          ))}
          <div className="w-px h-5 bg-zinc-800 mx-2"></div>
          <Tooltip>
            <Tooltip.Trigger>
              <Button variant="secondary" className="w-8 h-8 p-0 min-w-0 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 border-none transition-all rounded-md">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content className="bg-zinc-800 border border-zinc-700 text-zinc-200 px-3 py-1.5 text-xs shadow-xl rounded-md">
              <Tooltip.Arrow className="fill-zinc-800" />
              Link <span className="text-zinc-500 ml-2 font-mono text-[10px]">Ctrl+K</span>
            </Tooltip.Content>
          </Tooltip>
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
                alert(`Tell your peers to connect to:\n\nIP(s): ${ips}\nPort: ${info.port}\n\n(A peer discovery broadcast was also forcefully sent to the local network.)`);
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
  const [treeOpen, setTreeOpen] = useState(true);
  const [files, setFiles] = useState<string[]>([]);
  const [peers, setPeers] = useState<any[]>([]);
  const { activeFile, setActiveFile, isConnected, documentStats } = useDocumentStore();
  const { fetchDocument } = useDocumentHub();

  const fetchFiles = async () => {
    const fetchedFiles = await api.getFiles();
    setFiles(fetchedFiles);
  };

  const fetchPeers = async () => {
    const fetchedPeers = await api.getPeers();
    setPeers(fetchedPeers);
  };

  useEffect(() => {
    fetchFiles();
    fetchPeers();
    const interval = setInterval(() => {
      fetchFiles();
      fetchPeers();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeFile) fetchDocument();
  }, [activeFile]);

  const handleCreateFile = async () => {
    const filename = prompt("Enter new filename:");
    if (filename) {
      await api.createFile(filename);
      await fetchFiles();
    }
  };

  const handleDeleteFile = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
      await api.deleteFile(filename);
      await fetchFiles();
    }
  };

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-50 dark selection:bg-emerald-500/30 font-sans">
      <Topbar />
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Sidebar */}
        <Panel defaultSize="20" minSize="15" maxSize="40" className="flex flex-col bg-zinc-900/30 backdrop-blur-md">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 custom-scrollbar">
            
            <div className="flex items-center justify-between mb-2 cursor-pointer group select-none" onClick={() => setTreeOpen(!treeOpen)}>
              <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">Document Tree</h2>
              <div className="flex items-center gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); handleCreateFile(); }}
                  className="text-zinc-500 hover:text-emerald-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                </button>
                <svg className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${treeOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            
            <div className={`flex flex-col gap-1 overflow-hidden transition-all duration-300 ${treeOpen ? 'opacity-100' : 'max-h-0 opacity-0'}`}>
              {files.map(file => (
                <div 
                  key={file} 
                  onClick={() => setActiveFile(file)}
                  className={`flex items-center justify-between group/item px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${activeFile === file ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300'}`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {file}
                  </div>
                  <button 
                    onClick={(e) => handleDeleteFile(file, e)}
                    className="opacity-0 group-hover/item:opacity-100 text-red-500/70 hover:text-red-500 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
              {files.length === 0 && (
                <div className="text-xs text-zinc-600 px-2 italic">No files found.</div>
              )}
            </div>
          </div>
        </Panel>

        {/* Resizer */}
        <PanelResizeHandle className="w-1 hover:bg-emerald-500/50 active:bg-emerald-500 transition-colors cursor-col-resize z-50" />

        {/* Main Workspace */}
        <Panel defaultSize="80" className="flex flex-col overflow-hidden relative bg-zinc-950 shadow-inner">
          {activeFile ? (
            <div key={activeFile} className="flex-1 overflow-hidden relative flex flex-col">
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
