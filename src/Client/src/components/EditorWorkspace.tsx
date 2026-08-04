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
import { ViewPlugin, EditorView, Decoration, WidgetType } from "@codemirror/view";
import { Annotation, RangeSetBuilder } from "@codemirror/state";
import { syntaxHighlighting, HighlightStyle, syntaxTree } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

export const remoteUpdateAnnotation = Annotation.define<boolean>();

class LanguageLabelWidget extends WidgetType {
  constructor(readonly lang: string) { super(); }
  eq(other: LanguageLabelWidget) { return this.lang === other.lang; }
  toDOM() {
    const span = document.createElement("span");
    span.textContent = this.lang;
    span.className = "cm-codeblock-lang-label";
    return span;
  }
}

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

const customLinkClickPlugin = EditorView.domEventHandlers({
  click: (event, view) => {
    if (event.button !== 0) return false;
    const target = event.target as Element;
    const linkEl = target.closest(".cm-atomic-link");
    if (linkEl) {
      const pos = view.posAtDOM(linkEl);
      if (pos < 0) return false;
      
      const tree = syntaxTree(view.state);
      let node = tree.resolveInner(pos, 1);
      
      let visibleUrl = null;
      while (node && node.name !== "Link") {
        if (node.name === "URL") visibleUrl = node;
        if (!node.parent) break;
        node = node.parent;
      }
      
      let url = "";
      if (node && node.name === "Link") {
         node.cursor().iterate(n => {
           if (n.name === "URL") {
             url = view.state.doc.sliceString(n.from, n.to);
             return false;
           }
         });
      } else if (visibleUrl) {
         url = view.state.doc.sliceString(visibleUrl.from, visibleUrl.to);
      }
      
      if (url) {
        event.preventDefault();
        event.stopPropagation();
        window.open(url, "_blank", "noopener,noreferrer");
        return true; // Stop propagation to atomic-editor's handler
      }
    }
    return false;
  }
});

const codeBlockDecoration = Decoration.line({
  class: "cm-codeblock-line"
});
const codeBlockFirstDecoration = Decoration.line({
  class: "cm-codeblock-line cm-codeblock-first-line"
});
const codeBlockLastDecoration = Decoration.line({
  class: "cm-codeblock-line cm-codeblock-last-line"
});
const codeBlockSingleDecoration = Decoration.line({
  class: "cm-codeblock-line cm-codeblock-first-line cm-codeblock-last-line"
});

const codeBlockPlugin = ViewPlugin.fromClass(class {
  decorations: any;
  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }
  update(update: any) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }
  buildDecorations(view: EditorView) {
    const decos: any[] = [];
    for (const {from, to} of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from, to,
        enter: (node) => {
          if (node.name === "FencedCode" || node.name === "CodeBlock") {
            let lang = "";
            if (node.name === "FencedCode") {
              const cursor = node.node.cursor();
              if (cursor.firstChild()) {
                do {
                  if (cursor.name === "CodeInfo") {
                    lang = view.state.doc.sliceString(cursor.from, cursor.to);
                  }
                } while (cursor.nextSibling());
              }
            }

            const startLine = view.state.doc.lineAt(node.from);
            const endLine = view.state.doc.lineAt(node.to);
            for (let i = startLine.number; i <= endLine.number; i++) {
              const line = view.state.doc.line(i);
              let dec = codeBlockDecoration;
              const isFirst = i === startLine.number;
              const isLast = i === endLine.number;
              if (isFirst && isLast) dec = codeBlockSingleDecoration;
              else if (isFirst) dec = codeBlockFirstDecoration;
              else if (isLast) dec = codeBlockLastDecoration;
              
              decos.push(dec.range(line.from));
            }

            if (lang) {
              decos.push(Decoration.widget({
                widget: new LanguageLabelWidget(lang),
                side: 1
              }).range(startLine.from));
            }
          }
        }
      });
    }
    decos.sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      // startSide is negative for line decorations, so they will sort before widgets
      return (a.value.startSide ?? 0) - (b.value.startSide ?? 0);
    });
    return Decoration.set(decos);
  }
}, {
  decorations: v => v.decorations
});

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

  // Memoize all props passed to the editor to prevent the React wrapper
  // from re-configuring or re-mounting the editor on every keystroke render
  const customHighlight = useMemo(() => {
    return syntaxHighlighting(HighlightStyle.define([
      { tag: t.heading1, fontSize: "2.25em", fontWeight: "800", color: "#60a5fa" }, // blue-400
      { tag: t.heading2, fontSize: "1.75em", fontWeight: "700", color: "#34d399" }, // emerald-400
      { tag: t.heading3, fontSize: "1.5em", fontWeight: "600", color: "#f472b6" }, // pink-400
      { tag: t.heading4, fontSize: "1.25em", fontWeight: "600", color: "#fbbf24" }, // amber-400
      { tag: t.heading5, fontSize: "1.1em", fontWeight: "500", color: "#a78bfa" }, // violet-400
      { tag: t.heading6, fontSize: "1em", fontWeight: "500", color: "#f87171" }, // red-400
      { tag: [t.monospace, t.processingInstruction], backgroundColor: "#18181b", borderRadius: "4px", padding: "2px 4px", fontFamily: "var(--font-mono)", color: "#e4e4e7" },
      { tag: t.quote, color: "#a1a1aa", fontStyle: "italic", borderLeft: "3px solid #3f3f46", paddingLeft: "8px" }, // blockquotes
      { tag: t.link, color: "#38bdf8", textDecoration: "underline" }, // links (light blue)
      { tag: t.url, color: "#71717a", textDecoration: "underline", cursor: "pointer" }, // URLs (gray)
      { tag: t.meta, color: "#a1a1aa", fontWeight: "600", fontSize: "0.85em" }, // Code block language name
      { tag: t.strong, color: "#f4f4f5", fontWeight: "bold" }, // Bold text brighter
      { tag: t.emphasis, fontStyle: "italic", color: "#e4e4e7" },
      { tag: t.strikethrough, textDecoration: "line-through", color: "#71717a" },
      { tag: t.list, color: "#34d399" }, // Emerald list bullets
      { tag: t.contentSeparator, color: "#52525b", fontWeight: "bold" }, // Horizontal rules
    ]));
  }, []);

  const editorTheme = useMemo(() => {
    return EditorView.theme({
      // We keep some global overrides just in case, but styling monospace block backgrounds fully requires targeting the lines.
      // We will do that in CSS.
    });
  }, []);
  
  const editorExtensions = useMemo(() => [captureViewExtension, customHighlight, editorTheme, codeBlockPlugin, customLinkClickPlugin], [captureViewExtension, customHighlight, editorTheme]);
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

