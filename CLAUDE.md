# Pagesight

Shared API for SEO, analytics, GEO, and web performance evidence, with CLI,
local HTTP, and MCP interfaces. npm package: `pagesight`.

The agent SEO observability goal and verification live in `../fipe-chat/seo-goal.md`.

## Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Development tools**: Vite+ (Oxfmt, Oxlint, type checks)
- **Git hooks**: Vite+ (pre-commit: staged checks + full type check)

## Architecture

`api.execute` owns operation validation, provider calls and evidence semantics.
Adapters translate transport input/output only. The six original MCP tools remain
compatible; `observe` exposes the shared API.

```
src/
  index.ts              # Bin dispatcher; no arguments preserve MCP startup
  cli.ts                # CLI adapter
  http.ts               # Bearer-authenticated loopback HTTP adapter
  mcp.ts                # MCP server entry, registers 7 tools
  api/
    index.ts            # Public execute API and operation dispatch
    schema.ts           # Shared request and site-context validation
    evidence.ts         # Raw observations, failures and provenance
    reports.ts          # Bounded GA/GSC pagination
    snapshot.ts         # Independent observations and aggregation
    web.ts              # Bounded deployed HTML and sitemap inventory
    dates.ts            # Pacific reporting-window defaults
  lib/
    auth.ts             # OAuth 2.0 + Service Account auth for GSC
    gsc.ts              # Google Search Console API client
    ga.ts               # GA Admin/Data APIs and separate credential cache
    http.ts             # Bounded requests and safe provider errors
    psi.ts              # PageSpeed Insights API client
    crux.ts             # Chrome UX Report API client
    robots.ts           # robots.txt parser + AI crawler registry
    sitemap.ts          # Sitemap XML parser + URL inspection utilities
  tools/
    observe.ts          # Shared API operation as an MCP tool
    audit.ts            # "How's my site?" — orchestrates all tools
    page.ts             # "What's on this URL?" — meta tags, links, structured data, contrast
    speed.ts            # "How fast is it?" — PageSpeed (single/batch/compare) + CrUX (snapshot/history)
    search.ts           # "How's Google seeing me?" — inspect, sample inspect, sitemaps, analytics
    ai.ts               # "How's AI seeing me?" — AI crawler audit, robots.txt validation
    setup.ts            # Auth setup helper
```

## APIs Used

| API | Auth | Env Var |
|-----|------|---------|
| Google Search Console | OAuth 2.0 / Service Account | `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` |
| Google Analytics Admin/Data | Service Account / authorized-user ADC | `PAGESIGHT_GA_CREDENTIALS` (preferred), `GOOGLE_APPLICATION_CREDENTIALS` |
| PageSpeed Insights v5 | API key (optional) | `GOOGLE_API_KEY` |
| Chrome UX Report | API key (required) | `GOOGLE_API_KEY` |

## Commands

- `bun run src/index.ts` — start MCP server
- `bun run typecheck` — TypeScript checks without emitting files
- `bun src/index.ts --help` — CLI operations
- `bun src/index.ts serve` — local HTTP API; requires `PAGESIGHT_API_TOKEN`
- `bun run lint` — Vite+ lint
- `bun run format` — Vite+ format
- `bun run check` — Vite+ format, lint and type checks
- `bun test` — run tests

## Conventions

- All tools have try/catch error handling with clean error messages
- Use Bun built-in APIs over third-party packages
- Meta tag and structured data checks fetch the page directly — no third-party parsing libraries
- Every check must be backed by an official API or standard (Google APIs, RFC 9309, schema.org), not industry conventions
- Preserve raw requests/responses and unknowns. Pagination completion is not exhaustive
  search coverage; missing rows are not zero, sitemap submission is not indexing, and
  configured key events are not automatically product outcomes.
