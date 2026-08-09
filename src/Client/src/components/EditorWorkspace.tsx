// @ts-nocheck
import {useCallback, useEffect, useRef, useState, useMemo} from "react";
import {Group as PanelGroup, Panel, Separator as PanelResizeHandle} from "react-resizable-panels";
import {Spinner} from "@heroui/react";
import {useBufferedInput} from "../hooks/useBufferedInput";
import {useDocumentHub, useDocumentStore} from "../hooks/useDocumentHub";
import DiffMatchPatch from "diff-match-patch";
import {AtomicCodeMirrorEditor} from "@atomic-editor/editor";
import type {AtomicCodeMirrorEditorHandle} from "@atomic-editor/editor";
import {ATOMIC_CODE_LANGUAGES} from "@atomic-editor/editor/code-languages";
import {ViewPlugin, EditorView} from "@codemirror/view";
import {Annotation} from "@codemirror/state";

export const remoteUpdateAnnotation = Annotation.define<boolean>();

import {
  customLinkClickPlugin,
  codeBlockPlugin,
  customHighlight,
  latexPlugin,
  verticalNavFix,
  obsidianLinkPlugin
} from "./EditorExtensions";
import {Excalidraw} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import {api} from "../api.ts";

export function EditorWorkspace() {
  const {text: remoteText, setDocumentStats, isLoading, activeFile, activeFileType} = useDocumentStore();
  const {localText, setLocalText, remoteUpdateText, queueInsert, queueDelete} = useBufferedInput();
  const {updateFile} = useDocumentHub();

  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const lastExcalidrawJson = useRef("[]");
  const excalidrawDebounce = useRef<NodeJS.Timeout | null>(null);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const textareaRef = useRef<AtomicCodeMirrorEditorHandle | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [loadedFile, setLoadedFile] = useState<string | null>(null);
  const [initialMarkdown, setInitialMarkdown] = useState('');

  useEffect(() => {
    if (!isLoading && activeFile && loadedFile !== activeFile) {
      setInitialMarkdown(remoteText);
      setLoadedFile(activeFile);
      lastExcalidrawJson.current = "[]";
      setExcalidrawAPI(null);
    }
  }, [activeFile, isLoading, remoteText, loadedFile]);

  const excalidrawInitialData = useMemo(() => {
    if (!initialMarkdown) return {elements: []};
    try {
      const parsed = JSON.parse(initialMarkdown);
      const elements = Array.isArray(parsed) ? parsed : parsed.elements || [];
      lastExcalidrawJson.current = JSON.stringify(elements, null, 2);
      return {elements};
    } catch (e) {
      return {elements: []};
    }
  }, [initialMarkdown]);

  useEffect(() => {
    if (!excalidrawAPI || !remoteUpdateText || activeFileType !== 'excalidraw') return;

    if (remoteUpdateText.text !== lastExcalidrawJson.current) {
      try {
        const parsed = JSON.parse(remoteUpdateText.text);
        const elements = Array.isArray(parsed) ? parsed : parsed.elements || [];
        excalidrawAPI.updateScene({elements});
        // Fetch back the elements directly from Excalidraw after it normalizes them, 
        // to prevent the subsequent onChange from detecting a false difference.
        const newElements = excalidrawAPI.getSceneElements();
        lastExcalidrawJson.current = JSON.stringify(newElements, null, 2);
      } catch (e) {
        console.error("Failed to parse remote Excalidraw update", e);
      }
    }
  }, [remoteUpdateText, excalidrawAPI, activeFileType]);

  const updateStats = useCallback((text: string, cursorIndex: number) => {
    const chars = text.length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;

    const textUpToCursor = text.substring(0, cursorIndex);
    const line = textUpToCursor.split('\n').length;
    const col = textUpToCursor.length - textUpToCursor.lastIndexOf('\n');

    setDocumentStats({words, chars, line, col});
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
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            const file = activeFile;
            debounceTimer.current = setTimeout(async () => {
              await api.commitFile(file);
            }, 5000);

            const isRemote = update.transactions.some(tr => tr.annotation(remoteUpdateAnnotation));
            if (!isRemote) {
              const changes: {
                type: 'insert' | 'delete',
                index: number,
                text?: string,
                length?: number
              }[] = [];

              update.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
                if (inserted.length > 0) {
                  changes.push({type: 'insert', index: fromA, text: inserted.toString()});
                }
                if (toA > fromA) {
                  changes.push({type: 'delete', index: fromA, length: toA - fromA});
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
            changes.push({from: currentIndex, to: currentIndex + text.length});
            currentIndex += text.length;
          } else if (op === 1) { // Insert
            changes.push({from: currentIndex, insert: text});
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
      // Headings are styled at the line level to prevent vertical cursor movement bugs when line wrapping is enabled.
      ".cm-heading1": {fontSize: "2.25em", fontWeight: "800", color: "#60a5fa"},
      ".cm-heading2": {fontSize: "1.75em", fontWeight: "700", color: "#34d399"},
      ".cm-heading3": {fontSize: "1.5em", fontWeight: "600", color: "#f472b6"},
      ".cm-heading4": {fontSize: "1.25em", fontWeight: "600", color: "#fbbf24"},
      ".cm-heading5": {fontSize: "1.1em", fontWeight: "500", color: "#a78bfa"},
      ".cm-heading6": {fontSize: "1em", fontWeight: "500", color: "#f87171"},
    });
  }, []);

  const editorExtensions = useMemo(() => [captureViewExtension, customHighlight, editorTheme, codeBlockPlugin, customLinkClickPlugin, latexPlugin, verticalNavFix, obsidianLinkPlugin], [captureViewExtension, customHighlight, editorTheme, codeBlockPlugin, customLinkClickPlugin, latexPlugin, verticalNavFix, obsidianLinkPlugin]);
  const handleLinkClick = useCallback((url: string) => window.open(url, "_blank"), []);

  return (
    <div className="flex-col h-full w-full bg-[#1e1e1e] flex">
      {isLoading || loadedFile !== activeFile ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <Spinner color="secondary" size="lg"/>
          <p className="text-zinc-500 mt-4 text-sm font-medium">Loading Document...</p>
        </div>
      ) : (
        <PanelGroup direction="horizontal" className="flex-1 w-full overflow-hidden relative bg-[#1e1e1e]">

          {/* Markdown editor & live preview */}
          <Panel defaultSize={100} minSize={20} className="relative group flex flex-col h-full">
            {activeFileType == "markdown" ? (
              <>
                <div
                  className="absolute top-4 right-6 text-[10px] font-bold text-zinc-700 uppercase tracking-widest pointer-events-none transition-colors z-10">Markdown
                </div>
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
              </>
            ) : (
              <div className="flex-1 w-full h-full relative">
                <Excalidraw
                  excalidrawAPI={(api) => setExcalidrawAPI(api)}
                  initialData={excalidrawInitialData}
                  theme={"dark"}
                  name={activeFile ?? "Untitled"}
                  gridModeEnabled={true}
                  onChange={(elements) => {
                    if (excalidrawDebounce.current) clearTimeout(excalidrawDebounce.current);
                    excalidrawDebounce.current = setTimeout(() => {
                      const newJson = JSON.stringify(elements, null, 2);
                      if (newJson !== lastExcalidrawJson.current) {
                        updateFile(newJson);
                        lastExcalidrawJson.current = newJson;
                      }
                    }, 500);
                  }}
                />
              </div>
            )}
          </Panel>
        </PanelGroup>
      )}
    </div>
  );
}

