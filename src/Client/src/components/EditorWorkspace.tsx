// @ts-nocheck
import { useCallback, useEffect, useRef } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import ReactMarkdown from "react-markdown";
import { useBufferedInput } from "../hooks/useBufferedInput";
import { useDocumentStore } from "../hooks/useDocumentHub";
import DiffMatchPatch from "diff-match-patch";

export function EditorWorkspace() {
  const { text: remoteText, setDocumentStats } = useDocumentStore();
  const { localText, setLocalText, queueInsert, queueDelete } = useBufferedInput();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dmp = new DiffMatchPatch();

  // Handle remote updates via DMP to avoid losing cursor
  useEffect(() => {
    if (remoteText !== localText && textareaRef.current) {
      const textarea = textareaRef.current;
      const cursor = textarea.selectionStart;
      
      const diffs = dmp.diff_main(localText, remoteText);
      dmp.diff_cleanupSemantic(diffs);

      let newCursor = cursor;
      let currentIndex = 0;

      for (const [op, text] of diffs) {
        if (currentIndex > cursor) break;

        if (op === -1) { // Delete
          if (currentIndex + text.length <= cursor) {
            newCursor -= text.length;
          } else {
            newCursor -= (cursor - currentIndex);
          }
        } else if (op === 1) { // Insert
          if (currentIndex <= cursor) {
            newCursor += text.length;
          }
          currentIndex += text.length;
        } else { // Equal
          currentIndex += text.length;
        }
      }

      setLocalText(remoteText);

      // Restore cursor after React updates the DOM
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    }
  }, [remoteText]);

  const updateStats = useCallback((text: string, cursorIndex: number) => {
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    
    const textUpToCursor = text.substring(0, cursorIndex);
    const line = textUpToCursor.split('\n').length;
    const col = textUpToCursor.length - textUpToCursor.lastIndexOf('\n');

    setDocumentStats({ words, chars, line, col });
  }, [setDocumentStats]);

  const handleSelect = useCallback(() => {
    if (textareaRef.current) {
      updateStats(localText, textareaRef.current.selectionStart);
    }
  }, [localText, updateStats]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    
    const diffs = dmp.diff_main(localText, newVal);
    // Do not run cleanupSemantic, we need the exact operational diffs
    // to map precisely to our CRDT indices.

    let currentIndex = 0;
    for (const [op, text] of diffs) {
      if (op === 0) { // Equal
        currentIndex += text.length;
      } else if (op === -1) { // Delete
        queueDelete(currentIndex, text.length);
      } else if (op === 1) { // Insert
        queueInsert(currentIndex, text);
        currentIndex += text.length;
      }
    }

    setLocalText(newVal);
    updateStats(newVal, e.target.selectionStart);
  }, [localText, queueInsert, queueDelete, setLocalText, updateStats, dmp]);

  // Initial stats calculation
  useEffect(() => {
    updateStats(localText, textareaRef.current?.selectionStart || 0);
  }, []);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden relative bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950">
        
        {/* Raw Markdown Input */}
        <Panel defaultSize={50} minSize={20} className="relative group flex flex-col h-full">
          <div className="absolute top-4 right-6 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none transition-colors z-10">Markdown</div>
          <div className="flex-1 overflow-hidden custom-scrollbar bg-transparent p-6">
            <textarea
              ref={textareaRef}
              value={localText}
              onChange={handleChange}
              onSelect={handleSelect}
              spellCheck={false}
              className="w-full h-full bg-transparent text-zinc-300 outline-none resize-none font-mono text-[13px] leading-loose custom-scrollbar"
              placeholder="Start typing..."
            />
          </div>
        </Panel>

        {/* Resizer */}
        <PanelResizeHandle className="w-1.5 bg-zinc-900/50 hover:bg-emerald-500/50 transition-colors cursor-col-resize flex items-center justify-center relative">
          <div className="w-0.5 h-8 bg-zinc-700 rounded-full pointer-events-none"></div>
        </PanelResizeHandle>
        
        {/* Live Preview */}
        <Panel defaultSize={50} minSize={20} className="relative custom-scrollbar bg-zinc-950/50 overflow-y-auto">
          <div className="absolute top-4 right-4 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none">Preview</div>
          <div className="p-8 prose prose-invert prose-zinc max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-h1:text-zinc-50 prose-p:leading-relaxed hover:prose-a:text-emerald-300 prose-code:bg-emerald-950/30 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:border prose-code:border-emerald-800/30">
            <ReactMarkdown>{localText}</ReactMarkdown>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}

