/*
 * DOM-replacement logic for md-tables.
 * Locates each parsed table block inside a rendered message-content element (by its
 * source line range in the raw message string) and swaps the table's own DOM lines
 * for a rendered `<table>` — without touching any surrounding text, even when a
 * table line shares a Text node with non-table content (a single Text node can hold
 * several "\n"-separated lines when Discord doesn't split lines into <br> elements).
 *
 * The replacement is NON-DESTRUCTIVE: the matched raw-line nodes are never removed.
 * They're moved (in order, at their original position) into a single hidden
 * `<span class="mdt-src" style="display:none">` wrapper, and the rendered table is
 * inserted immediately next to that wrapper. `restoreReplacedTables()` reverses this
 * exactly — it removes every inserted table and unwraps every `.mdt-src` span, so
 * `onUnload` can restore the original view without leaving the message blank.
 *
 * This module is pure DOM manipulation: it never references the `shelter` global and
 * never formats cell content itself — the caller supplies `makeTable`.
 */

import type { TableBlock } from "./parseTables";

interface Line {
  text: string;
  nodes: Node[];
}

// Marks a table this module inserted, so `restoreReplacedTables` can find and remove
// it regardless of whatever classes/structure the caller's `makeTable` used.
const MDT_INSERTED_ATTR = "data-mdt-inserted";
// `.mdt-wrap` is the Shelter integration's own wrapper class (see index.tsx). Matching
// it too, alongside the internal attribute above, is defense in depth.
const MDT_INSERTED_SELECTOR = `[${MDT_INSERTED_ATTR}], .mdt-wrap`;
const MDT_SRC_CLASS = "mdt-src";

function isNewlineMarker(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && node.textContent === "\n";
}

// Ensure no single Text node spans more than one logical line: any Text node whose
// data contains "\n" is replaced by a run of sibling nodes — one Text node per
// non-empty line chunk, plus a standalone one-character "\n" Text node marking each
// line boundary (treated the same way a <br> is). Handles leading/trailing and
// consecutive newlines without producing spurious nodes or crashing. This is
// visually inert (identical rendered text, identical serialized innerHTML for plain
// adjacent Text nodes) even when no block ends up matching.
function normalizeNewlines(root: HTMLElement): void {
  const doc = root.ownerDocument ?? document;
  const textNodes = Array.from(root.childNodes).filter(
    (n): n is Text => n.nodeType === Node.TEXT_NODE,
  );
  for (const textNode of textNodes) {
    const raw = textNode.data;
    if (!raw.includes("\n")) continue;

    const parts = raw.split("\n");
    const replacements: Node[] = [];
    parts.forEach((part, idx) => {
      if (part.length > 0) replacements.push(doc.createTextNode(part));
      if (idx < parts.length - 1) replacements.push(doc.createTextNode("\n"));
    });

    const parent = textNode.parentNode;
    if (!parent) continue;
    for (const node of replacements) parent.insertBefore(node, textNode);
    parent.removeChild(textNode);
  }
}

// Walk a (now newline-normalized) message-content element into logical lines,
// tracking exactly which DOM nodes compose each line. A boundary — a <br> element or
// a lone "\n" Text node — belongs to the line it ends, mirroring how the trailing
// separator before the next line is never shared with that next line.
function collectLines(root: HTMLElement): Line[] {
  const lines: Line[] = [];
  let cur: Line = { text: "", nodes: [] };
  const endLine = () => {
    lines.push(cur);
    cur = { text: "", nodes: [] };
  };
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeName === "BR" || isNewlineMarker(child)) {
      cur.nodes.push(child);
      endLine();
    } else {
      cur.nodes.push(child);
      cur.text += child.textContent ?? "";
    }
  }
  // Only append a trailing line when content actually followed the last boundary —
  // otherwise a message ending in <br> (or a trailing "\n") would yield a spurious
  // empty final line.
  if (cur.nodes.length > 0) lines.push(cur);
  return lines;
}

// Find the first contiguous run of `lines` whose trimmed text matches `blockLines`,
// and return the (deduplicated, in order) DOM nodes that make up exactly those lines.
function matchRange(lines: Line[], blockLines: string[]): Node[] | null {
  for (let start = 0; start + blockLines.length <= lines.length; start++) {
    let matches = true;
    for (let k = 0; k < blockLines.length; k++) {
      if (lines[start + k].text.trim() !== blockLines[k]) {
        matches = false;
        break;
      }
    }
    if (!matches) continue;

    const nodes: Node[] = [];
    for (let k = 0; k < blockLines.length; k++) {
      for (const n of lines[start + k].nodes) {
        if (!nodes.includes(n)) nodes.push(n);
      }
    }
    return nodes;
  }
  return null;
}

// Move `nodes` (in order, at their shared original position) into a single hidden
// `.mdt-src` wrapper, then insert `replacement` immediately after that wrapper.
// Nothing is deleted — `restoreReplacedTables` can undo this exactly.
function wrapAndInsert(nodes: Node[], replacement: HTMLElement): void {
  const first = nodes[0];
  const parent = first?.parentNode;
  if (!parent) return;

  const doc = parent.ownerDocument ?? document;
  const srcSpan = doc.createElement("span");
  srcSpan.className = MDT_SRC_CLASS;
  // Inline style as defense in depth (in case the plugin's CSS is unloaded/missing);
  // the `.mdt-src{display:none}` rule in index.tsx's injected CSS is the primary one.
  srcSpan.style.display = "none";

  parent.insertBefore(srcSpan, first);
  for (const n of nodes) srcSpan.appendChild(n);

  replacement.setAttribute(MDT_INSERTED_ATTR, "1");
  parent.insertBefore(replacement, srcSpan.nextSibling);
}

/**
 * Replace, inside `contentEl`, the DOM text of each table block (located by its
 * source line range in `content`) with `makeTable(block)`. Hides ONLY the table's
 * own lines — never surrounding text, even when a line shares a Text node with
 * non-table text — by moving them into a hidden `.mdt-src` span rather than deleting
 * them, so `restoreReplacedTables` can bring the original view back exactly.
 * No-op for any block whose lines can't be located in the DOM — e.g. a table cell
 * containing a Discord mention/emoji renders differently in the DOM than in the raw
 * `message.content` string, so its lines never match.
 * Blocks are applied last-to-first so earlier ranges stay valid.
 *
 * Returns the number of table blocks that were successfully located and replaced.
 * 0 means nothing in the DOM matched, and `contentEl` is left unchanged (including
 * undoing `normalizeNewlines`'s text-node split, which is otherwise required for
 * matching to work) — callers use this to decide whether it's safe to mark the
 * element as processed (see index.tsx's `processRow`).
 */
export function replaceTablesInContent(
  contentEl: HTMLElement,
  content: string,
  blocks: TableBlock[],
  makeTable: (block: TableBlock) => HTMLElement,
): number {
  if (!blocks.length) return 0;

  // Snapshot the original children BEFORE normalizeNewlines mutates them, so a
  // zero-match outcome can be undone exactly (see below).
  const originalChildren = Array.from(contentEl.childNodes);

  normalizeNewlines(contentEl);
  const contentLines = content.split("\n");
  const lines = collectLines(contentEl);

  // Compute all match ranges FIRST, without mutating the DOM — matchRange only
  // reads `lines`. This lets us tell, before touching anything, whether the
  // zero-match case applies.
  const matched: { block: TableBlock; range: Node[] }[] = [];
  for (const block of blocks) {
    const blockLines = contentLines
      .slice(block.startLine, block.endLine + 1)
      .map((s) => s.trim());
    const range = matchRange(lines, blockLines);
    if (range) matched.push({ block, range });
  }

  if (matched.length === 0) {
    // Nothing matched: undo normalizeNewlines's text-node split so `contentEl` is
    // left exactly as it was (same node identities, same childNodes.length) — no
    // partial mutation leaks out of a no-op call.
    while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
    for (const node of originalChildren) contentEl.appendChild(node);
    return 0;
  }

  // Apply last-to-first so earlier ranges (computed against the pre-mutation
  // `lines` snapshot) stay valid as later wraps rearrange sibling nodes.
  for (const { block, range } of [...matched].reverse()) {
    wrapAndInsert(range, makeTable(block));
  }
  return matched.length;
}

/**
 * Undo every replacement made by `replaceTablesInContent` within `root`: removes
 * every inserted table (identified by the internal marker `wrapAndInsert` sets, and
 * by the Shelter integration's `.mdt-wrap` class as a fallback) and unwraps every
 * `.mdt-src` span — moving its child nodes back into the parent at the span's
 * position, then removing the span — so the DOM ends up equivalent to the original.
 */
export function restoreReplacedTables(root: ParentNode): void {
  // Remove inserted tables first; they sit next to (not inside) the `.mdt-src`
  // spans, so order relative to the unwrap step below doesn't matter for correctness.
  root.querySelectorAll(MDT_INSERTED_SELECTOR).forEach((el) => el.remove());

  root.querySelectorAll(`.${MDT_SRC_CLASS}`).forEach((span) => {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  });
}
