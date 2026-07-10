/*
 * DOM-replacement logic for md-tables.
 * Locates each parsed table block inside a rendered message-content element (by its
 * source line range in the raw message string) and swaps the table's own DOM lines
 * for a rendered `<table>` — without touching any surrounding text, even when a
 * table line shares a Text node with non-table content (a single Text node can hold
 * several "\n"-separated lines when Discord doesn't split lines into <br> elements).
 *
 * This module is pure DOM manipulation: it never references the `shelter` global and
 * never formats cell content itself — the caller supplies `makeTable`.
 */

import type { TableBlock } from "./parseTables";

interface Line {
  text: string;
  nodes: Node[];
}

function isNewlineMarker(node: Node): boolean {
  return node.nodeType === Node.TEXT_NODE && node.textContent === "\n";
}

// Ensure no single Text node spans more than one logical line: any Text node whose
// data contains "\n" is replaced by a run of sibling nodes — one Text node per
// non-empty line chunk, plus a standalone one-character "\n" Text node marking each
// line boundary (treated the same way a <br> is). Handles leading/trailing and
// consecutive newlines without producing spurious nodes or crashing.
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
  // FINDING 3: only append a trailing line when content actually followed the last
  // boundary — otherwise a message ending in <br> (or a trailing "\n") would yield a
  // spurious empty final line.
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

function replaceNodes(nodes: Node[], replacement: HTMLElement): void {
  const first = nodes[0];
  const parent = first?.parentNode;
  if (!parent) return;
  parent.insertBefore(replacement, first);
  for (const n of nodes) {
    try {
      n.parentNode?.removeChild(n);
    } catch {
      /* already detached; ignore */
    }
  }
}

/**
 * Replace, inside `contentEl`, the DOM text of each table block (located by its
 * source line range in `content`) with `makeTable(block)`. Deletes ONLY the table's
 * own lines — never surrounding text, even when a line shares a Text node with
 * non-table text. No-op for any block whose lines can't be located in the DOM.
 * Blocks are applied last-to-first so earlier ranges stay valid.
 */
export function replaceTablesInContent(
  contentEl: HTMLElement,
  content: string,
  blocks: TableBlock[],
  makeTable: (block: TableBlock) => HTMLElement,
): void {
  if (!blocks.length) return;

  normalizeNewlines(contentEl);
  const contentLines = content.split("\n");
  const lines = collectLines(contentEl);

  for (const block of [...blocks].reverse()) {
    const blockLines = contentLines
      .slice(block.startLine, block.endLine + 1)
      .map((s) => s.trim());
    const range = matchRange(lines, blockLines);
    if (range) replaceNodes(range, makeTable(block));
  }
}
