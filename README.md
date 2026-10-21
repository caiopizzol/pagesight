<h1 align="center">Pagesight</h1>

<p align="center">
  Check your site's search traffic, analytics, and page performance.
  <br>
  Built for developers and AI assistants. Use the TypeScript API, CLI, or MCP.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pagesight"><img src="https://img.shields.io/npm/v/pagesight" alt="npm version"></a>
</p>

## Quick start

Requires [Bun](https://bun.sh). These checks need no provider credentials:

```sh
bunx --bun pagesight page --url https://example.com
bunx --bun pagesight robots --url https://example.com
```

## Development

Use Bun 1.3.12 and Node 22.18 or later in the 22.x line. From the repository root:

```sh
bun install --frozen-lockfile
bun run start --help  # Show local CLI commands
bun run verify       # Format, lint, types, import boundaries, and tests
bun run test:package # Check the packed API, CLI, and MCP entrypoints
```

Source and tests live in `packages/pagesight`.

- [API, CLI, and MCP](packages/pagesight/docs/usage.md)
- [Google credentials](packages/pagesight/docs/credentials.md)
- [Snapshots and comparisons](packages/pagesight/docs/snapshots.md)

MIT — see [LICENSE](LICENSE).

- [Rendered-page verification](packages/pagesight/docs/rendering.md)
- [SEO agent workflow](packages/pagesight/docs/seo-agent-workflow.md)
