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
const BLOCK_TAGS = new Set([
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"UL",
	"OL",
	"LI",
	"P",
	"DIV",
	"BLOCKQUOTE",
	"PRE",
	"HR",
	"TABLE",
	"ASIDE",
	"SECTION",
	"ARTICLE",
	"FIGURE"
]);
const MDT_INSERTED_ATTR = "data-mdt-inserted";
const MDT_INSERTED_SELECTOR = `[${MDT_INSERTED_ATTR}], .mdt-wrap`;
const MDT_SRC_CLASS = "mdt-src";
function isBlock(n) {
	return n.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(n.nodeName);
}
function buildRunText(run) {
	let text = "";
	const segs = [];
	const visit = (node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const t = node;
			segs.push({
				node: t,
				start: text.length,
				len: t.data.length
			});
			text += t.data;
		} else if (node.nodeName === "BR") text += "\n";
else for (const child of Array.from(node.childNodes)) visit(child);
	};
	for (const n of run) visit(n);
	return {
		text,
		segs
	};
}
function locate(segs, char) {
	for (const s of segs) if (char >= s.start && char < s.start + s.len) return {
		node: s.node,
		offset: char - s.start
	};
	let best;
	for (const s of segs) if (s.start + s.len <= char) best = s;
else if (s.start <= char) best = s;
	if (best && char >= best.start && char <= best.start + best.len) return {
		node: best.node,
		offset: char - best.start
	};
	return null;
}
function blockCharRange(runLines, block) {
	let start = 0;
	for (let i = 0; i < block.startLine; i++) start += runLines[i].length + 1;
	let end = start;
	for (let i = block.startLine; i <= block.endLine; i++) {
		end += runLines[i].length;
		if (i < block.endLine) end += 1;
	}
	return [start, end];
}
function renderTablesInContent(contentEl, makeTable) {
	const doc = contentEl.ownerDocument ?? document;
	const runs = [];
	let cur = [];
	for (const child of Array.from(contentEl.childNodes)) if (isBlock(child)) {
		if (cur.length) runs.push(cur);
		cur = [];
	} else cur.push(child);
	if (cur.length) runs.push(cur);
	let count = 0;
	for (const run of runs) {
		const { text, segs } = buildRunText(run);
		if (!text.includes("|")) continue;
		const blocks = parseTables(text);
		if (!blocks.length) continue;
		const runLines = text.split("\n");
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
			range.insertNode(holder);
			holder.parentNode?.insertBefore(table, holder.nextSibling);
			count++;
		}
	}
	return count;
}
function restoreReplacedTables(root) {
	root.querySelectorAll(MDT_INSERTED_SELECTOR).forEach((el) => el.remove());
	root.querySelectorAll(`.${MDT_SRC_CLASS}`).forEach((holder) => {
		const parent = holder.parentNode;
		if (!parent) return;
		while (holder.firstChild) parent.insertBefore(holder.firstChild, holder);
		parent.removeChild(holder);
	});
}

//#endregion
//#region plugins/md-tables/index.tsx
const { flux: { storesFlat: { SelectedChannelStore }, dispatcher }, observeDom, ui: { injectCss } } = shelter;
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
	if (!(contentEl.textContent ?? "").includes("|")) return;
	const rendered = renderTablesInContent(contentEl, renderTable);
	if (rendered > 0) contentEl.dataset.mdTables = "1";
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