/*
 * Markdown Tables — Shelter plugin.
 * Detects GFM tables in messages and renders them inline as styled HTML tables.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
  type Align,
  formatInline,
  parseTables,
  replaceTablesInContent,
  type TableBlock,
} from "./core";

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

function processRow(row: HTMLElement) {
  const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message as any;
  const content: string | undefined = msg?.content;
  if (!content || !content.includes("|")) return;

  const blocks = parseTables(content);
  if (!blocks.length) return;

  const contentEl = row.querySelector('[id^="message-content-"]') as HTMLElement | null;
  if (!contentEl) return;

  replaceTablesInContent(contentEl, content, blocks, renderTable);
}

const TRIGGERS = [
  "MESSAGE_CREATE",
  "MESSAGE_UPDATE",
  "LOAD_MESSAGES_SUCCESS",
  "UPDATE_CHANNEL_DIMENSIONS",
];

// In-flight observer stoppers, tracked so onUnload can halt any that are still
// running when the plugin is unloaded (FINDING 4).
const activeObservers = new Set<() => void>();

function handleDispatch(payload: any) {
  if (
    (payload.type === "MESSAGE_CREATE" || payload.type === "MESSAGE_UPDATE") &&
    payload.message?.channel_id !== (SelectedChannelStore as any).getChannelId()
  )
    return;

  // Process every row matched during this observation window — a single dispatch
  // (e.g. LOAD_MESSAGES_SUCCESS after scrolling history) can mount many rows at
  // once, and `observeDom` invokes this callback once per matching element. The
  // dataset guard, set immediately, prevents any row from ever being reprocessed
  // (FINDING 2 — do not stop the observer after only the first match).
  const unobs = observeDom('[id^="chat-messages-"]:not([data-md-tables])', (e: HTMLElement) => {
    e.dataset.mdTables = "1";
    try {
      processRow(e);
    } catch (err) {
      console.error("[md-tables] processRow failed", err);
    }
  });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    activeObservers.delete(stop);
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    unobs();
  };
  activeObservers.add(stop);
  timeoutId = setTimeout(stop, 1500);
}

let removeCss: (() => void) | undefined;

export function onLoad() {
  removeCss = injectCss(CSS);
  for (const t of TRIGGERS) dispatcher.subscribe(t, handleDispatch);
}

export function onUnload() {
  for (const t of TRIGGERS) dispatcher.unsubscribe(t, handleDispatch);
  for (const stop of [...activeObservers]) stop();
  document.querySelectorAll(".mdt-wrap").forEach((n) => n.remove());
  removeCss?.();
}
