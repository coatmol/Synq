// @ts-nocheck
import { useCallback, useEffect, useRef, useState } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import { useDocumentHub, useDocumentStore } from "../hooks/useDocumentHub";
import DiffMatchPatch from "diff-match-patch";

export function EditorWorkspace() {
  const { text: remoteText, setText } = useDocumentStore();
  const { insertText, deleteText } = useDocumentHub();
  const [localText, setLocalText] = useState(remoteText);
  const cmRef = useRef<any>(null);
  
  const dmp = new DiffMatchPatch();

  // Sync from Remote
  useEffect(() => {
    if (remoteText !== localText) {
      const view = cmRef.current?.view;
      if (view) {
        const cursor = view.state.selection.main.head;
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

        setTimeout(() => {
          if (cmRef.current?.view) {
            cmRef.current.view.dispatch({
              selection: { anchor: newCursor, head: newCursor }
            });
          }
        }, 10);
      } else {
        setLocalText(remoteText);
      }
    }
  }, [remoteText]);

  // Queue for debouncing/batching
  const queueRef = useRef<{type: 'insert'|'delete', index: number, text?: string, length?: number}[]>([]);
  const timeoutRef = useRef<any>(null);

  const processQueue = () => {
    const queue = [...queueRef.current];
    queueRef.current = [];
    queue.forEach(op => {
      if (op.type === 'insert') {
        insertText(op.index, op.text!);
      } else {
        deleteText(op.index, op.length!);
      }
    });
  };

  const handleChange = useCallback((val: string, viewUpdate: any) => {
    if (viewUpdate.transactions.some((tr: any) => 
      tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('undo') || tr.isUserEvent('paste') || tr.isUserEvent('cut')
    )) {
      setLocalText(val);
      setText(val);

      viewUpdate.changes.iterChanges((fromA: number, toA: number, fromB: number, toB: number, inserted: any) => {
        if (toA > fromA) {
          queueRef.current.push({ type: 'delete', index: fromA, length: toA - fromA });
        }
        if (toB > fromB) {
          queueRef.current.push({ type: 'insert', index: fromA, text: inserted.toString() });
        }
      });

      processQueue();
    }
  }, [insertText, deleteText, setText]);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden relative bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950">
        
        {/* Raw Markdown Input */}
        <Panel defaultSize="50" minSize="20" className="relative group flex flex-col h-full">
          <div className="absolute top-4 right-6 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none transition-colors z-10">Markdown</div>
          <div className="flex-1 overflow-hidden custom-scrollbar bg-transparent">
            <CodeMirror
              ref={cmRef}
              value={localText}
              onChange={handleChange}
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
            <ReactMarkdown>{localText}</ReactMarkdown>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
