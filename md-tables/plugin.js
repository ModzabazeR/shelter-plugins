(function(exports) {

"use strict";

//#region plugins/md-tables/core/parseTables.ts
const DELIM_CELL = /^:?-+:?$/;
function splitRow(line) {
	const cells = [];
	let cur = "";
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === "\\" && line[i + 1] === "|") {
			cur += "|";
			i++;
			continue;
		}
		if (ch === "|") {
			cells.push(cur);
			cur = "";
			continue;
		}
		cur += ch;
	}
	cells.push(cur);
	if (cells.length && cells[0].trim() === "") cells.shift();
	if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
	return cells.map((c) => c.trim());
}
function isDelimiterLine(line) {
	if (!line.includes("-")) return false;
	const cells = splitRow(line);
	return cells.length > 0 && cells.every((c) => DELIM_CELL.test(c));
}
function parseAligns(line) {
	return splitRow(line).map((c) => {
		const left = c.startsWith(":");
		const right = c.endsWith(":");
		if (left && right) return "center";
		if (right) return "right";
		if (left) return "left";
		return null;
	});
}
function fit(cells, n) {
	const out = cells.slice(0, n);
	while (out.length < n) out.push("");
	return out;
}
function parseTables(text) {
	const lines = text.split("\n");
	const blocks = [];
	let i = 0;
	while (i < lines.length) {
		const header = lines[i];
		const delim = lines[i + 1];
		const headerIsRow = header !== undefined && header.includes("|") && header.trim() !== "";
		if (headerIsRow && delim !== undefined && isDelimiterLine(delim)) {
			const aligns = parseAligns(delim);
			const ncol = aligns.length;
			const headerCells = splitRow(header);
			if (headerCells.length !== ncol) {
				i++;
				continue;
			}
			const headers = fit(headerCells, ncol);
			const rows = [];
			let j = i + 2;
			while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) {
				rows.push(fit(splitRow(lines[j]), ncol));
				j++;
			}
			blocks.push({
				headers,
				aligns,
				rows,
				startLine: i,
				endLine: j - 1
			});
			i = j;
		} else i++;
	}
	return blocks;
}

//#endregion
//#region plugins/md-tables/core/formatInline.ts
function formatInline(cell, doc = document) {
	return parseSegment(cell, doc);
}
function parseSegment(text, doc) {
	const nodes = [];
	let buf = "";
	let i = 0;
	const flush = () => {
		if (buf) {
			nodes.push(doc.createTextNode(buf));
			buf = "";
		}
	};
	while (i < text.length) {
		const rest = text.slice(i);
		let m = /^`([^`]+)`/.exec(rest);
		if (m) {
			flush();
			const el = doc.createElement("code");
			el.textContent = m[1];
			nodes.push(el);
			i += m[0].length;
			continue;
		}
		m = /^(\*\*|__)(.+?)\1/.exec(rest);
		if (m) {
			flush();
			const el = doc.createElement("strong");
			el.append(...parseSegment(m[2], doc));
			nodes.push(el);
			i += m[0].length;
			continue;
		}
		m = /^~~(.+?)~~/.exec(rest);
		if (m) {
			flush();
			const el = doc.createElement("s");
			el.append(...parseSegment(m[1], doc));
			nodes.push(el);
			i += m[0].length;
			continue;
		}
		m = /^(\*|_)(?!\s)(.+?)(?<!\s)\1/.exec(rest);
		if (m) {
			flush();
			const el = doc.createElement("em");
			el.append(...parseSegment(m[2], doc));
			nodes.push(el);
			i += m[0].length;
			continue;
		}
		buf += text[i];
		i++;
	}
	flush();
	return nodes;
}

//#endregion
//#region plugins/md-tables/core/replaceTables.ts
const MDT_INSERTED_ATTR = "data-mdt-inserted";
const MDT_INSERTED_SELECTOR = `[${MDT_INSERTED_ATTR}], .mdt-wrap`;
const MDT_SRC_CLASS = "mdt-src";
function isNewlineMarker(node) {
	return node.nodeType === Node.TEXT_NODE && node.textContent === "\n";
}
function normalizeNewlines(root) {
	const doc = root.ownerDocument ?? document;
	const textNodes = Array.from(root.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
	for (const textNode of textNodes) {
		const raw = textNode.data;
		if (!raw.includes("\n")) continue;
		const parts = raw.split("\n");
		const replacements = [];
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
function collectLines(root) {
	const lines = [];
	let cur = {
		text: "",
		nodes: []
	};
	const endLine = () => {
		lines.push(cur);
		cur = {
			text: "",
			nodes: []
		};
	};
	for (const child of Array.from(root.childNodes)) if (child.nodeName === "BR" || isNewlineMarker(child)) {
		cur.nodes.push(child);
		endLine();
	} else {
		cur.nodes.push(child);
		cur.text += child.textContent ?? "";
	}
	if (cur.nodes.length > 0) lines.push(cur);
	return lines;
}
function matchRange(lines, blockLines) {
	for (let start = 0; start + blockLines.length <= lines.length; start++) {
		let matches = true;
		for (let k = 0; k < blockLines.length; k++) if (lines[start + k].text.trim() !== blockLines[k]) {
			matches = false;
			break;
		}
		if (!matches) continue;
		const nodes = [];
		for (let k = 0; k < blockLines.length; k++) for (const n of lines[start + k].nodes) if (!nodes.includes(n)) nodes.push(n);
		return nodes;
	}
	return null;
}
function wrapAndInsert(nodes, replacement) {
	const first = nodes[0];
	const parent = first?.parentNode;
	if (!parent) return;
	const doc = parent.ownerDocument ?? document;
	const srcSpan = doc.createElement("span");
	srcSpan.className = MDT_SRC_CLASS;
	srcSpan.style.display = "none";
	parent.insertBefore(srcSpan, first);
	for (const n of nodes) srcSpan.appendChild(n);
	replacement.setAttribute(MDT_INSERTED_ATTR, "1");
	parent.insertBefore(replacement, srcSpan.nextSibling);
}
function replaceTablesInContent(contentEl, content, blocks, makeTable) {
	if (!blocks.length) return 0;
	const originalChildren = Array.from(contentEl.childNodes);
	normalizeNewlines(contentEl);
	const contentLines = content.split("\n");
	const lines = collectLines(contentEl);
	const matched = [];
	for (const block of blocks) {
		const blockLines = contentLines.slice(block.startLine, block.endLine + 1).map((s) => s.trim());
		const range = matchRange(lines, blockLines);
		if (range) matched.push({
			block,
			range
		});
	}
	if (matched.length === 0) {
		while (contentEl.firstChild) contentEl.removeChild(contentEl.firstChild);
		for (const node of originalChildren) contentEl.appendChild(node);
		return 0;
	}
	for (const { block, range } of [...matched].reverse()) wrapAndInsert(range, makeTable(block));
	return matched.length;
}
function restoreReplacedTables(root) {
	root.querySelectorAll(MDT_INSERTED_SELECTOR).forEach((el) => el.remove());
	root.querySelectorAll(`.${MDT_SRC_CLASS}`).forEach((span) => {
		const parent = span.parentNode;
		if (!parent) return;
		while (span.firstChild) parent.insertBefore(span.firstChild, span);
		parent.removeChild(span);
	});
}

//#endregion
//#region plugins/md-tables/index.tsx
const { flux: { storesFlat: { SelectedChannelStore }, dispatcher }, util: { getFiber, reactFiberWalker }, observeDom, ui: { injectCss } } = shelter;
const CSS = `
.mdt-wrap{max-width:100%;overflow-x:auto;margin:6px 0}
.mdt-table{border-collapse:collapse;font-size:.95rem;line-height:1.35}
.mdt-table th,.mdt-table td{border:1px solid var(--background-modifier-accent,rgba(255,255,255,.1));padding:6px 10px;color:var(--text-normal,#dbdee1);vertical-align:top}
.mdt-table th{background:var(--background-secondary,#2b2d31);font-weight:600;text-align:left}
.mdt-table tbody tr:nth-child(even){background:var(--background-secondary-alt,rgba(255,255,255,.03))}
.mdt-table code{background:var(--background-secondary-alt,rgba(255,255,255,.08));padding:0 4px;border-radius:3px;font-family:var(--font-code,monospace)}
.mdt-src{display:none}
`;
function applyAlign(el, a) {
	if (a) el.style.textAlign = a;
}
function renderTable(block) {
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
function processRow(row) {
	const contentEl = row.querySelector("[id^=\"message-content-\"]");
	if (!contentEl) return;
	if (contentEl.dataset.mdTables === "1") return;
	const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message;
	const content = msg?.content;
	if (!content || !content.includes("|")) return;
	const blocks = parseTables(content);
	if (!blocks.length) return;
	const replaced = replaceTablesInContent(contentEl, content, blocks, renderTable);
	if (replaced > 0) contentEl.dataset.mdTables = "1";
}
const TRIGGERS = [
	"MESSAGE_CREATE",
	"MESSAGE_UPDATE",
	"LOAD_MESSAGES_SUCCESS",
	"UPDATE_CHANNEL_DIMENSIONS"
];
const activeObservers = new Set();
function handleDispatch(payload) {
	if ((payload.type === "MESSAGE_CREATE" || payload.type === "MESSAGE_UPDATE") && payload.message?.channel_id !== SelectedChannelStore.getChannelId()) return;
	const unobs = observeDom("[id^=\"chat-messages-\"]", (e) => {
		if (!(e instanceof HTMLElement)) return;
		try {
			processRow(e);
		} catch (err) {
			console.error("[md-tables] processRow failed", err);
		}
	});
	let timeoutId;
	const stop = () => {
		activeObservers.delete(stop);
		if (timeoutId !== undefined) clearTimeout(timeoutId);
		unobs();
	};
	activeObservers.add(stop);
	timeoutId = setTimeout(stop, 1500);
}
let removeCss;
function onLoad() {
	removeCss = injectCss(CSS);
	for (const t of TRIGGERS) dispatcher.subscribe(t, handleDispatch);
}
function onUnload() {
	for (const t of TRIGGERS) dispatcher.unsubscribe(t, handleDispatch);
	for (const stop of [...activeObservers]) stop();
	restoreReplacedTables(document);
	document.querySelectorAll("[data-md-tables]").forEach((el) => {
		delete el.dataset.mdTables;
	});
	removeCss?.();
}

//#endregion
exports.onLoad = onLoad
exports.onUnload = onUnload
return exports;
})({});