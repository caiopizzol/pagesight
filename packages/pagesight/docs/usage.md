# Using Pagesight

## API

```ts
import { execute } from "pagesight";

const report = await execute({
  operation: "gsc.report",
  site: "sc-domain:example.com",
  request: {
    startDate: "2026-08-01",
    endDate: "2026-08-28",
    dimensions: ["page"],
  },
  maxPages: 4,
});
```

Each result contains `schemaVersion`, `provider`, `operation`, `target`, collection
timestamps, `status`, request/response `pages`, `warnings`, and any `error` and
`failedRequest`. Reports include `pagination` with `exhausted`, `nextOffset` and
`rowsReturned`. Raw provider metadata, aggregation, quota, sampling and thresholding
are retained. Exhausted pagination does **not** imply exhaustive search coverage.
GA evidence identifies the credential source variable, credential type, and service
account email when present. It never includes the token or private key. Aggregate
results include a concise per-observation `summary` alongside full observations.

| Operation                                    | Required inputs                                                            |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `discover`                                   | `url`; optional `providers` (`["gsc", "ga"]` by default)                   |
| `bing.sites`                                 | None                                                                       |
| `bing.queries`, `bing.pages`, `bing.traffic` | `site`                                                                     |
| `gsc.sites`                                  | None                                                                       |
| `gsc.sitemaps`                               | `site`                                                                     |
| `gsc.inspect`                                | `site`, `url`                                                              |
| `gsc.report`                                 | `site`, `request`; optional `maxPages`                                     |
| `ga.accounts`                                | None                                                                       |
| `ga.property`, `ga.key-events`               | `property`                                                                 |
| `ga.realtime`                                | `property`, `request`; moving window, no offset                            |
| `ga.report`                                  | `property`, `request`; optional `maxPages`                                 |
| `page`                                       | `url`                                                                      |
| `speed.psi`                                  | `url`; optional `strategy` (`mobile` or `desktop`)                         |
| `speed.crux`, `speed.history`                | `url`; optional `origin: true`, `formFactor`                               |
| `doctor`                                     | `config`                                                                   |
| `crawl`                                      | `config`; optional crawl bounds and `inspectLimit` (see [crawl](crawl.md)) |
| `investigate`                                | `config`, `url`, `startDate`, `endDate`; optional `maxPages`, `maxRows`    |
| `assess`                                     | `snapshot`; optional `maxRows` (default 10, max 100)                       |
| `snapshot`                                   | `config`, `startDate`, `endDate`; optional `maxPages`                      |

`operationSchema` and `configSchema` are exported for typed validation. The MCP
`observe` input uses the same schema. `page` observes fetched HTML, status,
redirects, canonical, robots directives, JSON-LD and a content hash. It does not
execute browser JavaScript. The original MCP page tool retains its additional
link, social-meta and contrast checks.

See [measurement and verification](measurement.md) for saved-snapshot assessments,
Realtime requests, freshness limits and repeatable browser checks.
See [investigating one URL](investigation.md) for fresh exact-page search, organic and technical evidence.

## CLI

```sh
pagesight --help
pagesight discover --url https://example.com/ --providers gsc,ga
pagesight doctor --config seo.config.json
pagesight gsc report --site sc-domain:example.com --request report.json --max-pages 4
pagesight ga report --property 123456 --request ga-report.json
pagesight page --url https://example.com/
pagesight speed psi --url https://example.com/
pagesight speed crux --url https://example.com/ --origin
pagesight snapshot --config seo.config.json --out observations/baseline.json
pagesight api --request operation.json
```

A GSC `report.json` uses the provider request shape. Defaults are finalized data,
Web search, no dimensions, 25,000 rows, offset zero. Ad hoc commands fetch one page
unless `--max-pages` is supplied (maximum 20). Request examples:

```json
{ "startDate": "2026-08-01", "endDate": "2026-08-28", "dimensions": ["page"] }
```

```json
{
  "dateRanges": [{ "startDate": "2026-08-01", "endDate": "2026-08-28" }],
  "dimensions": [{ "name": "eventName" }],
  "metrics": [{ "name": "eventCount" }, { "name": "keyEvents" }],
  "dimensionFilter": {
    "filter": { "fieldName": "hostName", "stringFilter": { "matchType": "EXACT", "value": "example.com" } }
  }
}
```

GA report defaults are 10,000 rows, offset zero and quota metadata requested.
`rowCount` determines remaining pages. For discovery/key-event lists, retain and
check any `nextPageToken`; these small metadata requests currently return one page.
They return `status: partial` when another metadata page is available.

All data commands output JSON; `--json` is accepted. `--out` writes the same result.
Exit codes: 0 success, 1 provider failure, 2 invalid input, 3 partial evidence.
Partial snapshots are saved. A successful report can still have provider coverage
limitations; inspect warnings and metadata before making comparisons.

## Local HTTP interface

```sh
# Set PAGESIGHT_API_TOKEN in your private environment file (at least 24 characters).
pagesight serve --port 6095
```

Send the shared operation JSON to `POST http://127.0.0.1:6095/v1/query` with
`Authorization: Bearer <PAGESIGHT_API_TOKEN>`. The server binds only to loopback.
Missing/invalid authentication returns 401; invalid operations return 400; provider
failures return 502; partial evidence returns 200 with `status: partial`.
This interface is for local agents, not an Internet deployment.

## MCP compatibility

Run `pagesight mcp` to start the stdio MCP server. Configure your host to run
`bun /path/to/pagesight/packages/pagesight/src/index.ts mcp` with the environment above. Existing MCP
launch configurations must include the `mcp` argument; no arguments show CLI help.

The new `observe` tool accepts `{ "request": <operation object> }` and returns
structured API evidence. The original six tools remain available:

| Tool     | Capability                                                                |
| -------- | ------------------------------------------------------------------------- |
| `audit`  | PageSpeed, metadata, robots, sitemap processing errors and URL inspection |
| `page`   | Metadata, links, JSON-LD checks, redirects and contrast                   |
| `speed`  | PageSpeed and CrUX snapshots/history                                      |
| `search` | GSC reports, sitemap metadata and selected URL inspection                 |
| `ai`     | Robots and crawler-registry checks, llms.txt detection                    |
| `setup`  | Existing GSC authentication helpers                                       |

The legacy text tools do not invent indexed counts from deprecated sitemap fields,
extrapolate sample verdicts to the whole site, or treat missing comparison rows as zero.
Use `observe` for exact request/response evidence and pagination status.
