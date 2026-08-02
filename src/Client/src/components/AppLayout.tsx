// @ts-nocheck
import { useState } from "react";
import type {ReactNode} from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [treeOpen, setTreeOpen] = useState(true);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-50 dark selection:bg-emerald-500/30 font-sans">
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden">
        {/* Sidebar */}
        <Panel defaultSize="20" minSize="15" maxSize="40" className="flex flex-col bg-zinc-900/30 backdrop-blur-md">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2 custom-scrollbar">
            
            <div className="flex items-center justify-between mb-2 cursor-pointer group select-none" onClick={() => setTreeOpen(!treeOpen)}>
              <h2 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">Document Tree</h2>
              <svg className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${treeOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            
            <div className={`flex flex-col gap-1 overflow-hidden transition-all duration-300 ${treeOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-zinc-800/50 text-sm text-zinc-300 border border-zinc-700/50 cursor-pointer hover:bg-zinc-800 transition-colors shadow-sm">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                README.md
              </div>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 transition-colors cursor-pointer">
                <svg className="w-4 h-4 text-zinc-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                notes.md
              </div>
            </div>
          </div>
        </Panel>

        {/* Resizer */}
        <PanelResizeHandle className="w-1 hover:bg-emerald-500/50 active:bg-emerald-500 transition-colors cursor-col-resize z-50 bg-zinc-800" />

        {/* Main Workspace */}
        <Panel defaultSize="80" className="flex flex-col overflow-hidden relative bg-zinc-950 shadow-inner">
          {children}
        </Panel>
      </PanelGroup>

      {/* Status Bar */}
      <footer className="h-7 border-t border-zinc-800/80 bg-zinc-900 flex items-center justify-between px-4 text-[11px] font-medium text-zinc-500 tracking-wide select-none z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 group cursor-pointer hover:text-zinc-300 transition-colors">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            SignalR Connected
          </div>
          <div className="flex items-center gap-1.5 hover:text-zinc-300 transition-colors cursor-pointer">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            3 Peers Online
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hover:text-zinc-300 transition-colors">Ln 12, Col 42</div>
          <div className="w-px h-3 bg-zinc-800"></div>
          <div className="hover:text-zinc-300 transition-colors">1,204 Words</div>
          <div className="hover:text-zinc-300 transition-colors">8,401 Chars</div>
        </div>
      </footer>
    </div>
  );
}
