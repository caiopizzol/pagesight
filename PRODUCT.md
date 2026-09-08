# Pagesight

Pagesight helps developers and their AI assistants see how a site is doing in search,
what visitors do, and how fast pages load. It reads Google and Bing APIs and web
pages, then returns the evidence. You decide what to fix.

The Bun package offers a [TypeScript API](src/api/index.ts), [CLI](src/cli.ts),
[local HTTP API](src/http.ts), and [MCP tools](src/mcp.ts). The shared `execute`
function owns request checks, provider calls, and results. CLI, HTTP, and MCP
`observe` pass requests to it. The six original MCP tools keep their own code and
text output, so their results can differ from the shared API.

## What it does

| Capability                                                                                                       | Where to use it                                                                                                        | Main code                                                                     | Existing checks                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Find Google properties and Bing sites, then check access. Start with just a site URL; choose providers yourself. | `discover`, `doctor`; MCP `setup` for Google OAuth help                                                                | [setup](src/api/setup.ts), [OAuth](src/tools/setup.ts)                        | [API tests](__tests__/api.test.ts), [Bing tests](__tests__/bing.test.ts), [auth tests](__tests__/auth.test.ts)    |
| Read Search Console indexing, sitemaps, and traffic; read GA4 reports and key events.                            | `gsc.*`, `ga.*`; MCP `search` for Search Console only                                                                  | [reports](src/api/reports.ts), [search](src/tools/search.ts)                  | [API tests](__tests__/api.test.ts), [search tests](__tests__/search-evidence.test.ts)                             |
| Read Bing query, page, and traffic reports with raw dates and provider coverage limits.                          | `bing.queries`, `bing.pages`, `bing.traffic`; `snapshot` with `bingSite`                                               | [Bing API](src/api/bing.ts), [Bing client](src/lib/bing.ts)                   | [Bing tests](__tests__/bing.test.ts) verify documented envelopes and safe failures                                |
| Inspect pages and performance: HTML, metadata, PageSpeed lab runs, and CrUX field data/history.                  | `page`, `speed.*`; MCP `page` adds social, schema, link, and contrast checks; MCP `speed` adds batches and comparisons | [web](src/api/web.ts), [page](src/tools/page.ts), [speed](src/tools/speed.ts) | [API tests](__tests__/api.test.ts) cover HTML and errors; no dedicated contrast or speed-result tests             |
| Collect a site snapshot, or get a ranked list of findings.                                                       | `snapshot`; MCP `audit`                                                                                                | [snapshot](src/api/snapshot.ts), [audit](src/tools/audit.ts)                  | [API tests](__tests__/api.test.ts), [audit cases](__tests__/search-evidence.test.ts)                              |
| Compare saved snapshots and retain raw values with descriptive changes for common report rows.                   | `compare` through the shared API, CLI, HTTP, or MCP `observe`                                                          | [comparison](src/api/compare.ts), [snapshot imports](src/api/imported.ts)     | [Comparison tests](__tests__/compare.test.ts) cover compatibility, limitations, malformed imports, and transports |
| Check robots rules by crawler or path and detect `llms.txt`.                                                     | MCP `ai`                                                                                                               | [ai](src/tools/ai.ts), [robots](src/lib/robots.ts)                            | [Robots tests](__tests__/robots.test.ts), [extra cases](__tests__/formatting.test.ts)                             |

## Where it stops

- Pagesight collects and explains data. It doesn't edit or deploy sites, submit
  indexing requests, change provider settings, or promise traffic. There's no hosted
  dashboard or scheduler. HTTP access is local only and requires a bearer token.
- Google reports need read-only credentials and property access. PageSpeed's key is
  optional; CrUX requires `GOOGLE_API_KEY`. Bing requires `BING_WEBMASTER_API_KEY`
  and site access. A site-only snapshot needs no provider credentials.
- Bing reports use provider-defined periods without date-range or pagination inputs.
  Reporting timezone and complete coverage remain unknown; traffic spans Bing verticals.
- Snapshot comparison supports compatible GSC and GA reports with non-time row keys
  and equal-length, nonoverlapping periods. Partial or recent data remains limited;
  changes don't establish causation. Bing and other observations aren't compared.
- Page checks read HTML without running browser JavaScript. JSON-LD checks cover
  supported rules; color contrast isn't a full accessibility audit.
- Robots rules don't prove that bots visited or followed them. Pagesight doesn't
  measure AI citations.

## How to read the results

The [shared API](src/api/evidence.ts) keeps requests, responses, limits, and failures.
A failed provider doesn't erase successful observations. Missing rows aren't zero;
finishing pagination doesn't mean complete coverage. Sitemap membership isn't
indexing, and GA key events aren't automatically business outcomes.

Tests cover pagination, partial failures, provider selection, page/sitemap parsing,
and [CLI/HTTP/MCP behavior](__tests__/transports.test.ts). They use fixtures and
mocks, so they don't prove live provider access. [CI](.github/workflows/ci.yml) runs
type checks, lint, formatting checks, and tests.

Some older text tools still have rough edges: `page` uses description-length rules
of thumb. If the crawler registry fails, `ai` reports an empty registry as skipped,
but `audit` doesn't report that failure. A clean report isn't proof that every check ran.

## What's next

[The current plan](seo-goal.md) tracks verification and review of provider setup,
Bing reports, and snapshot comparison. Keep raw evidence
and unknowns visible as the product grows; don't turn missing data into confident
conclusions. See [README.md](README.md) for usage.
