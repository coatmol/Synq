// @ts-nocheck
import {useState, useEffect} from "react";
import type {ReactNode} from "react";
import {Group as PanelGroup, Panel, Separator as PanelResizeHandle} from "react-resizable-panels";
import {Tooltip, Button, Dropdown} from "@heroui/react";
import {toast} from "sonner";
import {FileMenu, WindowControls} from "./Topbar";
import {ConnectModal} from "./ConnectModal";
import * as React from "react";
import {api} from "../api";
import {useDocumentStore, useDocumentHub} from "../hooks/useDocumentHub";
import {FileTree} from "./FileTree";
import {VersionHistory} from "./VersionHistory";
import {DiffViewer} from "./DiffViewer";
import {DeletedFileBanner} from "./DeletedFileBanner";
import {X, FileText, Users, Menu, History, FolderTree} from "lucide-react";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({children}: AppLayoutProps) {
  const [peers, setPeers] = useState<any[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'files' | 'history'>('files');

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const os = searchParams.get('os') || 'windows';
  const isNativeFrame = os === 'linux';

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  const {
    activeFile,
    setActiveFile,
    openFiles,
    setOpenFiles,
    deletedOpenFiles,
    setDeletedOpenFiles,
    isConnected,
    documentStats
  } = useDocumentStore();
  const {fetchDocument} = useDocumentHub();

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
    <div
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#1e1e1e] text-zinc-50 dark selection:bg-emerald-500/30 font-sans">
      {/* Mobile Sidebar Overlay */}
      {isMobile && showMobileMenu && (
        <div className="fixed inset-0 z-50 flex">
          <div className="w-64 bg-[#18181b] h-full flex flex-col shadow-2xl z-50">
            <div className="flex items-center justify-between h-10.5 shrink-0 border-b border-[#202020] px-2">
              <FileMenu/>
              <button onClick={() => setShowMobileMenu(false)}
                      className="p-1 text-zinc-400 hover:text-zinc-100 rounded">
                <X className="w-4 h-4"/>
              </button>
            </div>
            <div className="flex-1 overflow-hidden" onClick={() => setShowMobileMenu(false)}>
              <FileTree/>
            </div>
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setShowMobileMenu(false)}/>
        </div>
      )}

      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Activity Bar (Far Left) */}
        {!isMobile && (
          <div
            className="w-11 shrink-0 h-full flex flex-col items-center py-2 bg-[#18181b] border-r border-[#202020] z-20"
            style={isNativeFrame ? {} : {WebkitAppRegion: 'drag'} as any}>
            <div style={isNativeFrame ? {} : {WebkitAppRegion: 'no-drag'} as any}
                 className="flex flex-col gap-2 mt-2 w-full">
              <div className="flex items-center justify-center w-full mb-2">
                <img src="/Synq3.png" alt="Logo" className="w-6 h-6"/>
              </div>
              <button
                onClick={() => setSidebarTab('files')}
                title="Files"
                className={`w-9 h-9 mx-auto rounded-xl transition-all flex items-center justify-center ${sidebarTab === 'files' ? 'text-zinc-100 bg-[#27272a] shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#202020]'}`}
              >
                <FolderTree className="w-5 h-5" strokeWidth={1.5}/>
              </button>
              <button
                onClick={() => setSidebarTab('history')}
                title="Version History"
                className={`w-9 h-9 mx-auto rounded-xl transition-all flex items-center justify-center ${sidebarTab === 'history' ? 'text-zinc-100 bg-[#27272a] shadow-sm' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#202020]'}`}
              >
                <History className="w-5 h-5" strokeWidth={1.5}/>
              </button>
            </div>
          </div>
        )}

        {/* Sidebar */}
        {!isMobile && (
          <Panel defaultSize={20} className="flex flex-col bg-[#18181b]">
            <div
              className="flex items-center h-10.5 shrink-0 border-b border-[#202020] px-2"
              style={isNativeFrame ? {} : {WebkitAppRegion: 'drag'} as any}
              onPointerDown={(e) => {
                if (!isNativeFrame && e.target === e.currentTarget) {
                  if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
                    (window as any).external.sendMessage(JSON.stringify({action: "drag"}));
                  }
                }
              }}
            >
              <div style={isNativeFrame ? {} : {WebkitAppRegion: 'no-drag'} as any}>
                <FileMenu/>
              </div>
            </div>
            {sidebarTab === 'files' ? <FileTree/> : <VersionHistory/>}
          </Panel>
        )}

        {/* Resizer */}
        {!isMobile && (
          <PanelResizeHandle
            className="w-1 hover:bg-emerald-500/50 active:bg-emerald-500 transition-colors cursor-col-resize z-50"/>
        )}

        {/* Main Workspace */}
        <Panel defaultSize={isMobile ? 100 : 80} className="flex flex-col overflow-hidden relative bg-[#1e1e1e]">
          <div
            className="flex items-end justify-between h-10.5 shrink-0 bg-[#1e1e1e] border-b border-[#202020]"
            style={isNativeFrame ? {} : {WebkitAppRegion: 'drag'} as any}
            onPointerDown={(e) => {
              if (!isNativeFrame && e.target === e.currentTarget) {
                if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
                  (window as any).external.sendMessage(JSON.stringify({action: "drag"}));
                }
              }
            }}
          >
            <div
              className="flex items-end h-full overflow-x-auto overflow-y-hidden custom-scrollbar pt-1 pl-2 gap-1.5 min-w-0 flex-1"
              onPointerDown={(e) => {
                if (!isNativeFrame && e.target === e.currentTarget) {
                  if (typeof window !== 'undefined' && (window as any).external && (window as any).external.sendMessage) {
                    (window as any).external.sendMessage(JSON.stringify({action: "drag"}));
                  }
                }
              }}
            >
              {isMobile && (
                <button
                  onClick={() => setShowMobileMenu(true)}
                  className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded mr-2 h-7 mt-1.5 flex items-center justify-center shrink-0"
                  style={{WebkitAppRegion: 'no-drag'} as any}
                >
                  <Menu className="w-4 h-4"/>
                </button>
              )}
              {openFiles.length > 0 && openFiles.map(file => {
                const isActive = activeFile === file;
                const isDiff = file.startsWith('diff:');
                const displayName = isDiff ? `Diff: ${file.split(':')[1].split('/').pop()}` : file.split('/').pop();

                return (
                  <div
                    key={file}
                    style={isNativeFrame ? {} : {WebkitAppRegion: 'no-drag'} as any}
                    onClick={() => {
                      if (!isActive) {
                        setActiveFile(file);
                      }
                    }}
                    onMouseUp={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        closeFile(e as any, file);
                      }
                    }}
                    className={`group/tab flex items-center gap-2 px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-all duration-200 ease-out select-none
                      ${isActive
                      ? 'bg-[#1e1e1e] text-zinc-200 border-t-[3px] border-t-emerald-500 border-x border-x-zinc-800/60 rounded-t-lg relative -mb-[1px] z-10 shadow-[0_-2px_10px_rgba(0,0,0,0.2)]'
                      : 'bg-transparent text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40 rounded-t-lg border-t-[3px] border-t-transparent border-x border-x-transparent'}
                    `}
                  >
                    <span className="truncate max-w-[150px]">{displayName}</span>
                    <button
                      onClick={(e) => closeFile(e, file)}
                      className={`rounded-full p-0.5 transition-colors shrink-0 
                        ${isActive ? 'text-zinc-400 hover:bg-zinc-800 hover:text-red-400' : 'text-zinc-600 opacity-0 group-hover/tab:opacity-100 hover:bg-zinc-800 hover:text-red-400'}
                      `}
                    >
                      <X className="w-3 h-3"/>
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="h-full shrink-0 flex items-center">
              <WindowControls isNativeFrame={isNativeFrame}/>
            </div>
          </div>
          {activeFile?.startsWith('diff:') ? (
            <div key={activeFile} className="flex-1 overflow-hidden relative flex flex-col">
              <DiffViewer fileUri={activeFile}/>
            </div>
          ) : activeFile ? (
            <div key={activeFile} className="flex-1 overflow-hidden relative flex flex-col">
              {deletedOpenFiles.includes(activeFile) && <DeletedFileBanner/>}
              {children}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-zinc-500">
              <FileText className="w-16 h-16 mb-4 text-zinc-800" strokeWidth={1}/>
              <p>Select a file to start editing</p>
            </div>
          )}
        </Panel>
      </PanelGroup>

      {/* Status Bar */}
      <footer
        className="h-auto min-h-7 py-1 md:py-0 border-t border-zinc-800/80 bg-[#1e1e1e] flex flex-wrap gap-2 items-center justify-between pl-3 pr-4 text-[11px] font-medium text-zinc-500 tracking-wide select-none z-10">
        <div className="flex items-center">
          {!isConnected && (
            <div className="flex items-center gap-2 group cursor-pointer hover:text-zinc-300 transition-colors mr-6">
              <div className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 bg-red-400"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </div>
              Disconnected
            </div>
          )}
          <div className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer">
            <Users className="w-3.5 h-3.5"/>
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
