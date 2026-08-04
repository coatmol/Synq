// @ts-nocheck
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle, syntaxTree } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

// --- Link Click Handling ---
export const customLinkClickPlugin = EditorView.domEventHandlers({
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

// --- Code Block Styling ---
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

export const codeBlockPlugin = ViewPlugin.fromClass(class {
  declare decorations: any;
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

// --- Syntax Highlighting ---
export const customHighlight = syntaxHighlighting(HighlightStyle.define([
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
