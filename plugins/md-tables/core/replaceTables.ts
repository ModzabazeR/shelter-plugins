/*
 * DOM-replacement logic for md-tables.
 *
 * Detection works off the RENDERED message DOM, not the raw `message.content`
 * string. That is the load-bearing correction: Discord renders inline markdown
 * inside table cells (e.g. `**bold**` becomes a `<strong>`), so the raw content
 * string does not match the rendered text, and a message's lines are split across
 * `<span>`/`<strong>`/... siblings with the "\n"s living inside those spans. We
 * therefore reconstruct each inline run's rendered text, detect GFM tables in it,
 * and carve the table's exact character span out of the DOM with a `Range` — which
 * transparently splits nested Text nodes and partially-selected element ancestors.
 *
 * The replacement is NON-DESTRUCTIVE: the carved-out rendered nodes are not thrown
 * away. They are stashed in a hidden `<span class="mdt-src">` holder placed where the
 * table now sits, and `restoreReplacedTables()` puts them back exactly (removing the
 * inserted table and unwrapping the holder) so `onUnload` never leaves a blank gap.
 *
 * This module is pure DOM: it never touches the `shelter` global. The caller supplies
 * `makeTable(block)` to build the visible table from a parsed block.
 *
 * KNOWN LIMITATION (v0.1): cells render as plain text. Inline formatting Discord had
 * rendered inside a cell (bold/italic/code/mentions/emoji) is flattened to text,
 * because detection reads the already-rendered (marker-free) text. Preserving in-cell
 * formatting by moving the rendered nodes into the cells is a follow-up.
 */

import { parseTables, type TableBlock } from "./parseTables";

// Block-level tags break an inline run: a GFM table never spans across one, and their
// text must not be glued to adjacent lines. Everything else at the top level of a
// message-content element (#text, SPAN, STRONG, EM, CODE, A, IMG, BR, ...) is inline.
const BLOCK_TAGS = new Set([
  "H1", "H2", "H3", "H4", "H5", "H6",
  "UL", "OL", "LI", "P", "DIV", "BLOCKQUOTE", "PRE", "HR",
  "TABLE", "ASIDE", "SECTION", "ARTICLE", "FIGURE",
]);

const MDT_INSERTED_ATTR = "data-mdt-inserted";
// `.mdt-wrap` is the Shelter integration's own wrapper class (index.tsx). Matching it
// too, alongside the internal attribute, is defense in depth on restore.
const MDT_INSERTED_SELECTOR = `[${MDT_INSERTED_ATTR}], .mdt-wrap`;
const MDT_SRC_CLASS = "mdt-src";

function isBlock(n: Node): boolean {
  return n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(n.nodeName);
}

// Map from a character offset in the reconstructed run text to a descendant Text node.
interface TextSeg {
  node: Text;
  start: number; // char offset of this node's text within the run string
  len: number;
}

// Reconstruct an inline run's rendered text and record where each descendant Text
// node sits within it, so a character span can be turned into a DOM Range. A <br>
// contributes a "\n" with no node (line boundaries never become Range edges).
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

// Resolve a character offset to (Text node, offset within it). Prefers a position at
// the *start* of a segment over the end of the previous one, so a Range endpoint lands
// on a real character rather than a zero-length boundary where possible.
function locate(segs: TextSeg[], char: number): { node: Text; offset: number } | null {
  for (const s of segs) {
    if (char >= s.start && char < s.start + s.len) {
      return { node: s.node, offset: char - s.start };
    }
  }
  // End-of-run (or a boundary that coincides with a segment end): clamp to the last
  // segment that ends at or before `char`.
  let best: TextSeg | undefined;
  for (const s of segs) {
    if (s.start + s.len <= char) best = s;
    else if (s.start <= char) best = s;
  }
  if (best && char >= best.start && char <= best.start + best.len) {
    return { node: best.node, offset: char - best.start };
  }
  return null;
}

// Character span [start, end) covered by a table block within the run text.
function blockCharRange(runLines: string[], block: TableBlock): [number, number] {
  let start = 0;
  for (let i = 0; i < block.startLine; i++) start += runLines[i].length + 1;
  let end = start;
  for (let i = block.startLine; i <= block.endLine; i++) {
    end += runLines[i].length;
    if (i < block.endLine) end += 1; // the "\n" between rows
  }
  return [start, end];
}

/**
 * Detect every GFM table in `contentEl`'s rendered content and replace each in place
 * with `makeTable(block)`. Detection reads the rendered DOM text (per inline run,
 * split on block-level elements), so tables whose cells Discord already formatted are
 * still found. Each table's exact character span is carved out with a Range, stashed
 * in a hidden `.mdt-src` holder (so `restoreReplacedTables` can bring it back), and the
 * table is inserted where it was.
 *
 * Returns the number of tables rendered. 0 means nothing was found and `contentEl` is
 * untouched — callers use this to decide whether to mark the element processed.
 */
export function renderTablesInContent(
  contentEl: HTMLElement,
  makeTable: (block: TableBlock) => HTMLElement,
): number {
  const doc = contentEl.ownerDocument ?? document;

  // Partition top-level children into inline runs separated by block elements.
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
    // Apply last-to-first: extracting a later block only splits nodes at/after its own
    // start, so earlier blocks' segment offsets stay valid.
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

      const holder = doc.createElement("span");
      holder.className = MDT_SRC_CLASS;
      holder.style.display = "none";
      holder.appendChild(frag);

      const table = makeTable(block);
      table.setAttribute(MDT_INSERTED_ATTR, "1");

      // The range has collapsed to the extraction point; drop the holder there, then
      // the table right after it.
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
