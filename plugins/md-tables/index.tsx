/*
 * Markdown Tables — Shelter plugin.
 * Detects GFM tables in messages and renders them inline as styled HTML tables.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { renderTablesInContent, restoreReplacedTables } from "./core";

const {
  flux: {
    storesFlat: { SelectedChannelStore },
    dispatcher,
  },
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
.mdt-src{display:none}
`;

function processRow(row: HTMLElement) {
  // The reprocessing guard lives on the CONTENT node, not the row: Discord replaces
  // `[id^="message-content-"]` wholesale when a message is edited, so a marker set on
  // the row would survive the edit and permanently block re-rendering. Marking the
  // content node instead means an edit naturally re-processes.
  const contentEl = row.querySelector('[id^="message-content-"]') as HTMLElement | null;
  if (!contentEl) return;
  if (contentEl.dataset.mdTables === "1") return;

  // Detection reads the RENDERED text (not the fiber's raw content), so a table whose
  // cells Discord already formatted is still found. Cheap bail before the DOM walk.
  if (!(contentEl.textContent ?? "").includes("|")) return;

  // Only persist the reprocess guard once a table was actually rendered. If no table
  // was found, leaving the guard unset lets the next dispatch retry — cheap, and it
  // avoids permanently marking a message that briefly had no locatable table.
  const rendered = renderTablesInContent(contentEl);
  if (rendered > 0) contentEl.dataset.mdTables = "1";
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
  // once, and `observeDom` invokes this callback once per matching element (FINDING
  // 2 — do not stop the observer after only the first match). The selector has no
  // `:not([data-md-tables])` filter: dedup happens at the content level inside
  // `processRow`, so rows stay revisitable — which matters because Discord swaps a
  // row's content node (not the row itself) on edit (FINDING A).
  // observeDom hands back HTMLElement | SVGElement; message rows are always HTML.
  const unobs = observeDom('[id^="chat-messages-"]', (e) => {
    if (!(e instanceof HTMLElement)) return;
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
  // Non-destructive replace (FINDING B) means undo is a real restore, not just a
  // removal of inserted nodes: `restoreReplacedTables` also unwraps `.mdt-src` spans
  // so the original message text reappears instead of leaving a blank gap.
  restoreReplacedTables(document);
  document.querySelectorAll("[data-md-tables]").forEach((el) => {
    delete (el as HTMLElement).dataset.mdTables;
  });
  removeCss?.();
}
