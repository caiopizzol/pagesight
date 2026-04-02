# Pagesight

MCP server for SEO, GEO, and web performance analysis. npm package: `pagesight`.

## Stack

- **Runtime**: Bun (not Node.js)
- **Language**: TypeScript
- **MCP SDK**: `@modelcontextprotocol/sdk`
- **Linter**: Biome
- **Git hooks**: Lefthook (pre-commit: biome + tsc)

## Architecture

```
src/
  index.ts              # MCP server entry, registers all tools
  lib/
    auth.ts             # OAuth 2.0 + Service Account auth for GSC
    gsc.ts              # Google Search Console API client
    psi.ts              # PageSpeed Insights API client
    crux.ts             # Chrome UX Report API client
    robots.ts           # robots.txt parser + AI crawler registry
  tools/
    audit.ts            # Cross-tool site audit (orchestrates all tools)
    inspect.ts          # URL Inspection tool
    metatags.ts         # Meta tags, OG, Twitter, JSON-LD, redirect chain
    pagespeed.ts        # PageSpeed Insights + failing audit details
    crux.ts             # CrUX + CrUX History tools
    performance.ts      # Search Analytics + period comparison
    robots.ts           # robots.txt + AI crawler audit
    sample-inspect.ts   # Batch sitemap URL inspection
    sitemaps.ts         # Sites + Sitemaps tool
    setup.ts            # Auth setup helper
```

## APIs Used

| API | Auth | Env Var |
|-----|------|---------|
| Google Search Console | OAuth 2.0 / Service Account | `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` |
| PageSpeed Insights v5 | API key (optional) | `GOOGLE_API_KEY` |
| Chrome UX Report | API key (required) | `GOOGLE_API_KEY` |

## Commands

- `bun run src/index.ts` — start MCP server
- `bun run lint` — biome check
- `bun run format` — biome format
- `bun test` — run tests

## Conventions

- All tools have try/catch error handling with clean error messages
- Use Bun built-in APIs over third-party packages
- Meta tag and structured data checks fetch the page directly — no third-party parsing libraries
- Every check must be backed by an official API or standard (Google APIs, RFC 9309, schema.org), not industry conventions
