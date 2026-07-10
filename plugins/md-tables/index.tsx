/*
 * Markdown Tables — Shelter plugin.
 * Detects GFM tables in messages and renders them inline as styled HTML tables.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { type Align, formatInline, parseTables, type TableBlock } from "./core";

const {
  flux: {
    storesFlat: { SelectedChannelStore },
    dispatcher,
  },
  util: { getFiber, reactFiberWalker },
  observeDom,
  ui: { injectCss },
} = shelter;

const CSS = `
.mdt-wrap{max-width:100%;overflow-x:auto;margin:6px 0}
.mdt-table{border-collapse:collapse;font-size:.95rem;line-height:1.35}
.mdt-table th,.mdt-table td{border:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));padding:6px 10px;color:var(--text-normal,#dbdee1);vertical-align:top}
.mdt-table th{background:var(--background-secondary,#2b2d31);font-weight:600;text-align:left}
.mdt-table tbody tr:nth-child(even){background:var(--background-secondary-alt,rgba(255,255,255,.03))}
.mdt-table code{background:var(--background-secondary-alt,rgba(255,255,255,.08));padding:0 4px;border-radius:3px;font-family:var(--font-code,monospace)}
`;

function applyAlign(el: HTMLElement, a: Align) {
  if (a) el.style.textAlign = a;
}

function renderTable(block: TableBlock): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "mdt-wrap";
  const table = document.createElement("table");
  table.className = "mdt-table";

  const thead = document.createElement("thead");
  const htr = document.createElement("tr");
  block.headers.forEach((h, c) => {
    const th = document.createElement("th");
    applyAlign(th, block.aligns[c]);
    th.append(...formatInline(h));
    htr.append(th);
  });
  thead.append(htr);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const row of block.rows) {
    const tr = document.createElement("tr");
    row.forEach((cell, c) => {
      const td = document.createElement("td");
      applyAlign(td, block.aligns[c]);
      td.append(...formatInline(cell));
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

interface Line {
  text: string;
  nodes: Node[];
}

// Walk a message-content element into logical lines, tracking the DOM nodes that
// compose each line. Handles both <br>-separated and \n-in-text-node line breaks.
function collectLines(root: HTMLElement): Line[] {
  const lines: Line[] = [];
  let cur: Line = { text: "", nodes: [] };
  const push = () => {
    lines.push(cur);
    cur = { text: "", nodes: [] };
  };
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const parts = (child.textContent ?? "").split("\n");
      parts.forEach((p, idx) => {
        if (idx > 0) push();
        cur.text += p;
        if (!cur.nodes.includes(child)) cur.nodes.push(child);
      });
    } else if (child.nodeName === "BR") {
      cur.nodes.push(child);
      push();
    } else {
      cur.nodes.push(child);
      cur.text += (child as HTMLElement).textContent ?? "";
    }
  }
  lines.push(cur);
  return lines;
}

function matchRange(lines: Line[], blockLines: string[]): Node[] | null {
  for (let s = 0; s + blockLines.length <= lines.length; s++) {
    let ok = true;
    for (let k = 0; k < blockLines.length; k++) {
      if (lines[s + k].text.trim() !== blockLines[k]) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    const nodes: Node[] = [];
    for (let k = 0; k < blockLines.length; k++) {
      for (const n of lines[s + k].nodes) if (!nodes.includes(n)) nodes.push(n);
    }
    return nodes;
  }
  return null;
}

function replaceNodes(nodes: Node[], replacement: HTMLElement) {
  const first = nodes[0];
  const parent = first?.parentNode;
  if (!parent) return;
  parent.insertBefore(replacement, first);
  for (const n of nodes) {
    try {
      n.parentNode?.removeChild(n);
    } catch {
      /* ignore */
    }
  }
}

function processRow(row: HTMLElement) {
  const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message as any;
  const content: string | undefined = msg?.content;
  if (!content || !content.includes("|")) return;

  const blocks = parseTables(content);
  if (!blocks.length) return;

  const contentEl = row.querySelector('[id^="message-content-"]') as HTMLElement | null;
  if (!contentEl) return;

  const contentLines = content.split("\n");
  const lines = collectLines(contentEl);

  // Replace from the last block to the first so earlier node references stay valid.
  for (const block of [...blocks].reverse()) {
    const blockLines = contentLines.slice(block.startLine, block.endLine + 1).map((s) => s.trim());
    const range = matchRange(lines, blockLines);
    if (range) replaceNodes(range, renderTable(block));
  }
}

const TRIGGERS = [
  "MESSAGE_CREATE",
  "MESSAGE_UPDATE",
  "LOAD_MESSAGES_SUCCESS",
  "UPDATE_CHANNEL_DIMENSIONS",
];

function handleDispatch(payload: any) {
  if (
    (payload.type === "MESSAGE_CREATE" || payload.type === "MESSAGE_UPDATE") &&
    payload.message?.channel_id !== (SelectedChannelStore as any).getChannelId()
  )
    return;

  const unobs = observeDom('[id^="chat-messages-"]:not([data-md-tables])', (e: HTMLElement) => {
    e.dataset.mdTables = "1";
    unobs();
    try {
      processRow(e);
    } catch (err) {
      console.error("[md-tables] processRow failed", err);
    }
  });
  setTimeout(unobs, 1500);
}

let removeCss: (() => void) | undefined;

export function onLoad() {
  removeCss = injectCss(CSS);
  for (const t of TRIGGERS) dispatcher.subscribe(t, handleDispatch);
}

export function onUnload() {
  for (const t of TRIGGERS) dispatcher.unsubscribe(t, handleDispatch);
  document.querySelectorAll(".mdt-wrap").forEach((n) => n.remove());
  removeCss?.();
}
