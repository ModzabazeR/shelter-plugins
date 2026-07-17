# Markdown Attachments (md-tables extension) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `.md`/`.markdown` file attachments as formatted GFM documents inline in Discord, inside the existing md-tables Shelter plugin.

**Architecture:** A pure, unit-tested core (`marked` GFM parse with images rewritten to links → DOMPurify strict sanitize → HTML string) plus a thin Shelter integration: detect md attachments via the React fiber, hide Discord's native attachment card non-destructively, and mount an auto-rendered collapsible Solid card with Full view modal and Download. Spec: `docs/specs/2026-07-17-md-attachments-design.md`.

**Tech Stack:** TypeScript, Solid JSX (Shelter), marked (≥13 — token-object renderer API), DOMPurify v3, Vitest (jsdom), Lune build, pnpm workspace.

## Global Constraints

- All commands run from the repo root `D:\projects\shelter-plugins` (pnpm workspace).
- Tests: `pnpm test` (Vitest, jsdom env, globals on, picks up `plugins/**/*.test.ts`). Typecheck: `pnpm typecheck`. Build: `pnpm build`.
- New source files start with a comment block ending `SPDX-License-Identifier: GPL-3.0-or-later` (match existing files).
- Size cap is a constant `MAX_INLINE_KB = 512` — **no settings surface anywhere**.
- Sanitized HTML may only ever be assigned to plugin-owned `.mdt-doc` divs — never into Discord-owned nodes.
- Non-destructive integration: `onUnload` must restore Discord's native attachment cards (un-hide, not recreate).
- Images must never load: markdown images become links in the marked renderer; `img` is not in the sanitizer allowlist.
- Conventional commits (`feat:`, `test:`, `docs:` …), no attribution footers.
- The existing in-message table path (`parseTables`/`replaceTables`, `data-md-tables` guard) must not change behavior; all its tests stay green.

---

### Task 1: Dependencies + `isMdAttachment` core module

**Files:**
- Modify: `plugins/md-tables/package.json` (via pnpm — adds `marked`, `dompurify`)
- Create: `plugins/md-tables/core/mdAttachment.ts`
- Create: `plugins/md-tables/core/mdAttachment.test.ts`
- Modify: `plugins/md-tables/core/index.ts` (barrel export)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `isMdAttachment(att: { filename?: string } | null | undefined): boolean` — exported from `plugins/md-tables/core/index.ts`. Tasks 2–5 rely on `marked` and `dompurify` being installed; Task 5 calls `isMdAttachment`.

- [ ] **Step 1: Install the two runtime dependencies**

Run: `pnpm --filter md-tables add marked dompurify`

Expected: `plugins/md-tables/package.json` `dependencies` now contains `marked` (must resolve to v13 or newer — the token-object renderer API) and `dompurify` (v3 — ships its own TypeScript types). `pnpm-lock.yaml` updated.

- [ ] **Step 2: Write the failing test**

Create `plugins/md-tables/core/mdAttachment.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isMdAttachment } from "./mdAttachment";

describe("isMdAttachment", () => {
  it("accepts .md and .markdown, case-insensitive", () => {
    expect(isMdAttachment({ filename: "README.md" })).toBe(true);
    expect(isMdAttachment({ filename: "NOTES.MD" })).toBe(true);
    expect(isMdAttachment({ filename: "doc.markdown" })).toBe(true);
    expect(isMdAttachment({ filename: "weird.name.v2.md" })).toBe(true);
  });

  it("rejects other extensions and missing filenames", () => {
    expect(isMdAttachment({ filename: "page.mdx" })).toBe(false);
    expect(isMdAttachment({ filename: "notes.txt" })).toBe(false);
    expect(isMdAttachment({ filename: "md" })).toBe(false);
    expect(isMdAttachment({ filename: "archive.md.zip" })).toBe(false);
    expect(isMdAttachment({})).toBe(false);
    expect(isMdAttachment(null)).toBe(false);
    expect(isMdAttachment(undefined)).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test -- mdAttachment`
Expected: FAIL — cannot resolve `./mdAttachment`.

- [ ] **Step 4: Write the implementation**

Create `plugins/md-tables/core/mdAttachment.ts`:

```ts
/*
 * Attachment detection for .md files. Filename-only, case-insensitive — Discord
 * reports text/plain (or nothing) for markdown uploads, so content_type is not trusted.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

const MD_EXT = /\.(md|markdown)$/i;

export function isMdAttachment(
  att: { filename?: string } | null | undefined,
): boolean {
  const name = att?.filename;
  return typeof name === "string" && MD_EXT.test(name);
}
```

Add to `plugins/md-tables/core/index.ts` (append line):

```ts
export { isMdAttachment } from "./mdAttachment";
```

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `pnpm test -- mdAttachment` → PASS (2 tests).
Run: `pnpm typecheck` → no errors.

- [ ] **Step 6: Commit**

```bash
git add plugins/md-tables/package.json pnpm-lock.yaml plugins/md-tables/core/mdAttachment.ts plugins/md-tables/core/mdAttachment.test.ts plugins/md-tables/core/index.ts
git commit -m "feat(md-tables): add marked+dompurify deps and isMdAttachment detection"
```

---

### Task 2: `renderMarkdownToHtml` — GFM rendering core

**Files:**
- Create: `plugins/md-tables/core/renderMarkdown.ts`
- Create: `plugins/md-tables/core/renderMarkdown.test.ts`
- Modify: `plugins/md-tables/core/index.ts` (barrel export)

**Interfaces:**
- Consumes: `marked` and `dompurify` packages (installed in Task 1).
- Produces: `renderMarkdownToHtml(text: string): string` — pure string→sanitized-HTML-string, exported from `plugins/md-tables/core/index.ts`. Task 3 adds hostile-input tests against it; Task 4 calls it from the card.

- [ ] **Step 1: Write the failing GFM tests**

Create `plugins/md-tables/core/renderMarkdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderMarkdownToHtml } from "./renderMarkdown";

// Mount into a detached div so assertions can use querySelector.
const mount = (md: string): HTMLElement => {
  const el = document.createElement("div");
  el.innerHTML = renderMarkdownToHtml(md);
  return el;
};

describe("GFM rendering", () => {
  it("renders headings", () => {
    const el = mount("# Title\n\n## Sub");
    expect(el.querySelector("h1")?.textContent).toBe("Title");
    expect(el.querySelector("h2")?.textContent).toBe("Sub");
  });

  it("renders nested lists", () => {
    const el = mount("- a\n  - b\n- c");
    expect(el.querySelectorAll("ul").length).toBe(2);
    expect(el.querySelectorAll("li").length).toBe(3);
  });

  it("renders task lists as disabled checkboxes", () => {
    const el = mount("- [x] done\n- [ ] todo");
    const boxes = el.querySelectorAll('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    boxes.forEach((b) => expect(b.hasAttribute("disabled")).toBe(true));
  });

  it("renders fenced code with escaped content and language class", () => {
    const el = mount('```js\nconst a = "<b>";\n```');
    const code = el.querySelector("pre code");
    expect(code?.className).toContain("language-js");
    expect(code?.textContent).toContain('const a = "<b>"');
    expect(el.querySelector("pre b")).toBeNull(); // "<b>" stayed text, not markup
  });

  it("renders blockquote, hr, strikethrough", () => {
    const el = mount("> quoted\n\n---\n\n~~gone~~");
    expect(el.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(el.querySelector("hr")).not.toBeNull();
    expect(el.querySelector("del")?.textContent).toBe("gone");
  });

  it("renders GFM tables", () => {
    const el = mount("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(el.querySelector("table thead th")?.textContent).toBe("a");
    expect(el.querySelector("table tbody td")?.textContent).toBe("1");
  });

  it("autolinks bare URLs", () => {
    const el = mount("see https://example.com/x");
    expect(el.querySelector('a[href="https://example.com/x"]')).not.toBeNull();
  });

  it("rewrites markdown images to plain links — never <img>", () => {
    const el = mount("![diagram](https://example.com/d.png)");
    expect(el.querySelector("img")).toBeNull();
    const a = el.querySelector('a[href="https://example.com/d.png"]');
    expect(a?.textContent).toBe("diagram");
  });

  it("uses the URL as link text when an image has no alt", () => {
    const el = mount("![](https://example.com/d.png)");
    expect(el.querySelector("a")?.textContent).toBe("https://example.com/d.png");
  });

  it("returns empty output for empty input", () => {
    expect(renderMarkdownToHtml("").trim()).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- renderMarkdown`
Expected: FAIL — cannot resolve `./renderMarkdown`.

- [ ] **Step 3: Write the implementation**

Create `plugins/md-tables/core/renderMarkdown.ts`:

```ts
/*
 * Markdown document rendering for .md attachments.
 * marked (GFM) -> DOMPurify with a strict profile. Pure string -> string.
 * Markdown images are rewritten to plain links BEFORE sanitization and `img` is
 * not in the allowlist, so rendering a document performs zero network requests.
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import DOMPurify from "dompurify";
import { Marked } from "marked";

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// marked >= 13: renderer methods receive a single token object.
const parser = new Marked({
  gfm: true,
  renderer: {
    image({ href, text }) {
      const url = href ?? "";
      return `<a href="${escapeHtml(url)}">${escapeHtml(text || url)}</a>`;
    },
  },
});

// Own DOMPurify instance so our hooks never interact with any other consumer.
const purifier = DOMPurify(window);

purifier.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  if (node.tagName === "INPUT") {
    // GFM task-list checkboxes are the only inputs allowed to survive, always inert.
    if (node.getAttribute("type") !== "checkbox") {
      node.remove();
      return;
    }
    node.setAttribute("disabled", "");
  }
});

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    "h1", "h2", "h3", "h4", "h5", "h6",
    "p", "br", "hr", "ul", "ol", "li", "blockquote",
    "pre", "code", "em", "strong", "del", "s", "a",
    "table", "thead", "tbody", "tr", "th", "td",
    "input", "span",
  ],
  ALLOWED_ATTR: ["href", "align", "start", "type", "checked", "disabled", "class"],
  ALLOWED_URI_REGEXP: /^(?:https?:|mailto:)/i,
};

export function renderMarkdownToHtml(text: string): string {
  const raw = parser.parse(text, { async: false }) as string;
  return purifier.sanitize(raw, PURIFY_CONFIG);
}
```

Add to `plugins/md-tables/core/index.ts` (append line):

```ts
export { renderMarkdownToHtml } from "./renderMarkdown";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- renderMarkdown`
Expected: PASS (10 tests). If the task-list test fails on `disabled`, the hook isn't registered on the same instance doing the sanitizing — verify `purifier.addHook`, not `DOMPurify.addHook`. If the image test finds an `<img>`, the marked version is older than 13 (renderer signature mismatch) — check `pnpm why marked`.

Run: `pnpm typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add plugins/md-tables/core/renderMarkdown.ts plugins/md-tables/core/renderMarkdown.test.ts plugins/md-tables/core/index.ts
git commit -m "feat(md-tables): GFM markdown-to-sanitized-HTML rendering core"
```

---

### Task 3: Sanitization hardening suite

**Files:**
- Modify: `plugins/md-tables/core/renderMarkdown.test.ts` (append a describe block)
- Modify (only if a test exposes a gap): `plugins/md-tables/core/renderMarkdown.ts`

**Interfaces:**
- Consumes: `renderMarkdownToHtml` from Task 2.
- Produces: nothing new — this task is the security gate for the spec §7 invariant: hostile inputs cannot yield script execution or network fetches.

- [ ] **Step 1: Append the hostile-input tests**

Append to `plugins/md-tables/core/renderMarkdown.test.ts` (uses the existing `mount` helper):

```ts
describe("sanitization", () => {
  it("strips <script>", () => {
    const out = renderMarkdownToHtml("hi\n\n<script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
  });

  it("strips event handler attributes on raw HTML", () => {
    const out = renderMarkdownToHtml('<a href="https://x.y" onclick="evil()">x</a>');
    expect(out).not.toContain("onclick");
  });

  it("removes raw <img>, including onerror payloads", () => {
    const out = renderMarkdownToHtml('<img src="https://t.example/p.gif" onerror="evil()">');
    expect(out).not.toContain("<img");
    expect(out).not.toContain("onerror");
  });

  it("removes javascript: and data: hrefs", () => {
    const out = renderMarkdownToHtml(
      "[a](javascript:alert(1))\n\n[b](data:text/html,x)",
    );
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("data:");
  });

  it("removes iframes, style blocks, and svg", () => {
    const out = renderMarkdownToHtml(
      '<iframe src="https://x.y"></iframe>\n\n<style>*{color:red}</style>\n\n<svg onload="evil()"></svg>',
    );
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<style");
    expect(out).not.toContain("<svg");
  });

  it("forces target=_blank rel=noopener noreferrer on every link", () => {
    const el = mount('[a](https://x.y) and <a href="https://z.w">b</a>');
    const anchors = el.querySelectorAll("a");
    expect(anchors.length).toBe(2);
    anchors.forEach((a) => {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  it("removes non-checkbox inputs entirely", () => {
    const el = mount('<input type="text" value="x"> <input type="checkbox">');
    const inputs = el.querySelectorAll("input");
    expect(inputs.length).toBe(1);
    expect(inputs[0].getAttribute("type")).toBe("checkbox");
    expect(inputs[0].hasAttribute("disabled")).toBe(true);
  });

  it("neutralizes HTML hidden inside fenced code", () => {
    const el = mount('```\n<script>alert(1)</script>\n```');
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("pre code")?.textContent).toContain("<script>alert(1)</script>");
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `pnpm test -- renderMarkdown`
Expected: PASS (18 tests). These verify the Task 2 profile; a failure here is a real security gap.

- [ ] **Step 3: Fix any failure in `renderMarkdown.ts` (only if red)**

The fix belongs in the DOMPurify profile or the hook — never by post-processing the output string. Likely candidates: a tag missing from `ALLOWED_TAGS` review, or the hook not running (wrong instance). Re-run until green, then re-run the full suite: `pnpm test` → all md-tables tests PASS.

- [ ] **Step 4: Commit**

```bash
git add plugins/md-tables/core/renderMarkdown.test.ts plugins/md-tables/core/renderMarkdown.ts
git commit -m "test(md-tables): hostile-input sanitization suite for markdown rendering"
```

---

### Task 4: Card UI — CSS, fetch cache, `MdCard`, full view, download

**Files:**
- Modify: `plugins/md-tables/index.tsx` (shelter destructure, CSS constant, new helpers + component; no wiring yet)

**Interfaces:**
- Consumes: `renderMarkdownToHtml` from Task 2 (via `./core`).
- Produces: `MdCard(props: { att: any }): JSX.Element` (Solid component), `fetchMd(att: any): Promise<string>`, `formatBytes(n: number): string`, `download(att: any): void`, `openFullView(att: any): void`, constants `MAX_INLINE_KB = 512` / `MAX_INLINE_BYTES`. Task 5 mounts `MdCard` and reuses nothing else.

This task is UI-integration code with no unit-testable seam (the tested seam is the core). Gate: `pnpm typecheck` + `pnpm build` stay green; behavior is verified manually in Task 6.

- [ ] **Step 1: Extend the shelter destructure and core import**

In `plugins/md-tables/index.tsx`, replace the import and destructure at the top:

```tsx
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
```

(`isMdAttachment` is imported now but first used in Task 5 — if the linter/typecheck complains about an unused import, prefix the Task 5 wiring's `processAttachments` stub instead; in practice `tsc --noEmit` does not error on unused imports here.)

- [ ] **Step 2: Replace the CSS constant**

Replace the entire `const CSS = \`...\`;` block with:

```tsx
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
```

(The first six rules are the existing table styles with `.mdt-doc` variants added to the selectors so document tables share the exact visual language; everything from `.mdt-card` down is new.)

- [ ] **Step 3: Add the attachment helpers + `MdCard` component**

Insert after the CSS constant (before `processRow`):

```tsx
// ---- .md attachment rendering --------------------------------------------------

const MAX_INLINE_KB = 512;
const MAX_INLINE_BYTES = MAX_INLINE_KB * 1024;

// fetch cache (attachment id -> raw markdown text)
const mdCache = new Map<string, string>();

async function fetchMd(att: any): Promise<string> {
  if (mdCache.has(att.id)) return mdCache.get(att.id)!;
  const res = await fetch(att.url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  mdCache.set(att.id, text);
  return text;
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
    .catch((e) => console.error("[md-tables] full view failed", e));
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
          <button class="mdt-btn" onClick={() => setOpen(!open())}>
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
```

- [ ] **Step 4: Typecheck and build**

Run: `pnpm typecheck` → no errors.
Run: `pnpm build` → lune build succeeds for `md-tables` (marked + dompurify bundle in).
Run: `pnpm test` → all existing tests still PASS (this task touched no core files).

- [ ] **Step 5: Commit**

```bash
git add plugins/md-tables/index.tsx
git commit -m "feat(md-tables): MdCard attachment card UI with full view and download"
```

---

### Task 5: Wiring — `processAttachments`, dispatch, unload restore

**Files:**
- Modify: `plugins/md-tables/index.tsx` (processAttachments + hook into observeDom callback + onUnload additions)

**Interfaces:**
- Consumes: `MdCard`, constants and helpers from Task 4; `isMdAttachment` from Task 1.
- Produces: the live feature. `processAttachments(row: HTMLElement): void`; module-level `disposers: Array<() => void>` and `hiddenNativeEls: Set<HTMLElement>`.

- [ ] **Step 1: Add `processAttachments` and its state**

Insert after the `MdCard` component (before the existing `processRow`):

```tsx
// Solid dispose functions + natively-hidden attachment wrappers, tracked for onUnload.
const disposers: Array<() => void> = [];
const hiddenNativeEls = new Set<HTMLElement>();

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
    const link = row.querySelector(`a[href*="${att.id}"]`) as HTMLElement | null;

    // Discord shows a .md attachment as a "non-visual media" card with a source
    // preview. Hide that wrapper non-destructively (display:none + remember it),
    // with the same fallback chain html-viewer uses for class-prefix drift.
    const nativeWrap =
      (link?.closest('[class*="nonVisualMediaItemContainer"]') as HTMLElement | null) ??
      (link?.closest(
        '[class*="nonVisualMediaItem"], [class*="mosaicItem"], [class*="messageAttachment"]',
      ) as HTMLElement | null);
    if (nativeWrap) {
      nativeWrap.style.display = "none";
      hiddenNativeEls.add(nativeWrap);
    }

    const mount = document.createElement("div");
    mount.className = "mdt-mount";
    disposers.push(render(() => <MdCard att={att} />, mount));
    (contents ?? row).appendChild(mount);
  }
}
```

- [ ] **Step 2: Hook it into the existing observe callback**

In `handleDispatch`, extend the `observeDom` callback so both paths run per row. Replace:

```tsx
  const unobs = observeDom('[id^="chat-messages-"]', (e) => {
    if (!(e instanceof HTMLElement)) return;
    try {
      processRow(e);
    } catch (err) {
      console.error("[md-tables] processRow failed", err);
    }
  });
```

with:

```tsx
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
```

- [ ] **Step 3: Extend `onUnload`**

Replace the existing `onUnload` with (existing table-restore logic unchanged, attachment teardown added before it):

```tsx
export function onUnload() {
  for (const t of TRIGGERS) dispatcher.unsubscribe(t, handleDispatch);
  for (const stop of [...activeObservers]) stop();

  // Attachment cards: dispose Solid roots, drop mounts, un-hide native cards.
  for (const d of disposers.splice(0)) {
    try {
      d();
    } catch {
      /* ignore */
    }
  }
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
```

- [ ] **Step 4: Typecheck, build, full test run**

Run: `pnpm typecheck` → no errors.
Run: `pnpm build` → succeeds.
Run: `pnpm test` → all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/md-tables/index.tsx
git commit -m "feat(md-tables): wire .md attachment detection, native-card hiding, unload restore"
```

---

### Task 6: Metadata, README, manual verification

**Files:**
- Modify: `plugins/md-tables/plugin.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete feature from Tasks 1–5.
- Produces: shipped metadata + the recorded manual QA gate.

- [ ] **Step 1: Update plugin.json**

Replace `plugins/md-tables/plugin.json`:

```json
{
  "name": "Markdown Tables",
  "author": "modda",
  "description": "Renders GFM markdown tables inline in Discord messages, and .md file attachments as formatted documents."
}
```

- [ ] **Step 2: Update the repo README**

In `README.md`, replace the md-tables bullet list under `### Markdown Tables (md-tables)`:

```markdown
- Auto-renders tables in place; basic inline formatting (bold/italic/code/strike) inside cells; column alignment honored.
- Cell content is rendered as text nodes only (no HTML injection).
- Renders `.md` file attachments as formatted GFM documents in a collapsible card (Full view + Download included). Content is DOMPurify-sanitized; images are stripped to links so rendering never makes a network request.
```

- [ ] **Step 3: Full local gate**

Run: `pnpm test` → all PASS.
Run: `pnpm typecheck` → no errors.
Run: `pnpm build` → dist output for md-tables produced.

- [ ] **Step 4: Manual verification in live Shelter (record results in the commit message body)**

Load the built plugin in Shelter (dev install from `dist/md-tables/`), then verify:

1. Post a `.md` file with headings, lists, task list, fenced code, a table, a link, and an image — card auto-renders; native attachment card hidden; image appears as a link; table matches the in-message table styling; no image network request (DevTools Network tab).
2. Collapse/Expand toggles the body; Full view opens the modal; Download saves the file.
3. Post a >512 KB `.md` — note shown instead of inline render; Full view still renders.
4. A message with BOTH an in-message table and a `.md` attachment renders both features.
5. Unload the plugin — native attachment cards reappear, no leftover `.mdt-mount` nodes, in-message tables restored.

- [ ] **Step 5: Commit**

```bash
git add plugins/md-tables/plugin.json README.md
git commit -m "docs(md-tables): describe .md attachment rendering; manual QA pass"
```
