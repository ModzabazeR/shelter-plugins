# Markdown Tables — Shelter plugin design

**Status:** approved (2026-07-10)
**Repo:** `shelter-plugins` (new Lune-workspace hub) · **Plugin:** `md-tables` · **Display name:** "Markdown Tables"
**Install URL (target):** `https://modzabazer.github.io/shelter-plugins/md-tables/`

## 1. Problem

Discord renders its own flavour of markdown but has **no GFM table support**. A message
containing:

```
| Name | Role |
| ---- | ---- |
| Ana  | Lead |
| Ben  | Eng  |
```

shows as literal pipe lines in the message body. Teams that pass AI-generated output around
(the same motivation as `html-viewer`) frequently get tables and can't read them. This plugin
detects GFM tables in messages and renders them as real styled HTML tables, in place.

## 2. UX decisions (settled during brainstorming)

- **Appearance:** *Auto, replace in place.* Detect the table and swap the raw `| … |` lines
  for a rendered `<table>` right where they were. No click. Surrounding message text is left
  exactly as Discord rendered it.
- **Scope:** *All channel messages* — others' and your own, in scrollback and as new/edited
  messages arrive. **Not** the composer text box (separate, re-render-heavy surface; out of scope).
- **Cell content:** *Basic inline formatting* — `**bold**`, `*italic*`, `` `code` ``,
  `~~strike~~` render inside cells. Links show as plain text in v0.1. No mentions/emoji/timestamps.
- **Alignment:** GFM alignment markers (`:--`, `--:`, `:-:`) are honored per column.
- **Settings:** none in v0.1 (auto-render is the whole point). A kill-switch toggle can be
  added later if wanted.

## 3. Goals / Non-goals

**Goals**
- Correctly detect valid GFM tables and reject stray pipes (a delimiter row is required).
- Render a themed, readable table in place, preserving all non-table message rendering.
- Safe against untrusted cell content (no HTML/script injection).
- Pure, unit-tested parsing/formatting core.

**Non-goals (v0.1)**
- Composer live preview.
- Full Discord markdown inside cells (mentions, custom emoji, timestamps, clickable links).
- Pipes inside inline code spans within a cell (`` `a|b` ``) — known limitation, may mis-split.
- Nested tables / multiline cells (not valid GFM anyway).

## 4. Architecture

New hub repo, Lune workspace, one GitHub Pages site with a generated root index:

```
shelter-plugins/
├─ plugins/
│  └─ md-tables/
│     ├─ core/                    # pure, framework-agnostic, unit-tested
│     │  ├─ parseTables.ts        # text -> TableBlock[] (with source line ranges)
│     │  ├─ formatInline.ts       # cell markdown -> safe DOM nodes
│     │  ├─ index.ts              # barrel
│     │  └─ *.test.ts             # Vitest (jsdom env for formatInline)
│     ├─ index.tsx                # Shelter integration (detect -> locate -> replace)
│     ├─ plugin.json              # { name, author, description }
│     └─ (styles via injectCss in index.tsx)
├─ lune.config.js                 # ssg { repo_name: "shelter-plugins",
│                                 #       base_url: "https://modzabazer.github.io/shelter-plugins" }
├─ package.json / pnpm-workspace.yaml
├─ tsconfig.json                  # jsx preserve, jsxImportSource solid-js
└─ .github/workflows/pages.yml    # peaceiris build -> gh-pages (same flow as html-viewer)
```

The `core` lives **inside** the plugin folder — it is table-specific and not shared across
plugins, which keeps the hub simple. (This is deliberately unlike html-viewer's top-level
shared `core/`, because there the same CSP logic was shared by the Vencord + Shelter targets;
here there is one target and one consumer.)

`html-viewer` is **not** moved. Its repo and its shipped install URL stay exactly as they are.

## 5. Core API (the load-bearing, testable logic)

```ts
// parseTables.ts
type Align = "left" | "center" | "right" | null;

interface TableBlock {
  headers: string[];   // raw (unformatted) header cell text, one per column
  aligns: Align[];     // per-column alignment from the delimiter row
  rows: string[][];    // body rows, each padded/truncated to headers.length
  startLine: number;   // 0-based, inclusive: first source line of the table (header)
  endLine: number;     // 0-based, inclusive: last source line (last body row)
}

function parseTables(text: string): TableBlock[];
```

**Detection rule.** Split `text` into lines. A table exists where a **delimiter line** is found
whose cells each match `:?-+:?` (hyphens with optional leading/trailing colon), and the line
directly above it is a non-empty **header line**. Body rows are the contiguous following lines
that still look like table rows, stopping at a blank line or a non-row line. A delimiter row is
**mandatory** — this is what distinguishes a real table from stray pipes.

**Cell splitting.** Split a row on **unescaped** `|`. Drop the leading/trailing empty cell when
outer pipes are present. Unescape `\|` → `|`. Trim each cell. Column count is taken from the
delimiter row; headers and rows are padded with `""` or truncated to match (GFM-lenient).

```ts
// formatInline.ts
// Returns detached DOM nodes for a single cell's text. NEVER uses innerHTML.
function formatInline(cell: string, doc?: Document): Node[];
```

Supported spans, parsed so code is not re-formatted: `` `code` `` first, then `**bold**`/`__bold__`,
`~~strike~~`, `*italic*`/`_italic_`. Produces `<code>`, `<strong>`, `<s>`, `<em>` elements whose
text is set via `textContent` (HTML-safe by construction) plus plain text nodes.

## 6. Shelter integration (thin DOM layer)

Reuses the html-viewer injection spine:

1. **Triggers:** `flux` dispatcher subscribe to `MESSAGE_CREATE`, `MESSAGE_UPDATE`,
   `LOAD_MESSAGES_SUCCESS`, `UPDATE_CHANNEL_DIMENSIONS`.
2. **Observe:** `observeDom('[id^="chat-messages-"]:not([data-md-tables])', …)`, mark processed.
3. **Read model:** `reactFiberWalker(getFiber(row), "message", true)?.memoizedProps?.message`
   to get `message.content` (raw markdown) and the content element `#message-content-<id>`.
4. **Detect:** `parseTables(message.content)`.
5. **Replace in place:** for each `TableBlock`, walk the child nodes of `#message-content-<id>`
   into logical lines (splitting on `<br>` and on `\n` inside text nodes), find the contiguous
   node run whose text matches the block's source lines, and replace that run with the rendered
   `<table>` (wrapped in a horizontal-scroll `<div>`). Because table lines render as literal text
   (pipes are not transformed by Discord), rendered line text equals the source lines, which is
   what makes the match reliable.
6. **Re-apply:** editing a message makes Discord replace the content node, dropping the
   `data-md-tables` marker, so it reprocesses naturally.

> **DOM caveat (explicit).** The exact internal structure of `#message-content-<id>` (how
> newlines are represented — `<br>` vs split text nodes) will be confirmed with a one-shot
> console probe before selectors are finalized, exactly as was done for html-viewer. No guessing.
> **Fallback** if a layout resists surgical range replacement: hide the raw table lines and insert
> the rendered table immediately after them (still reads as in place).

## 7. Security

The table chrome is generated by us, but **cell content is untrusted**. All cell text reaches
the DOM only through `formatInline`, which builds text nodes and elements and sets `textContent`
— **never** `innerHTML`. There is no script execution and no network, so no CSP/iframe is needed
(unlike html-viewer). The single invariant under test: no code path passes cell text to
`innerHTML`/`insertAdjacentHTML`.

## 8. Styling

CSS injected via `injectCss`, themed with Discord variables and dark/light fallback chains
(as in html-viewer):
- table: collapsed borders, `--background-modifier-accent` grid lines, rounded outer border.
- header row: `--background-secondary` background, `--text-normal`, semibold.
- cells: `--text-normal`, comfortable padding; alignment from `aligns`.
- wrapper: `overflow-x:auto` so wide tables scroll within the message column instead of
  breaking layout. `max-width` matched to the message content width.

## 9. Testing

- **`parseTables` (pure):** with/without outer pipes; alignment markers (all four states);
  escaped `\|`; ragged/mismatched column counts (pad + truncate); **not-a-table rejection**
  (pipes with no delimiter row; a lone delimiter with no header); multiple tables in one message;
  correct `startLine`/`endLine`.
- **`formatInline` (jsdom):** bold/italic/code/strike; code span not re-formatted;
  HTML-special characters in cells rendered as text (`<`, `&`, `"`), i.e. injection-safe;
  plain text passthrough.
- **DOM integration:** verified manually in a live Shelter + the console probe (no Discord test
  harness), same as html-viewer.

## 10. Deployment

Lune SSG → GitHub Pages via `.github/workflows/pages.yml` (peaceiris build → `gh-pages` branch,
Pages source = that branch), identical to the html-viewer pipeline. Root index lists all plugins
in the hub; each plugin installs from `…/shelter-plugins/<name>/`.

## 11. Known limitations (recorded up front)

- Pipes inside inline code within a cell may mis-split (v0.1).
- Links/mentions/emoji inside cells render as plain text.
- The DOM range-replacement rides Discord's message-content structure; a Discord refactor could
  require a selector bump (same fragility class as html-viewer's native-hide).
