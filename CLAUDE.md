# Pagesight

MCP server for SEO, GEO, and web performance analysis. npm package: `pagesight`.

## Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Development tools**: Vite+ (Oxfmt, Oxlint, type checks)
- **Git hooks**: Vite+ (pre-commit: staged checks + full type check)

## Architecture

6 tools organized by developer intent, not data source.

```
src/
  index.ts              # MCP server entry, registers 6 tools
  lib/
    auth.ts             # OAuth 2.0 + Service Account auth for GSC
    gsc.ts              # Google Search Console API client
    psi.ts              # PageSpeed Insights API client
    crux.ts             # Chrome UX Report API client
    robots.ts           # robots.txt parser + AI crawler registry
    sitemap.ts          # Sitemap XML parser + URL inspection utilities
  tools/
    audit.ts            # "How's my site?" — orchestrates all tools
    page.ts             # "What's on this URL?" — meta tags, links, structured data, contrast
    speed.ts            # "How fast is it?" — PageSpeed (single/batch/compare) + CrUX (snapshot/history)
    search.ts           # "How's Google seeing me?" — inspect, sample inspect, sitemaps, analytics
    ai.ts               # "How's AI seeing me?" — AI crawler audit, robots.txt validation
    setup.ts            # Auth setup helper
```

## APIs Used

| API                   | Auth                        | Env Var                                                   |
| --------------------- | --------------------------- | --------------------------------------------------------- |
| Google Search Console | OAuth 2.0 / Service Account | `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` |
| PageSpeed Insights v5 | API key (optional)          | `GOOGLE_API_KEY`                                          |
| Chrome UX Report      | API key (required)          | `GOOGLE_API_KEY`                                          |

## Commands

- `bun run src/index.ts` — start MCP server
- `bun run check` — Vite+ format, lint, and type checks
- `bun run typecheck` — TypeScript checks without emitting files
- `bun run lint` — Vite+ lint
- `bun run format` — Vite+ format
- `bun test` — run tests

## Conventions

- All tools have try/catch error handling with clean error messages
- Use Bun built-in APIs over third-party packages
- Meta tag and structured data checks fetch the page directly — no third-party parsing libraries
- Every check must be backed by an official API or standard (Google APIs, RFC 9309, schema.org), not industry conventions
