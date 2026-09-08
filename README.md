# Pagesight

SEO, analytics, page, and performance evidence for developers and AI assistants.
Use it through the TypeScript API, CLI, local HTTP server, or MCP.

## Quick start

With Bun installed:

```sh
bunx --bun pagesight page --url https://example.com
```

This page check needs no provider credentials. See the [package guide](packages/pagesight/README.md)
for installation and usage, or [provider access](packages/pagesight/docs/credentials.md)
for Google and Bing reports.

## Repository

- `packages/pagesight` — the published npm package, source, tests, and usage guides.
- `apps/website` — reserved for the future website; no app is scaffolded yet.
- Root — shared tools, lockfile, checks, and release configuration.

To run from a checkout, use `bun run start --help` or
`bun packages/pagesight/src/index.ts page --url https://example.com`.
The former root `src/index.ts` checkout path has moved; installed npm commands are unchanged.

[Contributing](CONTRIBUTING.md) · [Product boundary](PRODUCT.md) · [Brand notes](docs/brand.md)

MIT — see [LICENSE](LICENSE).
