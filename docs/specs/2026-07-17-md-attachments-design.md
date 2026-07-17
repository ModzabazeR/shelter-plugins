# Markdown Attachments — md-tables extension design

**Status:** approved (2026-07-17)
**Repo:** `shelter-plugins` · **Plugin:** `md-tables` (extended, no new plugin) · **Display name:** "Markdown Tables"
**Install URL (unchanged):** `https://modzabazer.github.io/shelter-plugins/md-tables/`

## 1. Problem

Discord shows a `.md` file attachment as a generic file card with a raw source preview —
useless for actually *reading* the document. `html-viewer` already solves this for `.html`
attachments (card + sandboxed render). This extension gives `.md` attachments the same
treatment: detect the attachment, hide Discord's native card, and render the document as
formatted markdown inline in the channel.

## 2. UX decisions (settled during brainstorming)

- **Home:** extend `md-tables`, not a new plugin — one install covers "Discord doesn't render
  markdown tables/files" end to end. The existing in-message table replacement is untouched.
- **Render engine:** battle-tested library + sanitizer (`marked` with `gfm: true` +
  `DOMPurify`), injected as sanitized HTML into a card styled with Discord CSS variables.
  This deliberately relaxes the repo's "no HTML injection" rule to "sanitized injection" for
  this one path; the in-message table path keeps its text-nodes-only discipline.
- **Card behavior:** **auto-render, collapsible.** Sanitized markdown is inert, so no Render
  button, no per-user/server allowlists, no settings panel. Header: filename · size ·
  Collapse/Expand · Full view (modal) · Download. Body: rendered document, max-height capped
  with internal scroll.
- **Images:** **stripped to links.** Markdown images `![alt](url)` render as a plain link
  (alt text + URL); raw HTML `<img>` is removed by the sanitizer. No network request is ever
  made for image content — auto-render stays privacy-safe (no tracking-pixel IP leak).
- **Size cap:** files over **512 KB** (constant, no setting) don't auto-render; the card shows
  a note with Full view and Download still available. Full view renders regardless of size
  (explicit user action).

## 3. Goals / Non-goals

**Goals**
- Detect `.md` / `.markdown` attachments and replace the native attachment card with a
  readable, themed document card.
- Full GFM rendering: headings, paragraphs, lists (incl. task lists), fenced/indented code,
  blockquotes, hr, links, strikethrough, tables.
- Zero script execution and zero unsolicited network requests from document content.
- Pure, unit-tested render/sanitize core; non-destructive DOM integration (unload restores
  Discord's native card).

**Non-goals (v0.1)**
- Rendering images (they become links — revisit as click-to-load later if wanted).
- Syntax highlighting inside code fences.
- Footnotes, math, mermaid, front-matter interpretation (front-matter renders as whatever
  GFM makes of it — typically an hr-delimited block or table).
- Any settings surface.

## 4. Architecture

```
plugins/md-tables/
├─ core/
│  ├─ parseTables.ts          # (existing) in-message table detection
│  ├─ replaceTables.ts        # (existing) in-message DOM replacement
│  ├─ mdAttachment.ts         # NEW: isMdAttachment(att)
│  ├─ renderMarkdown.ts       # NEW: renderMarkdownToHtml(text) -> sanitized HTML string
│  ├─ index.ts                # barrel (re-export new modules)
│  └─ *.test.ts               # Vitest (jsdom for renderMarkdown — DOMPurify needs a DOM)
├─ index.tsx                  # + attachment path: detect -> hide native -> mount MdCard
├─ package.json               # + marked, dompurify
└─ plugin.json                # description updated to mention .md attachments
```

Two independent code paths in `index.tsx` share the dispatch/observe spine:
the existing content-node table path (guard: `data-md-tables` on the content node) and the
new attachment path (guard: `data-mdt-att` on the message row, html-viewer style — attachments
live in the accessories container, which Discord does not swap the way it swaps content nodes).

## 5. Core API (the load-bearing, testable logic)

```ts
// mdAttachment.ts
// filename ends ".md" or ".markdown", case-insensitive. content_type is not trusted
// (Discord reports text/plain or nothing for md uploads).
function isMdAttachment(att: { filename?: string }): boolean;

// renderMarkdown.ts
// GFM parse + strict sanitize. Pure string -> string; never touches the live document.
function renderMarkdownToHtml(text: string): string;
```

**`renderMarkdownToHtml` pipeline.**
1. `marked` with `gfm: true`, plus a renderer override for `image`: emit
   `<a href="{href}">{alt || href}</a>` instead of `<img>` (the strip-to-links rule at the
   source, before sanitization).
2. `DOMPurify.sanitize` with a strict profile:
   - `ALLOWED_TAGS`: `h1–h6, p, br, hr, ul, ol, li, blockquote, pre, code, em, strong, del,
     s, a, table, thead, tbody, tr, th, td, input, span` — nothing else (`img`, `script`,
     `style`, `iframe`, `form`, `svg`, `math` all fall away).
   - `ALLOWED_ATTR`: `href` (a), `align` (th/td), `start` (ol), `type`/`checked`/`disabled`
     (input), `class` (marked emits `language-*` on code fences; an author-supplied class is
     cosmetic-only inside the card and cannot execute anything).
   - `ALLOWED_URI_REGEXP` limited to `https?:` and `mailto:` (kills `javascript:`/`data:`).
   - `afterSanitizeAttributes` hook: every `<a>` gets `target="_blank"
     rel="noopener noreferrer"`; every `<input>` is forced to `type="checkbox" disabled`
     (GFM task lists) or removed if it is anything else.

The output string is injected exactly once per render via `innerHTML` on a
plugin-owned `<div class="mdt-doc">` — never into Discord's own nodes.

## 6. Shelter integration (thin DOM layer)

Rides the existing spine — same `TRIGGERS`, same `observeDom` window, same 1500 ms safety
timeout. New per-row work, mirroring html-viewer's attachment plumbing:

1. `reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message` →
   `message.attachments`, filter with `isMdAttachment`. None ⇒ return (table path still runs).
2. Guard: `row.dataset.mdtAtt = "1"` before mounting (skip if already set).
3. **Hide native card, non-destructively:** find the attachment's anchor
   (`a[href*="${att.id}"]`), walk up to the `nonVisualMediaItemContainer` wrapper (with the
   same fallback chain html-viewer uses), set `style.display = "none"`, and remember the
   element for restore.
4. Mount `<MdCard att={att} />` via `solidWeb.render` into the message's contents column
   (fallback: append to the row); track the disposer.

**`MdCard` (Solid).**
- State: `open` (starts `true` unless over the 512 KB cap), `html`, `loading`, `error`.
- On first open, fetch the attachment text (per-attachment-id `Map` cache, as html-viewer),
  run `renderMarkdownToHtml`, set the sanitized string into the body div's `innerHTML`.
- Header row: filename, formatted size, Collapse/Expand toggle, Full view button
  (`openModal` + `ModalRoot LARGE`, same chrome as html-viewer), Download button
  (Blob + object URL, `type: "text/markdown"`).
- Body: `.mdt-doc` div, `max-height: 480px`, `overflow-y: auto`. Over-cap state shows a note
  ("N MB exceeds the 512 KB inline limit — use Full view or Download"). Fetch/render errors
  show an inline error note; the native card stays hidden but Download still works from the
  attachment URL.

**Unload.** Extends the existing `onUnload`: dispose all Solid roots, remove `.mdt-mount`
nodes, restore `display` on every hidden native wrapper, clear `data-mdt-att` markers, then
the existing table-restore logic runs unchanged.

## 7. Security

Attachment text is fully untrusted (anyone in the channel authored it). The whole defense is
in `renderMarkdownToHtml`, which is pure and directly testable:

- No script: `script`, event-handler attributes, and non-http(s)/mailto URIs cannot survive
  the DOMPurify profile.
- No unsolicited network: nothing that fetches (`img`, `iframe`, `link`, `source`, `video`,
  `audio`, `object`, `svg` with refs) is in `ALLOWED_TAGS`; md images are rewritten to links
  before sanitization.
- Blast radius: the sanitized string only ever lands in a plugin-owned div; Discord's DOM is
  never written with attachment-derived HTML.
- The card chrome itself (filename, size) renders through Solid text interpolation, not HTML.

Invariant under test: for hostile inputs (script tags, `onerror` handlers, `javascript:`
links, nested/raw HTML img, `data:` URIs), the sanitized output contains none of them.

## 8. Styling

Injected via the existing `injectCss` call (one stylesheet for the whole plugin), themed with
Discord variables + fallbacks:

- `.mdt-card`: same card shell language as html-viewer (`--background-secondary` surface,
  `--background-modifier-accent` border, 8px radius, `max-width: min(680px, 100%)`).
- `.mdt-doc`: `--text-normal` body text; heading scale h1–h3 with bottom hairlines on h1/h2;
  `--text-muted` blockquote with accent left border; `pre`/`code` on
  `--background-secondary-alt` with `--font-code`; task-list checkboxes unstyled native.
- Tables inside the document reuse the existing `.mdt-table` rules (one visual language for
  both features).
- Links: `--text-link`.

## 9. Testing

- **`isMdAttachment` (pure):** `.md`, `.MD`, `.markdown` accepted; `.mdx`, `.txt`, missing
  filename rejected.
- **`renderMarkdownToHtml` (jsdom):**
  - GFM coverage: headings, nested lists, task lists (disabled checkboxes), fenced code
    (content HTML-escaped), blockquotes, hr, strikethrough, tables, autolinks.
  - Sanitization suite: `<script>` gone; `onerror`/`onclick` gone; `javascript:` and `data:`
    hrefs gone; `![alt](url)` → `<a>` with no `<img>` anywhere; raw `<img>`/`<iframe>`
    removed; every `<a>` carries `target="_blank" rel="noopener noreferrer"`; `<input>`
    only ever `checkbox disabled`.
- **DOM integration:** verified manually in live Shelter (native-hide, card mount, collapse,
  full view, unload restore), same standard as the existing table path.

Coverage expectation: the two new core modules at or near 100% branch coverage; the Vitest
suite stays green alongside the existing parse/replace tests.

## 10. Deployment

No pipeline change: same Lune build, same Pages deploy, same install URL. `marked` and
`dompurify` are bundled into the plugin output by Lune/esbuild (~60 KB added, acceptable for
a self-hosted plugin). `plugin.json` description and the repo README gain a line about
`.md` attachment rendering.

## 11. Known limitations (recorded up front)

- Images never render inline (by design, v0.1) — a doc that is mostly screenshots reads as a
  link list.
- No syntax highlighting in code fences.
- Native-hide rides Discord's `nonVisualMediaItemContainer` class prefix — same fragility
  class as html-viewer; a Discord refactor needs a selector bump.
- A `.md` attachment edited/removed while its card is open is not re-reconciled until the
  next dispatch reprocesses the row.
