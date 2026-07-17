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
function parseTables(text$1) {
	const lines = text$1.split("\n");
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
			let j$1 = i + 2;
			while (j$1 < lines.length && lines[j$1].trim() !== "" && lines[j$1].includes("|")) {
				rows.push(fit$1(splitRow(lines[j$1]), ncol));
				j$1++;
			}
			blocks.push({
				headers,
				aligns,
				rows,
				startLine: i,
				endLine: j$1 - 1
			});
			i = j$1;
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
	let text$1 = "";
	const segs = [];
	const visit = (node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			const t = node;
			segs.push({
				node: t,
				start: text$1.length,
				len: t.data.length
			});
			text$1 += t.data;
		} else if (node.nodeName === "BR") text$1 += "\n";
else for (const child of Array.from(node.childNodes)) visit(child);
	};
	for (const n of run) visit(n);
	return {
		text: text$1,
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
	const d$1 = rawRows.findIndex((cells) => cells.length > 0 && cells.every((c) => DELIM_CELL.test(cellText(c))));
	if (d$1 < 1) return null;
	const header = rawRows[d$1 - 1];
	const aligns = alignsFromRow(rawRows[d$1]);
	const ncol = aligns.length;
	const body = rawRows.slice(d$1 + 1);
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
		const { text: text$1, segs } = buildRunText(run);
		if (!text$1.includes("|")) continue;
		const blocks = parseTables(text$1);
		if (!blocks.length) continue;
		const runLines = text$1.split("\n");
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
//#region plugins/md-tables/core/mdAttachment.ts
const MD_EXT = /\.(md|markdown)$/i;
function isMdAttachment(att) {
	const name = att?.filename;
	return typeof name === "string" && MD_EXT.test(name);
}

//#endregion
//#region node_modules/.pnpm/dompurify@3.4.12/node_modules/dompurify/dist/purify.es.mjs
/*! @license DOMPurify 3.4.12 | (c) Cure53 and other contributors | Released under the Apache license 2.0 and Mozilla Public License 2.0 | github.com/cure53/DOMPurify/blob/3.4.12/LICENSE */
function _arrayLikeToArray(r, a) {
	(null == a || a > r.length) && (a = r.length);
	for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
	return n;
}
function _arrayWithHoles(r) {
	if (Array.isArray(r)) return r;
}
function _iterableToArrayLimit(r, l) {
	var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
	if (null != t) {
		var e, n, i, u, a = [], f = true, o = false;
		try {
			if (i = (t = t.call(r)).next, 0 === l);
else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
		} catch (r$1) {
			o = true, n = r$1;
		} finally {
			try {
				if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
			} finally {
				if (o) throw n;
			}
		}
		return a;
	}
}
function _nonIterableRest() {
	throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _slicedToArray(r, e) {
	return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
}
function _unsupportedIterableToArray(r, a) {
	if (r) {
		if ("string" == typeof r) return _arrayLikeToArray(r, a);
		var t = {}.toString.call(r).slice(8, -1);
		return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
	}
}
const entries = Object.entries, setPrototypeOf = Object.setPrototypeOf, isFrozen = Object.isFrozen, getPrototypeOf = Object.getPrototypeOf, getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
let freeze = Object.freeze, seal = Object.seal, create = Object.create;
let _ref = typeof Reflect !== "undefined" && Reflect, apply = _ref.apply, construct = _ref.construct;
if (!freeze) freeze = function freeze$1(x$1) {
	return x$1;
};
if (!seal) seal = function seal$1(x$1) {
	return x$1;
};
if (!apply) apply = function apply$1(func, thisArg) {
	for (var _len = arguments.length, args = new Array(_len > 2 ? _len - 2 : 0), _key = 2; _key < _len; _key++) args[_key - 2] = arguments[_key];
	return func.apply(thisArg, args);
};
if (!construct) construct = function construct$1(Func) {
	for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) args[_key2 - 1] = arguments[_key2];
	return new Func(...args);
};
const arrayForEach = unapply(Array.prototype.forEach);
const arrayLastIndexOf = unapply(Array.prototype.lastIndexOf);
const arrayPop = unapply(Array.prototype.pop);
const arrayPush = unapply(Array.prototype.push);
const arraySplice = unapply(Array.prototype.splice);
const arrayIsArray = Array.isArray;
const stringToLowerCase = unapply(String.prototype.toLowerCase);
const stringToString = unapply(String.prototype.toString);
const stringMatch = unapply(String.prototype.match);
const stringReplace = unapply(String.prototype.replace);
const stringIndexOf = unapply(String.prototype.indexOf);
const stringTrim = unapply(String.prototype.trim);
const numberToString = unapply(Number.prototype.toString);
const booleanToString = unapply(Boolean.prototype.toString);
const bigintToString = typeof BigInt === "undefined" ? null : unapply(BigInt.prototype.toString);
const symbolToString = typeof Symbol === "undefined" ? null : unapply(Symbol.prototype.toString);
const objectHasOwnProperty = unapply(Object.prototype.hasOwnProperty);
const objectToString = unapply(Object.prototype.toString);
const regExpTest = unapply(RegExp.prototype.test);
const typeErrorCreate = unconstruct(TypeError);
/**
* Creates a new function that calls the given function with a specified thisArg and arguments.
*
* @param func - The function to be wrapped and called.
* @returns A new function that calls the given function with a specified thisArg and arguments.
*/
function unapply(func) {
	return function(thisArg) {
		if (thisArg instanceof RegExp) thisArg.lastIndex = 0;
		for (var _len3 = arguments.length, args = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) args[_key3 - 1] = arguments[_key3];
		return apply(func, thisArg, args);
	};
}
/**
* Creates a new function that constructs an instance of the given constructor function with the provided arguments.
*
* @param func - The constructor function to be wrapped and called.
* @returns A new function that constructs an instance of the given constructor function with the provided arguments.
*/
function unconstruct(Func) {
	return function() {
		for (var _len4 = arguments.length, args = new Array(_len4), _key4 = 0; _key4 < _len4; _key4++) args[_key4] = arguments[_key4];
		return construct(Func, args);
	};
}
/**
* Add properties to a lookup table
*
* @param set - The set to which elements will be added.
* @param array - The array containing elements to be added to the set.
* @param transformCaseFunc - An optional function to transform the case of each element before adding to the set.
* @returns The modified set with added elements.
*/
function addToSet(set, array) {
	let transformCaseFunc = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : stringToLowerCase;
	if (setPrototypeOf) setPrototypeOf(set, null);
	if (!arrayIsArray(array)) return set;
	let l = array.length;
	while (l--) {
		let element = array[l];
		if (typeof element === "string") {
			const lcElement = transformCaseFunc(element);
			if (lcElement !== element) {
				if (!isFrozen(array)) array[l] = lcElement;
				element = lcElement;
			}
		}
		set[element] = true;
	}
	return set;
}
/**
* Clean up an array to harden against CSPP
*
* @param array - The array to be cleaned.
* @returns The cleaned version of the array
*/
function cleanArray(array) {
	for (let index = 0; index < array.length; index++) {
		const isPropertyExist = objectHasOwnProperty(array, index);
		if (!isPropertyExist) array[index] = null;
	}
	return array;
}
/**
* Shallow clone an object
*
* @param object - The object to be cloned.
* @returns A new object that copies the original.
*/
function clone(object) {
	const newObject = create(null);
	for (const _ref2 of entries(object)) {
		var _ref3 = _slicedToArray(_ref2, 2);
		const property = _ref3[0];
		const value = _ref3[1];
		const isPropertyExist = objectHasOwnProperty(object, property);
		if (isPropertyExist) if (arrayIsArray(value)) newObject[property] = cleanArray(value);
else if (value && typeof value === "object" && value.constructor === Object) newObject[property] = clone(value);
else newObject[property] = value;
	}
	return newObject;
}
/**
* Convert non-node values into strings without depending on direct property access.
*
* @param value - The value to stringify.
* @returns A string representation of the provided value.
*/
function stringifyValue(value) {
	switch (typeof value) {
		case "string": return value;
		case "number": return numberToString(value);
		case "boolean": return booleanToString(value);
		case "bigint": return bigintToString ? bigintToString(value) : "0";
		case "symbol": return symbolToString ? symbolToString(value) : "Symbol()";
		case "undefined": return objectToString(value);
		case "function":
		case "object": {
			if (value === null) return objectToString(value);
			const valueAsRecord = value;
			const valueToString = lookupGetter(valueAsRecord, "toString");
			if (typeof valueToString === "function") {
				const stringified = valueToString(valueAsRecord);
				return typeof stringified === "string" ? stringified : objectToString(stringified);
			}
			return objectToString(value);
		}
		default: return objectToString(value);
	}
}
/**
* This method automatically checks if the prop is function or getter and behaves accordingly.
*
* @param object - The object to look up the getter function in its prototype chain.
* @param prop - The property name for which to find the getter function.
* @returns The getter function found in the prototype chain or a fallback function.
*/
function lookupGetter(object, prop) {
	while (object !== null) {
		const desc = getOwnPropertyDescriptor(object, prop);
		if (desc) {
			if (desc.get) return unapply(desc.get);
			if (typeof desc.value === "function") return unapply(desc.value);
		}
		object = getPrototypeOf(object);
	}
	function fallbackValue() {
		return null;
	}
	return fallbackValue;
}
function isRegex(value) {
	try {
		regExpTest(value, "");
		return true;
	} catch (_unused) {
		return false;
	}
}
const html$1 = freeze([
	"a",
	"abbr",
	"acronym",
	"address",
	"area",
	"article",
	"aside",
	"audio",
	"b",
	"bdi",
	"bdo",
	"big",
	"blink",
	"blockquote",
	"body",
	"br",
	"button",
	"canvas",
	"caption",
	"center",
	"cite",
	"code",
	"col",
	"colgroup",
	"content",
	"data",
	"datalist",
	"dd",
	"decorator",
	"del",
	"details",
	"dfn",
	"dialog",
	"dir",
	"div",
	"dl",
	"dt",
	"element",
	"em",
	"fieldset",
	"figcaption",
	"figure",
	"font",
	"footer",
	"form",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"head",
	"header",
	"hgroup",
	"hr",
	"html",
	"i",
	"img",
	"input",
	"ins",
	"kbd",
	"label",
	"legend",
	"li",
	"main",
	"map",
	"mark",
	"marquee",
	"menu",
	"menuitem",
	"meter",
	"nav",
	"nobr",
	"ol",
	"optgroup",
	"option",
	"output",
	"p",
	"picture",
	"pre",
	"progress",
	"q",
	"rp",
	"rt",
	"ruby",
	"s",
	"samp",
	"search",
	"section",
	"select",
	"shadow",
	"slot",
	"small",
	"source",
	"spacer",
	"span",
	"strike",
	"strong",
	"style",
	"sub",
	"summary",
	"sup",
	"table",
	"tbody",
	"td",
	"template",
	"textarea",
	"tfoot",
	"th",
	"thead",
	"time",
	"tr",
	"track",
	"tt",
	"u",
	"ul",
	"var",
	"video",
	"wbr"
]);
const svg$1 = freeze([
	"svg",
	"a",
	"altglyph",
	"altglyphdef",
	"altglyphitem",
	"animatecolor",
	"animatemotion",
	"animatetransform",
	"circle",
	"clippath",
	"defs",
	"desc",
	"ellipse",
	"enterkeyhint",
	"exportparts",
	"filter",
	"font",
	"g",
	"glyph",
	"glyphref",
	"hkern",
	"image",
	"inputmode",
	"line",
	"lineargradient",
	"marker",
	"mask",
	"metadata",
	"mpath",
	"part",
	"path",
	"pattern",
	"polygon",
	"polyline",
	"radialgradient",
	"rect",
	"stop",
	"style",
	"switch",
	"symbol",
	"text",
	"textpath",
	"title",
	"tref",
	"tspan",
	"view",
	"vkern"
]);
const svgFilters = freeze([
	"feBlend",
	"feColorMatrix",
	"feComponentTransfer",
	"feComposite",
	"feConvolveMatrix",
	"feDiffuseLighting",
	"feDisplacementMap",
	"feDistantLight",
	"feDropShadow",
	"feFlood",
	"feFuncA",
	"feFuncB",
	"feFuncG",
	"feFuncR",
	"feGaussianBlur",
	"feImage",
	"feMerge",
	"feMergeNode",
	"feMorphology",
	"feOffset",
	"fePointLight",
	"feSpecularLighting",
	"feSpotLight",
	"feTile",
	"feTurbulence"
]);
const svgDisallowed = freeze([
	"animate",
	"color-profile",
	"cursor",
	"discard",
	"font-face",
	"font-face-format",
	"font-face-name",
	"font-face-src",
	"font-face-uri",
	"foreignobject",
	"hatch",
	"hatchpath",
	"mesh",
	"meshgradient",
	"meshpatch",
	"meshrow",
	"missing-glyph",
	"script",
	"set",
	"solidcolor",
	"unknown",
	"use"
]);
const mathMl$1 = freeze([
	"math",
	"menclose",
	"merror",
	"mfenced",
	"mfrac",
	"mglyph",
	"mi",
	"mlabeledtr",
	"mmultiscripts",
	"mn",
	"mo",
	"mover",
	"mpadded",
	"mphantom",
	"mroot",
	"mrow",
	"ms",
	"mspace",
	"msqrt",
	"mstyle",
	"msub",
	"msup",
	"msubsup",
	"mtable",
	"mtd",
	"mtext",
	"mtr",
	"munder",
	"munderover",
	"mprescripts"
]);
const mathMlDisallowed = freeze([
	"maction",
	"maligngroup",
	"malignmark",
	"mlongdiv",
	"mscarries",
	"mscarry",
	"msgroup",
	"mstack",
	"msline",
	"msrow",
	"semantics",
	"annotation",
	"annotation-xml",
	"mprescripts",
	"none"
]);
const text = freeze(["#text"]);
const html = freeze([
	"accept",
	"action",
	"align",
	"alt",
	"autocapitalize",
	"autocomplete",
	"autopictureinpicture",
	"autoplay",
	"background",
	"bgcolor",
	"border",
	"capture",
	"cellpadding",
	"cellspacing",
	"checked",
	"cite",
	"class",
	"clear",
	"color",
	"cols",
	"colspan",
	"command",
	"commandfor",
	"controls",
	"controlslist",
	"coords",
	"crossorigin",
	"datetime",
	"decoding",
	"default",
	"dir",
	"disabled",
	"disablepictureinpicture",
	"disableremoteplayback",
	"download",
	"draggable",
	"enctype",
	"enterkeyhint",
	"exportparts",
	"face",
	"for",
	"headers",
	"height",
	"hidden",
	"high",
	"href",
	"hreflang",
	"id",
	"inert",
	"inputmode",
	"integrity",
	"ismap",
	"kind",
	"label",
	"lang",
	"list",
	"loading",
	"loop",
	"low",
	"max",
	"maxlength",
	"media",
	"method",
	"min",
	"minlength",
	"multiple",
	"muted",
	"name",
	"nonce",
	"noshade",
	"novalidate",
	"nowrap",
	"open",
	"optimum",
	"part",
	"pattern",
	"placeholder",
	"playsinline",
	"popover",
	"popovertarget",
	"popovertargetaction",
	"poster",
	"preload",
	"pubdate",
	"radiogroup",
	"readonly",
	"rel",
	"required",
	"rev",
	"reversed",
	"role",
	"rows",
	"rowspan",
	"spellcheck",
	"scope",
	"selected",
	"shape",
	"size",
	"sizes",
	"slot",
	"span",
	"srclang",
	"start",
	"src",
	"srcset",
	"step",
	"style",
	"summary",
	"tabindex",
	"title",
	"translate",
	"type",
	"usemap",
	"valign",
	"value",
	"width",
	"wrap",
	"xmlns"
]);
const svg = freeze([
	"accent-height",
	"accumulate",
	"additive",
	"alignment-baseline",
	"amplitude",
	"ascent",
	"attributename",
	"attributetype",
	"azimuth",
	"basefrequency",
	"baseline-shift",
	"begin",
	"bias",
	"by",
	"class",
	"clip",
	"clippathunits",
	"clip-path",
	"clip-rule",
	"color",
	"color-interpolation",
	"color-interpolation-filters",
	"color-profile",
	"color-rendering",
	"cx",
	"cy",
	"d",
	"dx",
	"dy",
	"diffuseconstant",
	"direction",
	"display",
	"divisor",
	"dominant-baseline",
	"dur",
	"edgemode",
	"elevation",
	"end",
	"exponent",
	"fill",
	"fill-opacity",
	"fill-rule",
	"filter",
	"filterunits",
	"flood-color",
	"flood-opacity",
	"font-family",
	"font-size",
	"font-size-adjust",
	"font-stretch",
	"font-style",
	"font-variant",
	"font-weight",
	"fx",
	"fy",
	"g1",
	"g2",
	"glyph-name",
	"glyphref",
	"gradientunits",
	"gradienttransform",
	"height",
	"href",
	"id",
	"image-rendering",
	"in",
	"in2",
	"intercept",
	"k",
	"k1",
	"k2",
	"k3",
	"k4",
	"kerning",
	"keypoints",
	"keysplines",
	"keytimes",
	"lang",
	"lengthadjust",
	"letter-spacing",
	"kernelmatrix",
	"kernelunitlength",
	"lighting-color",
	"local",
	"marker-end",
	"marker-mid",
	"marker-start",
	"markerheight",
	"markerunits",
	"markerwidth",
	"maskcontentunits",
	"maskunits",
	"max",
	"mask",
	"mask-type",
	"media",
	"method",
	"mode",
	"min",
	"name",
	"numoctaves",
	"offset",
	"operator",
	"opacity",
	"order",
	"orient",
	"orientation",
	"origin",
	"overflow",
	"paint-order",
	"path",
	"pathlength",
	"patterncontentunits",
	"patterntransform",
	"patternunits",
	"points",
	"preservealpha",
	"preserveaspectratio",
	"primitiveunits",
	"r",
	"rx",
	"ry",
	"radius",
	"refx",
	"refy",
	"repeatcount",
	"repeatdur",
	"restart",
	"result",
	"rotate",
	"scale",
	"seed",
	"shape-rendering",
	"slope",
	"specularconstant",
	"specularexponent",
	"spreadmethod",
	"startoffset",
	"stddeviation",
	"stitchtiles",
	"stop-color",
	"stop-opacity",
	"stroke-dasharray",
	"stroke-dashoffset",
	"stroke-linecap",
	"stroke-linejoin",
	"stroke-miterlimit",
	"stroke-opacity",
	"stroke",
	"stroke-width",
	"style",
	"surfacescale",
	"systemlanguage",
	"tabindex",
	"tablevalues",
	"targetx",
	"targety",
	"transform",
	"transform-origin",
	"text-anchor",
	"text-decoration",
	"text-orientation",
	"text-rendering",
	"textlength",
	"type",
	"u1",
	"u2",
	"unicode",
	"values",
	"viewbox",
	"visibility",
	"version",
	"vert-adv-y",
	"vert-origin-x",
	"vert-origin-y",
	"width",
	"word-spacing",
	"wrap",
	"writing-mode",
	"xchannelselector",
	"ychannelselector",
	"x",
	"x1",
	"x2",
	"xmlns",
	"y",
	"y1",
	"y2",
	"z",
	"zoomandpan"
]);
const mathMl = freeze([
	"accent",
	"accentunder",
	"align",
	"bevelled",
	"close",
	"columnalign",
	"columnlines",
	"columnspacing",
	"columnspan",
	"denomalign",
	"depth",
	"dir",
	"display",
	"displaystyle",
	"encoding",
	"fence",
	"frame",
	"height",
	"href",
	"id",
	"largeop",
	"length",
	"linethickness",
	"lquote",
	"lspace",
	"mathbackground",
	"mathcolor",
	"mathsize",
	"mathvariant",
	"maxsize",
	"minsize",
	"movablelimits",
	"notation",
	"numalign",
	"open",
	"rowalign",
	"rowlines",
	"rowspacing",
	"rowspan",
	"rspace",
	"rquote",
	"scriptlevel",
	"scriptminsize",
	"scriptsizemultiplier",
	"selection",
	"separator",
	"separators",
	"stretchy",
	"subscriptshift",
	"supscriptshift",
	"symmetric",
	"voffset",
	"width",
	"xmlns"
]);
const xml = freeze([
	"xlink:href",
	"xml:id",
	"xlink:title",
	"xml:space",
	"xmlns:xlink"
]);
const MUSTACHE_EXPR = seal(/{{[\w\W]*|^[\w\W]*}}/g);
const ERB_EXPR = seal(/<%[\w\W]*|^[\w\W]*%>/g);
const TMPLIT_EXPR = seal(/\${[\w\W]*/g);
const DATA_ATTR = seal(/^data-[\-\w.\u00B7-\uFFFF]+$/);
const ARIA_ATTR = seal(/^aria-[\-\w]+$/);
const IS_ALLOWED_URI = seal(/^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i);
const IS_SCRIPT_OR_DATA = seal(/^(?:\w+script|data):/i);
const ATTR_WHITESPACE = seal(/[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g);
const DOCTYPE_NAME = seal(/^html$/i);
const CUSTOM_ELEMENT = seal(/^[a-z][.\w]*(-[.\w]+)+$/i);
const ELEMENT_MARKUP_PROBE = seal(/<[/\w!]/g);
const COMMENT_MARKUP_PROBE = seal(/<[/\w]/g);
const FALLBACK_TAG_CLOSE = seal(/<\/no(script|embed|frames)/i);
const SELF_CLOSING_TAG = seal(/\/>/i);
const NODE_TYPE = {
	element: 1,
	attribute: 2,
	text: 3,
	cdataSection: 4,
	entityReference: 5,
	entityNode: 6,
	processingInstruction: 7,
	comment: 8,
	document: 9,
	documentType: 10,
	documentFragment: 11,
	notation: 12
};
const getGlobal = function getGlobal$1() {
	return typeof window === "undefined" ? null : window;
};
/**
* Creates a no-op policy for internal use only.
* Don't export this function outside this module!
* @param trustedTypes The policy factory.
* @param purifyHostElement The Script element used to load DOMPurify (to determine policy name suffix).
* @return The policy created (or null, if Trusted Types
* are not supported or creating the policy failed).
*/
const _createTrustedTypesPolicy = function _createTrustedTypesPolicy$1(trustedTypes, purifyHostElement) {
	if (typeof trustedTypes !== "object" || typeof trustedTypes.createPolicy !== "function") return null;
	let suffix = null;
	const ATTR_NAME = "data-tt-policy-suffix";
	if (purifyHostElement && purifyHostElement.hasAttribute(ATTR_NAME)) suffix = purifyHostElement.getAttribute(ATTR_NAME);
	const policyName = "dompurify" + (suffix ? "#" + suffix : "");
	try {
		return trustedTypes.createPolicy(policyName, {
			createHTML(html$2) {
				return html$2;
			},
			createScriptURL(scriptUrl) {
				return scriptUrl;
			}
		});
	} catch (_$1) {
		console.warn("TrustedTypes policy " + policyName + " could not be created.");
		return null;
	}
};
const _createHooksMap = function _createHooksMap$1() {
	return {
		afterSanitizeAttributes: [],
		afterSanitizeElements: [],
		afterSanitizeShadowDOM: [],
		beforeSanitizeAttributes: [],
		beforeSanitizeElements: [],
		beforeSanitizeShadowDOM: [],
		uponSanitizeAttribute: [],
		uponSanitizeElement: [],
		uponSanitizeShadowNode: []
	};
};
/**
* Resolve a set-valued configuration option: a fresh set built from
* cfg[key] when it is an own array property (seeded with a clone of
* options.base when given, case-normalized via options.transform),
* the fallback set otherwise.
*
* @param cfg the cloned, prototype-free configuration object
* @param key the configuration property to read
* @param fallback the set to use when the option is absent or not an array
* @param options transform and optional base set to merge into
* @returns the resolved set
*/
const _resolveSetOption = function _resolveSetOption$1(cfg, key, fallback, options) {
	return objectHasOwnProperty(cfg, key) && arrayIsArray(cfg[key]) ? addToSet(options.base ? clone(options.base) : {}, cfg[key], options.transform) : fallback;
};
function createDOMPurify() {
	let window$1 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : getGlobal();
	const DOMPurify = (root) => createDOMPurify(root);
	DOMPurify.version = "3.4.12";
	DOMPurify.removed = [];
	if (!window$1 || !window$1.document || window$1.document.nodeType !== NODE_TYPE.document || !window$1.Element) {
		DOMPurify.isSupported = false;
		return DOMPurify;
	}
	let document$1 = window$1.document;
	const originalDocument = document$1;
	const currentScript = originalDocument.currentScript;
	window$1.DocumentFragment;
	const HTMLTemplateElement = window$1.HTMLTemplateElement, Node$1 = window$1.Node, Element = window$1.Element, NodeFilter = window$1.NodeFilter, _window$NamedNodeMap = window$1.NamedNodeMap;
	_window$NamedNodeMap === void 0 ? window$1.NamedNodeMap || window$1.MozNamedAttrMap : _window$NamedNodeMap;
	window$1.HTMLFormElement;
	const DOMParser = window$1.DOMParser, trustedTypes = window$1.trustedTypes;
	const ElementPrototype = Element.prototype;
	const cloneNode = lookupGetter(ElementPrototype, "cloneNode");
	const remove = lookupGetter(ElementPrototype, "remove");
	const getNextSibling = lookupGetter(ElementPrototype, "nextSibling");
	const getChildNodes = lookupGetter(ElementPrototype, "childNodes");
	const getParentNode = lookupGetter(ElementPrototype, "parentNode");
	const getShadowRoot = lookupGetter(ElementPrototype, "shadowRoot");
	const getAttributes = lookupGetter(ElementPrototype, "attributes");
	const getNodeType = Node$1 && Node$1.prototype ? lookupGetter(Node$1.prototype, "nodeType") : null;
	const getNodeName = Node$1 && Node$1.prototype ? lookupGetter(Node$1.prototype, "nodeName") : null;
	if (typeof HTMLTemplateElement === "function") {
		const template = document$1.createElement("template");
		if (template.content && template.content.ownerDocument) document$1 = template.content.ownerDocument;
	}
	let trustedTypesPolicy;
	let emptyHTML = "";
	let defaultTrustedTypesPolicy;
	let defaultTrustedTypesPolicyResolved = false;
	let IN_TRUSTED_TYPES_POLICY = 0;
	const _assertNotInTrustedTypesPolicy = function _assertNotInTrustedTypesPolicy$1() {
		if (IN_TRUSTED_TYPES_POLICY > 0) throw typeErrorCreate("A configured TRUSTED_TYPES_POLICY callback (createHTML or createScriptURL) must not call DOMPurify.sanitize, as that causes infinite recursion. Do not pass a policy whose callbacks wrap DOMPurify as TRUSTED_TYPES_POLICY; see the \"DOMPurify and Trusted Types\" section of the README.");
	};
	const _createTrustedHTML = function _createTrustedHTML$1(html$2) {
		_assertNotInTrustedTypesPolicy();
		IN_TRUSTED_TYPES_POLICY++;
		try {
			return trustedTypesPolicy.createHTML(html$2);
		} finally {
			IN_TRUSTED_TYPES_POLICY--;
		}
	};
	const _createTrustedScriptURL = function _createTrustedScriptURL$1(scriptUrl) {
		_assertNotInTrustedTypesPolicy();
		IN_TRUSTED_TYPES_POLICY++;
		try {
			return trustedTypesPolicy.createScriptURL(scriptUrl);
		} finally {
			IN_TRUSTED_TYPES_POLICY--;
		}
	};
	const _getDefaultTrustedTypesPolicy = function _getDefaultTrustedTypesPolicy$1() {
		if (!defaultTrustedTypesPolicyResolved) {
			defaultTrustedTypesPolicy = _createTrustedTypesPolicy(trustedTypes, currentScript);
			defaultTrustedTypesPolicyResolved = true;
		}
		return defaultTrustedTypesPolicy;
	};
	const _document = document$1, implementation = _document.implementation, createNodeIterator = _document.createNodeIterator, createDocumentFragment = _document.createDocumentFragment, getElementsByTagName = _document.getElementsByTagName;
	const importNode = originalDocument.importNode;
	let hooks = _createHooksMap();
	/**
	* Expose whether this browser supports running the full DOMPurify.
	*/
	DOMPurify.isSupported = typeof entries === "function" && typeof getParentNode === "function" && implementation && implementation.createHTMLDocument !== undefined;
	const MUSTACHE_EXPR$1 = MUSTACHE_EXPR, ERB_EXPR$1 = ERB_EXPR, TMPLIT_EXPR$1 = TMPLIT_EXPR, DATA_ATTR$1 = DATA_ATTR, ARIA_ATTR$1 = ARIA_ATTR, IS_SCRIPT_OR_DATA$1 = IS_SCRIPT_OR_DATA, ATTR_WHITESPACE$1 = ATTR_WHITESPACE, CUSTOM_ELEMENT$1 = CUSTOM_ELEMENT;
	let IS_ALLOWED_URI$1 = IS_ALLOWED_URI;
	/**
	* We consider the elements and attributes below to be safe. Ideally
	* don't add any new ones but feel free to remove unwanted ones.
	*/
	let ALLOWED_TAGS = null;
	const DEFAULT_ALLOWED_TAGS = addToSet({}, [
		...html$1,
		...svg$1,
		...svgFilters,
		...mathMl$1,
		...text
	]);
	let ALLOWED_ATTR = null;
	const DEFAULT_ALLOWED_ATTR = addToSet({}, [
		...html,
		...svg,
		...mathMl,
		...xml
	]);
	let CUSTOM_ELEMENT_HANDLING = Object.seal(create(null, {
		tagNameCheck: {
			writable: true,
			configurable: false,
			enumerable: true,
			value: null
		},
		attributeNameCheck: {
			writable: true,
			configurable: false,
			enumerable: true,
			value: null
		},
		allowCustomizedBuiltInElements: {
			writable: true,
			configurable: false,
			enumerable: true,
			value: false
		}
	}));
	let FORBID_TAGS = null;
	let FORBID_ATTR = null;
	const EXTRA_ELEMENT_HANDLING = Object.seal(create(null, {
		tagCheck: {
			writable: true,
			configurable: false,
			enumerable: true,
			value: null
		},
		attributeCheck: {
			writable: true,
			configurable: false,
			enumerable: true,
			value: null
		}
	}));
	let ALLOW_ARIA_ATTR = true;
	let ALLOW_DATA_ATTR = true;
	let ALLOW_UNKNOWN_PROTOCOLS = false;
	let ALLOW_SELF_CLOSE_IN_ATTR = true;
	let SAFE_FOR_TEMPLATES = false;
	let SAFE_FOR_XML = true;
	let WHOLE_DOCUMENT = false;
	let SET_CONFIG = false;
	let SET_CONFIG_ALLOWED_TAGS = null;
	let SET_CONFIG_ALLOWED_ATTR = null;
	let FORCE_BODY = false;
	let RETURN_DOM = false;
	let RETURN_DOM_FRAGMENT = false;
	let RETURN_TRUSTED_TYPE = false;
	let SANITIZE_DOM = true;
	let SANITIZE_NAMED_PROPS = false;
	const SANITIZE_NAMED_PROPS_PREFIX = "user-content-";
	let KEEP_CONTENT = true;
	let IN_PLACE = false;
	let USE_PROFILES = {};
	let FORBID_CONTENTS = null;
	const DEFAULT_FORBID_CONTENTS = addToSet({}, [
		"annotation-xml",
		"audio",
		"colgroup",
		"desc",
		"foreignobject",
		"head",
		"iframe",
		"math",
		"mi",
		"mn",
		"mo",
		"ms",
		"mtext",
		"noembed",
		"noframes",
		"noscript",
		"plaintext",
		"script",
		"selectedcontent",
		"style",
		"svg",
		"template",
		"thead",
		"title",
		"video",
		"xmp"
	]);
	let DATA_URI_TAGS = null;
	const DEFAULT_DATA_URI_TAGS = addToSet({}, [
		"audio",
		"video",
		"img",
		"source",
		"image",
		"track"
	]);
	let URI_SAFE_ATTRIBUTES = null;
	const DEFAULT_URI_SAFE_ATTRIBUTES = addToSet({}, [
		"alt",
		"class",
		"for",
		"id",
		"label",
		"name",
		"pattern",
		"placeholder",
		"role",
		"summary",
		"title",
		"value",
		"style",
		"xmlns"
	]);
	const MATHML_NAMESPACE = "http://www.w3.org/1998/Math/MathML";
	const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
	const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
	let NAMESPACE = HTML_NAMESPACE;
	let IS_EMPTY_INPUT = false;
	let ALLOWED_NAMESPACES = null;
	const DEFAULT_ALLOWED_NAMESPACES = addToSet({}, [
		MATHML_NAMESPACE,
		SVG_NAMESPACE,
		HTML_NAMESPACE
	], stringToString);
	const DEFAULT_MATHML_TEXT_INTEGRATION_POINTS = freeze([
		"mi",
		"mo",
		"mn",
		"ms",
		"mtext"
	]);
	let MATHML_TEXT_INTEGRATION_POINTS = addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
	const DEFAULT_HTML_INTEGRATION_POINTS = freeze(["annotation-xml"]);
	let HTML_INTEGRATION_POINTS = addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
	const COMMON_SVG_AND_HTML_ELEMENTS = addToSet({}, [
		"title",
		"style",
		"font",
		"a",
		"script"
	]);
	let PARSER_MEDIA_TYPE = null;
	const SUPPORTED_PARSER_MEDIA_TYPES = ["application/xhtml+xml", "text/html"];
	const DEFAULT_PARSER_MEDIA_TYPE = "text/html";
	let transformCaseFunc = null;
	let CONFIG = null;
	const formElement = document$1.createElement("form");
	const isRegexOrFunction = function isRegexOrFunction$1(testValue) {
		return testValue instanceof RegExp || testValue instanceof Function;
	};
	/**
	* _parseConfig
	*
	* @param cfg optional config literal
	*/
	const _parseConfig = function _parseConfig$1() {
		let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
		if (CONFIG && CONFIG === cfg) return;
		if (!cfg || typeof cfg !== "object") cfg = {};
		cfg = clone(cfg);
		PARSER_MEDIA_TYPE = SUPPORTED_PARSER_MEDIA_TYPES.indexOf(cfg.PARSER_MEDIA_TYPE) === -1 ? DEFAULT_PARSER_MEDIA_TYPE : cfg.PARSER_MEDIA_TYPE;
		transformCaseFunc = PARSER_MEDIA_TYPE === "application/xhtml+xml" ? stringToString : stringToLowerCase;
		ALLOWED_TAGS = _resolveSetOption(cfg, "ALLOWED_TAGS", DEFAULT_ALLOWED_TAGS, { transform: transformCaseFunc });
		ALLOWED_ATTR = _resolveSetOption(cfg, "ALLOWED_ATTR", DEFAULT_ALLOWED_ATTR, { transform: transformCaseFunc });
		ALLOWED_NAMESPACES = _resolveSetOption(cfg, "ALLOWED_NAMESPACES", DEFAULT_ALLOWED_NAMESPACES, { transform: stringToString });
		URI_SAFE_ATTRIBUTES = _resolveSetOption(cfg, "ADD_URI_SAFE_ATTR", DEFAULT_URI_SAFE_ATTRIBUTES, {
			transform: transformCaseFunc,
			base: DEFAULT_URI_SAFE_ATTRIBUTES
		});
		DATA_URI_TAGS = _resolveSetOption(cfg, "ADD_DATA_URI_TAGS", DEFAULT_DATA_URI_TAGS, {
			transform: transformCaseFunc,
			base: DEFAULT_DATA_URI_TAGS
		});
		FORBID_CONTENTS = _resolveSetOption(cfg, "FORBID_CONTENTS", DEFAULT_FORBID_CONTENTS, { transform: transformCaseFunc });
		FORBID_TAGS = _resolveSetOption(cfg, "FORBID_TAGS", clone({}), { transform: transformCaseFunc });
		FORBID_ATTR = _resolveSetOption(cfg, "FORBID_ATTR", clone({}), { transform: transformCaseFunc });
		USE_PROFILES = objectHasOwnProperty(cfg, "USE_PROFILES") ? cfg.USE_PROFILES && typeof cfg.USE_PROFILES === "object" ? clone(cfg.USE_PROFILES) : cfg.USE_PROFILES : false;
		ALLOW_ARIA_ATTR = cfg.ALLOW_ARIA_ATTR !== false;
		ALLOW_DATA_ATTR = cfg.ALLOW_DATA_ATTR !== false;
		ALLOW_UNKNOWN_PROTOCOLS = cfg.ALLOW_UNKNOWN_PROTOCOLS || false;
		ALLOW_SELF_CLOSE_IN_ATTR = cfg.ALLOW_SELF_CLOSE_IN_ATTR !== false;
		SAFE_FOR_TEMPLATES = cfg.SAFE_FOR_TEMPLATES || false;
		SAFE_FOR_XML = cfg.SAFE_FOR_XML !== false;
		WHOLE_DOCUMENT = cfg.WHOLE_DOCUMENT || false;
		RETURN_DOM = cfg.RETURN_DOM || false;
		RETURN_DOM_FRAGMENT = cfg.RETURN_DOM_FRAGMENT || false;
		RETURN_TRUSTED_TYPE = cfg.RETURN_TRUSTED_TYPE || false;
		FORCE_BODY = cfg.FORCE_BODY || false;
		SANITIZE_DOM = cfg.SANITIZE_DOM !== false;
		SANITIZE_NAMED_PROPS = cfg.SANITIZE_NAMED_PROPS || false;
		KEEP_CONTENT = cfg.KEEP_CONTENT !== false;
		IN_PLACE = cfg.IN_PLACE || false;
		IS_ALLOWED_URI$1 = isRegex(cfg.ALLOWED_URI_REGEXP) ? cfg.ALLOWED_URI_REGEXP : IS_ALLOWED_URI;
		NAMESPACE = typeof cfg.NAMESPACE === "string" ? cfg.NAMESPACE : HTML_NAMESPACE;
		MATHML_TEXT_INTEGRATION_POINTS = objectHasOwnProperty(cfg, "MATHML_TEXT_INTEGRATION_POINTS") && cfg.MATHML_TEXT_INTEGRATION_POINTS && typeof cfg.MATHML_TEXT_INTEGRATION_POINTS === "object" ? clone(cfg.MATHML_TEXT_INTEGRATION_POINTS) : addToSet({}, DEFAULT_MATHML_TEXT_INTEGRATION_POINTS);
		HTML_INTEGRATION_POINTS = objectHasOwnProperty(cfg, "HTML_INTEGRATION_POINTS") && cfg.HTML_INTEGRATION_POINTS && typeof cfg.HTML_INTEGRATION_POINTS === "object" ? clone(cfg.HTML_INTEGRATION_POINTS) : addToSet({}, DEFAULT_HTML_INTEGRATION_POINTS);
		const customElementHandling = objectHasOwnProperty(cfg, "CUSTOM_ELEMENT_HANDLING") && cfg.CUSTOM_ELEMENT_HANDLING && typeof cfg.CUSTOM_ELEMENT_HANDLING === "object" ? clone(cfg.CUSTOM_ELEMENT_HANDLING) : create(null);
		CUSTOM_ELEMENT_HANDLING = create(null);
		if (objectHasOwnProperty(customElementHandling, "tagNameCheck") && isRegexOrFunction(customElementHandling.tagNameCheck)) CUSTOM_ELEMENT_HANDLING.tagNameCheck = customElementHandling.tagNameCheck;
		if (objectHasOwnProperty(customElementHandling, "attributeNameCheck") && isRegexOrFunction(customElementHandling.attributeNameCheck)) CUSTOM_ELEMENT_HANDLING.attributeNameCheck = customElementHandling.attributeNameCheck;
		if (objectHasOwnProperty(customElementHandling, "allowCustomizedBuiltInElements") && typeof customElementHandling.allowCustomizedBuiltInElements === "boolean") CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements = customElementHandling.allowCustomizedBuiltInElements;
		seal(CUSTOM_ELEMENT_HANDLING);
		if (SAFE_FOR_TEMPLATES) ALLOW_DATA_ATTR = false;
		if (RETURN_DOM_FRAGMENT) RETURN_DOM = true;
		if (USE_PROFILES) {
			ALLOWED_TAGS = addToSet({}, text);
			ALLOWED_ATTR = create(null);
			if (USE_PROFILES.html === true) {
				addToSet(ALLOWED_TAGS, html$1);
				addToSet(ALLOWED_ATTR, html);
			}
			if (USE_PROFILES.svg === true) {
				addToSet(ALLOWED_TAGS, svg$1);
				addToSet(ALLOWED_ATTR, svg);
				addToSet(ALLOWED_ATTR, xml);
			}
			if (USE_PROFILES.svgFilters === true) {
				addToSet(ALLOWED_TAGS, svgFilters);
				addToSet(ALLOWED_ATTR, svg);
				addToSet(ALLOWED_ATTR, xml);
			}
			if (USE_PROFILES.mathMl === true) {
				addToSet(ALLOWED_TAGS, mathMl$1);
				addToSet(ALLOWED_ATTR, mathMl);
				addToSet(ALLOWED_ATTR, xml);
			}
		}
		EXTRA_ELEMENT_HANDLING.tagCheck = null;
		EXTRA_ELEMENT_HANDLING.attributeCheck = null;
		if (objectHasOwnProperty(cfg, "ADD_TAGS")) {
			if (typeof cfg.ADD_TAGS === "function") EXTRA_ELEMENT_HANDLING.tagCheck = cfg.ADD_TAGS;
else if (arrayIsArray(cfg.ADD_TAGS)) {
				if (ALLOWED_TAGS === DEFAULT_ALLOWED_TAGS) ALLOWED_TAGS = clone(ALLOWED_TAGS);
				addToSet(ALLOWED_TAGS, cfg.ADD_TAGS, transformCaseFunc);
			}
		}
		if (objectHasOwnProperty(cfg, "ADD_ATTR")) {
			if (typeof cfg.ADD_ATTR === "function") EXTRA_ELEMENT_HANDLING.attributeCheck = cfg.ADD_ATTR;
else if (arrayIsArray(cfg.ADD_ATTR)) {
				if (ALLOWED_ATTR === DEFAULT_ALLOWED_ATTR) ALLOWED_ATTR = clone(ALLOWED_ATTR);
				addToSet(ALLOWED_ATTR, cfg.ADD_ATTR, transformCaseFunc);
			}
		}
		if (objectHasOwnProperty(cfg, "ADD_URI_SAFE_ATTR") && arrayIsArray(cfg.ADD_URI_SAFE_ATTR)) addToSet(URI_SAFE_ATTRIBUTES, cfg.ADD_URI_SAFE_ATTR, transformCaseFunc);
		if (objectHasOwnProperty(cfg, "FORBID_CONTENTS") && arrayIsArray(cfg.FORBID_CONTENTS)) {
			if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) FORBID_CONTENTS = clone(FORBID_CONTENTS);
			addToSet(FORBID_CONTENTS, cfg.FORBID_CONTENTS, transformCaseFunc);
		}
		if (objectHasOwnProperty(cfg, "ADD_FORBID_CONTENTS") && arrayIsArray(cfg.ADD_FORBID_CONTENTS)) {
			if (FORBID_CONTENTS === DEFAULT_FORBID_CONTENTS) FORBID_CONTENTS = clone(FORBID_CONTENTS);
			addToSet(FORBID_CONTENTS, cfg.ADD_FORBID_CONTENTS, transformCaseFunc);
		}
		if (KEEP_CONTENT) ALLOWED_TAGS["#text"] = true;
		if (WHOLE_DOCUMENT) addToSet(ALLOWED_TAGS, [
			"html",
			"head",
			"body"
		]);
		if (ALLOWED_TAGS.table) {
			addToSet(ALLOWED_TAGS, ["tbody"]);
			delete FORBID_TAGS.tbody;
		}
		if (cfg.TRUSTED_TYPES_POLICY) {
			if (typeof cfg.TRUSTED_TYPES_POLICY.createHTML !== "function") throw typeErrorCreate("TRUSTED_TYPES_POLICY configuration option must provide a \"createHTML\" hook.");
			if (typeof cfg.TRUSTED_TYPES_POLICY.createScriptURL !== "function") throw typeErrorCreate("TRUSTED_TYPES_POLICY configuration option must provide a \"createScriptURL\" hook.");
			const previousTrustedTypesPolicy = trustedTypesPolicy;
			trustedTypesPolicy = cfg.TRUSTED_TYPES_POLICY;
			try {
				emptyHTML = _createTrustedHTML("");
			} catch (error) {
				trustedTypesPolicy = previousTrustedTypesPolicy;
				throw error;
			}
		} else if (cfg.TRUSTED_TYPES_POLICY === null) {
			trustedTypesPolicy = undefined;
			emptyHTML = "";
		} else {
			if (trustedTypesPolicy === undefined) trustedTypesPolicy = _getDefaultTrustedTypesPolicy();
			if (trustedTypesPolicy && typeof emptyHTML === "string") emptyHTML = _createTrustedHTML("");
		}
		if (freeze) freeze(cfg);
		CONFIG = cfg;
	};
	const ALL_SVG_TAGS = addToSet({}, [
		...svg$1,
		...svgFilters,
		...svgDisallowed
	]);
	const ALL_MATHML_TAGS = addToSet({}, [...mathMl$1, ...mathMlDisallowed]);
	/**
	* Namespace rules for an element in the SVG namespace.
	*
	* @param tagName the element's lowercase tag name
	* @param parent the (possibly simulated) parent node
	* @param parentTagName the parent's lowercase tag name
	* @returns true if a spec-compliant parser could produce this element
	*/
	const _checkSvgNamespace = function _checkSvgNamespace$1(tagName, parent, parentTagName) {
		if (parent.namespaceURI === HTML_NAMESPACE) return tagName === "svg";
		if (parent.namespaceURI === MATHML_NAMESPACE) return tagName === "svg" && (parentTagName === "annotation-xml" || MATHML_TEXT_INTEGRATION_POINTS[parentTagName]);
		return Boolean(ALL_SVG_TAGS[tagName]);
	};
	/**
	* Namespace rules for an element in the MathML namespace.
	*
	* @param tagName the element's lowercase tag name
	* @param parent the (possibly simulated) parent node
	* @param parentTagName the parent's lowercase tag name
	* @returns true if a spec-compliant parser could produce this element
	*/
	const _checkMathMlNamespace = function _checkMathMlNamespace$1(tagName, parent, parentTagName) {
		if (parent.namespaceURI === HTML_NAMESPACE) return tagName === "math";
		if (parent.namespaceURI === SVG_NAMESPACE) return tagName === "math" && HTML_INTEGRATION_POINTS[parentTagName];
		return Boolean(ALL_MATHML_TAGS[tagName]);
	};
	/**
	* Namespace rules for an element in the HTML namespace.
	*
	* @param tagName the element's lowercase tag name
	* @param parent the (possibly simulated) parent node
	* @param parentTagName the parent's lowercase tag name
	* @returns true if a spec-compliant parser could produce this element
	*/
	const _checkHtmlNamespace = function _checkHtmlNamespace$1(tagName, parent, parentTagName) {
		if (parent.namespaceURI === SVG_NAMESPACE && !HTML_INTEGRATION_POINTS[parentTagName]) return false;
		if (parent.namespaceURI === MATHML_NAMESPACE && !MATHML_TEXT_INTEGRATION_POINTS[parentTagName]) return false;
		return !ALL_MATHML_TAGS[tagName] && (COMMON_SVG_AND_HTML_ELEMENTS[tagName] || !ALL_SVG_TAGS[tagName]);
	};
	/**
	* @param element a DOM element whose namespace is being checked
	* @returns Return false if the element has a
	*  namespace that a spec-compliant parser would never
	*  return. Return true otherwise.
	*/
	const _checkValidNamespace = function _checkValidNamespace$1(element) {
		let parent = getParentNode(element);
		if (!parent || !parent.tagName) parent = {
			namespaceURI: NAMESPACE,
			tagName: "template"
		};
		const tagName = stringToLowerCase(element.tagName);
		const parentTagName = stringToLowerCase(parent.tagName);
		if (!ALLOWED_NAMESPACES[element.namespaceURI]) return false;
		if (element.namespaceURI === SVG_NAMESPACE) return _checkSvgNamespace(tagName, parent, parentTagName);
		if (element.namespaceURI === MATHML_NAMESPACE) return _checkMathMlNamespace(tagName, parent, parentTagName);
		if (element.namespaceURI === HTML_NAMESPACE) return _checkHtmlNamespace(tagName, parent, parentTagName);
		if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && ALLOWED_NAMESPACES[element.namespaceURI]) return true;
		return false;
	};
	/**
	* _forceRemove
	*
	* @param node a DOM node
	*/
	const _forceRemove = function _forceRemove$1(node) {
		arrayPush(DOMPurify.removed, { element: node });
		try {
			getParentNode(node).removeChild(node);
		} catch (_$1) {
			remove(node);
			if (!getParentNode(node)) throw typeErrorCreate("a node selected for removal could not be detached from its tree and cannot be safely returned; refusing to sanitize in place");
		}
	};
	/**
	* _neutralizeRoot
	*
	* Fail-closed teardown of an in-place root after the sanitize walk aborts
	* (campaign-3 F2). An internal throw mid-walk — e.g. a page-registered
	* custom element's reaction detaches a node so `_forceRemove`'s deliberate
	* parentless guard throws, or any other re-entrant engine mutation — would
	* otherwise leave the caller's *live* tree half-sanitized, with everything
	* after the abort point still carrying its handlers. There is no safe way
	* to resume the walk (the tree mutated under us), so we strip the root bare:
	* remove every child and every attribute, then let the caller's catch see
	* the original error. Clobber-safe (cached `remove`/`childNodes`/`attributes`
	* getters; the root was already clobber-pre-flighted at the IN_PLACE entry).
	*
	* @param root the in-place root to empty
	*/
	const _neutralizeRoot = function _neutralizeRoot$1(root) {
		_neutralizeSubtree(root);
		const childNodes = getChildNodes(root);
		if (childNodes) {
			const snapshot = [];
			arrayForEach(childNodes, (child) => {
				arrayPush(snapshot, child);
			});
			arrayForEach(snapshot, (child) => {
				try {
					remove(child);
				} catch (_$1) {}
			});
		}
		const attributes = getAttributes(root);
		if (attributes) for (let i = attributes.length - 1; i >= 0; --i) {
			const attribute = attributes[i];
			const name = attribute && attribute.name;
			if (typeof name === "string") try {
				root.removeAttribute(name);
			} catch (_$1) {}
		}
	};
	/**
	* _removeAttribute
	*
	* @param name an Attribute name
	* @param element a DOM node
	*/
	const _removeAttribute = function _removeAttribute$1(name, element) {
		try {
			arrayPush(DOMPurify.removed, {
				attribute: element.getAttributeNode(name),
				from: element
			});
		} catch (_$1) {
			arrayPush(DOMPurify.removed, {
				attribute: null,
				from: element
			});
		}
		element.removeAttribute(name);
		if (name === "is") if (RETURN_DOM || RETURN_DOM_FRAGMENT) try {
			_forceRemove(element);
		} catch (_$1) {}
else try {
			element.setAttribute(name, "");
		} catch (_$1) {}
	};
	/**
	* _stripDisallowedAttributes
	*
	* Removes every attribute the active configuration does not allow from a
	* single element, using the same allowlist as the main attribute pass (so
	* `on*` handlers go, but no `/^on/` blocklist is introduced). Used only to
	* neutralise nodes that are being discarded from an in-place tree.
	*
	* @param element the element to strip
	*/
	const _stripDisallowedAttributes = function _stripDisallowedAttributes$1(element) {
		const attributes = getAttributes(element);
		if (!attributes) return;
		for (let i = attributes.length - 1; i >= 0; --i) {
			const attribute = attributes[i];
			const name = attribute && attribute.name;
			if (typeof name !== "string" || ALLOWED_ATTR[transformCaseFunc(name)]) continue;
			try {
				element.removeAttribute(name);
			} catch (_$1) {}
		}
	};
	/**
	* _neutralizeSubtree
	*
	* Completes the audit-5 F1 fix across every removal path. The KEEP_CONTENT
	* move-hoist neutralises only disallowed-tag removals; clobber, mXSS-canary,
	* namespace, comment, processing-instruction and KEEP_CONTENT:false removals
	* all drop their subtree wholesale via `_forceRemove`. On the IN_PLACE path
	* those dropped nodes are detached from the caller's LIVE tree but a
	* handler-bearing original among them (an `<img onerror>`/`<video>` that was
	* loading) keeps its queued resource event, which fires in page scope after
	* sanitize returns. This walks a removed subtree and strips every attribute
	* the active configuration does not allow — so `on*` handlers are cancelled
	* through the SAME allowlist that governs kept nodes, not a separate `/^on/`
	* blocklist. Run synchronously before sanitize returns, i.e. before any
	* queued event can fire. Hook-free by design: these nodes leave the output,
	* so firing attribute hooks for them would be surprising. Clobber-safe reads;
	* a doomed clobbered node may shadow `removeAttribute` (its own attributes are
	* irrelevant — it is discarded — while its non-clobbered descendants, e.g.
	* the `<img>`, are reached and scrubbed).
	*
	* @param root the root of a removed subtree to neutralise
	*/
	const _neutralizeSubtree = function _neutralizeSubtree$1(root) {
		const stack = [root];
		while (stack.length > 0) {
			const node = stack.pop();
			const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
			if (nodeType === NODE_TYPE.element) _stripDisallowedAttributes(node);
			const childNodes = getChildNodes(node);
			if (childNodes) for (let i = childNodes.length - 1; i >= 0; --i) stack.push(childNodes[i]);
		}
	};
	/**
	* _neutralizePatchLinkage
	*
	* IN_PLACE entry pre-pass (declarative-partial-updates / streaming
	* hardening, https://github.com/WICG/declarative-partial-updates).
	*
	* The main walk strips patch linkage (`for`/`patchsrc`) and removes range
	* markers (PIs / markup comments) node-by-node, in document order, AS it
	* reaches each node. On a live in-place root that leaves a window: from the
	* moment the root is connected until the walk arrives at a given node, that
	* node's linkage is live. A patch applied on connection/stream can fire as
	* a microtask during the walk and inject or teleport an unsanitized DOM
	* range into a region the iterator has already passed and will not revisit,
	* so the post-return "tree is sanitized" contract is violated. Sweep the
	* whole tree once up front and sever every linkage before the walk begins,
	* closing that window.
	*
	* This CANNOT undo a patch that already fired before sanitize ran — that is
	* the irreducible "do not IN_PLACE a live-connected attacker tree" caveat —
	* but it closes everything from sanitize-start onward. Gated on SAFE_FOR_XML
	* to group with the rest of the declarative-partial-updates handling and
	* stay overridable, consistent with the codebase.
	*
	* Clobber-safe traversal (cached childNodes getter); per-node try/catch so a
	* clobbered root cannot defeat the sweep of its non-clobbered descendants.
	*
	* NOTE (pending real-Chrome confirmation, see test/declarative-patch-probe
	* .html Q1): this mirrors the existing policy of keeping `for` on
	* <label>/<output>. If the shipping feature can drive a patch through a
	* surviving `for`-on-label/output + `id` pair, this pre-pass and the
	* attribute check at _isBasicCustomElement's caller must additionally drop
	* that pair on the IN_PLACE path. Left as-is until the taxonomy is verified.
	*
	* @param root the in-place root to sweep
	*/
	const _neutralizePatchLinkage = function _neutralizePatchLinkage$1(root) {
		if (!SAFE_FOR_XML) return;
		const stack = [root];
		while (stack.length > 0) {
			const node = stack.pop();
			const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
			if (nodeType === NODE_TYPE.processingInstruction || nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, node.data)) {
				try {
					remove(node);
				} catch (_$1) {}
				continue;
			}
			if (nodeType === NODE_TYPE.element) {
				const element = node;
				const lcTag = transformCaseFunc(getNodeName ? getNodeName(node) : node.nodeName);
				try {
					if (element.hasAttribute && element.hasAttribute("patchsrc")) element.removeAttribute("patchsrc");
					if (element.hasAttribute && element.hasAttribute("for") && lcTag !== "label" && lcTag !== "output") element.removeAttribute("for");
				} catch (_$1) {}
			}
			const childNodes = getChildNodes(node);
			if (childNodes) for (let i = childNodes.length - 1; i >= 0; --i) stack.push(childNodes[i]);
		}
	};
	/**
	* _initDocument
	*
	* @param dirty - a string of dirty markup
	* @return a DOM, filled with the dirty markup
	*/
	const _initDocument = function _initDocument$1(dirty) {
		let doc = null;
		let leadingWhitespace = null;
		if (FORCE_BODY) dirty = "<remove></remove>" + dirty;
else {
			const matches = stringMatch(dirty, /^[\r\n\t ]+/);
			leadingWhitespace = matches && matches[0];
		}
		if (PARSER_MEDIA_TYPE === "application/xhtml+xml" && NAMESPACE === HTML_NAMESPACE) dirty = "<html xmlns=\"http://www.w3.org/1999/xhtml\"><head></head><body>" + dirty + "</body></html>";
		const dirtyPayload = trustedTypesPolicy ? _createTrustedHTML(dirty) : dirty;
		if (NAMESPACE === HTML_NAMESPACE) try {
			doc = new DOMParser().parseFromString(dirtyPayload, PARSER_MEDIA_TYPE);
		} catch (_$1) {}
		if (!doc || !doc.documentElement) {
			doc = implementation.createDocument(NAMESPACE, "template", null);
			try {
				doc.documentElement.innerHTML = IS_EMPTY_INPUT ? emptyHTML : dirtyPayload;
			} catch (_$1) {}
		}
		const body = doc.body || doc.documentElement;
		if (dirty && leadingWhitespace) body.insertBefore(document$1.createTextNode(leadingWhitespace), body.childNodes[0] || null);
		if (NAMESPACE === HTML_NAMESPACE) return getElementsByTagName.call(doc, WHOLE_DOCUMENT ? "html" : "body")[0];
		return WHOLE_DOCUMENT ? doc.documentElement : body;
	};
	/**
	* Creates a NodeIterator object that you can use to traverse filtered lists of nodes or elements in a document.
	*
	* @param root The root element or node to start traversing on.
	* @return The created NodeIterator
	*/
	const _createNodeIterator = function _createNodeIterator$1(root) {
		return createNodeIterator.call(
			root.ownerDocument || root,
			root,
			// eslint-disable-next-line no-bitwise
			NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT | NodeFilter.SHOW_PROCESSING_INSTRUCTION | NodeFilter.SHOW_CDATA_SECTION,
			null
);
	};
	/**
	* Replace template expression syntax (mustache, ERB, template
	* literal) with a space; shared by all SAFE_FOR_TEMPLATES scrub
	* sites. Order matters: mustache, then ERB, then template literal.
	*
	* @param value the string to scrub
	* @returns the scrubbed string
	*/
	const _stripTemplateExpressions = function _stripTemplateExpressions$1(value) {
		value = stringReplace(value, MUSTACHE_EXPR$1, " ");
		value = stringReplace(value, ERB_EXPR$1, " ");
		value = stringReplace(value, TMPLIT_EXPR$1, " ");
		return value;
	};
	/**
	* Strip template-engine expressions ({{...}}, ${...}, <%...%>) from the
	* character data of an element subtree. Used as the final safety net for
	* SAFE_FOR_TEMPLATES on every DOM-returning code path so that expressions
	* which only form after text-node normalization (e.g. fragments split across
	* stripped elements) cannot survive into a template-evaluating framework.
	*
	* Walks text/comment/CDATA/processing-instruction nodes and mutates `.data`
	* in place rather than round-tripping through innerHTML. This preserves
	* descendant node references (important for IN_PLACE callers), avoids a
	* serialize/reparse cycle, and reads literal character data — which means
	* `<%...%>` in text content matches the ERB regex against its real bytes
	* instead of the HTML-entity-escaped form innerHTML would produce.
	*
	* Attribute values are not visited here; SAFE_FOR_TEMPLATES handling for
	* attributes is performed during the per-node `_sanitizeAttributes` pass.
	*
	* @param node The root element whose character data should be scrubbed.
	*/
	const _scrubTemplateExpressions2 = function _scrubTemplateExpressions(node) {
		var _node$querySelectorAl;
		node.normalize();
		const walker = createNodeIterator.call(
			node.ownerDocument || node,
			node,
			// eslint-disable-next-line no-bitwise
			NodeFilter.SHOW_TEXT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_CDATA_SECTION | NodeFilter.SHOW_PROCESSING_INSTRUCTION,
			null
);
		let currentNode = walker.nextNode();
		while (currentNode) {
			currentNode.data = _stripTemplateExpressions(currentNode.data);
			currentNode = walker.nextNode();
		}
		const templates = (_node$querySelectorAl = node.querySelectorAll) === null || _node$querySelectorAl === void 0 ? void 0 : _node$querySelectorAl.call(node, "template");
		if (templates) arrayForEach(templates, (tmpl) => {
			if (_isDocumentFragment(tmpl.content)) _scrubTemplateExpressions2(tmpl.content);
		});
	};
	/**
	* _isClobbered
	*
	* Detect DOM-clobbering on HTMLFormElement nodes. Form is the only HTML
	* interface with [LegacyOverrideBuiltIns]; a descendant element with a
	* `name` attribute matching a prototype property shadows that property
	* on direct reads. We use this check at the IN_PLACE entry-point and
	* during attribute sanitization to refuse clobbered forms.
	*
	* @param element element to check for clobbering attacks
	* @return true if clobbered, false if safe
	*/
	const _isClobbered = function _isClobbered$1(element) {
		const realTagName = getNodeName ? getNodeName(element) : null;
		if (typeof realTagName !== "string") return false;
		if (transformCaseFunc(realTagName) !== "form") return false;
		return typeof element.nodeName !== "string" || typeof element.textContent !== "string" || typeof element.removeChild !== "function" || element.attributes !== getAttributes(element) || typeof element.removeAttribute !== "function" || typeof element.setAttribute !== "function" || typeof element.namespaceURI !== "string" || typeof element.insertBefore !== "function" || typeof element.hasChildNodes !== "function" || element.nodeType !== getNodeType(element) || element.childNodes !== getChildNodes(element);
	};
	/**
	* Checks whether the given value is a DocumentFragment from any realm.
	*
	* The realm-independent replacement reads `nodeType` through the cached
	* Node.prototype getter and compares to the DOCUMENT_FRAGMENT_NODE
	* constant (11). nodeType is a numeric value resolved from the node's
	* internal slot, identical across realms for the same kind of node.
	*
	* @param value object to check
	* @return true if value is a DocumentFragment-shaped node from any realm
	*/
	const _isDocumentFragment = function _isDocumentFragment$1(value) {
		if (!getNodeType || typeof value !== "object" || value === null) return false;
		try {
			return getNodeType(value) === NODE_TYPE.documentFragment;
		} catch (_$1) {
			return false;
		}
	};
	/**
	* Checks whether the given object is a DOM node, including nodes that
	* originate from a different window/realm (e.g. an iframe's
	* contentDocument). The previous `value instanceof Node` check was
	* realm-bound: nodes from a different window failed it, causing
	* sanitize() to silently stringify them and reset IN_PLACE to false,
	* returning the original node unsanitized. See GHSA-4w3q-35jp-p934.
	*
	* @param value object to check whether it's a DOM node
	* @return true if value is a DOM node from any realm
	*/
	const _isNode = function _isNode$1(value) {
		if (!getNodeType || typeof value !== "object" || value === null) return false;
		try {
			return typeof getNodeType(value) === "number";
		} catch (_$1) {
			return false;
		}
	};
	function _executeHooks(hooks$1, currentNode, data) {
		if (hooks$1.length === 0) return;
		arrayForEach(hooks$1, (hook) => {
			hook.call(DOMPurify, currentNode, data, CONFIG);
		});
	}
	/**
	* Structural-threat checks that condemn a node regardless of the
	* allowlists: mXSS via namespace confusion, risky CSS construction,
	* processing instructions, markup-bearing comments. Pure predicate;
	* the caller removes. Check order is load-bearing.
	*
	* @param currentNode the node to inspect
	* @param tagName the node's transformCaseFunc'd tag name
	* @return true if the node must be removed
	*/
	const _isUnsafeNode = function _isUnsafeNode$1(currentNode, tagName) {
		if (SAFE_FOR_XML && currentNode.hasChildNodes() && !_isNode(currentNode.firstElementChild) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.textContent) && regExpTest(ELEMENT_MARKUP_PROBE, currentNode.innerHTML)) return true;
		if (SAFE_FOR_XML && currentNode.namespaceURI === HTML_NAMESPACE && tagName === "style" && _isNode(currentNode.firstElementChild)) return true;
		if (currentNode.nodeType === NODE_TYPE.processingInstruction) return true;
		if (SAFE_FOR_XML && currentNode.nodeType === NODE_TYPE.comment && regExpTest(COMMENT_MARKUP_PROBE, currentNode.data)) return true;
		return false;
	};
	/**
	* Handle a node whose tag is forbidden or not allowlisted: keep
	* allowed custom elements (false return exits _sanitizeElements
	* early - the namespace and fallback-tag removal checks are
	* intentionally skipped for kept custom elements), else hoist
	* content per KEEP_CONTENT and remove.
	*
	* A kept custom element is the ONLY case in which this function
	* returns false, so the caller uses that return value to run the
	* afterSanitizeElements hook on the kept element and keep the
	* element-hook lifecycle consistent with normal allowlisted
	* elements (GHSA-c2j3-45gr-mqc4).
	*
	* @param currentNode the disallowed node
	* @param tagName the node's transformCaseFunc'd tag name
	* @return true if the node was removed, false if kept
	*/
	const _sanitizeDisallowedNode = function _sanitizeDisallowedNode$1(currentNode, tagName) {
		if (!FORBID_TAGS[tagName] && _isBasicCustomElement(tagName)) {
			if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, tagName)) return false;
			if (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(tagName)) return false;
		}
		if (KEEP_CONTENT && !FORBID_CONTENTS[tagName]) {
			const parentNode = getParentNode(currentNode);
			const childNodes = getChildNodes(currentNode);
			if (childNodes && parentNode) {
				const childCount = childNodes.length;
				for (let i = childCount - 1; i >= 0; --i) {
					const hoisted = IN_PLACE ? childNodes[i] : cloneNode(childNodes[i], true);
					parentNode.insertBefore(hoisted, getNextSibling(currentNode));
				}
			}
		}
		_forceRemove(currentNode);
		return true;
	};
	/**
	* _sanitizeElements
	*
	* @protect nodeName
	* @protect textContent
	* @protect removeChild
	* @param currentNode to check for permission to exist
	* @return true if node was killed, false if left alive
	*/
	const _sanitizeElements = function _sanitizeElements$1(currentNode, root) {
		_executeHooks(hooks.beforeSanitizeElements, currentNode, null);
		if (currentNode !== root && getParentNode(currentNode) === null) return true;
		if (_isClobbered(currentNode)) {
			_forceRemove(currentNode);
			return true;
		}
		const tagName = transformCaseFunc(getNodeName ? getNodeName(currentNode) : currentNode.nodeName);
		_executeHooks(hooks.uponSanitizeElement, currentNode, {
			tagName,
			allowedTags: ALLOWED_TAGS
		});
		if (currentNode !== root && getParentNode(currentNode) === null) return true;
		if (_isUnsafeNode(currentNode, tagName)) {
			_forceRemove(currentNode);
			return true;
		}
		if (FORBID_TAGS[tagName] || !(EXTRA_ELEMENT_HANDLING.tagCheck instanceof Function && EXTRA_ELEMENT_HANDLING.tagCheck(tagName)) && !ALLOWED_TAGS[tagName]) {
			const removed = _sanitizeDisallowedNode(currentNode, tagName);
			if (removed === false) _executeHooks(hooks.afterSanitizeElements, currentNode, null);
			return removed;
		}
		const nt$1 = getNodeType ? getNodeType(currentNode) : currentNode.nodeType;
		if (nt$1 === NODE_TYPE.element && !_checkValidNamespace(currentNode)) {
			_forceRemove(currentNode);
			return true;
		}
		if ((tagName === "noscript" || tagName === "noembed" || tagName === "noframes") && regExpTest(FALLBACK_TAG_CLOSE, currentNode.innerHTML)) {
			_forceRemove(currentNode);
			return true;
		}
		if (SAFE_FOR_TEMPLATES && currentNode.nodeType === NODE_TYPE.text) {
			const content = _stripTemplateExpressions(currentNode.textContent);
			if (currentNode.textContent !== content) {
				arrayPush(DOMPurify.removed, { element: currentNode.cloneNode() });
				currentNode.textContent = content;
			}
		}
		_executeHooks(hooks.afterSanitizeElements, currentNode, null);
		return false;
	};
	/**
	* _isValidAttribute
	*
	* @param lcTag Lowercase tag name of containing element.
	* @param lcName Lowercase attribute name.
	* @param value Attribute value.
	* @return Returns true if `value` is valid, otherwise false.
	*/
	const _isValidAttribute = function _isValidAttribute$1(lcTag, lcName, value) {
		if (FORBID_ATTR[lcName]) return false;
		if (SAFE_FOR_XML && lcName === "patchsrc") return false;
		if (SAFE_FOR_XML && lcName === "for" && lcTag !== "label" && lcTag !== "output") return false;
		if (SANITIZE_DOM && (lcName === "id" || lcName === "name") && (value in document$1 || value in formElement)) return false;
		const nameIsPermitted = ALLOWED_ATTR[lcName] || EXTRA_ELEMENT_HANDLING.attributeCheck instanceof Function && EXTRA_ELEMENT_HANDLING.attributeCheck(lcName, lcTag);
		if (ALLOW_DATA_ATTR && regExpTest(DATA_ATTR$1, lcName));
else if (ALLOW_ARIA_ATTR && regExpTest(ARIA_ATTR$1, lcName));
else if (!nameIsPermitted) if (_isBasicCustomElement(lcTag) && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, lcTag) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(lcTag)) && (CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.attributeNameCheck, lcName) || CUSTOM_ELEMENT_HANDLING.attributeNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.attributeNameCheck(lcName, lcTag)) || lcName === "is" && CUSTOM_ELEMENT_HANDLING.allowCustomizedBuiltInElements && (CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof RegExp && regExpTest(CUSTOM_ELEMENT_HANDLING.tagNameCheck, value) || CUSTOM_ELEMENT_HANDLING.tagNameCheck instanceof Function && CUSTOM_ELEMENT_HANDLING.tagNameCheck(value)));
else return false;
else if (URI_SAFE_ATTRIBUTES[lcName]);
else if (regExpTest(IS_ALLOWED_URI$1, stringReplace(value, ATTR_WHITESPACE$1, "")));
else if ((lcName === "src" || lcName === "xlink:href" || lcName === "href") && lcTag !== "script" && stringIndexOf(value, "data:") === 0 && DATA_URI_TAGS[lcTag]);
else if (ALLOW_UNKNOWN_PROTOCOLS && !regExpTest(IS_SCRIPT_OR_DATA$1, stringReplace(value, ATTR_WHITESPACE$1, "")));
else if (value) return false;
else;
		return true;
	};
	const RESERVED_CUSTOM_ELEMENT_NAMES = addToSet({}, [
		"annotation-xml",
		"color-profile",
		"font-face",
		"font-face-format",
		"font-face-name",
		"font-face-src",
		"font-face-uri",
		"missing-glyph"
	]);
	/**
	* _isBasicCustomElement
	* checks if at least one dash is included in tagName, and it's not the first char
	* for more sophisticated checking see https://github.com/sindresorhus/validate-element-name
	*
	* @param tagName name of the tag of the node to sanitize
	* @returns Returns true if the tag name meets the basic criteria for a custom element, otherwise false.
	*/
	const _isBasicCustomElement = function _isBasicCustomElement$1(tagName) {
		return !RESERVED_CUSTOM_ELEMENT_NAMES[stringToLowerCase(tagName)] && regExpTest(CUSTOM_ELEMENT$1, tagName);
	};
	/**
	* Wrap an attribute value in the matching Trusted Types object when
	* the active policy requires it. Namespaced attributes pass through
	* unchanged (no TT support yet, see
	* https://bugs.chromium.org/p/chromium/issues/detail?id=1305293).
	*
	* @param lcTag lowercase tag name of the containing element
	* @param lcName lowercase attribute name
	* @param namespaceURI the attribute's namespace, if any
	* @param value the attribute value to wrap
	* @return the value, wrapped when Trusted Types demand it
	*/
	const _applyTrustedTypesToAttribute = function _applyTrustedTypesToAttribute$1(lcTag, lcName, namespaceURI, value) {
		if (trustedTypesPolicy && typeof trustedTypes === "object" && typeof trustedTypes.getAttributeType === "function" && !namespaceURI) switch (trustedTypes.getAttributeType(lcTag, lcName)) {
			case "TrustedHTML": return _createTrustedHTML(value);
			case "TrustedScriptURL": return _createTrustedScriptURL(value);
		}
		return value;
	};
	/**
	* Write a modified attribute value back onto the element. On
	* success, re-probe for clobbering introduced by the new value and
	* remove the element when found; otherwise pop the removal entry
	* recorded by the earlier _removeAttribute (long-standing pairing
	* with the SANITIZE_NAMED_PROPS path - do not "fix" casually). On
	* failure, remove the attribute instead.
	*
	* @param currentNode the element carrying the attribute
	* @param name the attribute name as present on the element
	* @param namespaceURI the attribute's namespace, if any
	* @param value the new attribute value
	*/
	const _setAttributeValue = function _setAttributeValue$1(currentNode, name, namespaceURI, value) {
		try {
			if (namespaceURI) currentNode.setAttributeNS(namespaceURI, name, value);
else currentNode.setAttribute(name, value);
			if (_isClobbered(currentNode)) _forceRemove(currentNode);
else arrayPop(DOMPurify.removed);
		} catch (_$1) {
			_removeAttribute(name, currentNode);
		}
	};
	/**
	* _sanitizeAttributes
	*
	* @protect attributes
	* @protect nodeName
	* @protect removeAttribute
	* @protect setAttribute
	*
	* @param currentNode to sanitize
	*/
	const _sanitizeAttributes = function _sanitizeAttributes$1(currentNode) {
		_executeHooks(hooks.beforeSanitizeAttributes, currentNode, null);
		const attributes = currentNode.attributes;
		if (!attributes || _isClobbered(currentNode)) return;
		const hookEvent = {
			attrName: "",
			attrValue: "",
			keepAttr: true,
			allowedAttributes: ALLOWED_ATTR,
			forceKeepAttr: undefined
		};
		let l = attributes.length;
		const lcTag = transformCaseFunc(currentNode.nodeName);
		while (l--) {
			const attr = attributes[l];
			const name = attr.name, namespaceURI = attr.namespaceURI, attrValue = attr.value;
			const lcName = transformCaseFunc(name);
			const initValue = attrValue;
			let value = name === "value" ? initValue : stringTrim(initValue);
			hookEvent.attrName = lcName;
			hookEvent.attrValue = value;
			hookEvent.keepAttr = true;
			hookEvent.forceKeepAttr = undefined;
			_executeHooks(hooks.uponSanitizeAttribute, currentNode, hookEvent);
			value = hookEvent.attrValue;
			if (SANITIZE_NAMED_PROPS && (lcName === "id" || lcName === "name") && stringIndexOf(value, SANITIZE_NAMED_PROPS_PREFIX) !== 0) {
				_removeAttribute(name, currentNode);
				value = SANITIZE_NAMED_PROPS_PREFIX + value;
			}
			if (SAFE_FOR_XML && regExpTest(/((--!?|])>)|<\/(style|script|title|xmp|textarea|noscript|iframe|noembed|noframes)/i, value)) {
				_removeAttribute(name, currentNode);
				continue;
			}
			if (lcName === "attributename" && stringMatch(value, "href")) {
				_removeAttribute(name, currentNode);
				continue;
			}
			if (hookEvent.forceKeepAttr) continue;
			if (!hookEvent.keepAttr) {
				_removeAttribute(name, currentNode);
				continue;
			}
			if (!ALLOW_SELF_CLOSE_IN_ATTR && regExpTest(SELF_CLOSING_TAG, value)) {
				_removeAttribute(name, currentNode);
				continue;
			}
			if (SAFE_FOR_TEMPLATES) value = _stripTemplateExpressions(value);
			if (!_isValidAttribute(lcTag, lcName, value)) {
				_removeAttribute(name, currentNode);
				continue;
			}
			value = _applyTrustedTypesToAttribute(lcTag, lcName, namespaceURI, value);
			if (value !== initValue) _setAttributeValue(currentNode, name, namespaceURI, value);
		}
		_executeHooks(hooks.afterSanitizeAttributes, currentNode, null);
	};
	/**
	* _sanitizeShadowDOM
	*
	* @param fragment to iterate over recursively
	*/
	const _sanitizeShadowDOM2 = function _sanitizeShadowDOM(fragment) {
		let shadowNode = null;
		const shadowIterator = _createNodeIterator(fragment);
		_executeHooks(hooks.beforeSanitizeShadowDOM, fragment, null);
		while (shadowNode = shadowIterator.nextNode()) {
			_executeHooks(hooks.uponSanitizeShadowNode, shadowNode, null);
			_sanitizeElements(shadowNode, fragment);
			_sanitizeAttributes(shadowNode);
			if (_isDocumentFragment(shadowNode.content)) _sanitizeShadowDOM2(shadowNode.content);
			const shadowNodeType = getNodeType ? getNodeType(shadowNode) : shadowNode.nodeType;
			if (shadowNodeType === NODE_TYPE.element) {
				const innerSr = getShadowRoot(shadowNode);
				if (_isDocumentFragment(innerSr)) {
					_sanitizeAttachedShadowRoots(innerSr);
					_sanitizeShadowDOM2(innerSr);
				}
			}
		}
		_executeHooks(hooks.afterSanitizeShadowDOM, fragment, null);
	};
	/**
	* _sanitizeAttachedShadowRoots
	*
	* Walks `root` and feeds every attached shadow root we encounter into
	* the existing _sanitizeShadowDOM pipeline. The default node iterator
	* does not descend into shadow trees, so nodes inside an attached
	* shadow root would otherwise be skipped entirely.
	*
	* Two real input paths put attached shadow roots in front of us:
	*   1. IN_PLACE on a DOM node that already has shadow roots attached.
	*   2. DOM-node input where importNode(dirty, true) deep-clones the
	*      shadow root because it was created with `clonable: true`.
	*
	* This pass runs once, up front, so the main iteration loop (and the
	* existing _sanitizeShadowDOM template-content recursion) stay
	* untouched — string-input paths are not affected.
	*
	* @param root the subtree root to walk for attached shadow roots
	*/
	const _sanitizeAttachedShadowRoots = function _sanitizeAttachedShadowRoots$1(root) {
		const stack = [{
			node: root,
			shadow: null
		}];
		while (stack.length > 0) {
			const item = stack.pop();
			if (item.shadow) {
				_sanitizeShadowDOM2(item.shadow);
				continue;
			}
			const node = item.node;
			const nodeType = getNodeType ? getNodeType(node) : node.nodeType;
			const isElement = nodeType === NODE_TYPE.element;
			const childNodes = getChildNodes(node);
			if (childNodes) for (let i = childNodes.length - 1; i >= 0; --i) stack.push({
				node: childNodes[i],
				shadow: null
			});
			if (isElement) {
				const rootName = getNodeName ? getNodeName(node) : null;
				if (typeof rootName === "string" && transformCaseFunc(rootName) === "template") {
					const content = node.content;
					if (_isDocumentFragment(content)) stack.push({
						node: content,
						shadow: null
					});
				}
			}
			if (isElement) {
				const sr = getShadowRoot(node);
				if (_isDocumentFragment(sr)) stack.push({
					node: null,
					shadow: sr
				}, {
					node: sr,
					shadow: null
				});
			}
		}
	};
	DOMPurify.sanitize = function(dirty) {
		let cfg = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
		let body = null;
		let importedNode = null;
		let currentNode = null;
		let returnNode = null;
		IS_EMPTY_INPUT = !dirty;
		if (IS_EMPTY_INPUT) dirty = "<!-->";
		if (typeof dirty !== "string" && !_isNode(dirty)) {
			dirty = stringifyValue(dirty);
			if (typeof dirty !== "string") throw typeErrorCreate("dirty is not a string, aborting");
		}
		if (!DOMPurify.isSupported) return dirty;
		if (SET_CONFIG) {
			ALLOWED_TAGS = SET_CONFIG_ALLOWED_TAGS;
			ALLOWED_ATTR = SET_CONFIG_ALLOWED_ATTR;
		} else _parseConfig(cfg);
		if (hooks.uponSanitizeElement.length > 0 || hooks.uponSanitizeAttribute.length > 0) ALLOWED_TAGS = clone(ALLOWED_TAGS);
		if (hooks.uponSanitizeAttribute.length > 0) ALLOWED_ATTR = clone(ALLOWED_ATTR);
		DOMPurify.removed = [];
		const inPlace = IN_PLACE && typeof dirty !== "string" && _isNode(dirty);
		if (inPlace) {
			_neutralizePatchLinkage(dirty);
			const nn = getNodeName ? getNodeName(dirty) : dirty.nodeName;
			if (typeof nn === "string") {
				const tagName = transformCaseFunc(nn);
				if (!ALLOWED_TAGS[tagName] || FORBID_TAGS[tagName]) {
					_neutralizeRoot(dirty);
					throw typeErrorCreate("root node is forbidden and cannot be sanitized in-place");
				}
			}
			if (_isClobbered(dirty)) {
				_neutralizeRoot(dirty);
				throw typeErrorCreate("root node is clobbered and cannot be sanitized in-place");
			}
			try {
				_sanitizeAttachedShadowRoots(dirty);
			} catch (error) {
				_neutralizeRoot(dirty);
				throw error;
			}
		} else if (_isNode(dirty)) {
			body = _initDocument("<!---->");
			importedNode = body.ownerDocument.importNode(dirty, true);
			if (importedNode.nodeType === NODE_TYPE.element && importedNode.nodeName === "BODY") body = importedNode;
else if (importedNode.nodeName === "HTML") body = importedNode;
else body.appendChild(importedNode);
			_sanitizeAttachedShadowRoots(importedNode);
		} else {
			if (!RETURN_DOM && !SAFE_FOR_TEMPLATES && !WHOLE_DOCUMENT && dirty.indexOf("<") === -1) return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(dirty) : dirty;
			body = _initDocument(dirty);
			if (!body) return RETURN_DOM ? null : RETURN_TRUSTED_TYPE ? emptyHTML : "";
		}
		if (body && FORCE_BODY) _forceRemove(body.firstChild);
		const walkRoot = inPlace ? dirty : body;
		const nodeIterator = _createNodeIterator(walkRoot);
		try {
			while (currentNode = nodeIterator.nextNode()) {
				_sanitizeElements(currentNode, walkRoot);
				_sanitizeAttributes(currentNode);
				if (_isDocumentFragment(currentNode.content)) _sanitizeShadowDOM2(currentNode.content);
			}
		} catch (error) {
			if (inPlace) {
				_neutralizeRoot(dirty);
				arrayForEach(DOMPurify.removed, (entry) => {
					if (entry.element) _neutralizeSubtree(entry.element);
				});
			}
			throw error;
		}
		if (inPlace) {
			arrayForEach(DOMPurify.removed, (entry) => {
				if (entry.element) _neutralizeSubtree(entry.element);
			});
			if (SAFE_FOR_TEMPLATES) _scrubTemplateExpressions2(dirty);
			return dirty;
		}
		if (RETURN_DOM) {
			if (SAFE_FOR_TEMPLATES) _scrubTemplateExpressions2(body);
			if (RETURN_DOM_FRAGMENT) {
				returnNode = createDocumentFragment.call(body.ownerDocument);
				while (body.firstChild) returnNode.appendChild(body.firstChild);
			} else returnNode = body;
			if (ALLOWED_ATTR.shadowroot || ALLOWED_ATTR.shadowrootmode) returnNode = importNode.call(originalDocument, returnNode, true);
			return returnNode;
		}
		let serializedHTML = WHOLE_DOCUMENT ? body.outerHTML : body.innerHTML;
		if (WHOLE_DOCUMENT && ALLOWED_TAGS["!doctype"] && body.ownerDocument && body.ownerDocument.doctype && body.ownerDocument.doctype.name && regExpTest(DOCTYPE_NAME, body.ownerDocument.doctype.name)) serializedHTML = "<!DOCTYPE " + body.ownerDocument.doctype.name + ">\n" + serializedHTML;
		if (SAFE_FOR_TEMPLATES) serializedHTML = _stripTemplateExpressions(serializedHTML);
		return trustedTypesPolicy && RETURN_TRUSTED_TYPE ? _createTrustedHTML(serializedHTML) : serializedHTML;
	};
	DOMPurify.setConfig = function() {
		let cfg = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
		_parseConfig(cfg);
		SET_CONFIG = true;
		SET_CONFIG_ALLOWED_TAGS = ALLOWED_TAGS;
		SET_CONFIG_ALLOWED_ATTR = ALLOWED_ATTR;
	};
	DOMPurify.clearConfig = function() {
		CONFIG = null;
		SET_CONFIG = false;
		SET_CONFIG_ALLOWED_TAGS = null;
		SET_CONFIG_ALLOWED_ATTR = null;
		trustedTypesPolicy = defaultTrustedTypesPolicy;
		emptyHTML = "";
	};
	DOMPurify.isValidAttribute = function(tag, attr, value) {
		if (!CONFIG) _parseConfig({});
		const lcTag = transformCaseFunc(tag);
		const lcName = transformCaseFunc(attr);
		return _isValidAttribute(lcTag, lcName, value);
	};
	DOMPurify.addHook = function(entryPoint, hookFunction) {
		if (typeof hookFunction !== "function") return;
		if (!objectHasOwnProperty(hooks, entryPoint)) return;
		arrayPush(hooks[entryPoint], hookFunction);
	};
	DOMPurify.removeHook = function(entryPoint, hookFunction) {
		if (!objectHasOwnProperty(hooks, entryPoint)) return undefined;
		if (hookFunction !== undefined) {
			const index = arrayLastIndexOf(hooks[entryPoint], hookFunction);
			return index === -1 ? undefined : arraySplice(hooks[entryPoint], index, 1)[0];
		}
		return arrayPop(hooks[entryPoint]);
	};
	DOMPurify.removeHooks = function(entryPoint) {
		if (!objectHasOwnProperty(hooks, entryPoint)) return;
		hooks[entryPoint] = [];
	};
	DOMPurify.removeAllHooks = function() {
		hooks = _createHooksMap();
	};
	return DOMPurify;
}
var purify = createDOMPurify();

//#endregion
//#region node_modules/.pnpm/marked@18.0.6/node_modules/marked/lib/marked.esm.js
/**
* marked v18.0.6 - a markdown parser
* Copyright (c) 2018-2026, MarkedJS. (MIT License)
* Copyright (c) 2011-2018, Christopher Jeffrey. (MIT License)
* https://github.com/markedjs/marked
*/
/**
* DO NOT EDIT THIS FILE
* The code in this file is generated from files in ./src/
*/
function M() {
	return {
		async: !1,
		breaks: !1,
		extensions: null,
		gfm: !0,
		hooks: null,
		pedantic: !1,
		renderer: null,
		silent: !1,
		tokenizer: null,
		walkTokens: null
	};
}
var T = M();
function N(l) {
	T = l;
}
var _ = { exec: () => null };
function E(l) {
	let e = [];
	return (t) => {
		let n = Math.max(0, Math.min(3, t - 1)), s = e[n];
		return s || (s = l(n), e[n] = s), s;
	};
}
function d(l, e = "") {
	let t = typeof l == "string" ? l : l.source, n = {
		replace: (s, r) => {
			let i = typeof r == "string" ? r : r.source;
			return i = i.replace(m.caret, "$1"), t = t.replace(s, i), n;
		},
		getRegex: () => new RegExp(t, e)
	};
	return n;
}
var Te = ((l = "") => {
	try {
		return true;
	} catch {
		return !1;
	}
})(), m = {
	codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm,
	outputLinkReplace: /\\([\[\]])/g,
	indentCodeCompensation: /^(\s+)(?:```)/,
	beginningSpace: /^\s+/,
	endingHash: /#$/,
	startingSpaceChar: /^ /,
	endingSpaceChar: / $/,
	nonSpaceChar: /[^ ]/,
	newLineCharGlobal: /\n/g,
	tabCharGlobal: /\t/g,
	multipleSpaceGlobal: /\s+/g,
	blankLine: /^[ \t]*$/,
	doubleBlankLine: /\n[ \t]*\n[ \t]*$/,
	blockquoteStart: /^ {0,3}>/,
	blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g,
	blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm,
	listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g,
	listIsTask: /^\[[ xX]\] +\S/,
	listReplaceTask: /^\[[ xX]\] +/,
	listTaskCheckbox: /\[[ xX]\]/,
	anyLine: /\n.*\n/,
	hrefBrackets: /^<(.*)>$/,
	tableDelimiter: /[:|]/,
	tableAlignChars: /^\||\| *$/g,
	tableRowBlankLine: /\n[ \t]*$/,
	tableAlignRight: /^ *-+: *$/,
	tableAlignCenter: /^ *:-+: *$/,
	tableAlignLeft: /^ *:-+ *$/,
	startATag: /^<a /i,
	endATag: /^<\/a>/i,
	startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i,
	endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i,
	startAngleBracket: /^</,
	endAngleBracket: />$/,
	pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/,
	unicodeAlphaNumeric: /[\p{L}\p{N}]/u,
	escapeTest: /[&<>"']/,
	escapeReplace: /[&<>"']/g,
	escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/,
	escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g,
	caret: /(^|[^\[])\^/g,
	percentDecode: /%25/g,
	findPipe: /\|/g,
	splitPipe: / \|/,
	slashPipe: /\\\|/g,
	carriageReturn: /\r\n|\r/g,
	spaceLine: /^ +$/gm,
	notSpaceStart: /^\S*/,
	endingNewline: /\n$/,
	listItemRegex: (l) => new RegExp(`^( {0,3}${l})((?:[	 ][^\\n]*)?(?:\\n|$))`),
	nextBulletRegex: E((l) => new RegExp(`^ {0,${l}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`)),
	hrRegex: E((l) => new RegExp(`^ {0,${l}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`)),
	fencesBeginRegex: E((l) => new RegExp(`^ {0,${l}}(?:\`\`\`|~~~)`)),
	headingBeginRegex: E((l) => new RegExp(`^ {0,${l}}#`)),
	htmlBeginRegex: E((l) => new RegExp(`^ {0,${l}}<(?:[a-z].*>|!--)`, "i")),
	blockquoteBeginRegex: E((l) => new RegExp(`^ {0,${l}}>`))
}, Oe = /^(?:[ \t]*(?:\n|$))+/, we = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/, ye = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/, B = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/, Pe = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/, j = / {0,3}(?:[*+-]|\d{1,9}[.)])/, oe = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/, ae = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex(), Se = d(oe).replace(/bull/g, j).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex(), F = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/, $e = /^[^\n]+/, U = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/, Le = d(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", U).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex(), _e = d(/^(bull)([ \t][^\n]*?)?(?:\n|$)/).replace(/bull/g, j).getRegex(), H = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul", K = /<!--(?:-?>|[\s\S]*?(?:-->|$))/, ze = d("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>[^\\n]*\\n+|$)|<![A-Z][\\s\\S]*?(?:>[^\\n]*\\n+|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>[^\\n]*\\n+|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", K).replace("tag", H).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex(), le = (l) => d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", l).replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex(), Me = le(/ {0,3}(?:[*+-]|1[.)])[ \t]+[^ \t\n]/), Ee = le(/ {0,3}(?:[*+-]|\d{1,9}[.)])[ \t]+[^ \t\n]/), Ie = d(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", Ee).getRegex(), W = {
	blockquote: Ie,
	code: we,
	def: Le,
	fences: ye,
	heading: Pe,
	hr: B,
	html: ze,
	lheading: ae,
	list: _e,
	newline: Oe,
	paragraph: Me,
	table: _,
	text: $e
}, se = d("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex(), Ae = {
	...W,
	lheading: Se,
	table: se,
	paragraph: d(F).replace("hr", B).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", se).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]+[^ \\t\\n]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", H).getRegex()
}, Ce = {
	...W,
	html: d(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", K).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(),
	def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/,
	heading: /^(#{1,6})(.*)(?:\n+|$)/,
	fences: _,
	lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/,
	paragraph: d(F).replace("hr", B).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", ae).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex()
}, Be = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/, qe = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, ue = /^( {2,}|\\)\n(?!\s*$)/, De = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/, I = /[\p{P}\p{S}]/u, Z = /[\s\p{P}\p{S}]/u, X = /[^\s\p{P}\p{S}]/u, ve = d(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, Z).getRegex(), pe = /(?!~)[\p{P}\p{S}]/u, He = /(?!~)[\s\p{P}\p{S}]/u, Ze = /(?:[^\s\p{P}\p{S}]|~)/u, Ge = d(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Te ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex(), ce = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/, Ne = d(ce, "u").replace(/punct/g, I).getRegex(), Qe = d(ce, "u").replace(/punct/g, pe).getRegex(), he = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)", je = d(he, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Fe = d(he, "gu").replace(/notPunctSpace/g, Ze).replace(/punctSpace/g, He).replace(/punct/g, pe).getRegex(), Ue = d("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Ke = d(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, I).getRegex(), We = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)", Xe = d(We, "gu").replace(/notPunctSpace/g, X).replace(/punctSpace/g, Z).replace(/punct/g, I).getRegex(), Je = d(/\\(punct)/, "gu").replace(/punct/g, I).getRegex(), Ve = d(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex(), Ye = d(K).replace("(?:-->|$)", "-->").getRegex(), et = d("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Ye).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex(), v = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/, tt = d(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", v).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]+|(?=\))/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex(), ke = d(/^!?\[(label)\]\[(ref)\]/).replace("label", v).replace("ref", U).getRegex(), de = d(/^!?\[(ref)\](?:\[\])?/).replace("ref", U).getRegex(), nt = d("reflink|nolink(?!\\()", "g").replace("reflink", ke).replace("nolink", de).getRegex(), ie = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/, J = {
	_backpedal: _,
	anyPunctuation: Je,
	autolink: Ve,
	blockSkip: Ge,
	br: ue,
	code: qe,
	del: _,
	delLDelim: _,
	delRDelim: _,
	emStrongLDelim: Ne,
	emStrongRDelimAst: je,
	emStrongRDelimUnd: Ue,
	escape: Be,
	link: tt,
	nolink: de,
	punctuation: ve,
	reflink: ke,
	reflinkSearch: nt,
	tag: et,
	text: De,
	url: _
}, rt = {
	...J,
	link: d(/^!?\[(label)\]\((.*?)\)/).replace("label", v).getRegex(),
	reflink: d(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", v).getRegex()
}, Q = {
	...J,
	emStrongRDelimAst: Fe,
	emStrongLDelim: Qe,
	delLDelim: Ke,
	delRDelim: Xe,
	url: d(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", ie).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(),
	_backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/,
	del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/,
	text: d(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", ie).getRegex()
}, st = {
	...Q,
	br: d(ue).replace("{2,}", "*").getRegex(),
	text: d(Q.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex()
}, q = {
	normal: W,
	gfm: Ae,
	pedantic: Ce
}, A = {
	normal: J,
	gfm: Q,
	breaks: st,
	pedantic: rt
};
var it = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
}, ge = (l) => it[l];
function O(l, e) {
	if (e) {
		if (m.escapeTest.test(l)) return l.replace(m.escapeReplace, ge);
	} else if (m.escapeTestNoEncode.test(l)) return l.replace(m.escapeReplaceNoEncode, ge);
	return l;
}
function V(l) {
	try {
		l = encodeURI(l).replace(m.percentDecode, "%");
	} catch {
		return null;
	}
	return l;
}
function Y(l, e) {
	let t = l.replace(m.findPipe, (r, i, o) => {
		let u = !1, a = i;
		for (; --a >= 0 && o[a] === "\\";) u = !u;
		return u ? "|" : " |";
	}), n = t.split(m.splitPipe), s = 0;
	if (n[0].trim() || n.shift(), n.length > 0 && !n.at(-1)?.trim() && n.pop(), e) if (n.length > e) n.splice(e);
else for (; n.length < e;) n.push("");
	for (; s < n.length; s++) n[s] = n[s].trim().replace(m.slashPipe, "|");
	return n;
}
function $(l, e, t) {
	let n = l.length;
	if (n === 0) return "";
	let s = 0;
	for (; s < n;) {
		let r = l.charAt(n - s - 1);
		if (r === e && !t) s++;
else if (r !== e && t) s++;
else break;
	}
	return l.slice(0, n - s);
}
function ee(l) {
	let e = l.split(`
`), t = e.length - 1;
	for (; t >= 0 && m.blankLine.test(e[t]);) t--;
	return e.length - t <= 2 ? l : e.slice(0, t + 1).join(`
`);
}
function fe(l, e) {
	if (l.indexOf(e[1]) === -1) return -1;
	let t = 0;
	for (let n = 0; n < l.length; n++) if (l[n] === "\\") n++;
else if (l[n] === e[0]) t++;
else if (l[n] === e[1] && (t--, t < 0)) return n;
	return t > 0 ? -2 : -1;
}
function me(l, e = 0) {
	let t = e, n = "";
	for (let s of l) if (s === "	") {
		let r = 4 - t % 4;
		n += " ".repeat(r), t += r;
	} else n += s, t++;
	return n;
}
function xe(l, e, t, n, s) {
	let r = e.href, i = e.title || null, o = l[1].replace(s.other.outputLinkReplace, "$1");
	n.state.inLink = !0;
	let u = {
		type: l[0].charAt(0) === "!" ? "image" : "link",
		raw: t,
		href: r,
		title: i,
		text: o,
		tokens: n.inlineTokens(o)
	};
	return n.state.inLink = !1, u;
}
function ot(l, e, t) {
	let n = l.match(t.other.indentCodeCompensation);
	if (n === null) return e;
	let s = n[1];
	return e.split(`
`).map((r) => {
		let i = r.match(t.other.beginningSpace);
		if (i === null) return r;
		let [o] = i;
		return o.length >= s.length ? r.slice(s.length) : r;
	}).join(`
`);
}
var w = class {
	options;
	rules;
	lexer;
	constructor(e) {
		this.options = e || T;
	}
	space(e) {
		let t = this.rules.block.newline.exec(e);
		if (t && t[0].length > 0) return {
			type: "space",
			raw: t[0]
		};
	}
	code(e) {
		let t = this.rules.block.code.exec(e);
		if (t) {
			let n = this.options.pedantic ? t[0] : ee(t[0]), s = n.replace(this.rules.other.codeRemoveIndent, "");
			return {
				type: "code",
				raw: n,
				codeBlockStyle: "indented",
				text: s
			};
		}
	}
	fences(e) {
		let t = this.rules.block.fences.exec(e);
		if (t) {
			let n = t[0], s = ot(n, t[3] || "", this.rules);
			return {
				type: "code",
				raw: n,
				lang: t[2] ? t[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t[2],
				text: s
			};
		}
	}
	heading(e) {
		let t = this.rules.block.heading.exec(e);
		if (t) {
			let n = t[2].trim();
			if (this.rules.other.endingHash.test(n)) {
				let s = $(n, "#");
				(this.options.pedantic || !s || this.rules.other.endingSpaceChar.test(s)) && (n = s.trim());
			}
			return {
				type: "heading",
				raw: $(t[0], `
`),
				depth: t[1].length,
				text: n,
				tokens: this.lexer.inline(n)
			};
		}
	}
	hr(e) {
		let t = this.rules.block.hr.exec(e);
		if (t) return {
			type: "hr",
			raw: $(t[0], `
`)
		};
	}
	blockquote(e) {
		let t = this.rules.block.blockquote.exec(e);
		if (t) {
			let n = $(t[0], `
`).split(`
`), s = "", r = "", i = [];
			for (; n.length > 0;) {
				let o = !1, u = [], a;
				for (a = 0; a < n.length; a++) if (this.rules.other.blockquoteStart.test(n[a])) u.push(n[a]), o = !0;
else if (!o) u.push(n[a]);
else break;
				n = n.slice(a);
				let c = u.join(`
`), p = c.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
				s = s ? `${s}
${c}` : c, r = r ? `${r}
${p}` : p;
				let k = this.lexer.state.top;
				if (this.lexer.state.top = !0, this.lexer.blockTokens(p, i, !0), this.lexer.state.top = k, n.length === 0) break;
				let h = i.at(-1);
				if (h?.type === "code") break;
				if (h?.type === "blockquote") {
					let R = h, f = R.raw + `
` + n.join(`
`), S = this.blockquote(f);
					i[i.length - 1] = S, s = s.substring(0, s.length - R.raw.length) + S.raw, r = r.substring(0, r.length - R.text.length) + S.text;
					break;
				} else if (h?.type === "list") {
					let R = h, f = R.raw + `
` + n.join(`
`), S = this.list(f);
					i[i.length - 1] = S, s = s.substring(0, s.length - h.raw.length) + S.raw, r = r.substring(0, r.length - R.raw.length) + S.raw, n = f.substring(i.at(-1).raw.length).split(`
`);
					continue;
				}
			}
			return {
				type: "blockquote",
				raw: s,
				tokens: i,
				text: r
			};
		}
	}
	list(e) {
		let t = this.rules.block.list.exec(e);
		if (t) {
			let n = t[1].trim(), s = n.length > 1, r = {
				type: "list",
				raw: "",
				ordered: s,
				start: s ? +n.slice(0, -1) : "",
				loose: !1,
				items: []
			};
			n = s ? `\\d{1,9}\\${n.slice(-1)}` : `\\${n}`, this.options.pedantic && (n = s ? n : "[*+-]");
			let i = this.rules.other.listItemRegex(n), o = !1;
			for (; e;) {
				let a = !1, c = "", p = "";
				if (!(t = i.exec(e)) || this.rules.block.hr.test(e)) break;
				c = t[0], e = e.substring(c.length);
				let k = me(t[2].split(`
`, 1)[0], t[1].length), h = e.split(`
`, 1)[0], R = !k.trim(), f = 0;
				if (this.options.pedantic ? (f = 2, p = k.trimStart()) : R ? f = t[1].length + 1 : (f = k.search(this.rules.other.nonSpaceChar), f = f > 4 ? 1 : f, p = k.slice(f), f += t[1].length), R && this.rules.other.blankLine.test(h) && (c += h + `
`, e = e.substring(h.length + 1), a = !0), !a) {
					let S = this.rules.other.nextBulletRegex(f), te = this.rules.other.hrRegex(f), ne = this.rules.other.fencesBeginRegex(f), re = this.rules.other.headingBeginRegex(f), be = this.rules.other.htmlBeginRegex(f), Re = this.rules.other.blockquoteBeginRegex(f);
					for (; e;) {
						let G = e.split(`
`, 1)[0], C;
						if (h = G, this.options.pedantic ? (h = h.replace(this.rules.other.listReplaceNesting, "  "), C = h) : C = h.replace(this.rules.other.tabCharGlobal, "    "), ne.test(h) || re.test(h) || be.test(h) || Re.test(h) || S.test(h) || te.test(h)) break;
						if (C.search(this.rules.other.nonSpaceChar) >= f || !h.trim()) p += `
` + C.slice(f);
else {
							if (R || k.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || ne.test(k) || re.test(k) || te.test(k)) break;
							p += `
` + h;
						}
						R = !h.trim(), c += G + `
`, e = e.substring(G.length + 1), k = C.slice(f);
					}
				}
				r.loose || (o ? r.loose = !0 : this.rules.other.doubleBlankLine.test(c) && (o = !0)), r.items.push({
					type: "list_item",
					raw: c,
					task: !!this.options.gfm && this.rules.other.listIsTask.test(p),
					loose: !1,
					text: p,
					tokens: []
				}), r.raw += c;
			}
			let u = r.items.at(-1);
			if (u) u.raw = u.raw.trimEnd(), u.text = u.text.trimEnd();
else return;
			r.raw = r.raw.trimEnd();
			for (let a of r.items) {
				this.lexer.state.top = !1, a.tokens = this.lexer.blockTokens(a.text, []);
				let c = a.tokens[0];
				if (a.task && (c?.type === "text" || c?.type === "paragraph")) {
					a.text = a.text.replace(this.rules.other.listReplaceTask, ""), c.raw = c.raw.replace(this.rules.other.listReplaceTask, ""), c.text = c.text.replace(this.rules.other.listReplaceTask, "");
					for (let k = this.lexer.inlineQueue.length - 1; k >= 0; k--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k].src)) {
						this.lexer.inlineQueue[k].src = this.lexer.inlineQueue[k].src.replace(this.rules.other.listReplaceTask, "");
						break;
					}
					let p = this.rules.other.listTaskCheckbox.exec(a.raw);
					if (p) {
						let k = {
							type: "checkbox",
							raw: p[0] + " ",
							checked: p[0] !== "[ ]"
						};
						a.checked = k.checked, r.loose ? a.tokens[0] && ["paragraph", "text"].includes(a.tokens[0].type) && "tokens" in a.tokens[0] && a.tokens[0].tokens ? (a.tokens[0].raw = k.raw + a.tokens[0].raw, a.tokens[0].text = k.raw + a.tokens[0].text, a.tokens[0].tokens.unshift(k)) : a.tokens.unshift({
							type: "paragraph",
							raw: k.raw,
							text: k.raw,
							tokens: [k]
						}) : a.tokens.unshift(k);
					}
				} else a.task && (a.task = !1);
				if (!r.loose) {
					let p = a.tokens.filter((h) => h.type === "space"), k = p.length > 0 && p.some((h) => this.rules.other.anyLine.test(h.raw));
					r.loose = k;
				}
			}
			if (r.loose) for (let a of r.items) {
				a.loose = !0;
				for (let c of a.tokens) c.type === "text" && (c.type = "paragraph");
			}
			return r;
		}
	}
	html(e) {
		let t = this.rules.block.html.exec(e);
		if (t) {
			let n = ee(t[0]);
			return {
				type: "html",
				block: !0,
				raw: n,
				pre: t[1] === "pre" || t[1] === "script" || t[1] === "style",
				text: n
			};
		}
	}
	def(e) {
		let t = this.rules.block.def.exec(e);
		if (t) {
			let n = t[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s = t[2] ? t[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r = t[3] ? t[3].substring(1, t[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t[3];
			return {
				type: "def",
				tag: n,
				raw: $(t[0], `
`),
				href: s,
				title: r
			};
		}
	}
	table(e) {
		let t = this.rules.block.table.exec(e);
		if (!t || !this.rules.other.tableDelimiter.test(t[2])) return;
		let n = Y(t[1]), s = t[2].replace(this.rules.other.tableAlignChars, "").split("|"), r = t[3]?.trim() ? t[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i = {
			type: "table",
			raw: $(t[0], `
`),
			header: [],
			align: [],
			rows: []
		};
		if (n.length === s.length) {
			for (let o of s) this.rules.other.tableAlignRight.test(o) ? i.align.push("right") : this.rules.other.tableAlignCenter.test(o) ? i.align.push("center") : this.rules.other.tableAlignLeft.test(o) ? i.align.push("left") : i.align.push(null);
			for (let o = 0; o < n.length; o++) i.header.push({
				text: n[o],
				tokens: this.lexer.inline(n[o]),
				header: !0,
				align: i.align[o]
			});
			for (let o of r) i.rows.push(Y(o, i.header.length).map((u, a) => ({
				text: u,
				tokens: this.lexer.inline(u),
				header: !1,
				align: i.align[a]
			})));
			return i;
		}
	}
	lheading(e) {
		let t = this.rules.block.lheading.exec(e);
		if (t) {
			let n = t[1].trim();
			return {
				type: "heading",
				raw: $(t[0], `
`),
				depth: t[2].charAt(0) === "=" ? 1 : 2,
				text: n,
				tokens: this.lexer.inline(n)
			};
		}
	}
	paragraph(e) {
		let t = this.rules.block.paragraph.exec(e);
		if (t) {
			let n = t[1].charAt(t[1].length - 1) === `
` ? t[1].slice(0, -1) : t[1];
			return {
				type: "paragraph",
				raw: t[0],
				text: n,
				tokens: this.lexer.inline(n)
			};
		}
	}
	text(e) {
		let t = this.rules.block.text.exec(e);
		if (t) return {
			type: "text",
			raw: t[0],
			text: t[0],
			tokens: this.lexer.inline(t[0])
		};
	}
	escape(e) {
		let t = this.rules.inline.escape.exec(e);
		if (t) return {
			type: "escape",
			raw: t[0],
			text: t[1]
		};
	}
	tag(e) {
		let t = this.rules.inline.tag.exec(e);
		if (t) return !this.lexer.state.inLink && this.rules.other.startATag.test(t[0]) ? this.lexer.state.inLink = !0 : this.lexer.state.inLink && this.rules.other.endATag.test(t[0]) && (this.lexer.state.inLink = !1), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t[0]) ? this.lexer.state.inRawBlock = !0 : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t[0]) && (this.lexer.state.inRawBlock = !1), {
			type: "html",
			raw: t[0],
			inLink: this.lexer.state.inLink,
			inRawBlock: this.lexer.state.inRawBlock,
			block: !1,
			text: t[0]
		};
	}
	link(e) {
		let t = this.rules.inline.link.exec(e);
		if (t) {
			let n = t[2].trim();
			if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n)) {
				if (!this.rules.other.endAngleBracket.test(n)) return;
				let i = $(n.slice(0, -1), "\\");
				if ((n.length - i.length) % 2 === 0) return;
			} else {
				let i = fe(t[2], "()");
				if (i === -2) return;
				if (i > -1) {
					let u = (t[0].indexOf("!") === 0 ? 5 : 4) + t[1].length + i;
					t[2] = t[2].substring(0, i), t[0] = t[0].substring(0, u).trim(), t[3] = "";
				}
			}
			let s = t[2], r = "";
			if (this.options.pedantic) {
				let i = this.rules.other.pedanticHrefTitle.exec(s);
				i && (s = i[1], r = i[3]);
			} else r = t[3] ? t[3].slice(1, -1) : "";
			return s = s.trim(), this.rules.other.startAngleBracket.test(s) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n) ? s = s.slice(1) : s = s.slice(1, -1)), xe(t, {
				href: s && s.replace(this.rules.inline.anyPunctuation, "$1"),
				title: r && r.replace(this.rules.inline.anyPunctuation, "$1")
			}, t[0], this.lexer, this.rules);
		}
	}
	reflink(e, t) {
		let n;
		if ((n = this.rules.inline.reflink.exec(e)) || (n = this.rules.inline.nolink.exec(e))) {
			let s = (n[2] || n[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r = t[s.toLowerCase()];
			if (!r) {
				let i = n[0].charAt(0);
				return {
					type: "text",
					raw: i,
					text: i
				};
			}
			return xe(n, r, n[0], this.lexer, this.rules);
		}
	}
	emStrong(e, t, n = "") {
		let s = this.rules.inline.emStrongLDelim.exec(e);
		if (!s || !s[1] && !s[2] && !s[3] && !s[4] || s[4] && n.match(this.rules.other.unicodeAlphaNumeric)) return;
		if (!(s[1] || s[3] || "") || !n || this.rules.inline.punctuation.exec(n)) {
			let i = [...s[0]].length - 1, o, u, a = i, c = 0, p = s[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
			for (p.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = p.exec(t)) !== null;) {
				if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o) continue;
				if (u = [...o].length, s[3] || s[4]) {
					a += u;
					continue;
				} else if ((s[5] || s[6]) && i % 3 && !((i + u) % 3)) {
					c += u;
					continue;
				}
				if (a -= u, a > 0) continue;
				u = Math.min(u, u + a + c);
				let k = [...s[0]][0].length, h = e.slice(0, i + s.index + k + u);
				if (Math.min(i, u) % 2) {
					let f = h.slice(1, -1);
					return {
						type: "em",
						raw: h,
						text: f,
						tokens: this.lexer.inlineTokens(f)
					};
				}
				let R = h.slice(2, -2);
				return {
					type: "strong",
					raw: h,
					text: R,
					tokens: this.lexer.inlineTokens(R)
				};
			}
		}
	}
	codespan(e) {
		let t = this.rules.inline.code.exec(e);
		if (t) {
			let n = t[2].replace(this.rules.other.newLineCharGlobal, " "), s = this.rules.other.nonSpaceChar.test(n), r = this.rules.other.startingSpaceChar.test(n) && this.rules.other.endingSpaceChar.test(n);
			return s && r && (n = n.substring(1, n.length - 1)), {
				type: "codespan",
				raw: t[0],
				text: n
			};
		}
	}
	br(e) {
		let t = this.rules.inline.br.exec(e);
		if (t) return {
			type: "br",
			raw: t[0]
		};
	}
	del(e, t, n = "") {
		let s = this.rules.inline.delLDelim.exec(e);
		if (!s) return;
		if (!(s[1] || "") || !n || this.rules.inline.punctuation.exec(n)) {
			let i = [...s[0]].length - 1, o, u, a = i, c = this.rules.inline.delRDelim;
			for (c.lastIndex = 0, t = t.slice(-1 * e.length + i); (s = c.exec(t)) !== null;) {
				if (o = s[1] || s[2] || s[3] || s[4] || s[5] || s[6], !o || (u = [...o].length, u !== i)) continue;
				if (s[3] || s[4]) {
					a += u;
					continue;
				}
				if (a -= u, a > 0) continue;
				u = Math.min(u, u + a);
				let p = [...s[0]][0].length, k = e.slice(0, i + s.index + p + u), h = k.slice(i, -i);
				return {
					type: "del",
					raw: k,
					text: h,
					tokens: this.lexer.inlineTokens(h)
				};
			}
		}
	}
	autolink(e) {
		let t = this.rules.inline.autolink.exec(e);
		if (t) {
			let n, s;
			return t[2] === "@" ? (n = t[1], s = "mailto:" + n) : (n = t[1], s = n), {
				type: "link",
				raw: t[0],
				text: n,
				href: s,
				tokens: [{
					type: "text",
					raw: n,
					text: n
				}]
			};
		}
	}
	url(e) {
		let t;
		if (t = this.rules.inline.url.exec(e)) {
			let n, s;
			if (t[2] === "@") n = t[0], s = "mailto:" + n;
else {
				let r;
				do 
					r = t[0], t[0] = this.rules.inline._backpedal.exec(t[0])?.[0] ?? "";
				while (r !== t[0]);
				n = t[0], t[1] === "www." ? s = "http://" + t[0] : s = t[0];
			}
			return {
				type: "link",
				raw: t[0],
				text: n,
				href: s,
				tokens: [{
					type: "text",
					raw: n,
					text: n
				}]
			};
		}
	}
	inlineText(e) {
		let t = this.rules.inline.text.exec(e);
		if (t) {
			let n = this.lexer.state.inRawBlock;
			return {
				type: "text",
				raw: t[0],
				text: t[0],
				escaped: n
			};
		}
	}
};
var x = class l {
	tokens;
	options;
	state;
	inlineQueue;
	tokenizer;
	constructor(e) {
		this.tokens = [], this.tokens.links = Object.create(null), this.options = e || T, this.options.tokenizer = this.options.tokenizer || new w(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = {
			inLink: !1,
			inRawBlock: !1,
			top: !0
		};
		let t = {
			other: m,
			block: q.normal,
			inline: A.normal
		};
		this.options.pedantic ? (t.block = q.pedantic, t.inline = A.pedantic) : this.options.gfm && (t.block = q.gfm, this.options.breaks ? t.inline = A.breaks : t.inline = A.gfm), this.tokenizer.rules = t;
	}
	static get rules() {
		return {
			block: q,
			inline: A
		};
	}
	static lex(e, t) {
		return new l(t).lex(e);
	}
	static lexInline(e, t) {
		return new l(t).inlineTokens(e);
	}
	lex(e) {
		e = e.replace(m.carriageReturn, `
`), this.blockTokens(e, this.tokens);
		for (let t = 0; t < this.inlineQueue.length; t++) {
			let n = this.inlineQueue[t];
			this.inlineTokens(n.src, n.tokens);
		}
		return this.inlineQueue = [], this.tokens;
	}
	blockTokens(e, t = [], n = !1) {
		this.tokenizer.lexer = this, this.options.pedantic && (e = e.replace(m.tabCharGlobal, "    ").replace(m.spaceLine, ""));
		let s = Infinity;
		for (; e;) {
			if (e.length < s) s = e.length;
else {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
			let r;
			if (this.options.extensions?.block?.some((o) => (r = o.call({ lexer: this }, e, t)) ? (e = e.substring(r.raw.length), t.push(r), !0) : !1)) continue;
			if (r = this.tokenizer.space(e)) {
				e = e.substring(r.raw.length);
				let o = t.at(-1);
				r.raw.length === 1 && o !== void 0 ? o.raw += `
` : t.push(r);
				continue;
			}
			if (r = this.tokenizer.code(e)) {
				e = e.substring(r.raw.length);
				let o = t.at(-1);
				o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.at(-1).src = o.text) : t.push(r);
				continue;
			}
			if (r = this.tokenizer.fences(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.heading(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.hr(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.blockquote(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.list(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.html(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.def(e)) {
				e = e.substring(r.raw.length);
				let o = t.at(-1);
				o?.type === "paragraph" || o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.raw, this.inlineQueue.at(-1).src = o.text) : this.tokens.links[r.tag] || (this.tokens.links[r.tag] = {
					href: r.href,
					title: r.title
				}, t.push(r));
				continue;
			}
			if (r = this.tokenizer.table(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			if (r = this.tokenizer.lheading(e)) {
				e = e.substring(r.raw.length), t.push(r);
				continue;
			}
			let i = e;
			if (this.options.extensions?.startBlock) {
				let o = Infinity, u = e.slice(1), a;
				this.options.extensions.startBlock.forEach((c) => {
					a = c.call({ lexer: this }, u), typeof a == "number" && a >= 0 && (o = Math.min(o, a));
				}), o < Infinity && o >= 0 && (i = e.substring(0, o + 1));
			}
			if (this.state.top && (r = this.tokenizer.paragraph(i))) {
				let o = t.at(-1);
				n && o?.type === "paragraph" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r), n = i.length !== e.length, e = e.substring(r.raw.length);
				continue;
			}
			if (r = this.tokenizer.text(e)) {
				e = e.substring(r.raw.length);
				let o = t.at(-1);
				o?.type === "text" ? (o.raw += (o.raw.endsWith(`
`) ? "" : `
`) + r.raw, o.text += `
` + r.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o.text) : t.push(r);
				continue;
			}
			if (e) {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
		}
		return this.state.top = !0, t;
	}
	inline(e, t = []) {
		return this.inlineQueue.push({
			src: e,
			tokens: t
		}), t;
	}
	inlineTokens(e, t = []) {
		this.tokenizer.lexer = this;
		let n = e, s = null;
		if (this.tokens.links) {
			let a = Object.keys(this.tokens.links);
			if (a.length > 0) for (; (s = this.tokenizer.rules.inline.reflinkSearch.exec(n)) !== null;) a.includes(s[0].slice(s[0].lastIndexOf("[") + 1, -1)) && (n = n.slice(0, s.index) + "[" + "a".repeat(s[0].length - 2) + "]" + n.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
		}
		for (; (s = this.tokenizer.rules.inline.anyPunctuation.exec(n)) !== null;) n = n.slice(0, s.index) + "++" + n.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
		let r;
		for (; (s = this.tokenizer.rules.inline.blockSkip.exec(n)) !== null;) r = s[2] ? s[2].length : 0, n = n.slice(0, s.index + r) + "[" + "a".repeat(s[0].length - r - 2) + "]" + n.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
		n = this.options.hooks?.emStrongMask?.call({ lexer: this }, n) ?? n;
		let i = !1, o = "", u = Infinity;
		for (; e;) {
			if (e.length < u) u = e.length;
else {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
			i || (o = ""), i = !1;
			let a;
			if (this.options.extensions?.inline?.some((p) => (a = p.call({ lexer: this }, e, t)) ? (e = e.substring(a.raw.length), t.push(a), !0) : !1)) continue;
			if (a = this.tokenizer.escape(e)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.tag(e)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.link(e)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.reflink(e, this.tokens.links)) {
				e = e.substring(a.raw.length);
				let p = t.at(-1);
				a.type === "text" && p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
				continue;
			}
			if (a = this.tokenizer.emStrong(e, n, o)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.codespan(e)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.br(e)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.del(e, n, o)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (a = this.tokenizer.autolink(e)) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			if (!this.state.inLink && (a = this.tokenizer.url(e))) {
				e = e.substring(a.raw.length), t.push(a);
				continue;
			}
			let c = e;
			if (this.options.extensions?.startInline) {
				let p = Infinity, k = e.slice(1), h;
				this.options.extensions.startInline.forEach((R) => {
					h = R.call({ lexer: this }, k), typeof h == "number" && h >= 0 && (p = Math.min(p, h));
				}), p < Infinity && p >= 0 && (c = e.substring(0, p + 1));
			}
			if (a = this.tokenizer.inlineText(c)) {
				e = e.substring(a.raw.length), a.raw.slice(-1) !== "_" && (o = a.raw.slice(-1)), i = !0;
				let p = t.at(-1);
				p?.type === "text" ? (p.raw += a.raw, p.text += a.text) : t.push(a);
				continue;
			}
			if (e) {
				this.infiniteLoopError(e.charCodeAt(0));
				break;
			}
		}
		return t;
	}
	infiniteLoopError(e) {
		let t = "Infinite loop on byte: " + e;
		if (this.options.silent) console.error(t);
else throw new Error(t);
	}
};
var y = class {
	options;
	parser;
	constructor(e) {
		this.options = e || T;
	}
	space(e) {
		return "";
	}
	code({ text: e, lang: t, escaped: n }) {
		let s = (t || "").match(m.notSpaceStart)?.[0], r = e.replace(m.endingNewline, "") + `
`;
		return s ? "<pre><code class=\"language-" + O(s) + "\">" + (n ? r : O(r, !0)) + `</code></pre>
` : "<pre><code>" + (n ? r : O(r, !0)) + `</code></pre>
`;
	}
	blockquote({ tokens: e }) {
		return `<blockquote>
${this.parser.parse(e)}</blockquote>
`;
	}
	html({ text: e }) {
		return e;
	}
	def(e) {
		return "";
	}
	heading({ tokens: e, depth: t }) {
		return `<h${t}>${this.parser.parseInline(e)}</h${t}>
`;
	}
	hr(e) {
		return `<hr>
`;
	}
	list(e) {
		let t = e.ordered, n = e.start, s = "";
		for (let o = 0; o < e.items.length; o++) {
			let u = e.items[o];
			s += this.listitem(u);
		}
		let r = t ? "ol" : "ul", i = t && n !== 1 ? " start=\"" + n + "\"" : "";
		return "<" + r + i + `>
` + s + "</" + r + `>
`;
	}
	listitem(e) {
		return `<li>${this.parser.parse(e.tokens)}</li>
`;
	}
	checkbox({ checked: e }) {
		return "<input " + (e ? "checked=\"\" " : "") + "disabled=\"\" type=\"checkbox\"> ";
	}
	paragraph({ tokens: e }) {
		return `<p>${this.parser.parseInline(e)}</p>
`;
	}
	table(e) {
		let t = "", n = "";
		for (let r = 0; r < e.header.length; r++) n += this.tablecell(e.header[r]);
		t += this.tablerow({ text: n });
		let s = "";
		for (let r = 0; r < e.rows.length; r++) {
			let i = e.rows[r];
			n = "";
			for (let o = 0; o < i.length; o++) n += this.tablecell(i[o]);
			s += this.tablerow({ text: n });
		}
		return s && (s = `<tbody>${s}</tbody>`), `<table>
<thead>
` + t + `</thead>
` + s + `</table>
`;
	}
	tablerow({ text: e }) {
		return `<tr>
${e}</tr>
`;
	}
	tablecell(e) {
		let t = this.parser.parseInline(e.tokens), n = e.header ? "th" : "td";
		return (e.align ? `<${n} align="${e.align}">` : `<${n}>`) + t + `</${n}>
`;
	}
	strong({ tokens: e }) {
		return `<strong>${this.parser.parseInline(e)}</strong>`;
	}
	em({ tokens: e }) {
		return `<em>${this.parser.parseInline(e)}</em>`;
	}
	codespan({ text: e }) {
		return `<code>${O(e, !0)}</code>`;
	}
	br(e) {
		return "<br>";
	}
	del({ tokens: e }) {
		return `<del>${this.parser.parseInline(e)}</del>`;
	}
	link({ href: e, title: t, tokens: n }) {
		let s = this.parser.parseInline(n), r = V(e);
		if (r === null) return s;
		e = r;
		let i = "<a href=\"" + e + "\"";
		return t && (i += " title=\"" + O(t) + "\""), i += ">" + s + "</a>", i;
	}
	image({ href: e, title: t, text: n, tokens: s }) {
		s && (n = this.parser.parseInline(s, this.parser.textRenderer));
		let r = V(e);
		if (r === null) return O(n);
		e = r;
		let i = `<img src="${e}" alt="${O(n)}"`;
		return t && (i += ` title="${O(t)}"`), i += ">", i;
	}
	text(e) {
		return "tokens" in e && e.tokens ? this.parser.parseInline(e.tokens) : "escaped" in e && e.escaped ? e.text : O(e.text);
	}
};
var L = class {
	strong({ text: e }) {
		return e;
	}
	em({ text: e }) {
		return e;
	}
	codespan({ text: e }) {
		return e;
	}
	del({ text: e }) {
		return e;
	}
	html({ text: e }) {
		return e;
	}
	text({ text: e }) {
		return e;
	}
	link({ text: e }) {
		return "" + e;
	}
	image({ text: e }) {
		return "" + e;
	}
	br() {
		return "";
	}
	checkbox({ raw: e }) {
		return e;
	}
};
var b = class l {
	options;
	renderer;
	textRenderer;
	constructor(e) {
		this.options = e || T, this.options.renderer = this.options.renderer || new y(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L();
	}
	static parse(e, t) {
		return new l(t).parse(e);
	}
	static parseInline(e, t) {
		return new l(t).parseInline(e);
	}
	parse(e) {
		this.renderer.parser = this;
		let t = "";
		for (let n = 0; n < e.length; n++) {
			let s = e[n];
			if (this.options.extensions?.renderers?.[s.type]) {
				let i = s, o = this.options.extensions.renderers[i.type].call({ parser: this }, i);
				if (o !== !1 || ![
					"space",
					"hr",
					"heading",
					"code",
					"table",
					"blockquote",
					"list",
					"html",
					"def",
					"paragraph",
					"text"
				].includes(i.type)) {
					t += o || "";
					continue;
				}
			}
			let r = s;
			switch (r.type) {
				case "space": {
					t += this.renderer.space(r);
					break;
				}
				case "hr": {
					t += this.renderer.hr(r);
					break;
				}
				case "heading": {
					t += this.renderer.heading(r);
					break;
				}
				case "code": {
					t += this.renderer.code(r);
					break;
				}
				case "table": {
					t += this.renderer.table(r);
					break;
				}
				case "blockquote": {
					t += this.renderer.blockquote(r);
					break;
				}
				case "list": {
					t += this.renderer.list(r);
					break;
				}
				case "checkbox": {
					t += this.renderer.checkbox(r);
					break;
				}
				case "html": {
					t += this.renderer.html(r);
					break;
				}
				case "def": {
					t += this.renderer.def(r);
					break;
				}
				case "paragraph": {
					t += this.renderer.paragraph(r);
					break;
				}
				case "text": {
					t += this.renderer.text(r);
					break;
				}
				default: {
					let i = "Token with \"" + r.type + "\" type was not found.";
					if (this.options.silent) return console.error(i), "";
					throw new Error(i);
				}
			}
		}
		return t;
	}
	parseInline(e, t = this.renderer) {
		this.renderer.parser = this;
		let n = "";
		for (let s = 0; s < e.length; s++) {
			let r = e[s];
			if (this.options.extensions?.renderers?.[r.type]) {
				let o = this.options.extensions.renderers[r.type].call({ parser: this }, r);
				if (o !== !1 || ![
					"escape",
					"html",
					"link",
					"image",
					"strong",
					"em",
					"codespan",
					"br",
					"del",
					"text"
				].includes(r.type)) {
					n += o || "";
					continue;
				}
			}
			let i = r;
			switch (i.type) {
				case "escape": {
					n += t.text(i);
					break;
				}
				case "html": {
					n += t.html(i);
					break;
				}
				case "link": {
					n += t.link(i);
					break;
				}
				case "image": {
					n += t.image(i);
					break;
				}
				case "checkbox": {
					n += t.checkbox(i);
					break;
				}
				case "strong": {
					n += t.strong(i);
					break;
				}
				case "em": {
					n += t.em(i);
					break;
				}
				case "codespan": {
					n += t.codespan(i);
					break;
				}
				case "br": {
					n += t.br(i);
					break;
				}
				case "del": {
					n += t.del(i);
					break;
				}
				case "text": {
					n += t.text(i);
					break;
				}
				default: {
					let o = "Token with \"" + i.type + "\" type was not found.";
					if (this.options.silent) return console.error(o), "";
					throw new Error(o);
				}
			}
		}
		return n;
	}
};
var P = class {
	options;
	block;
	constructor(e) {
		this.options = e || T;
	}
	static passThroughHooks = new Set([
		"preprocess",
		"postprocess",
		"processAllTokens",
		"emStrongMask"
	]);
	static passThroughHooksRespectAsync = new Set([
		"preprocess",
		"postprocess",
		"processAllTokens"
	]);
	preprocess(e) {
		return e;
	}
	postprocess(e) {
		return e;
	}
	processAllTokens(e) {
		return e;
	}
	emStrongMask(e) {
		return e;
	}
	provideLexer(e = this.block) {
		return e ? x.lex : x.lexInline;
	}
	provideParser(e = this.block) {
		return e ? b.parse : b.parseInline;
	}
};
var D = class {
	defaults = M();
	options = this.setOptions;
	parse = this.parseMarkdown(!0);
	parseInline = this.parseMarkdown(!1);
	Parser = b;
	Renderer = y;
	TextRenderer = L;
	Lexer = x;
	Tokenizer = w;
	Hooks = P;
	constructor(...e) {
		this.use(...e);
	}
	walkTokens(e, t) {
		let n = [];
		for (let s of e) switch (n = n.concat(t.call(this, s)), s.type) {
			case "table": {
				let r = s;
				for (let i of r.header) n = n.concat(this.walkTokens(i.tokens, t));
				for (let i of r.rows) for (let o of i) n = n.concat(this.walkTokens(o.tokens, t));
				break;
			}
			case "list": {
				let r = s;
				n = n.concat(this.walkTokens(r.items, t));
				break;
			}
			default: {
				let r = s;
				this.defaults.extensions?.childTokens?.[r.type] ? this.defaults.extensions.childTokens[r.type].forEach((i) => {
					let o = r[i].flat(Infinity);
					n = n.concat(this.walkTokens(o, t));
				}) : r.tokens && (n = n.concat(this.walkTokens(r.tokens, t)));
			}
		}
		return n;
	}
	use(...e) {
		let t = this.defaults.extensions || {
			renderers: {},
			childTokens: {}
		};
		return e.forEach((n) => {
			let s = { ...n };
			if (s.async = this.defaults.async || s.async || !1, n.extensions && (n.extensions.forEach((r) => {
				if (!r.name) throw new Error("extension name required");
				if ("renderer" in r) {
					let i = t.renderers[r.name];
					i ? t.renderers[r.name] = function(...o) {
						let u = r.renderer.apply(this, o);
						return u === !1 && (u = i.apply(this, o)), u;
					} : t.renderers[r.name] = r.renderer;
				}
				if ("tokenizer" in r) {
					if (!r.level || r.level !== "block" && r.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
					let i = t[r.level];
					i ? i.unshift(r.tokenizer) : t[r.level] = [r.tokenizer], r.start && (r.level === "block" ? t.startBlock ? t.startBlock.push(r.start) : t.startBlock = [r.start] : r.level === "inline" && (t.startInline ? t.startInline.push(r.start) : t.startInline = [r.start]));
				}
				"childTokens" in r && r.childTokens && (t.childTokens[r.name] = r.childTokens);
			}), s.extensions = t), n.renderer) {
				let r = this.defaults.renderer || new y(this.defaults);
				for (let i in n.renderer) {
					if (!(i in r)) throw new Error(`renderer '${i}' does not exist`);
					if (["options", "parser"].includes(i)) continue;
					let o = i, u = n.renderer[o], a = r[o];
					r[o] = (...c) => {
						let p = u.apply(r, c);
						return p === !1 && (p = a.apply(r, c)), p || "";
					};
				}
				s.renderer = r;
			}
			if (n.tokenizer) {
				let r = this.defaults.tokenizer || new w(this.defaults);
				for (let i in n.tokenizer) {
					if (!(i in r)) throw new Error(`tokenizer '${i}' does not exist`);
					if ([
						"options",
						"rules",
						"lexer"
					].includes(i)) continue;
					let o = i, u = n.tokenizer[o], a = r[o];
					r[o] = (...c) => {
						let p = u.apply(r, c);
						return p === !1 && (p = a.apply(r, c)), p;
					};
				}
				s.tokenizer = r;
			}
			if (n.hooks) {
				let r = this.defaults.hooks || new P();
				for (let i in n.hooks) {
					if (!(i in r)) throw new Error(`hook '${i}' does not exist`);
					if (["options", "block"].includes(i)) continue;
					let o = i, u = n.hooks[o], a = r[o];
					P.passThroughHooks.has(i) ? r[o] = (c) => {
						if (this.defaults.async && P.passThroughHooksRespectAsync.has(i)) return (async () => {
							let k = await u.call(r, c);
							return a.call(r, k);
						})();
						let p = u.call(r, c);
						return a.call(r, p);
					} : r[o] = (...c) => {
						if (this.defaults.async) return (async () => {
							let k = await u.apply(r, c);
							return k === !1 && (k = await a.apply(r, c)), k;
						})();
						let p = u.apply(r, c);
						return p === !1 && (p = a.apply(r, c)), p;
					};
				}
				s.hooks = r;
			}
			if (n.walkTokens) {
				let r = this.defaults.walkTokens, i = n.walkTokens;
				s.walkTokens = function(o) {
					let u = [];
					return u.push(i.call(this, o)), r && (u = u.concat(r.call(this, o))), u;
				};
			}
			this.defaults = {
				...this.defaults,
				...s
			};
		}), this;
	}
	setOptions(e) {
		return this.defaults = {
			...this.defaults,
			...e
		}, this;
	}
	lexer(e, t) {
		return x.lex(e, t ?? this.defaults);
	}
	parser(e, t) {
		return b.parse(e, t ?? this.defaults);
	}
	parseMarkdown(e) {
		return (n, s) => {
			let r = { ...s }, i = {
				...this.defaults,
				...r
			}, o = this.onError(!!i.silent, !!i.async);
			if (this.defaults.async === !0 && r.async === !1) return o(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
			if (typeof n > "u" || n === null) return o(new Error("marked(): input parameter is undefined or null"));
			if (typeof n != "string") return o(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n) + ", string expected"));
			if (i.hooks && (i.hooks.options = i, i.hooks.block = e), i.async) return (async () => {
				let u = i.hooks ? await i.hooks.preprocess(n) : n, c = await (i.hooks ? await i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(u, i), p = i.hooks ? await i.hooks.processAllTokens(c) : c;
				i.walkTokens && await Promise.all(this.walkTokens(p, i.walkTokens));
				let h = await (i.hooks ? await i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(p, i);
				return i.hooks ? await i.hooks.postprocess(h) : h;
			})().catch(o);
			try {
				i.hooks && (n = i.hooks.preprocess(n));
				let a = (i.hooks ? i.hooks.provideLexer(e) : e ? x.lex : x.lexInline)(n, i);
				i.hooks && (a = i.hooks.processAllTokens(a)), i.walkTokens && this.walkTokens(a, i.walkTokens);
				let p = (i.hooks ? i.hooks.provideParser(e) : e ? b.parse : b.parseInline)(a, i);
				return i.hooks && (p = i.hooks.postprocess(p)), p;
			} catch (u) {
				return o(u);
			}
		};
	}
	onError(e, t) {
		return (n) => {
			if (n.message += `
Please report this to https://github.com/markedjs/marked.`, e) {
				let s = "<p>An error occurred:</p><pre>" + O(n.message + "", !0) + "</pre>";
				return t ? Promise.resolve(s) : s;
			}
			if (t) return Promise.reject(n);
			throw n;
		};
	}
};
var z = new D();
function g(l, e) {
	return z.parse(l, e);
}
g.options = g.setOptions = function(l) {
	return z.setOptions(l), g.defaults = z.defaults, N(g.defaults), g;
};
g.getDefaults = M;
g.defaults = T;
g.use = function(...l) {
	return z.use(...l), g.defaults = z.defaults, N(g.defaults), g;
};
g.walkTokens = function(l, e) {
	return z.walkTokens(l, e);
};
g.parseInline = z.parseInline;
g.Parser = b;
g.parser = b.parse;
g.Renderer = y;
g.TextRenderer = L;
g.Lexer = x;
g.lexer = x.lex;
g.Tokenizer = w;
g.Hooks = P;
g.parse = g;
var Kt = g.options, Wt = g.setOptions, Xt = g.use, Jt = g.walkTokens, Vt = g.parseInline, Yt = g, en = b.parse, tn = x.lex;

//#endregion
//#region plugins/md-tables/core/renderMarkdown.ts
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const parser = new D({
	gfm: true,
	renderer: { image({ href, text: text$1 }) {
		const url = href ?? "";
		return `<a href="${escapeHtml(url)}">${escapeHtml(text$1 || url)}</a>`;
	} }
});
const purifier = purify(window);
purifier.addHook("afterSanitizeAttributes", (node) => {
	if (node.tagName === "A") {
		node.setAttribute("target", "_blank");
		node.setAttribute("rel", "noopener noreferrer");
	}
	if (node.tagName === "INPUT") {
		if (node.getAttribute("type") !== "checkbox") {
			node.remove();
			return;
		}
		node.setAttribute("disabled", "");
	}
});
const PURIFY_CONFIG = {
	ALLOWED_TAGS: [
		"h1",
		"h2",
		"h3",
		"h4",
		"h5",
		"h6",
		"p",
		"br",
		"hr",
		"ul",
		"ol",
		"li",
		"blockquote",
		"pre",
		"code",
		"em",
		"strong",
		"del",
		"s",
		"a",
		"table",
		"thead",
		"tbody",
		"tr",
		"th",
		"td",
		"input",
		"span"
	],
	ALLOWED_ATTR: [
		"href",
		"align",
		"start",
		"type",
		"checked",
		"disabled",
		"class"
	],
	ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
	ADD_URI_SAFE_ATTR: [
		"type",
		"checked",
		"disabled",
		"align",
		"start"
	],
	ALLOW_DATA_ATTR: false
};
function renderMarkdownToHtml(text$1) {
	const raw = parser.parse(text$1, { async: false });
	return purifier.sanitize(raw, PURIFY_CONFIG);
}

//#endregion
//#region plugins/md-tables/index.tsx
var import_web = __toESM(require_web(), 1);
var import_web$1 = __toESM(require_web(), 1);
var import_web$2 = __toESM(require_web(), 1);
var import_web$3 = __toESM(require_web(), 1);
var import_web$4 = __toESM(require_web(), 1);
var import_web$5 = __toESM(require_web(), 1);
var import_web$6 = __toESM(require_web(), 1);
const _tmpl$ = /*#__PURE__*/ (0, import_web.template)(`<button class="mdt-btn"></button>`, 2), _tmpl$2 = /*#__PURE__*/ (0, import_web.template)(`<div class="mdt-note"><!#><!/> exceeds the 512 KB inline limit — use Full view or Download.</div>`, 4), _tmpl$3 = /*#__PURE__*/ (0, import_web.template)(`<div class="mdt-note">Rendering…</div>`, 2), _tmpl$4 = /*#__PURE__*/ (0, import_web.template)(`<div class="mdt-note mdt-error">Couldn't load file: <!#><!/></div>`, 4), _tmpl$5 = /*#__PURE__*/ (0, import_web.template)(`<div class="mdt-card"><div class="mdt-head"><span class="mdt-name"></span><span class="mdt-size"></span><span class="mdt-spacer"></span><!#><!/><button class="mdt-btn">Full view</button><button class="mdt-btn">Download</button></div><!#><!/><!#><!/></div>`, 20);
const { flux: { storesFlat: { SelectedChannelStore }, dispatcher }, util: { getFiber, reactFiberWalker }, observeDom, solid: { createSignal, createEffect, Show }, solidWeb: { render }, ui: { openModal, ModalRoot, ModalSizes, ModalHeader, ModalBody, ModalFooter, Button, injectCss } } = shelter;
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
.mdt-doc-modal{max-height:none;border-top:none}
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
.mdt-modal{width:min(1100px,92vw)!important;max-width:1100px!important}
`;
const MAX_INLINE_KB = 512;
const MAX_INLINE_BYTES = MAX_INLINE_KB * 1024;
const mdCache = new Map();
function fetchMd(att) {
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
function formatBytes(n) {
	if (typeof n !== "number") return "";
	if (n < 1024) return `${n} B`;
	if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
	return `${(n / 1048576).toFixed(1)} MB`;
}
function download(att) {
	fetchMd(att).then((text$1) => {
		const url = URL.createObjectURL(new Blob([text$1], { type: "text/markdown" }));
		const a = document.createElement("a");
		a.href = url;
		a.download = att.filename || "document.md";
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 1e3);
	}).catch(() => window.open(att.url, "_blank"));
}
function openFullView(att) {
	fetchMd(att).then((text$1) => {
		const doc = document.createElement("div");
		doc.className = "mdt-doc mdt-doc-modal";
		doc.innerHTML = renderMarkdownToHtml(text$1);
		openModal((props) => (0, import_web$6.createComponent)(ModalRoot, {
			get size() {
				return ModalSizes.LARGE;
			},
			"class": "mdt-modal",
			get children() {
				return [
					(0, import_web$6.createComponent)(ModalHeader, {
						get close() {
							return props.close;
						},
						get children() {
							return att.filename;
						}
					}),
					(0, import_web$6.createComponent)(ModalBody, { children: doc }),
					(0, import_web$6.createComponent)(ModalFooter, { get children() {
						return (0, import_web$6.createComponent)(Button, {
							get onClick() {
								return props.close;
							},
							children: "Done"
						});
					} })
				];
			}
		}));
	}).catch((e) => {
		console.error("[md-tables] full view failed", e);
		window.open(att.url, "_blank");
	});
}
function MdCard(props) {
	const att = props.att;
	const tooBig = att.size > MAX_INLINE_BYTES;
	const [open, setOpen] = createSignal(!tooBig);
	const [html$2, setHtml] = createSignal();
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal();
	createEffect(() => {
		if (!open() || html$2() !== undefined || loading() || error()) return;
		setLoading(true);
		fetchMd(att).then((t) => {
			setHtml(renderMarkdownToHtml(t));
			setLoading(false);
		}).catch((e) => {
			setError(String(e?.message ?? e));
			setLoading(false);
		});
	});
	const doc = document.createElement("div");
	doc.className = "mdt-doc";
	createEffect(() => {
		doc.innerHTML = html$2() ?? "";
	});
	return (() => {
		const _el$ = (0, import_web$3.getNextElement)(_tmpl$5), _el$2 = _el$.firstChild, _el$3 = _el$2.firstChild, _el$4 = _el$3.nextSibling, _el$5 = _el$4.nextSibling, _el$9 = _el$5.nextSibling, [_el$0, _co$] = (0, import_web$2.getNextMarker)(_el$9.nextSibling), _el$7 = _el$0.nextSibling, _el$8 = _el$7.nextSibling, _el$18 = _el$2.nextSibling, [_el$19, _co$4] = (0, import_web$2.getNextMarker)(_el$18.nextSibling), _el$20 = _el$19.nextSibling, [_el$21, _co$5] = (0, import_web$2.getNextMarker)(_el$20.nextSibling);
		(0, import_web$5.insert)(_el$3, () => att.filename);
		(0, import_web$5.insert)(_el$4, () => formatBytes(att.size));
		(0, import_web$5.insert)(_el$2, (0, import_web$6.createComponent)(Show, {
			when: !tooBig,
			get children() {
				const _el$6 = (0, import_web$3.getNextElement)(_tmpl$);
				_el$6.$$click = () => {
					if (!open() && error() !== undefined) setError(undefined);
					setOpen(!open());
				};
				(0, import_web$5.insert)(_el$6, () => open() ? "Collapse" : "Expand");
				(0, import_web$4.runHydrationEvents)();
				return _el$6;
			}
		}), _el$0, _co$);
		_el$7.$$click = () => openFullView(att);
		_el$8.$$click = () => download(att);
		(0, import_web$5.insert)(_el$, (0, import_web$6.createComponent)(Show, {
			when: tooBig,
			get children() {
				const _el$1 = (0, import_web$3.getNextElement)(_tmpl$2), _el$11 = _el$1.firstChild, [_el$12, _co$2] = (0, import_web$2.getNextMarker)(_el$11.nextSibling), _el$10 = _el$12.nextSibling;
				(0, import_web$5.insert)(_el$1, () => formatBytes(att.size), _el$12, _co$2);
				return _el$1;
			}
		}), _el$19, _co$4);
		(0, import_web$5.insert)(_el$, (0, import_web$6.createComponent)(Show, {
			get when() {
				return open();
			},
			get children() {
				return [
					(0, import_web$6.createComponent)(Show, {
						get when() {
							return loading();
						},
						get children() {
							return (0, import_web$3.getNextElement)(_tmpl$3);
						}
					}),
					(0, import_web$6.createComponent)(Show, {
						get when() {
							return error();
						},
						get children() {
							const _el$14 = (0, import_web$3.getNextElement)(_tmpl$4), _el$15 = _el$14.firstChild, _el$16 = _el$15.nextSibling, [_el$17, _co$3] = (0, import_web$2.getNextMarker)(_el$16.nextSibling);
							(0, import_web$5.insert)(_el$14, error, _el$17, _co$3);
							return _el$14;
						}
					}),
					(0, import_web$6.createComponent)(Show, {
						get when() {
							return html$2() !== undefined;
						},
						children: doc
					})
				];
			}
		}), _el$21, _co$5);
		(0, import_web$4.runHydrationEvents)();
		return _el$;
	})();
}
const mounts = new Map();
const hiddenNativeEls = new Set();
function pruneDetached() {
	for (const [mount, dispose] of mounts) {
		if (mount.isConnected) continue;
		try {
			dispose();
		} catch {}
		mounts.delete(mount);
	}
	for (const el of hiddenNativeEls) if (!el.isConnected) hiddenNativeEls.delete(el);
}
function processAttachments(row) {
	if (row.dataset.mdtAtt === "1") return;
	const msg = reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message;
	const artifacts = (msg?.attachments ?? []).filter(isMdAttachment);
	if (!artifacts.length) return;
	row.dataset.mdtAtt = "1";
	const contents = row.querySelector("[class*=\"contents\"]");
	for (const att of artifacts) {
		const mount = document.createElement("div");
		mount.className = "mdt-mount";
		mounts.set(mount, render(() => (0, import_web$6.createComponent)(MdCard, { att }), mount));
		(contents ?? row).appendChild(mount);
		const link = row.querySelector(`a[href*="${att.id}"]`);
		const nativeWrap = link?.closest("[class*=\"nonVisualMediaItemContainer\"]") ?? link?.closest("[class*=\"nonVisualMediaItem\"], [class*=\"mosaicItem\"], [class*=\"messageAttachment\"]");
		if (nativeWrap) {
			nativeWrap.style.display = "none";
			hiddenNativeEls.add(nativeWrap);
		}
	}
}
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
	pruneDetached();
	if ((payload.type === "MESSAGE_CREATE" || payload.type === "MESSAGE_UPDATE") && payload.message?.channel_id !== SelectedChannelStore.getChannelId()) return;
	const unobs = observeDom("[id^=\"chat-messages-\"]", (e) => {
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
	for (const [, dispose] of mounts) try {
		dispose();
	} catch {}
	mounts.clear();
	mdCache.clear();
	document.querySelectorAll(".mdt-mount").forEach((n) => n.remove());
	for (const el of hiddenNativeEls) el.style.display = "";
	hiddenNativeEls.clear();
	document.querySelectorAll("[data-mdt-att]").forEach((el) => {
		delete el.dataset.mdtAtt;
	});
	restoreReplacedTables(document);
	document.querySelectorAll("[data-md-tables]").forEach((el) => {
		delete el.dataset.mdTables;
	});
	removeCss?.();
}
(0, import_web$1.delegateEvents)(["click"]);

//#endregion
exports.onLoad = onLoad
exports.onUnload = onUnload
return exports;
})({});