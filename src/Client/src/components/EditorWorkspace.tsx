// @ts-nocheck
import { Tooltip, Button } from "@heroui/react";
import { SettingsModal } from "./SettingsModal";
import { LanPeersPanel } from "./LanPeersPanel";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

export function EditorWorkspace() {
  const tools = [
    { icon: "B", label: "Bold", shortcut: "Ctrl+B" },
    { icon: "I", label: "Italic", shortcut: "Ctrl+I" },
    { icon: "H", label: "Heading", shortcut: "Ctrl+H" },
    { icon: "</>", label: "Code Block", shortcut: "Ctrl+Alt+C" },
    { icon: "☑", label: "Task List", shortcut: "Ctrl+Shift+T" },
  ];

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      {/* Editor Toolbar */}
      <div className="h-12 border-b border-zinc-800/80 bg-zinc-900/90 px-4 flex items-center justify-between backdrop-blur-md z-20">
        <div className="flex items-center gap-1.5">
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
        
        <div className="flex items-center gap-3">
          <LanPeersPanel />
          <div className="w-px h-5 bg-zinc-800 mx-1"></div>
          <SettingsModal />
          <Button className="bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600 hover:text-white border border-emerald-500/30 hover:border-emerald-500 transition-all h-8 text-xs font-medium px-4 rounded-md shadow-[0_0_10px_rgba(16,185,129,0.1)] hover:shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            Share Link
          </Button>
        </div>
      </div>

      {/* Split Pane */}
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950">
        
        {/* Raw Markdown Input */}
        <Panel defaultSize="50" minSize="20" className="relative group flex flex-col h-full">
          <div className="absolute top-4 right-6 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none group-focus-within:text-emerald-900/50 transition-colors z-10">Markdown</div>
          <div className="flex-1 overflow-hidden custom-scrollbar bg-transparent">
            <CodeMirror
              value={"# Welcome to Synq\n\nStart collaborating on markdown files locally with your peers.\n\n## Features\n- Real-time sync via SignalR\n- mDNS Auto-discovery\n- Beautiful UI with HeroUI"}
              height="100%"
              extensions={[markdown({ base: markdownLanguage })]}
              theme="dark"
              className="h-full text-[13px] font-mono leading-loose [&.cm-theme]:!bg-transparent [&_.cm-editor]:!bg-transparent [&_.cm-scroller]:p-6 [&_.cm-scroller]:custom-scrollbar [&_.cm-gutters]:!bg-transparent [&_.cm-gutters]:!border-none [&_.cm-gutters]:!text-zinc-600 [&_.cm-activeLineGutter]:!bg-zinc-800/50 [&_.cm-activeLine]:!bg-zinc-900/30"
            />
          </div>
        </Panel>

        {/* Resizer */}
        <PanelResizeHandle className="w-1.5 bg-zinc-900/50 hover:bg-emerald-500/50 active:bg-emerald-500 transition-colors cursor-col-resize flex items-center justify-center relative">
          <div className="w-0.5 h-8 bg-zinc-700 rounded-full pointer-events-none"></div>
        </PanelResizeHandle>
        
        {/* Live Preview */}
        <Panel defaultSize="50" minSize="20" className="relative custom-scrollbar bg-zinc-950/50 overflow-y-auto">
          <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none">Preview</div>
          <div className="p-8 prose prose-invert prose-zinc max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-zinc-50 prose-p:text-zinc-300 prose-p:leading-relaxed prose-a:text-emerald-400 hover:prose-a:text-emerald-300 prose-li:text-zinc-300 prose-code:text-emerald-300 prose-code:bg-emerald-950/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:border prose-code:border-emerald-800/30 prose-pre:bg-zinc-900/80 prose-pre:border prose-pre:border-zinc-800 prose-hr:border-zinc-800">
            <h1>Welcome to Synq</h1>
            <p>Start collaborating on markdown files locally with your peers. Our goal is to make it seamless.</p>
            <h2>Features</h2>
            <ul>
              <li>Real-time sync via <code>SignalR</code></li>
              <li>mDNS Auto-discovery on LAN</li>
              <li>Beautiful UI with <strong>HeroUI</strong></li>
            </ul>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
