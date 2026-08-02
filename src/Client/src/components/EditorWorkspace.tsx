// @ts-nocheck
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";

export function EditorWorkspace() {
  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      {/* Split Pane */}
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden relative bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950">
        
        {/* Raw Markdown Input */}
        <Panel defaultSize="50" minSize="20" className="relative group flex flex-col h-full">
          <div className="absolute top-4 right-6 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none transition-colors z-10">Markdown</div>
          <div className="flex-1 overflow-hidden custom-scrollbar bg-transparent">
            <CodeMirror
              value={"# Welcome to Synq\n\nStart collaborating on markdown files locally with your peers.\n\n## Features\n- Real-time sync via SignalR\n- mDNS Auto-discovery\n- Beautiful UI with HeroUI"}
              height="100%"
              extensions={[markdown({ base: markdownLanguage })]}
              theme="dark"
              className="h-full text-[13px] font-mono leading-loose [&.cm-theme]:bg-transparent! [&_.cm-scroller]:p-6 [&_.cm-scroller]:custom-scrollbar [&_.cm-gutters]:border-none! [&_.cm-gutters]:text-zinc-600!"
            />
          </div>
        </Panel>

        {/* Resizer */}
        <PanelResizeHandle className="w-1.5 bg-zinc-900/50 hover:bg-emerald-500/50 transition-colors cursor-col-resize flex items-center justify-center relative">
          <div className="w-0.5 h-8 bg-zinc-700 rounded-full pointer-events-none"></div>
        </PanelResizeHandle>
        
        {/* Live Preview */}
        <Panel defaultSize="50" minSize="20" className="relative custom-scrollbar bg-zinc-950/50 overflow-y-auto">
          <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none">Preview</div>
          <div className="p-8 prose prose-invert prose-zinc max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-zinc-50 prose-p:leading-relaxed hover:prose-a:text-emerald-300 prose-code:bg-emerald-950/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:border prose-code:border-emerald-800/30">
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
