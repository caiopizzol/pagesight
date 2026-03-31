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
  index.ts          # MCP server entry, registers all tools
  lib/
    auth.ts         # OAuth 2.0 + Service Account auth for GSC
    gsc.ts          # Google Search Console API client
    psi.ts          # PageSpeed Insights API client
    crux.ts         # Chrome UX Report API client
  tools/
    inspect.ts      # URL Inspection tool
    pagespeed.ts    # PageSpeed Insights tool
    crux.ts         # CrUX + CrUX History tools
    performance.ts  # Search Analytics tool
    sitemaps.ts     # Sites + Sitemaps tool
    setup.ts        # Auth setup helper
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
- No HTML parsing or on-page analysis — only authoritative data sources
- Every check must be backed by an official API or standard (Google APIs, RFC 9309), not industry conventions
