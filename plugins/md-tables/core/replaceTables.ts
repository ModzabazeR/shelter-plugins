/*
 * DOM-replacement logic for md-tables.
 *
 * Detection works off the RENDERED message DOM, not the raw `message.content`
 * string. That is the load-bearing correction: Discord renders inline markdown
 * inside table cells (e.g. `**bold**` becomes a `<strong>`), so the raw content
 * string does not match the rendered text, and a message's lines are split across
 * `<span>`/`<strong>`/... siblings with the "\n"s living inside those spans. We
 * reconstruct each inline run's rendered text, detect GFM tables in it, and carve the
 * table's exact character span out of the DOM with a `Range` — which transparently
 * splits nested Text nodes and partially-selected element ancestors.
 *
 * Cell content is preserved with formatting: the carved-out fragment is tokenized by
 * `|` / `\n`, and each cell's rendered nodes (text, `<strong>`, `<code>`, mention/emoji
 * spans, links, ...) are CLONED into the table cell. Cloning (not moving) leaves the
 * pristine originals available for restore.
 *
 * The replacement is NON-DESTRUCTIVE: the carved-out originals are stashed in a hidden
 * `<span class="mdt-src">` holder placed where the table now sits, and
 * `restoreReplacedTables()` puts them back exactly (removing the inserted table and
 * unwrapping the holder) so `onUnload` never leaves a blank gap.
 *
 * This module is pure DOM: it never touches the `shelter` global.
 *
 * Known limitations: a cloned interactive node (e.g. a mention) renders styled but is
 * not clickable; a literal `|` inside an inline element (e.g. `**a|b**`) or an escaped
 * `\|` is indistinguishable from a real delimiter once rendered, so it splits a cell.
 */

import { type Align, parseTables, type TableBlock } from "./parseTables";

const BLOCK_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "P", "DIV", "BLOCKQUOTE", "PRE", "HR",
  "TABLE", "ASIDE", "SECTION", "ARTICLE", "FIGURE",
]);

const MDT_INSERTED_ATTR = "data-mdt-inserted";
const MDT_INSERTED_SELECTOR = `[${MDT_INSERTED_ATTR}], .mdt-wrap`;
const MDT_SRC_CLASS = "mdt-src";
const DELIM_CELL = /^:?-+:?$/;

function isBlock(n: Node): boolean {
  return n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(n.nodeName);
}

// ---- run text reconstruction + char->node mapping ------------------------------

interface TextSeg {
  node: Text;
  start: number;
  len: number;
}

function buildRunText(run: Node[]): { text: string; segs: TextSeg[] } {
  let text = "";
  const segs: TextSeg[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text;
      segs.push({ node: t, start: text.length, len: t.data.length });
      text += t.data;
    } else if (node.nodeName === "BR") {
      text += "\n";
    } else {
      for (const child of Array.from(node.childNodes)) visit(child);
    }
  };
  for (const n of run) visit(n);
  return { text, segs };
}

function locate(segs: TextSeg[], char: number): { node: Text; offset: number } | null {
  for (const s of segs) {
    if (char >= s.start && char < s.start + s.len) {
      return { node: s.node, offset: char - s.start };
    }
  }
  let best: TextSeg | undefined;
  for (const s of segs) {
    if (s.start <= char && char <= s.start + s.len) best = s;
  }
  return best ? { node: best.node, offset: char - best.start } : null;
}

function blockCharRange(runLines: string[], block: TableBlock): [number, number] {
  let start = 0;
  for (let i = 0; i < block.startLine; i++) start += runLines[i].length + 1;
  let end = start;
  for (let i = block.startLine; i <= block.endLine; i++) {
    end += runLines[i].length;
    if (i < block.endLine) end += 1;
  }
  return [start, end];
}

// ---- fragment -> table, preserving cell formatting -----------------------------

// A SPAN is a transparent text-run wrapper (descend into it) when it carries table
// delimiter characters; a class-bearing span with none (a mention/emoji/spoiler) is
// preserved atomically so its styling clones intact.
function isTransparentWrapper(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE || node.nodeName !== "SPAN") return false;
  const el = node as HTMLElement;
  if (el.className === "") return true;
  const t = el.textContent ?? "";
  return t.includes("|") || t.includes("\n");
}

type Tok =
  | { k: "text"; text: string }
  | { k: "el"; node: Node }
  | { k: "cell" }
  | { k: "row" };

function tokenize(frag: DocumentFragment): Tok[] {
  const toks: Tok[] = [];
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        let buf = "";
        const flush = () => {
          if (buf) {
            toks.push({ k: "text", text: buf });
            buf = "";
          }
        };
        for (const ch of (child as Text).data) {
          if (ch === "|") {
            flush();
            toks.push({ k: "cell" });
          } else if (ch === "\n") {
            flush();
            toks.push({ k: "row" });
          } else {
            buf += ch;
          }
        }
        flush();
      } else if (child.nodeName === "BR") {
        toks.push({ k: "row" });
      } else if (isTransparentWrapper(child)) {
        visit(child);
      } else {
        toks.push({ k: "el", node: child });
      }
    }
  };
  visit(frag);
  return toks;
}

// Group tokens into rows -> cells -> cloned nodes.
function tokensToRows(toks: Tok[], doc: Document): Node[][][] {
  const rows: Node[][][] = [];
  let row: Node[][] = [];
  let cell: Node[] = [];
  const endCell = () => {
    row.push(cell);
    cell = [];
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (const t of toks) {
    if (t.k === "cell") endCell();
    else if (t.k === "row") endRow();
    else if (t.k === "text") cell.push(doc.createTextNode(t.text));
    else cell.push(t.node.cloneNode(true));
  }
  // Emit the final row only if it holds anything (the carved range has no trailing "\n").
  if (cell.length || row.some((c) => c.length)) endRow();
  return rows;
}

function isWs(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && /^\s*$/.test((node as Text).data);
}

// Trim whitespace at a cell's edges (drop ws-only edge nodes, trim the first/last text).
function trimCell(nodes: Node[]): Node[] {
  const out = nodes.slice();
  while (out.length && isWs(out[0])) out.shift();
  while (out.length && isWs(out[out.length - 1])) out.pop();
  if (out.length && out[0].nodeType === Node.TEXT_NODE) {
    (out[0] as Text).data = (out[0] as Text).data.replace(/^\s+/, "");
  }
  const last = out[out.length - 1];
  if (out.length && last.nodeType === Node.TEXT_NODE) {
    (last as Text).data = (last as Text).data.replace(/\s+$/, "");
  }
  return out;
}

function cellText(nodes: Node[]): string {
  return nodes.map((n) => n.textContent ?? "").join("").trim();
}

// Drop the outer empty cells produced by leading/trailing pipes, then trim each cell.
function normalizeRow(cells: Node[][]): Node[][] {
  const trimmed = cells.map(trimCell);
  if (trimmed.length && cellText(trimmed[0]).length === 0) trimmed.shift();
  if (trimmed.length && cellText(trimmed[trimmed.length - 1]).length === 0) trimmed.pop();
  return trimmed;
}

function alignsFromRow(cells: Node[][]): Align[] {
  return cells.map((nodes) => {
    const s = cellText(nodes);
    const l = s.startsWith(":");
    const r = s.endsWith(":");
    return l && r ? "center" : r ? "right" : l ? "left" : null;
  });
}

function fit<T>(arr: T[], n: number, empty: () => T): T[] {
  const out = arr.slice(0, n);
  while (out.length < n) out.push(empty());
  return out;
}

function applyAlign(el: HTMLElement, a: Align): void {
  if (a) el.style.textAlign = a;
}

// Build the styled <table> from the carved fragment. Returns null if the fragment
// doesn't actually resolve to a header + delimiter + body (defensive; parseTables
// already vetted the run, but the tokenized view must agree).
function buildTable(frag: DocumentFragment, doc: Document): HTMLElement | null {
  const rawRows = tokensToRows(tokenize(frag), doc).map(normalizeRow);
  // Locate the delimiter row (cells all `:?-+:?`).
  const d = rawRows.findIndex(
    (cells) => cells.length > 0 && cells.every((c) => DELIM_CELL.test(cellText(c))),
  );
  if (d < 1) return null;
  const header = rawRows[d - 1];
  const aligns = alignsFromRow(rawRows[d]);
  const ncol = aligns.length;
  const body = rawRows.slice(d + 1);

  const wrap = doc.createElement("div");
  wrap.className = "mdt-wrap";
  const table = doc.createElement("table");
  table.className = "mdt-table";

  const thead = doc.createElement("thead");
  const htr = doc.createElement("tr");
  fit(header, ncol, () => [] as Node[]).forEach((nodes, c) => {
    const th = doc.createElement("th");
    applyAlign(th, aligns[c]);
    th.append(...nodes);
    htr.append(th);
  });
  thead.append(htr);
  table.append(thead);

  const tbody = doc.createElement("tbody");
  for (const rowCells of body) {
    const tr = doc.createElement("tr");
    fit(rowCells, ncol, () => [] as Node[]).forEach((nodes, c) => {
      const td = doc.createElement("td");
      applyAlign(td, aligns[c]);
      td.append(...nodes);
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

// ---- public API ----------------------------------------------------------------

/**
 * Detect every GFM table in `contentEl`'s rendered content and replace each in place
 * with a styled `<table>` whose cells preserve Discord's own rendered formatting.
 * Each table's exact character span is carved out with a Range, stashed in a hidden
 * `.mdt-src` holder (so `restoreReplacedTables` can bring it back), and the table
 * inserted where it was. Returns the number of tables rendered; 0 leaves `contentEl`
 * untouched.
 */
export function renderTablesInContent(contentEl: HTMLElement): number {
  const doc = contentEl.ownerDocument ?? document;

  const runs: Node[][] = [];
  let cur: Node[] = [];
  for (const child of Array.from(contentEl.childNodes)) {
    if (isBlock(child)) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else {
      cur.push(child);
    }
  }
  if (cur.length) runs.push(cur);

  let count = 0;
  for (const run of runs) {
    const { text, segs } = buildRunText(run);
    if (!text.includes("|")) continue;

    const blocks = parseTables(text);
    if (!blocks.length) continue;

    const runLines = text.split("\n");
    for (const block of [...blocks].reverse()) {
      const [sc, ec] = blockCharRange(runLines, block);
      const startPos = locate(segs, sc);
      const endPos = locate(segs, ec);
      if (!startPos || !endPos) continue;

      const range = doc.createRange();
      try {
        range.setStart(startPos.node, startPos.offset);
        range.setEnd(endPos.node, endPos.offset);
      } catch {
        continue;
      }

      const frag = range.extractContents();
      const table = buildTable(frag, doc);
      if (!table) {
        // Couldn't resolve the fragment into a table — put the carved nodes back and
        // skip, leaving the message intact rather than dropping content.
        range.insertNode(frag);
        continue;
      }

      const holder = doc.createElement("span");
      holder.className = MDT_SRC_CLASS;
      holder.style.display = "none";
      holder.appendChild(frag);

      table.setAttribute(MDT_INSERTED_ATTR, "1");
      range.insertNode(holder);
      holder.parentNode?.insertBefore(table, holder.nextSibling);
      count++;
    }
  }
  return count;
}

/**
 * Undo every replacement made by `renderTablesInContent` within `root`: remove every
 * inserted table and unwrap every `.mdt-src` holder — moving its stashed original nodes
 * back where the table sat — so the DOM returns to its pre-replacement rendering.
 */
export function restoreReplacedTables(root: ParentNode): void {
  root.querySelectorAll(MDT_INSERTED_SELECTOR).forEach((el) => el.remove());
  root.querySelectorAll(`.${MDT_SRC_CLASS}`).forEach((holder) => {
    const parent = holder.parentNode;
    if (!parent) return;
    while (holder.firstChild) parent.insertBefore(holder.firstChild, holder);
    parent.removeChild(holder);
  });
}
