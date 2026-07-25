/*
 * Markdown Tables — Shelter plugin.
 * Detects GFM tables in messages and renders them inline as styled HTML tables.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
  isMdAttachment,
  renderMarkdownToHtml,
  renderTablesInContent,
  restoreReplacedTables,
} from "./core";

const {
  flux: {
    storesFlat: { SelectedChannelStore },
    dispatcher,
  },
  util: { getFiber, reactFiberWalker },
  observeDom,
  solid: { createSignal, createEffect, Show },
  solidWeb: { render },
  ui: {
    openModal,
    ModalRoot,
    ModalSizes,
    ModalHeader,
    ModalBody,
    ModalFooter,
    Button,
    injectCss,
  },
} = shelter;

const CSS = `
.mdt-wrap{max-width:100%;overflow-x:auto;margin:6px 0}
.mdt-table,.mdt-doc table{border-collapse:collapse;font-size:.95rem;line-height:1.35}
.mdt-table th,.mdt-table td,.mdt-doc th,.mdt-doc td{border:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));padding:6px 10px;color:var(--text-normal,#dbdee1);vertical-align:top}
.mdt-table th,.mdt-doc th{background:var(--background-secondary,#2b2d31);font-weight:600;text-align:left}
.mdt-table tbody tr:nth-child(even),.mdt-doc tbody tr:nth-child(even){background:var(--background-secondary-alt,rgba(255,255,255,.03))}
.mdt-table code{background:var(--background-secondary-alt,rgba(255,255,255,.08));padding:0 4px;border-radius:3px;font-family:var(--font-code,monospace)}
.mdt-src{display:none}
.mdt-card{margin-top:4px;border:1px solid var(--background-modifier-accent,rgba(255,255,255,.09));border-radius:8px;background:var(--background-secondary,#2b2d31);overflow:hidden;max-width:min(680px,100%)}
.mdt-head{display:flex;align-items:center;gap:8px;padding:8px 10px}
.mdt-name{font-weight:600;color:var(--text-normal,#dbdee1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px}
.mdt-size{color:var(--text-muted,#949ba4);font-size:12px;flex:0 0 auto}
.mdt-spacer{flex:1 1 auto}
.mdt-btn{flex:0 0 auto;padding:4px 10px;border:none;border-radius:4px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text-normal,#dbdee1);background:var(--button-secondary-background,rgba(255,255,255,.07));transition:filter .12s}
.mdt-btn:hover{filter:brightness(1.25)}
.mdt-note{padding:8px 10px;font-size:12px;color:var(--text-muted,#949ba4);border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.09))}
.mdt-error{color:var(--text-danger,#f23f42)}
.mdt-doc{padding:10px 14px;max-height:480px;overflow-y:auto;color:var(--text-normal,#dbdee1);font-size:.95rem;line-height:1.5;border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.09))}
/* Full view must stay viewport-bounded: an unbounded doc grows the modal past the top and bottom of the screen. Scroll inside the body instead. */
.mdt-doc-modal{max-height:75vh;border-top:none}
.mdt-doc h1,.mdt-doc h2,.mdt-doc h3,.mdt-doc h4,.mdt-doc h5,.mdt-doc h6{margin:14px 0 6px;color:var(--header-primary,#f2f3f5);line-height:1.25}
.mdt-doc h1{font-size:1.5rem;padding-bottom:4px;border-bottom:1px solid var(--background-modifier-accent,rgba(255,255,255,.1))}
.mdt-doc h2{font-size:1.25rem;padding-bottom:3px;border-bottom:1px solid var(--background-modifier-accent,rgba(255,255,255,.08))}
.mdt-doc h3{font-size:1.1rem}
.mdt-doc p{margin:6px 0}
.mdt-doc ul,.mdt-doc ol{margin:4px 0;padding-left:22px}
.mdt-doc li{margin:2px 0}
.mdt-doc blockquote{margin:6px 0;padding:2px 12px;border-left:3px solid var(--background-modifier-accent,rgba(255,255,255,.2));color:var(--text-muted,#949ba4)}
.mdt-doc pre{background:var(--background-secondary-alt,rgba(255,255,255,.06));padding:8px 10px;border-radius:6px;overflow-x:auto;margin:6px 0}
.mdt-doc code{font-family:var(--font-code,monospace);font-size:.875em}
.mdt-doc :not(pre)>code{background:var(--background-secondary-alt,rgba(255,255,255,.08));padding:0 4px;border-radius:3px}
.mdt-doc a{color:var(--text-link,#00a8fc)}
.mdt-doc hr{border:none;border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));margin:12px 0}
.mdt-modal{width:min(1100px,92vw)!important;max-width:1100px!important;max-height:90vh!important}
`;

// ---- .md attachment rendering --------------------------------------------------

const MAX_INLINE_KB = 512;
const MAX_INLINE_BYTES = MAX_INLINE_KB * 1024;

// fetch cache (attachment id -> in-flight or settled fetch of the raw markdown).
// Caching the promise dedups concurrent requests (e.g. double-click); a rejected
// fetch evicts itself so Full view / Download / retry get a fresh attempt.
const mdCache = new Map<string, Promise<string>>();

function fetchMd(att: any): Promise<string> {
  const cached = mdCache.get(att.id);
  if (cached) return cached;
  const pending = (async () => {
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  })();
  mdCache.set(att.id, pending);
  pending.catch(() => mdCache.delete(att.id));
  return pending;
}

function formatBytes(n: number): string {
  if (typeof n !== "number") return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function download(att: any) {
  fetchMd(att)
    .then((text) => {
      const url = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = att.filename || "document.md";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    })
    // Fetch failed (expired CDN link etc.) — hand the URL to the browser instead.
    .catch(() => window.open(att.url, "_blank"));
}

function openFullView(att: any) {
  fetchMd(att)
    .then((text) => {
      const doc = document.createElement("div");
      doc.className = "mdt-doc mdt-doc-modal";
      doc.innerHTML = renderMarkdownToHtml(text);
      openModal((props: any) => (
        <ModalRoot size={ModalSizes.LARGE} class="mdt-modal">
          <ModalHeader close={props.close}>{att.filename}</ModalHeader>
          <ModalBody>{doc}</ModalBody>
          <ModalFooter>
            <Button onClick={props.close}>Done</Button>
          </ModalFooter>
        </ModalRoot>
      ));
    })
    .catch((e) => {
      console.error("[md-tables] full view failed", e);
      // Same visible fallback as download(): hand the URL to the browser.
      window.open(att.url, "_blank");
    });
}

function MdCard(props: { att: any }) {
  const att = props.att;
  const tooBig = att.size > MAX_INLINE_BYTES;
  const [open, setOpen] = createSignal(!tooBig);
  const [html, setHtml] = createSignal<string | undefined>();
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | undefined>();

  createEffect(() => {
    if (!open() || html() !== undefined || loading() || error()) return;
    setLoading(true);
    fetchMd(att)
      .then((t) => {
        setHtml(renderMarkdownToHtml(t));
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e?.message ?? e));
        setLoading(false);
      });
  });

  // The one place sanitized HTML enters the DOM: a plugin-owned div.
  const doc = document.createElement("div");
  doc.className = "mdt-doc";
  createEffect(() => {
    doc.innerHTML = html() ?? "";
  });

  return (
    <div class="mdt-card">
      <div class="mdt-head">
        <span class="mdt-name">{att.filename}</span>
        <span class="mdt-size">{formatBytes(att.size)}</span>
        <span class="mdt-spacer" />
        <Show when={!tooBig}>
          <button
            class="mdt-btn"
            onClick={() => {
              if (!open() && error() !== undefined) setError(undefined);
              setOpen(!open());
            }}
          >
            {open() ? "Collapse" : "Expand"}
          </button>
        </Show>
        <button class="mdt-btn" onClick={() => openFullView(att)}>Full view</button>
        <button class="mdt-btn" onClick={() => download(att)}>Download</button>
      </div>

      <Show when={tooBig}>
        <div class="mdt-note">
          {formatBytes(att.size)} exceeds the {MAX_INLINE_KB} KB inline limit — use Full view or Download.
        </div>
      </Show>

      <Show when={open()}>
        <Show when={loading()}>
          <div class="mdt-note">Rendering…</div>
        </Show>
        <Show when={error()}>
          <div class="mdt-note mdt-error">Couldn't load file: {error()}</div>
        </Show>
        <Show when={html() !== undefined}>{doc}</Show>
      </Show>
    </div>
  );
}

// Mount root -> its Solid dispose fn, plus natively-hidden attachment wrappers.
// Discord virtualizes rows, so mounts constantly leave the DOM long before
// onUnload — pruneDetached() reclaims them amortized, once per dispatch.
const mounts = new Map<HTMLElement, () => void>();
const hiddenNativeEls = new Set<HTMLElement>();

function pruneDetached() {
  for (const [mount, dispose] of mounts) {
    if (mount.isConnected) continue;
    try {
      dispose();
    } catch {
      /* ignore */
    }
    mounts.delete(mount);
  }
  for (const el of hiddenNativeEls) {
    if (!el.isConnected) hiddenNativeEls.delete(el);
  }
}

function processAttachments(row: HTMLElement) {
  // Row-level guard (html-viewer style): attachments live in the accessories
  // container, which Discord does NOT swap the way it swaps content nodes, so a
  // per-row marker is safe here. Only set once md attachments were actually found,
  // so a row whose fiber wasn't ready yet gets retried on the next dispatch.
  if (row.dataset.mdtAtt === "1") return;

  const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps
    ?.message as any;
  const artifacts: any[] = (msg?.attachments ?? []).filter(isMdAttachment);
  if (!artifacts.length) return;
  row.dataset.mdtAtt = "1";

  // The indented content column (username + text) — mounting here aligns the card
  // with the message text, same trick as html-viewer.
  const contents = row.querySelector('[class*="contents"]') as HTMLElement | null;

  for (const att of artifacts) {
    const mount = document.createElement("div");
    mount.className = "mdt-mount";
    mounts.set(mount, render(() => <MdCard att={att} />, mount));
    (contents ?? row).appendChild(mount);

    const link = row.querySelector(`a[href*="${att.id}"]`) as HTMLElement | null;

    // Discord shows a .md attachment as a "non-visual media" card with a source
    // preview. Hide that wrapper non-destructively (display:none + remember it),
    // with the same fallback chain html-viewer uses for class-prefix drift. This
    // runs only after the replacement card is mounted, so a mount failure can
    // never leave the attachment with no visible representation at all.
    const nativeWrap =
      (link?.closest('[class*="nonVisualMediaItemContainer"]') as HTMLElement | null) ??
      (link?.closest(
        '[class*="nonVisualMediaItem"], [class*="mosaicItem"], [class*="messageAttachment"]',
      ) as HTMLElement | null);
    if (nativeWrap) {
      nativeWrap.style.display = "none";
      hiddenNativeEls.add(nativeWrap);
    }
  }
}

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
  pruneDetached();
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
    try {
      processAttachments(e);
    } catch (err) {
      console.error("[md-tables] processAttachments failed", err);
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

  // Attachment cards: dispose Solid roots, drop mounts, un-hide native cards.
  for (const [, dispose] of mounts) {
    try {
      dispose();
    } catch {
      /* ignore */
    }
  }
  mounts.clear();
  mdCache.clear();
  document.querySelectorAll(".mdt-mount").forEach((n) => n.remove());
  for (const el of hiddenNativeEls) el.style.display = "";
  hiddenNativeEls.clear();
  document.querySelectorAll("[data-mdt-att]").forEach((el) => {
    delete (el as HTMLElement).dataset.mdtAtt;
  });

  // Non-destructive replace (FINDING B) means undo is a real restore, not just a
  // removal of inserted nodes: `restoreReplacedTables` also unwraps `.mdt-src` spans
  // so the original message text reappears instead of leaving a blank gap.
  restoreReplacedTables(document);
  document.querySelectorAll("[data-md-tables]").forEach((el) => {
    delete (el as HTMLElement).dataset.mdTables;
  });
  removeCss?.();
}
