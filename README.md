# shelter-plugins

A collection of [Shelter](https://shelter.uwu.network) plugins for Discord, built with Lune and hosted on GitHub Pages.

## Plugins

### HTML Viewer (`html-viewer`)
Renders `.html` file attachments inline in Discord, inside a sandboxed iframe — for reading AI-generated artifacts without leaving the client.

**Install:** User Settings → Shelter → Settings → Plugins → Add Plugin, then paste:
`https://modzabazer.github.io/shelter-plugins/html-viewer/`

- Inline render is near-offline: an injected CSP allows only a trusted-CDN allowlist (jsdelivr/unpkg/cdnjs/tailwind/google-fonts/esm.sh) for styles, fonts and scripts.
- Full view widens the CSP to any HTTPS CDN, while `connect-src 'none'` blocks fetch/XHR/WebSocket/beacon egress in **both** tiers.
- The iframe is `sandbox="allow-scripts"` with an opaque origin, so artifact code can never reach Discord's token or DOM.
- Per-user and per-server auto-render allowlists, plus Download.

> Moved here from the standalone [`html-viewer`](https://github.com/ModzabazeR/html-viewer) repo, which is now deprecated. If you installed the old `…/html-viewer/html-viewer/` URL, remove it and add the one above.

### Markdown Tables (`md-tables`)
Renders GFM markdown tables inline in Discord messages — Discord doesn't render tables, this fixes that.

**Install:** User Settings → Shelter → Settings → Plugins → Add Plugin, then paste:
`https://modzabazer.github.io/shelter-plugins/md-tables/`

- Auto-renders tables in place; basic inline formatting (bold/italic/code/strike) inside cells; column alignment honored.
- Cell content is rendered as text nodes only (no HTML injection).
- Renders `.md` file attachments as formatted GFM documents in a collapsible card (Full view + Download included). Content is DOMPurify-sanitized; images are stripped to links so rendering never makes a network request.

## Development

```sh
pnpm install
pnpm test          # Vitest on each plugin's core
pnpm build         # lune ci  -> dist/<plugin>/
pnpm ssg           # lune ssg ci -> dist/ (static site + index)
```

Each plugin lives in `plugins/<name>/` with its own `core/` (pure, unit-tested) and `index.tsx` (Shelter integration). CI builds and deploys all of them to Pages on push to `main`.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
