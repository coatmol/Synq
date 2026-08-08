// @ts-nocheck
import {Decoration, EditorView, ViewPlugin, WidgetType} from "@codemirror/view";
import {syntaxHighlighting, HighlightStyle, syntaxTree} from "@codemirror/language";
import {tags as t} from "@lezer/highlight";
import {RangeSetBuilder, StateField, Transaction, Text, EditorSelection, Prec} from "@codemirror/state";
import {keymap} from "@codemirror/view";
import katex from "katex";
import "katex/dist/katex.min.css";
import {api} from "../api";
import {useDocumentStore, fetchDocumentImpl} from "../hooks/useDocumentHub";

// --- Link Click Handling ---
export const customLinkClickPlugin = EditorView.domEventHandlers({
  click: (event, view) => {
    if (event.button !== 0) return false;
    const target = event.target as Element;
    const linkEl = target.closest(".cm-atomic-link");
    const obsidianLinkEl = target.closest(".cm-obsidian-link");

    if (obsidianLinkEl) {
      const resolvedFilename = obsidianLinkEl.getAttribute("data-filename");
      if (resolvedFilename) {
        event.preventDefault();
        event.stopPropagation();
        useDocumentStore.getState().setActiveFile(resolvedFilename);
        fetchDocumentImpl();
        return true;
      }
    }

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
const codeBlockDecoration = Decoration.line({class: "cm-codeblock-line"});
const codeBlockFirstDecoration = Decoration.line({class: "cm-codeblock-line cm-codeblock-first-line"});
const codeBlockLastDecoration = Decoration.line({class: "cm-codeblock-line cm-codeblock-last-line"});
const codeBlockSingleDecoration = Decoration.line({class: "cm-codeblock-line cm-codeblock-first-line cm-codeblock-last-line"});
const headingDecos = {
  ATXHeading1: Decoration.line({class: "cm-heading1"}),
  ATXHeading2: Decoration.line({class: "cm-heading2"}),
  ATXHeading3: Decoration.line({class: "cm-heading3"}),
  ATXHeading4: Decoration.line({class: "cm-heading4"}),
  ATXHeading5: Decoration.line({class: "cm-heading5"}),
  ATXHeading6: Decoration.line({class: "cm-heading6"})
};

class LanguageLabelWidget extends WidgetType {
  constructor(readonly lang: string) {
    super();
  }

  eq(other: LanguageLabelWidget) {
    return this.lang === other.lang;
  }

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
    if (update.docChanged || update.viewportChanged) this.decorations = this.buildDecorations(update.view);
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
                  if (cursor.name === "CodeInfo") lang = view.state.doc.sliceString(cursor.from, cursor.to);
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
            if (lang) decos.push(Decoration.widget({
              widget: new LanguageLabelWidget(lang),
              side: 1
            }).range(startLine.from));
          } else if (node.name.startsWith("ATXHeading")) {
            const line = view.state.doc.lineAt(node.from);
            const deco = headingDecos[node.name as keyof typeof headingDecos];
            if (deco) decos.push(deco.range(line.from));
          }
        }
      });
    }
    decos.sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      return (a.value.startSide ?? 0) - (b.value.startSide ?? 0);
    });
    return Decoration.set(decos);
  }
}, {decorations: v => v.decorations});

// --- Syntax Highlighting ---
export const customHighlight = syntaxHighlighting(HighlightStyle.define([
  {tag: t.heading, color: "inherit"},
  {
    tag: [t.monospace, t.processingInstruction],
    backgroundColor: "#18181b",
    borderRadius: "4px",
    padding: "2px 4px",
    fontFamily: "var(--font-mono)",
    color: "#e4e4e7"
  },
  {tag: t.quote, color: "#a1a1aa", fontStyle: "italic", borderLeft: "3px solid #3f3f46", paddingLeft: "8px"},
  {tag: t.link, color: "#38bdf8", textDecoration: "underline"},
  {tag: t.url, color: "#71717a", textDecoration: "underline", cursor: "pointer"},
  {tag: t.meta, color: "#a1a1aa", fontWeight: "600", fontSize: "0.85em"},
  {tag: t.strong, color: "#f4f4f5", fontWeight: "bold"},
  {tag: t.emphasis, fontStyle: "italic", color: "#e4e4e7"},
  {tag: t.strikethrough, textDecoration: "line-through", color: "#71717a"},
  {tag: t.list, color: "#34d399"},
  {tag: t.contentSeparator, color: "#52525b", fontWeight: "bold"},
]));

// --- Obsidian Links & Excalidraw ---
class ExcalidrawWidget extends WidgetType {
  constructor(readonly filename: string, readonly pos: number) {
    super();
  }

  eq(other: ExcalidrawWidget) {
    return this.filename === other.filename && this.pos === other.pos;
  }

  toDOM(view: EditorView) {
    const container = document.createElement("span");
    container.className = "cm-excalidraw-widget cursor-pointer my-4 border border-zinc-700/50 rounded-lg overflow-hidden bg-[#121212] flex items-center justify-center p-4 select-none";
    container.style.display = "block";
    container.style.minHeight = "100px";
    container.contentEditable = "false";
    const loading = document.createElement("div");
    loading.className = "text-zinc-500 text-sm";
    loading.textContent = `Loading ${this.filename}...`;
    container.appendChild(loading);
    container.addEventListener("mousedown", (e) => {
      view.dispatch({selection: {anchor: this.pos}});
    });
    container.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      useDocumentStore.getState().setActiveFile(this.filename);
      fetchDocumentImpl();
    });
    api.getDocument(this.filename).then(async (text) => {
      if (!text) {
        loading.textContent = `File not found: ${this.filename}`;
        return;
      }
      try {
        const parsed = JSON.parse(text);
        const elements = Array.isArray(parsed) ? parsed : parsed.elements || [];
        const {exportToSvg} = await import("@excalidraw/excalidraw");
        const svg = await exportToSvg({
          elements,
          appState: {exportBackground: false, exportWithDarkMode: true},
          files: null
        });
        svg.style.maxWidth = "100%";
        svg.style.height = "auto";
        svg.style.maxHeight = "500px";
        container.innerHTML = "";
        container.appendChild(svg);
      } catch (err) {
        container.innerHTML = `<div class="text-red-500 text-sm">Failed to render ${this.filename}</div>`;
      }
    });
    return container;
  }
}

export const obsidianLinkPlugin = StateField.define<any>({
  create(state) {
    return buildObsidianDecorations(state.doc, state.selection.main);
  },
  update(value, tr: Transaction) {
    if (tr.docChanged || tr.selection) return buildObsidianDecorations(tr.state.doc, tr.state.selection.main);
    return value;
  },
  provide: f => [EditorView.decorations.from(f), EditorView.atomicRanges.from(f)]
});

function buildObsidianDecorations(doc: Text, selection: any) {
  const text = doc.toString();
  const builder = new RangeSetBuilder<Decoration>();
  if (text.indexOf('[[') === -1) return builder.finish();
  const linkRegex = /\[\[(.*?)\]\]/g;
  const matches = [];
  let match;

  const currentActive = useDocumentStore.getState().activeFile;

  while ((match = linkRegex.exec(text)) !== null) {
    let filename = match[1];
    if (!filename.includes('.')) filename += '.md';
    if (currentActive && currentActive.includes('/') && !filename.includes('/')) {
      const dir = currentActive.substring(0, currentActive.lastIndexOf('/'));
      filename = `${dir}/${filename}`;
    }

    matches.push({start: match.index, end: match.index + match[0].length, filename});
  }

  for (const m of matches) {
    const hasCursor = selection.from <= m.end && selection.to >= m.start;
    if (m.filename.endsWith(".excalidraw")) {
      if (!hasCursor) {
        builder.add(m.start, m.end, Decoration.replace({
          widget: new ExcalidrawWidget(m.filename, m.start),
          inclusive: false
        }));
      } else {
        builder.add(m.start, m.end, Decoration.mark({
          class: "cm-obsidian-link bg-purple-900/40 text-purple-300 rounded px-1",
          attributes: {"data-filename": m.filename}
        }));
      }
    } else {
      builder.add(m.start, m.end, Decoration.mark({
        class: "cm-obsidian-link text-blue-400 hover:underline cursor-pointer transition-colors hover:text-blue-300",
        attributes: {"data-filename": m.filename}
      }));
    }
  }
  return builder.finish();
}

// --- LaTeX rendering ---
class MathWidget extends WidgetType {
  constructor(readonly math: string, readonly block: boolean, readonly pos: number) {
    super();
  }

  eq(other: MathWidget) {
    return this.math === other.math && this.block === other.block && this.pos === other.pos;
  }

  toDOM(view: EditorView) {
    const container = document.createElement(this.block ? "div" : "span");
    container.className = "cm-math-widget cursor-text";
    if (this.block) {
      container.style.display = "block";
      container.style.width = "100%";
      container.style.padding = "1rem 0";
    } else {
      container.style.display = "inline-block";
    }
    container.addEventListener("mousedown", (e) => {
      view.dispatch({selection: {anchor: this.pos}});
    });
    try {
      katex.render(this.math, container, {displayMode: this.block, throwOnError: false});
      if (!this.block) {
        const displayEl = container.querySelector(".katex-display") as HTMLElement;
        if (displayEl) displayEl.style.display = "inline-block";
      }
    } catch (err) {
      container.textContent = this.math;
      container.className += " cm-math-error text-red-500";
    }
    return container;
  }
}

export const latexPlugin = StateField.define<any>({
  create(state) {
    return buildMathDecorations(state.doc, state.selection.main);
  },
  update(value, tr: Transaction) {
    if (tr.docChanged || tr.selection) return buildMathDecorations(tr.state.doc, tr.state.selection.main);
    return value;
  },
  provide: f => [EditorView.decorations.from(f), EditorView.atomicRanges.from(f)]
});

function buildMathDecorations(doc: Text, selection: any) {
  const text = doc.toString();
  const builder = new RangeSetBuilder<Decoration>();
  const blockRegex = /\$\$([\s\S]*?)\$\$/g;
  const inlineRegex = /(?<!\$)\$([^$\n]+?)\$(?!\$)/g;
  const matches: { start: number, end: number, math: string, block: boolean }[] = [];
  let match;
  while ((match = blockRegex.exec(text)) !== null) {
    matches.push({start: match.index, end: match.index + match[0].length, math: match[1], block: true});
  }
  while ((match = inlineRegex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    const overlap = matches.some(m => start < m.end && end > m.start);
    if (!overlap) matches.push({start, end, math: match[1], block: false});
  }
  matches.sort((a, b) => a.start - b.start);
  for (const m of matches) {
    let start = m.start;
    let end = m.end;
    if (m.block) {
      start = doc.lineAt(m.start).from;
      end = doc.lineAt(m.end).to;
    }
    const hasCursor = selection.from <= end && selection.to >= start;
    if (!hasCursor) {
      if (m.block) builder.add(start, end, Decoration.replace({
        widget: new MathWidget(m.math, true, m.start),
        block: true
      }));
      else builder.add(start, end, Decoration.replace({
        widget: new MathWidget(m.math, false, m.start),
        inclusive: false
      }));
    } else {
      builder.add(m.start, m.end, Decoration.mark({class: "bg-zinc-800/40 text-emerald-400/90 rounded px-1"}));
    }
  }
  return builder.finish();
}

const customVerticalMove = (forward: boolean, extend: boolean) => (view: EditorView) => {
  const distance = view.defaultLineHeight;
  const movedSelection = view.moveVertically(view.state.selection, forward, distance);
  if (movedSelection.eq(view.state.selection)) return false;
  let finalSelection = movedSelection;
  if (extend) {
    finalSelection = EditorSelection.create(
      view.state.selection.ranges.map((r, i) => {
        return EditorSelection.range(r.anchor, movedSelection.ranges[i].head);
      }),
      movedSelection.mainIndex
    );
  }
  view.dispatch({
    selection: finalSelection,
    scrollIntoView: true,
    userEvent: "keyboard.selection"
  });
  return true;
};

export const verticalNavFix = Prec.highest(
  keymap.of([
    {key: "ArrowUp", run: customVerticalMove(false, false), shift: customVerticalMove(false, true)},
    {key: "ArrowDown", run: customVerticalMove(true, false), shift: customVerticalMove(true, true)}
  ])
);