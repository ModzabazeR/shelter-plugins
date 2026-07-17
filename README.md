# shelter-plugins

A collection of [Shelter](https://shelter.uwu.network) plugins for Discord, built with Lune and hosted on GitHub Pages.

## Plugins

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
