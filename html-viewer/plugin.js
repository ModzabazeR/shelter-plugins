(function(exports) {

//#region rolldown:runtime
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function() {
	return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));

//#endregion

//#region solid-js/web
var require_web = __commonJS({ "solid-js/web"(exports, module) {
	module.exports = shelter.solidWeb;
} });

//#endregion
//#region plugins/html-viewer/core/harden.ts
const TRUSTED_CDNS = [
	"https://cdn.jsdelivr.net",
	"https://unpkg.com",
	"https://cdnjs.cloudflare.com",
	"https://cdn.tailwindcss.com",
	"https://fonts.googleapis.com",
	"https://fonts.gstatic.com",
	"https://esm.sh"
];
const CDN = TRUSTED_CDNS.join(" ");
const DISCORD_MEDIA = "https://cdn.discordapp.com https://media.discordapp.net";
const LOCKED_CSP = [
	"default-src 'none'",
	`script-src 'unsafe-inline' 'unsafe-eval' ${CDN}`,
	`style-src 'unsafe-inline' ${CDN}`,
	`img-src data: ${DISCORD_MEDIA} ${CDN}`,
	`font-src data: ${CDN}`,
	`media-src data: ${DISCORD_MEDIA}`,
	"connect-src 'none'",
	"form-action 'none'",
	"base-uri 'none'"
].join("; ");
const FULLVIEW_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline' 'unsafe-eval' https:",
	"style-src 'unsafe-inline' https:",
	"img-src data: https:",
	"font-src data: https:",
	"media-src data: https:",
	"connect-src 'none'",
	"form-action 'none'",
	"base-uri 'none'"
].join("; ");
function metaFor(csp) {
	return `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
}
const HEAD_OPEN = /<head\b[^>]*>/i;
const HTML_OPEN = /<html\b[^>]*>/i;
function hardenHtml(html, csp = LOCKED_CSP) {
	const raw = html ?? "";
	const META = metaFor(csp);
	const head = HEAD_OPEN.exec(raw);
	if (head) {
		const at = head.index + head[0].length;
		return raw.slice(0, at) + META + raw.slice(at);
	}
	const htmlTag = HTML_OPEN.exec(raw);
	if (htmlTag) {
		const at = htmlTag.index + htmlTag[0].length;
		return raw.slice(0, at) + `<head>${META}</head>` + raw.slice(at);
	}
	return `<!doctype html><html><head>${META}</head><body>${raw}</body></html>`;
}

//#endregion
//#region plugins/html-viewer/core/detect.ts
function isHtmlAttachment(att) {
	if (!att) return false;
	const type = (att.content_type ?? "").toLowerCase();
	if (type.split(";")[0].trim() === "text/html") return true;
	const name = (att.filename ?? "").toLowerCase();
	return name.endsWith(".html") || name.endsWith(".htm");
}
const REF_URL = /(?:<(?:script|img)\b[^>]*\bsrc|<link\b[^>]*\bhref)\s*=\s*["']?\s*((?:https?:)?\/\/[^"'\s>]+)/gi;
const IMPORT_URL = /@import\s+(?:url\()?\s*["']?\s*((?:https?:)?\/\/[^"')\s]+)/gi;
function collectRefUrls(html) {
	const urls = [];
	for (const re of [REF_URL, IMPORT_URL]) {
		re.lastIndex = 0;
		let m;
		while ((m = re.exec(html)) !== null) urls.push(m[1]);
	}
	return urls;
}
function hasUntrustedRefs(html, trusted) {
	return collectRefUrls(html ?? "").some((u) => {
		const norm = u.startsWith("//") ? "https:" + u : u;
		return !trusted.some((t) => norm.startsWith(t));
	});
}

//#endregion
//#region plugins/html-viewer/core/allowlist.ts
function parseIds(csv) {
	return (csv ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}
function hasId(csv, id) {
	return !!id && parseIds(csv).includes(id);
}
function toggleId(csv, id) {
	if (!id) return csv ?? "";
	const ids = parseIds(csv);
	const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
	return next.join(",");
}

//#endregion
//#region plugins/html-viewer/index.tsx
var import_web = __toESM(require_web(), 1);
var import_web$1 = __toESM(require_web(), 1);
var import_web$2 = __toESM(require_web(), 1);
var import_web$3 = __toESM(require_web(), 1);
var import_web$4 = __toESM(require_web(), 1);
var import_web$5 = __toESM(require_web(), 1);
var import_web$6 = __toESM(require_web(), 1);
var import_web$7 = __toESM(require_web(), 1);
var import_web$8 = __toESM(require_web(), 1);
var import_web$9 = __toESM(require_web(), 1);
const _tmpl$ = /*#__PURE__*/ (0, import_web.template)(`<svg class="hv-icon" viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path></path></svg>`, 4), _tmpl$2 = /*#__PURE__*/ (0, import_web.template)(`<button class="hv-toggle" title="Always render this user's HTML"></button>`, 2), _tmpl$3 = /*#__PURE__*/ (0, import_web.template)(`<button class="hv-toggle" title="Always render HTML in this server"></button>`, 2), _tmpl$4 = /*#__PURE__*/ (0, import_web.template)(`<button class="hv-btn hv-btn-primary"><!#><!/> Render</button>`, 4), _tmpl$5 = /*#__PURE__*/ (0, import_web.template)(`<button class="hv-btn"><!#><!/> Collapse</button>`, 4), _tmpl$6 = /*#__PURE__*/ (0, import_web.template)(`<div class="hv-note"><!#><!/> exceeds the <!#><!/> KB inline limit. Use Full view or Download.</div>`, 6), _tmpl$7 = /*#__PURE__*/ (0, import_web.template)(`<div class="hv-note">Rendering…</div>`, 2), _tmpl$8 = /*#__PURE__*/ (0, import_web.template)(`<div class="hv-note hv-error">Couldn't load artifact: <!#><!/></div>`, 4), _tmpl$9 = /*#__PURE__*/ (0, import_web.template)(`<div class="hv-note hv-hint">References assets outside the trusted CDNs, which the inline preview blocks. Use Full view.</div>`, 2), _tmpl$0 = /*#__PURE__*/ (0, import_web.template)(`<div class="hv-card"><div class="hv-head"><span class="hv-lock" title="Inline preview is sandboxed; Full view enables CDN network. Neither can touch Discord.">🔒</span><span class="hv-name"></span><span class="hv-size"></span><span class="hv-spacer"></span><!#><!/><!#><!/><!#><!/><!#><!/><button class="hv-btn"><!#><!/> Full view</button><button class="hv-btn"><!#><!/> Download</button></div><!#><!/><!#><!/></div>`, 32), _tmpl$1 = /*#__PURE__*/ (0, import_web.template)(`<div><!#><!/><!#><!/><!#><!/><!#><!/><!#><!/><!#><!/><!#><!/><!#><!/><!#><!/><!#><!/></div>`, 22);
const { flux: { storesFlat: { SelectedChannelStore, ChannelStore }, dispatcher }, util: { getFiber, reactFiberWalker }, observeDom, solid: { createSignal, createEffect, Show }, solidWeb: { render }, ui: { openModal, ModalRoot, ModalSizes, ModalHeader, ModalBody, ModalFooter, Button, Text, Header, HeaderTags, Divider, SwitchItem, TextBox, injectCss }, plugin: { store } } = shelter;
store.maxSizeKb ??= 512;
store.autoRenderAll ??= false;
store.autoRenderUsers ??= "";
store.autoRenderServers ??= "";
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
const htmlCache = new Map();
async function fetchHtml(att) {
	if (htmlCache.has(att.id)) return htmlCache.get(att.id);
	const res = await fetch(att.url);
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	const text = await res.text();
	htmlCache.set(att.id, text);
	return text;
}
function formatBytes(n) {
	if (typeof n !== "number") return "";
	if (n < 1024) return `${n} B`;
	if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / 1048576).toFixed(1)} MB`;
}
function makeFrame(html, mode) {
	const f = document.createElement("iframe");
	f.setAttribute("sandbox", "allow-scripts");
	f.setAttribute("allow", "");
	f.setAttribute("referrerpolicy", "no-referrer");
	f.className = "hv-frame " + (mode === "full" ? "hv-frame-modal" : "hv-frame-inline");
	f.srcdoc = hardenHtml(html, mode === "full" ? FULLVIEW_CSP : LOCKED_CSP);
	return f;
}
function download(att) {
	fetchHtml(att).then((text) => {
		const url = URL.createObjectURL(new Blob([text], { type: "text/html" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = att.filename || "artifact.html";
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1e3);
	});
}
function openFullView(att) {
	fetchHtml(att).then((text) => {
		const frame = makeFrame(text, "full");
		openModal((props) => (0, import_web$9.createComponent)(ModalRoot, {
			get size() {
				return ModalSizes.LARGE;
			},
			"class": "hv-modal",
			get children() {
				return [
					(0, import_web$9.createComponent)(ModalHeader, {
						get close() {
							return props.close;
						},
						get children() {
							return att.filename;
						}
					}),
					(0, import_web$9.createComponent)(ModalBody, { children: frame }),
					(0, import_web$9.createComponent)(ModalFooter, { get children() {
						return (0, import_web$9.createComponent)(Button, {
							get onClick() {
								return props.close;
							},
							children: "Done"
						});
					} })
				];
			}
		}));
	});
}
const svg = (d) => (() => {
	const _el$ = (0, import_web$7.getNextElement)(_tmpl$), _el$2 = _el$.firstChild;
	(0, import_web$8.setAttribute)(_el$2, "d", d);
	return _el$;
})();
const RenderIcon = () => svg("M12 5c-5 0-9 4.2-10 7 1 2.8 5 7 10 7s9-4.2 10-7c-1-2.8-5-7-10-7zm0 11.5A4.5 4.5 0 1112 7.5a4.5 4.5 0 010 9zm0-2.2a2.3 2.3 0 100-4.6 2.3 2.3 0 000 4.6z");
const ExpandIcon = () => svg("M4 4h6V2H2v8h2V4zm16 0v6h2V2h-8v2h6zM4 14H2v8h8v-2H4v-6zm18 0h-2v6h-6v2h8v-8z");
const DownloadIcon = () => svg("M13 3h-2v9H7.5l4.5 4.5L16.5 12H13V3zM5 19h14v2H5v-2z");
const CollapseIcon = () => svg("M12 8.4l6 6L16.6 16 12 11.2 7.4 16 6 14.4z");
const UserIcon = () => svg("M12 12a5 5 0 100-10 5 5 0 000 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5c0-3-4-5.5-9-5.5z");
const ServerIcon = () => svg("M9.5 3L8 8H4l-.5 2h4l-1 5H2.5L2 17h4l-1 4h2l1-4h4l-1 4h2l1-4h4l.5-2h-4l1-5h4.5l.5-2h-4l1-5h-2l-1 5H10l1-5H9.5zm.1 7h4l-1 5h-4l1-5z");
function HtmlCard(props) {
	const att = props.att;
	const tooBig = () => att.size > store.maxSizeKb * 1024;
	const autoRender = store.autoRenderAll || hasId(store.autoRenderUsers, props.authorId) || !!props.guildId && hasId(store.autoRenderServers, props.guildId);
	const [open, setOpen] = createSignal(autoRender && !tooBig());
	const [html, setHtml] = createSignal(htmlCache.get(att.id));
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal();
	createEffect(() => {
		if (!open() || html() || loading() || error()) return;
		setLoading(true);
		fetchHtml(att).then((t) => {
			setHtml(t);
			setLoading(false);
		}).catch((e) => {
			setError(String(e?.message ?? e));
			setLoading(false);
		});
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
	const holder = document.createElement("div");
	createEffect(() => {
		holder.replaceChildren();
		const h = html();
		if (open() && h) holder.append(makeFrame(h, "locked"));
	});
	return (() => {
		const _el$3 = (0, import_web$7.getNextElement)(_tmpl$0), _el$4 = _el$3.firstChild, _el$5 = _el$4.firstChild, _el$6 = _el$5.nextSibling, _el$7 = _el$6.nextSibling, _el$8 = _el$7.nextSibling, _el$25 = _el$8.nextSibling, [_el$26, _co$5] = (0, import_web$2.getNextMarker)(_el$25.nextSibling), _el$27 = _el$26.nextSibling, [_el$28, _co$6] = (0, import_web$2.getNextMarker)(_el$27.nextSibling), _el$29 = _el$28.nextSibling, [_el$30, _co$7] = (0, import_web$2.getNextMarker)(_el$29.nextSibling), _el$31 = _el$30.nextSibling, [_el$32, _co$8] = (0, import_web$2.getNextMarker)(_el$31.nextSibling), _el$17 = _el$32.nextSibling, _el$19 = _el$17.firstChild, [_el$20, _co$3] = (0, import_web$2.getNextMarker)(_el$19.nextSibling), _el$18 = _el$20.nextSibling, _el$21 = _el$17.nextSibling, _el$23 = _el$21.firstChild, [_el$24, _co$4] = (0, import_web$2.getNextMarker)(_el$23.nextSibling), _el$22 = _el$24.nextSibling, _el$46 = _el$4.nextSibling, [_el$47, _co$10] = (0, import_web$2.getNextMarker)(_el$46.nextSibling), _el$48 = _el$47.nextSibling, [_el$49, _co$11] = (0, import_web$2.getNextMarker)(_el$48.nextSibling);
		(0, import_web$6.insert)(_el$6, () => att.filename);
		(0, import_web$6.insert)(_el$7, () => formatBytes(att.size));
		(0, import_web$6.insert)(_el$4, (0, import_web$9.createComponent)(Show, {
			get when() {
				return props.authorId;
			},
			get children() {
				const _el$9 = (0, import_web$7.getNextElement)(_tmpl$2);
				_el$9.$$click = toggleUser;
				(0, import_web$6.insert)(_el$9, (0, import_web$9.createComponent)(UserIcon, {}));
				(0, import_web$4.effect)(() => _el$9.classList.toggle("hv-toggle-on", !!userOn()));
				(0, import_web$5.runHydrationEvents)();
				return _el$9;
			}
		}), _el$26, _co$5);
		(0, import_web$6.insert)(_el$4, (0, import_web$9.createComponent)(Show, {
			get when() {
				return props.guildId;
			},
			get children() {
				const _el$0 = (0, import_web$7.getNextElement)(_tmpl$3);
				_el$0.$$click = toggleServer;
				(0, import_web$6.insert)(_el$0, (0, import_web$9.createComponent)(ServerIcon, {}));
				(0, import_web$4.effect)(() => _el$0.classList.toggle("hv-toggle-on", !!serverOn()));
				(0, import_web$5.runHydrationEvents)();
				return _el$0;
			}
		}), _el$28, _co$6);
		(0, import_web$6.insert)(_el$4, (0, import_web$9.createComponent)(Show, {
			get when() {
				return (0, import_web$3.memo)(() => !!!open())() && !tooBig();
			},
			get children() {
				const _el$1 = (0, import_web$7.getNextElement)(_tmpl$4), _el$11 = _el$1.firstChild, [_el$12, _co$] = (0, import_web$2.getNextMarker)(_el$11.nextSibling), _el$10 = _el$12.nextSibling;
				_el$1.$$click = () => setOpen(true);
				(0, import_web$6.insert)(_el$1, (0, import_web$9.createComponent)(RenderIcon, {}), _el$12, _co$);
				(0, import_web$5.runHydrationEvents)();
				return _el$1;
			}
		}), _el$30, _co$7);
		(0, import_web$6.insert)(_el$4, (0, import_web$9.createComponent)(Show, {
			get when() {
				return open();
			},
			get children() {
				const _el$13 = (0, import_web$7.getNextElement)(_tmpl$5), _el$15 = _el$13.firstChild, [_el$16, _co$2] = (0, import_web$2.getNextMarker)(_el$15.nextSibling), _el$14 = _el$16.nextSibling;
				_el$13.$$click = () => setOpen(false);
				(0, import_web$6.insert)(_el$13, (0, import_web$9.createComponent)(CollapseIcon, {}), _el$16, _co$2);
				(0, import_web$5.runHydrationEvents)();
				return _el$13;
			}
		}), _el$32, _co$8);
		_el$17.$$click = () => openFullView(att);
		(0, import_web$6.insert)(_el$17, (0, import_web$9.createComponent)(ExpandIcon, {}), _el$20, _co$3);
		_el$21.$$click = () => download(att);
		(0, import_web$6.insert)(_el$21, (0, import_web$9.createComponent)(DownloadIcon, {}), _el$24, _co$4);
		(0, import_web$6.insert)(_el$3, (0, import_web$9.createComponent)(Show, {
			get when() {
				return (0, import_web$3.memo)(() => !!tooBig())() && !open();
			},
			get children() {
				const _el$33 = (0, import_web$7.getNextElement)(_tmpl$6), _el$36 = _el$33.firstChild, [_el$37, _co$9] = (0, import_web$2.getNextMarker)(_el$36.nextSibling), _el$34 = _el$37.nextSibling, _el$38 = _el$34.nextSibling, [_el$39, _co$0] = (0, import_web$2.getNextMarker)(_el$38.nextSibling), _el$35 = _el$39.nextSibling;
				(0, import_web$6.insert)(_el$33, () => formatBytes(att.size), _el$37, _co$9);
				(0, import_web$6.insert)(_el$33, () => store.maxSizeKb, _el$39, _co$0);
				return _el$33;
			}
		}), _el$47, _co$10);
		(0, import_web$6.insert)(_el$3, (0, import_web$9.createComponent)(Show, {
			get when() {
				return open();
			},
			get children() {
				return [
					(0, import_web$9.createComponent)(Show, {
						get when() {
							return loading();
						},
						get children() {
							return (0, import_web$7.getNextElement)(_tmpl$7);
						}
					}),
					(0, import_web$9.createComponent)(Show, {
						get when() {
							return error();
						},
						get children() {
							const _el$41 = (0, import_web$7.getNextElement)(_tmpl$8), _el$42 = _el$41.firstChild, _el$43 = _el$42.nextSibling, [_el$44, _co$1] = (0, import_web$2.getNextMarker)(_el$43.nextSibling);
							(0, import_web$6.insert)(_el$41, error, _el$44, _co$1);
							return _el$41;
						}
					}),
					(0, import_web$9.createComponent)(Show, {
						get when() {
							return (0, import_web$3.memo)(() => !!html())() && hasUntrustedRefs(html(), TRUSTED_CDNS);
						},
						get children() {
							return (0, import_web$7.getNextElement)(_tmpl$9);
						}
					}),
					holder
				];
			}
		}), _el$49, _co$11);
		(0, import_web$5.runHydrationEvents)();
		return _el$3;
	})();
}
const disposers = [];
function processRow(row) {
	const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message;
	const attachments = msg?.attachments ?? [];
	const artifacts = attachments.filter(isHtmlAttachment);
	if (!artifacts.length) return;
	const guildId = ChannelStore.getChannel?.(msg.channel_id)?.guild_id;
	const authorId = msg.author?.id;
	const contents = row.querySelector("[class*=\"contents\"]");
	for (const att of artifacts) {
		const link = row.querySelector(`a[href*="${att.id}"]`);
		const nativeWrap = link?.closest("[class*=\"nonVisualMediaItemContainer\"]") ?? link?.closest("[class*=\"nonVisualMediaItem\"], [class*=\"mosaicItem\"], [class*=\"messageAttachment\"]");
		if (nativeWrap) nativeWrap.style.display = "none";
		const mount = document.createElement("div");
		mount.className = "hv-mount";
		const dispose = render(() => (0, import_web$9.createComponent)(HtmlCard, {
			att,
			authorId,
			guildId
		}), mount);
		disposers.push(dispose);
		if (contents) contents.appendChild(mount);
else row.appendChild(mount);
	}
}
const TRIGGERS = [
	"MESSAGE_CREATE",
	"MESSAGE_UPDATE",
	"UPDATE_CHANNEL_DIMENSIONS",
	"LOAD_MESSAGES_SUCCESS"
];
function handleDispatch(payload) {
	if ((payload.type === "MESSAGE_CREATE" || payload.type === "MESSAGE_UPDATE") && payload.message?.channel_id !== SelectedChannelStore.getChannelId()) return;
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
	setTimeout(unobs, 1500);
}
function settings() {
	const onNum = (v) => {
		const n = parseInt(v, 10);
		if (!Number.isNaN(n) && n > 0) store.maxSizeKb = n;
	};
	return (() => {
		const _el$50 = (0, import_web$7.getNextElement)(_tmpl$1), _el$51 = _el$50.firstChild, [_el$52, _co$12] = (0, import_web$2.getNextMarker)(_el$51.nextSibling), _el$53 = _el$52.nextSibling, [_el$54, _co$13] = (0, import_web$2.getNextMarker)(_el$53.nextSibling), _el$55 = _el$54.nextSibling, [_el$56, _co$14] = (0, import_web$2.getNextMarker)(_el$55.nextSibling), _el$57 = _el$56.nextSibling, [_el$58, _co$15] = (0, import_web$2.getNextMarker)(_el$57.nextSibling), _el$59 = _el$58.nextSibling, [_el$60, _co$16] = (0, import_web$2.getNextMarker)(_el$59.nextSibling), _el$61 = _el$60.nextSibling, [_el$62, _co$17] = (0, import_web$2.getNextMarker)(_el$61.nextSibling), _el$63 = _el$62.nextSibling, [_el$64, _co$18] = (0, import_web$2.getNextMarker)(_el$63.nextSibling), _el$65 = _el$64.nextSibling, [_el$66, _co$19] = (0, import_web$2.getNextMarker)(_el$65.nextSibling), _el$67 = _el$66.nextSibling, [_el$68, _co$20] = (0, import_web$2.getNextMarker)(_el$67.nextSibling), _el$69 = _el$68.nextSibling, [_el$70, _co$21] = (0, import_web$2.getNextMarker)(_el$69.nextSibling);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(Header, {
			get tag() {
				return HeaderTags.H3;
			},
			children: "Rendering"
		}), _el$52, _co$12);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(SwitchItem, {
			get checked() {
				return store.autoRenderAll;
			},
			onChange: (v) => store.autoRenderAll = v,
			note: "Render every HTML artifact inline automatically, skipping the Render button.",
			children: "Auto-render everything"
		}), _el$54, _co$13);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(Text, { children: "Max inline size (KB)" }), _el$56, _co$14);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(TextBox, {
			get value() {
				return String(store.maxSizeKb);
			},
			onInput: onNum
		}), _el$58, _co$15);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(Divider, {
			mt: true,
			mb: true
		}), _el$60, _co$16);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(Header, {
			get tag() {
				return HeaderTags.H3;
			},
			children: "Auto-render allowlists"
		}), _el$62, _co$17);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(Text, { children: "User IDs — comma-separated (easier: use the person toggle on a card)" }), _el$64, _co$18);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(TextBox, {
			get value() {
				return store.autoRenderUsers;
			},
			onInput: (v) => store.autoRenderUsers = v
		}), _el$66, _co$19);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(Text, { children: "Server IDs — comma-separated (easier: use the server toggle on a card)" }), _el$68, _co$20);
		(0, import_web$6.insert)(_el$50, (0, import_web$9.createComponent)(TextBox, {
			get value() {
				return store.autoRenderServers;
			},
			onInput: (v) => store.autoRenderServers = v
		}), _el$70, _co$21);
		return _el$50;
	})();
}
let removeCss;
function onLoad() {
	removeCss = injectCss(CSS);
	for (const t of TRIGGERS) dispatcher.subscribe(t, handleDispatch);
}
function onUnload() {
	for (const t of TRIGGERS) dispatcher.unsubscribe(t, handleDispatch);
	for (const d of disposers.splice(0)) try {
		d();
	} catch {}
	document.querySelectorAll(".hv-mount").forEach((n) => n.remove());
	removeCss?.();
}
(0, import_web$1.delegateEvents)(["click"]);

//#endregion
exports.onLoad = onLoad
exports.onUnload = onUnload
exports.settings = settings
return exports;
})({});