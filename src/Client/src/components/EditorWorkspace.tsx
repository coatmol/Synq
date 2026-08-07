// @ts-nocheck
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Spinner } from "@heroui/react";
import { useBufferedInput } from "../hooks/useBufferedInput";
import { useDocumentStore } from "../hooks/useDocumentHub";
import DiffMatchPatch from "diff-match-patch";
import { AtomicCodeMirrorEditor } from "@atomic-editor/editor";
import type { AtomicCodeMirrorEditorHandle } from "@atomic-editor/editor";
import { ATOMIC_CODE_LANGUAGES } from "@atomic-editor/editor/code-languages";
import { ViewPlugin, EditorView } from "@codemirror/view";
import { Annotation } from "@codemirror/state";

export const remoteUpdateAnnotation = Annotation.define<boolean>();

import { customLinkClickPlugin, codeBlockPlugin, customHighlight, latexPlugin } from "./EditorExtensions";

export function EditorWorkspace() {
  const { text: remoteText, setDocumentStats, isLoading, activeFile } = useDocumentStore();
  const { localText, setLocalText, remoteUpdateText, queueInsert, queueDelete } = useBufferedInput();
  
  const textareaRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialMarkdown = useMemo(() => localText, [activeFile]);

  const updateStats = useCallback((text: string, cursorIndex: number) => {
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    
    const textUpToCursor = text.substring(0, cursorIndex);
    const line = textUpToCursor.split('\n').length;
    const col = textUpToCursor.length - textUpToCursor.lastIndexOf('\n');

    setDocumentStats({ words, chars, line, col });
  }, [setDocumentStats]);

  const captureViewExtension = useMemo(() => {
    return ViewPlugin.define((view) => {
      setEditorView(view);
      return {
        update(update) {
           if (update.selectionSet || update.docChanged) {
             updateStats(view.state.doc.toString(), view.state.selection.main.head);
           }
           
           if (update.docChanged) {
             const isRemote = update.transactions.some(tr => tr.annotation(remoteUpdateAnnotation));
             if (!isRemote) {
               const changes: { type: 'insert' | 'delete', index: number, text?: string, length?: number }[] = [];
               
               update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                 if (inserted.length > 0) {
                   changes.push({ type: 'insert', index: fromA, text: inserted.toString() });
                 }
                 if (toA > fromA) {
                   changes.push({ type: 'delete', index: fromA, length: toA - fromA });
                 }
               });

               // Process changes in reverse so string indices don't shift for earlier changes
               for (let i = changes.length - 1; i >= 0; i--) {
                 const c = changes[i];
                 if (c.type === 'delete') queueDelete(c.index, c.length!);
                 if (c.type === 'insert') queueInsert(c.index, c.text!);
               }
             }
           }
        }
      };
    });
  }, [updateStats, queueDelete, queueInsert]);

  const lastAppliedRemoteVersion = useRef(0);

  const dmp = useMemo(() => new DiffMatchPatch(), []);

  // Handle remote updates via DMP to avoid losing cursor
  useEffect(() => {
    if (!editorView || !remoteUpdateText) return;
    
    if (remoteUpdateText.version !== lastAppliedRemoteVersion.current) {
      lastAppliedRemoteVersion.current = remoteUpdateText.version;
      
      const currentCodeMirrorText = editorView.state.doc.toString();
      if (remoteUpdateText.text !== currentCodeMirrorText) {
        
        const diffs = dmp.diff_main(currentCodeMirrorText, remoteUpdateText.text);
        dmp.diff_cleanupSemantic(diffs);

        let currentIndex = 0;
        const changes = [];

        for (const [op, text] of diffs) {
          if (op === -1) { // Delete
            changes.push({ from: currentIndex, to: currentIndex + text.length });
            currentIndex += text.length;
          } else if (op === 1) { // Insert
            changes.push({ from: currentIndex, insert: text });
          } else { // Equal
            currentIndex += text.length;
          }
        }

        // Apply changes sequentially to CodeMirror
        editorView.dispatch({ 
          changes,
          annotations: [remoteUpdateAnnotation.of(true)]
        });
      }
    }
  }, [remoteUpdateText, editorView, dmp]);

  const handleChange = useCallback((newVal: string) => {
    // We intentionally DO NOT update any React state here.
    // CodeMirror is fully uncontrolled and handles its own state.
    // Our ViewPlugin captures all edits natively.
  }, []);

  // Initial stats calculation
  useEffect(() => {
    if (editorView) {
      updateStats(localText, editorView.state.selection.main.head);
    } else {
      updateStats(localText, 0);
    }
  }, [editorView]);

  const editorTheme = useMemo(() => {
    return EditorView.theme({
      // We keep some global overrides just in case, but styling monospace block backgrounds fully requires targeting the lines.
      // We will do that in CSS.
    });
  }, []);
  
  const editorExtensions = useMemo(() => [captureViewExtension, customHighlight, editorTheme, codeBlockPlugin, customLinkClickPlugin, latexPlugin], [captureViewExtension, customHighlight, editorTheme]);
  const handleLinkClick = useCallback((url: string) => window.open(url, "_blank"), []);

  return (
    <div className="flex flex-col h-full w-full bg-zinc-950">
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Spinner color="success" size="lg" />
          <p className="text-zinc-500 mt-4 text-sm font-medium">Loading Document...</p>
        </div>
      ) : (
        <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden relative bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-zinc-900/40 via-zinc-950 to-zinc-950">
          
          {/* Markdown editor & live preview */}
        <Panel defaultSize={100} minSize={20} className="relative group flex flex-col h-full">
          <div className="absolute top-4 right-6 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none transition-colors z-10">Markdown</div>
          <div className="flex-1 overflow-y-auto custom-scrollbar bg-transparent p-6">
            <AtomicCodeMirrorEditor
                editorHandleRef={textareaRef}
                documentId={activeFile ?? undefined}
                markdownSource={initialMarkdown}
                onMarkdownChange={handleChange}
                codeLanguages={ATOMIC_CODE_LANGUAGES}
                extensions={editorExtensions}
                onLinkClick={handleLinkClick}
                className="w-full h-full"
            />
          </div>
        </Panel>
      </PanelGroup>
      )}
    </div>
  );
}

