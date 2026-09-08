# Pagesight

Shared API for SEO, analytics, GEO, and web performance evidence, with CLI,
local HTTP, and MCP interfaces. npm package: `pagesight`.

The active workspace and code cleanup goal is in `cleanup-goal.md`.

The active agent SEO observability goal and verification live in `seo-goal.md`.

## Stack

- **Runtime**: Bun (not Node.js)
- **Contributor runtime**: Node 22.18 or later in the 22.x line for Vite+ and release tooling
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Development tools**: Vite+ (Oxfmt, Oxlint, type checks)
- **Git hooks**: Vite+ (pre-commit: staged checks + full type check)

## Architecture

`api.execute` owns operation validation, provider calls and evidence semantics.
Adapters translate transport input/output only. The six original MCP tools remain
compatible; `observe` exposes the shared API.

```text
packages/pagesight/src/
  index.ts              # Existing bin dispatcher
  cli.ts, http.ts       # CLI and authenticated loopback HTTP
  mcp.ts                # Stdio startup
  mcp-server.ts         # Import-safe registration of seven tools
  api/
    index.ts            # Public exports
    execute.ts          # Validate and dispatch operations
    schema.ts           # Requests and site configuration
    evidence.ts         # Evidence creation, failures, and aggregation
    evidence-schema.ts  # Saved evidence validation
    doctor.ts           # Provider access checks
    discover.ts         # Accessible property discovery
    reports.ts          # Bounded GA/GSC pagination
    snapshot.ts         # Observation selection and collection
    compare-snapshots.ts
    bing.ts
  providers/            # gsc, ga, bing, pagespeed, crux clients
    google-tokens.ts    # OAuth/JWT exchanges; explicit scopes
    gsc-auth.ts         # GSC credentials, cache, and setup
  web/                  # Bounded observation; separate from legacy MCP parsing
    fetch.ts
    page-observation.ts
    sitemap-inventory.ts
    sitemap-parser.ts
    robots.ts
  shared/               # HTTP/error primitives and reporting dates only
  tools/
    page/               # Metadata, structured data, links, contrast, single/batch analysis
    search/             # Actions, inspection, coverage, analytics, sitemap sampling
    speed/              # PageSpeed, CrUX, and batch analysis
    ai.ts, audit.ts, observe.ts, setup.ts
```

Each large tool's `tool.ts` registers it. Tests live under matching subjects in
`packages/pagesight/__tests__`; shared fixtures are in `support/`.
Lower layers must not import API orchestration. Keep the strict sitemap inventory
and legacy search sampler separate, along with their existing fetch policies.

The private root owns shared tooling and one Bun lockfile. Runtime dependencies
belong to their workspace. A future website belongs in `apps/website`.

## APIs Used

| API                         | Auth                                  | Env Var                                                                  |
| --------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Google Search Console       | OAuth 2.0 / Service Account           | `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`                |
| Google Analytics Admin/Data | Service Account / authorized-user ADC | `PAGESIGHT_GA_CREDENTIALS` (preferred), `GOOGLE_APPLICATION_CREDENTIALS` |
| PageSpeed Insights v5       | API key (optional)                    | `GOOGLE_API_KEY`                                                         |
| Chrome UX Report            | API key (required)                    | `GOOGLE_API_KEY`                                                         |

## Commands

- `bun run packages/pagesight/src/index.ts` — show CLI help
- `bun run packages/pagesight/src/index.ts mcp` — start MCP server
- `bun run typecheck` — TypeScript checks without emitting files
- `bun packages/pagesight/src/index.ts --help` — CLI operations
- `bun packages/pagesight/src/index.ts serve` — local HTTP API; requires `PAGESIGHT_API_TOKEN`
- `bun run lint` — Vite+ lint
- `bun run format` — Vite+ format
- `bun run check` — Vite+ format, lint and type checks
- `bun run test` — run workspace tests
- `bun run verify` — all checks, import boundaries, and tests
- `bun run test:package` — packed API/CLI/MCP consumer checks

## Conventions

- All tools have try/catch error handling with clean error messages
- Use Bun built-in APIs over third-party packages
- Meta tag and structured data checks fetch the page directly — no third-party parsing libraries
- Every check must be backed by an official API or standard (Google APIs, RFC 9309, schema.org), not industry conventions
- Preserve raw requests/responses and unknowns. Pagination completion is not exhaustive
  search coverage; missing rows are not zero, sitemap submission is not indexing, and
  configured key events are not automatically product outcomes.
