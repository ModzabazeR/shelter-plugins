/*
 * HTML Viewer — Shelter plugin.
 * Renders .html attachments inline in a sandboxed iframe. Shares the tested core
 * (CSP hardening / detection / allowlists) with the Vencord target; only the
 * integration + UI are Shelter/Solid-specific.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    FULLVIEW_CSP,
    hardenHtml,
    hasId,
    hasUntrustedRefs,
    isHtmlAttachment,
    LOCKED_CSP,
    toggleId,
    TRUSTED_CDNS,
} from "./core";

const {
    flux: {
        storesFlat: { SelectedChannelStore, ChannelStore },
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
        Text,
        Header,
        HeaderTags,
        Divider,
        SwitchItem,
        TextBox,
        injectCss,
    },
    plugin: { store },
} = shelter;

// ---- settings defaults (top-level props on the reactive store auto-persist) ----
store.maxSizeKb ??= 512;
store.autoRenderAll ??= false;
store.autoRenderUsers ??= "";
store.autoRenderServers ??= "";

// ---- styles ----
const CSS = `
.hv-card{margin-top:4px;border:1px solid var(--background-modifier-accent,rgba(255,255,255,.09));border-radius:8px;background:var(--background-secondary,var(--background-secondary-alt,#2b2d31));overflow:hidden;max-width:min(680px,100%)}
.hv-head{display:flex;align-items:center;gap:8px;padding:8px 10px}
.hv-lock{font-size:13px;cursor:help;flex:0 0 auto}
.hv-name{font-weight:600;color:var(--text-normal,#dbdee1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}
.hv-size{color:var(--text-muted,#949ba4);font-size:12px;flex:0 0 auto}
.hv-spacer{flex:1 1 auto}
.hv-btn{flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:none;border-radius:4px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text-normal,#dbdee1);background:var(--button-secondary-background,var(--background-secondary-alt,rgba(255,255,255,.07)));transition:filter .12s}
.hv-btn:hover{filter:brightness(1.25)}
.hv-btn-primary{color:var(--white-500,#fff);background:var(--brand-500,#5865f2)}
.hv-toggle{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;padding:4px;border:none;border-radius:4px;cursor:pointer;color:var(--text-muted,#949ba4);background:transparent;transition:color .12s,background .12s}
.hv-toggle:hover{color:var(--text-normal,#dbdee1);background:var(--button-secondary-background,rgba(255,255,255,.07))}
.hv-toggle-on{color:var(--white-500,#fff);background:var(--brand-500,#5865f2)}
.hv-note{padding:8px 10px;font-size:12px;color:var(--text-muted,#949ba4);border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.09))}
.hv-hint{color:var(--text-warning,#f0b232)}
.hv-error{color:var(--text-danger,#f23f42)}
.hv-icon{flex:0 0 auto;display:block}
.hv-frame{border:none;background:#fff;display:block;width:100%}
.hv-frame-inline{height:480px;border-top:1px solid var(--background-modifier-accent,rgba(255,255,255,.09))}
.hv-frame-modal{height:80vh;min-height:80vh}
.hv-modal{width:min(1600px,94vw)!important;max-width:94vw!important}
`;

// ---- fetch cache (attachment id -> html text) ----
const htmlCache = new Map<string, string>();

async function fetchHtml(att: any): Promise<string> {
    if (htmlCache.has(att.id)) return htmlCache.get(att.id)!;
    const res = await fetch(att.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    htmlCache.set(att.id, text);
    return text;
}

function formatBytes(n: number): string {
    if (typeof n !== "number") return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ---- the sandboxed iframe (plain DOM; srcdoc set as a property, never markup) ----
function makeFrame(html: string, mode: "locked" | "full"): HTMLIFrameElement {
    const f = document.createElement("iframe");
    f.setAttribute("sandbox", "allow-scripts");
    f.setAttribute("allow", "");
    f.setAttribute("referrerpolicy", "no-referrer");
    f.className = "hv-frame " + (mode === "full" ? "hv-frame-modal" : "hv-frame-inline");
    f.srcdoc = hardenHtml(html, mode === "full" ? FULLVIEW_CSP : LOCKED_CSP);
    return f;
}

function download(att: any) {
    fetchHtml(att).then(text => {
        const url = URL.createObjectURL(new Blob([text], { type: "text/html" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = att.filename || "artifact.html";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
}

function openFullView(att: any) {
    fetchHtml(att).then(text => {
        const frame = makeFrame(text, "full");
        openModal((props: any) => (
            <ModalRoot size={ModalSizes.LARGE} class="hv-modal">
                <ModalHeader close={props.close}>{att.filename}</ModalHeader>
                <ModalBody>{frame}</ModalBody>
                <ModalFooter>
                    <Button onClick={props.close}>Done</Button>
                </ModalFooter>
            </ModalRoot>
        ));
    });
}

// ---- icons (Solid SVG, currentColor) ----
const svg = (d: string) => (
    <svg class="hv-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
        <path d={d} />
    </svg>
);
const RenderIcon = () => svg("M12 5c-5 0-9 4.2-10 7 1 2.8 5 7 10 7s9-4.2 10-7c-1-2.8-5-7-10-7zm0 11.5A4.5 4.5 0 1112 7.5a4.5 4.5 0 010 9zm0-2.2a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z");
const ExpandIcon = () => svg("M4 4h6V2H2v8h2V4zm16 0v6h2V2h-8v2h6zM4 14H2v8h8v-2H4v-6zm18 0h-2v6h-6v2h8v-8z");
const DownloadIcon = () => svg("M13 3h-2v9H7.5l4.5 4.5L16.5 12H13V3zM5 19h14v2H5v-2z");
const CollapseIcon = () => svg("M12 8.4l6 6L16.6 16 12 11.2 7.4 16 6 14.4z");
const UserIcon = () => svg("M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z");
const ServerIcon = () => svg("M9.5 3L8 8H4l-.5 2h4l-1 5H2.5L2 17h4l-1 4h2l1-4h4l-1 4h2l1-4h4l.5-2h-4l1-5h4.5l.5-2h-4l1-5h-2l-1 5H10l1-5H9.5zm.1 7h4l-1 5h-4l1-5z");

// ---- the card ----
function HtmlCard(props: { att: any; authorId?: string; guildId?: string; }) {
    const att = props.att;
    const tooBig = () => att.size > store.maxSizeKb * 1024;

    const autoRender =
        store.autoRenderAll ||
        hasId(store.autoRenderUsers, props.authorId) ||
        (!!props.guildId && hasId(store.autoRenderServers, props.guildId));

    const [open, setOpen] = createSignal(autoRender && !tooBig());
    const [html, setHtml] = createSignal<string | undefined>(htmlCache.get(att.id));
    const [loading, setLoading] = createSignal(false);
    const [error, setError] = createSignal<string | undefined>();

    createEffect(() => {
        if (!open() || html() || loading() || error()) return;
        setLoading(true);
        fetchHtml(att)
            .then(t => { setHtml(t); setLoading(false); })
            .catch(e => { setError(String(e?.message ?? e)); setLoading(false); });
    });

    const userOn = () => hasId(store.autoRenderUsers, props.authorId);
    const serverOn = () => !!props.guildId && hasId(store.autoRenderServers, props.guildId);
    const toggleUser = () => {
        if (!props.authorId) return;
        const turningOn = !userOn();
        store.autoRenderUsers = toggleId(store.autoRenderUsers, props.authorId);
        if (turningOn && !tooBig()) setOpen(true);
    };
    const toggleServer = () => {
        if (!props.guildId) return;
        const turningOn = !serverOn();
        store.autoRenderServers = toggleId(store.autoRenderServers, props.guildId);
        if (turningOn && !tooBig()) setOpen(true);
    };

    // inline iframe holder — rebuilt when html becomes available
    const holder = document.createElement("div");
    createEffect(() => {
        holder.replaceChildren();
        const h = html();
        if (open() && h) holder.append(makeFrame(h, "locked"));
    });

    return (
        <div class="hv-card">
            <div class="hv-head">
                <span class="hv-lock" title="Inline preview is sandboxed; Full view enables CDN network. Neither can touch Discord.">🔒</span>
                <span class="hv-name">{att.filename}</span>
                <span class="hv-size">{formatBytes(att.size)}</span>
                <span class="hv-spacer" />
                <Show when={props.authorId}>
                    <button classList={{ "hv-toggle": true, "hv-toggle-on": userOn() }} title="Always render this user's HTML" onClick={toggleUser}><UserIcon /></button>
                </Show>
                <Show when={props.guildId}>
                    <button classList={{ "hv-toggle": true, "hv-toggle-on": serverOn() }} title="Always render HTML in this server" onClick={toggleServer}><ServerIcon /></button>
                </Show>
                <Show when={!open() && !tooBig()}>
                    <button class="hv-btn hv-btn-primary" onClick={() => setOpen(true)}><RenderIcon /> Render</button>
                </Show>
                <Show when={open()}>
                    <button class="hv-btn" onClick={() => setOpen(false)}><CollapseIcon /> Collapse</button>
                </Show>
                <button class="hv-btn" onClick={() => openFullView(att)}><ExpandIcon /> Full view</button>
                <button class="hv-btn" onClick={() => download(att)}><DownloadIcon /> Download</button>
            </div>

            <Show when={tooBig() && !open()}>
                <div class="hv-note">{formatBytes(att.size)} exceeds the {store.maxSizeKb} KB inline limit. Use Full view or Download.</div>
            </Show>

            <Show when={open()}>
                <Show when={loading()}><div class="hv-note">Rendering…</div></Show>
                <Show when={error()}><div class="hv-note hv-error">Couldn't load artifact: {error()}</div></Show>
                <Show when={html() && hasUntrustedRefs(html()!, TRUSTED_CDNS)}>
                    <div class="hv-note hv-hint">References assets outside the trusted CDNs, which the inline preview blocks. Use Full view.</div>
                </Show>
                {holder}
            </Show>
        </div>
    );
}

// ---- injection: find html attachments in each message, hide native, mount card ----
const disposers: Array<() => void> = [];

function processRow(row: HTMLElement) {
    const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message as any;
    const attachments: any[] = msg?.attachments ?? [];
    const artifacts = attachments.filter(isHtmlAttachment);
    if (!artifacts.length) return;

    const guildId = (ChannelStore as any).getChannel?.(msg.channel_id)?.guild_id;
    const authorId = msg.author?.id;

    // the indented content column (holds username + text). Discord renders attachments in a
    // SIBLING accessories container, but both share the message's avatar-gutter indent, so
    // mounting our card at the end of this column lines it up with the message text.
    const contents = row.querySelector('[class*="contents"]') as HTMLElement | null;

    for (const att of artifacts) {
        const link = row.querySelector(`a[href*="${att.id}"]`) as HTMLElement | null;

        // Discord renders a .html attachment as a "non-visual media" card whose body includes
        // an inline source/code preview. Hide the per-file wrapper (which contains both the
        // card and the preview). Matching the NON-VISUAL wrapper specifically leaves co-posted
        // images (visual mosaic items) untouched. Fall back through inner wrappers if Discord's
        // class prefixes shift.
        const nativeWrap =
            (link?.closest('[class*="nonVisualMediaItemContainer"]') as HTMLElement | null) ??
            (link?.closest(
                '[class*="nonVisualMediaItem"], [class*="mosaicItem"], [class*="messageAttachment"]',
            ) as HTMLElement | null);
        if (nativeWrap) nativeWrap.style.display = "none";

        const mount = document.createElement("div");
        mount.className = "hv-mount";
        const dispose = render(() => <HtmlCard att={att} authorId={authorId} guildId={guildId} />, mount);
        disposers.push(dispose);

        if (contents) contents.appendChild(mount);
        else row.appendChild(mount);
    }
}

const TRIGGERS = ["MESSAGE_CREATE", "MESSAGE_UPDATE", "UPDATE_CHANNEL_DIMENSIONS", "LOAD_MESSAGES_SUCCESS"];

function handleDispatch(payload: any) {
    if (
        (payload.type === "MESSAGE_CREATE" || payload.type === "MESSAGE_UPDATE") &&
        payload.message?.channel_id !== (SelectedChannelStore as any).getChannelId()
    )
        return;

    // observeDom hands back HTMLElement | SVGElement; message rows are always HTML.
    const unobs = observeDom(`[id^="chat-messages-"]:not([data-html-viewer])`, (e) => {
        if (!(e instanceof HTMLElement)) return;
        e.dataset.htmlViewer = "1";
        unobs();
        try {
            processRow(e);
        } catch (err) {
            console.error("[html-viewer] processRow failed", err);
        }
    });
    setTimeout(unobs, 1500); // safety: cancel dangling observer
}

// ---- settings panel ----
export function settings() {
    const onNum = (v: string) => {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n > 0) store.maxSizeKb = n;
    };
    return (
        <div>
            <Header tag={HeaderTags.H3}>Rendering</Header>
            <SwitchItem
                checked={store.autoRenderAll}
                onChange={(v: boolean) => (store.autoRenderAll = v)}
                note="Render every HTML artifact inline automatically, skipping the Render button."
            >
                Auto-render everything
            </SwitchItem>
            <Text>Max inline size (KB)</Text>
            <TextBox value={String(store.maxSizeKb)} onInput={onNum} />
            <Divider mt mb />
            <Header tag={HeaderTags.H3}>Auto-render allowlists</Header>
            <Text>User IDs — comma-separated (easier: use the person toggle on a card)</Text>
            <TextBox value={store.autoRenderUsers} onInput={(v: string) => (store.autoRenderUsers = v)} />
            <Text>Server IDs — comma-separated (easier: use the server toggle on a card)</Text>
            <TextBox value={store.autoRenderServers} onInput={(v: string) => (store.autoRenderServers = v)} />
        </div>
    );
}

let removeCss: (() => void) | undefined;

export function onLoad() {
    removeCss = injectCss(CSS);
    for (const t of TRIGGERS) dispatcher.subscribe(t, handleDispatch);
}

export function onUnload() {
    for (const t of TRIGGERS) dispatcher.unsubscribe(t, handleDispatch);
    for (const d of disposers.splice(0)) {
        try { d(); } catch { /* ignore */ }
    }
    document.querySelectorAll(".hv-mount").forEach(n => n.remove());
    removeCss?.();
}
