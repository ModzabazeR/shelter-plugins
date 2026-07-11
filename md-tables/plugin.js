(function(exports) {

"use strict";

//#region plugins/md-tables/core/parseTables.ts
const DELIM_CELL$1 = /^:?-+:?$/;
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
	return cells.length > 0 && cells.every((c) => DELIM_CELL$1.test(c));
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
function fit$1(cells, n) {
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
			const headers = fit$1(headerCells, ncol);
			const rows = [];
			let j = i + 2;
			while (j < lines.length && lines[j].trim() !== "" && lines[j].includes("|")) {
				rows.push(fit$1(splitRow(lines[j]), ncol));
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
const DELIM_CELL = /^:?-+:?$/;
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
	for (const s of segs) if (s.start <= char && char <= s.start + s.len) best = s;
	return best ? {
		node: best.node,
		offset: char - best.start
	} : null;
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
function isTransparentWrapper(node) {
	if (node.nodeType !== Node.ELEMENT_NODE || node.nodeName !== "SPAN") return false;
	const el = node;
	if (el.className === "") return true;
	const t = el.textContent ?? "";
	return t.includes("|") || t.includes("\n");
}
function tokenize(frag) {
	const toks = [];
	const visit = (node) => {
		for (const child of Array.from(node.childNodes)) if (child.nodeType === Node.TEXT_NODE) {
			let buf = "";
			const flush = () => {
				if (buf) {
					toks.push({
						k: "text",
						text: buf
					});
					buf = "";
				}
			};
			for (const ch of child.data) if (ch === "|") {
				flush();
				toks.push({ k: "cell" });
			} else if (ch === "\n") {
				flush();
				toks.push({ k: "row" });
			} else buf += ch;
			flush();
		} else if (child.nodeName === "BR") toks.push({ k: "row" });
else if (isTransparentWrapper(child)) visit(child);
else toks.push({
			k: "el",
			node: child
		});
	};
	visit(frag);
	return toks;
}
function tokensToRows(toks, doc) {
	const rows = [];
	let row = [];
	let cell = [];
	const endCell = () => {
		row.push(cell);
		cell = [];
	};
	const endRow = () => {
		endCell();
		rows.push(row);
		row = [];
	};
	for (const t of toks) if (t.k === "cell") endCell();
else if (t.k === "row") endRow();
else if (t.k === "text") cell.push(doc.createTextNode(t.text));
else cell.push(t.node.cloneNode(true));
	if (cell.length || row.some((c) => c.length)) endRow();
	return rows;
}
function isWs(node) {
	return node.nodeType === Node.TEXT_NODE && /^\s*$/.test(node.data);
}
function trimCell(nodes) {
	const out = nodes.slice();
	while (out.length && isWs(out[0])) out.shift();
	while (out.length && isWs(out[out.length - 1])) out.pop();
	if (out.length && out[0].nodeType === Node.TEXT_NODE) out[0].data = out[0].data.replace(/^\s+/, "");
	const last = out[out.length - 1];
	if (out.length && last.nodeType === Node.TEXT_NODE) last.data = last.data.replace(/\s+$/, "");
	return out;
}
function cellText(nodes) {
	return nodes.map((n) => n.textContent ?? "").join("").trim();
}
function normalizeRow(cells) {
	const trimmed = cells.map(trimCell);
	if (trimmed.length && cellText(trimmed[0]).length === 0) trimmed.shift();
	if (trimmed.length && cellText(trimmed[trimmed.length - 1]).length === 0) trimmed.pop();
	return trimmed;
}
function alignsFromRow(cells) {
	return cells.map((nodes) => {
		const s = cellText(nodes);
		const l = s.startsWith(":");
		const r = s.endsWith(":");
		return l && r ? "center" : r ? "right" : l ? "left" : null;
	});
}
function fit(arr, n, empty) {
	const out = arr.slice(0, n);
	while (out.length < n) out.push(empty());
	return out;
}
function applyAlign(el, a) {
	if (a) el.style.textAlign = a;
}
function buildTable(frag, doc) {
	const rawRows = tokensToRows(tokenize(frag), doc).map(normalizeRow);
	const d = rawRows.findIndex((cells) => cells.length > 0 && cells.every((c) => DELIM_CELL.test(cellText(c))));
	if (d < 1) return null;
	const header = rawRows[d - 1];
	const aligns = alignsFromRow(rawRows[d]);
	const ncol = aligns.length;
	const body = rawRows.slice(d + 1);
	const wrap = doc.createElement("div");
	wrap.className = "mdt-wrap";
	const table = doc.createElement("table");
	table.className = "mdt-table";
	const thead = doc.createElement("thead");
	const htr = doc.createElement("tr");
	fit(header, ncol, () => []).forEach((nodes, c) => {
		const th = doc.createElement("th");
		applyAlign(th, aligns[c]);
		th.append(...nodes);
		htr.append(th);
	});
	thead.append(htr);
	table.append(thead);
	const tbody = doc.createElement("tbody");
	for (const rowCells of body) {
		const tr = doc.createElement("tr");
		fit(rowCells, ncol, () => []).forEach((nodes, c) => {
			const td = doc.createElement("td");
			applyAlign(td, aligns[c]);
			td.append(...nodes);
			tr.append(td);
		});
		tbody.append(tr);
	}
	table.append(tbody);
	wrap.append(table);
	return wrap;
}
function renderTablesInContent(contentEl) {
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
			const table = buildTable(frag, doc);
			if (!table) {
				range.insertNode(frag);
				continue;
			}
			const holder = doc.createElement("span");
			holder.className = MDT_SRC_CLASS;
			holder.style.display = "none";
			holder.appendChild(frag);
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
function processRow(row) {
	const contentEl = row.querySelector("[id^=\"message-content-\"]");
	if (!contentEl) return;
	if (contentEl.dataset.mdTables === "1") return;
	if (!(contentEl.textContent ?? "").includes("|")) return;
	const rendered = renderTablesInContent(contentEl);
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