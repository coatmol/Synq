// @ts-nocheck
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { syntaxHighlighting, HighlightStyle, syntaxTree } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import { RangeSetBuilder, StateField, Transaction } from "@codemirror/state";
import katex from "katex";
import "katex/dist/katex.min.css";

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

// --- LaTeX rendering ---
class MathWidget extends WidgetType {
  constructor(readonly math: string, readonly block: boolean, readonly pos: number) {
    super();
  }

  eq(other: MathWidget) {
    return this.math === other.math && this.block === other.block && this.pos === other.pos;
  }

  toDOM(view: EditorView) {
    const span = document.createElement("span");
    span.className = "cm-math-widget cursor-text";
    
    if (this.block) {
      span.style.display = "inline-block";
      span.style.width = "100%";
    }

    span.addEventListener("mousedown", (e) => {
      view.dispatch({ selection: { anchor: this.pos } });
    });

    try {
      katex.render(this.math, span, {
        displayMode: this.block,
        throwOnError: false,
      });
      
      // CRITICAL: CodeMirror inline replacements break if they contain `display: block` elements.
      // KaTeX displayMode creates a .katex-display element with display: block.
      // We must override it to inline-block to prevent CodeMirror layout crashes.
      if (this.block) {
        const displayEl = span.querySelector(".katex-display") as HTMLElement;
        if (displayEl) {
          displayEl.style.display = "inline-block";
          displayEl.style.width = "100%";
          displayEl.style.margin = "1rem 0";
          displayEl.style.textAlign = "center";
        }
      }
    } catch (err) {
      span.textContent = this.math;
      span.className += " cm-math-error text-red-500";
    }
    return span;
  }
}

export const latexPlugin = StateField.define<any>({
  create(state) {
    return buildMathDecorations(state.doc.toString(), state.selection.main);
  },
  update(value, tr: Transaction) {
    if (tr.docChanged || tr.selection) {
      return buildMathDecorations(tr.state.doc.toString(), tr.state.selection.main);
    }
    return value;
  },
  provide: f => EditorView.decorations.from(f)
});

function buildMathDecorations(text: string, selection: any) {
  const builder = new RangeSetBuilder<Decoration>();
  
  // We iterate over the entire document to ensure multi-line blocks are properly detected. 
  // For extreme performance on huge documents, this would be optimized to limit processing.
  
  const blockRegex = /\$\$([\s\S]*?)\$\$/g;
  const inlineRegex = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;

  const matches: { start: number, end: number, math: string, block: boolean }[] = [];

  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      math: match[1],
      block: true
    });
  }

  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const overlap = matches.some(m => start < m.end && end > m.start);
    if (!overlap) {
      matches.push({
        start,
        end,
        math: match[1],
        block: false
      });
    }
  }

  matches.sort((a, b) => a.start - b.start);

  for (const m of matches) {
    // Allow editing if cursor is inside or adjacent to the math block boundaries
    const hasCursor = selection.from >= m.start && selection.to <= m.end;
    
    if (!hasCursor) {
      builder.add(m.start, m.end, Decoration.replace({
        widget: new MathWidget(m.math, m.block, m.start),
        inclusive: false
      }));
    } else {
      builder.add(m.start, m.end, Decoration.mark({ class: "bg-zinc-800/40 text-emerald-400/90 rounded px-1" }));
    }
  }

  return builder.finish();
}
