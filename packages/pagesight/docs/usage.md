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

| Operation                      | Required inputs                                                            |
| ------------------------------ | -------------------------------------------------------------------------- |
| `discover`                     | `url`; optional `providers` (`["gsc", "ga"]` by default)                   |
| `gsc.sites`                    | None                                                                       |
| `gsc.sitemaps`                 | `site`                                                                     |
| `gsc.inspect`                  | `site`, `url`                                                              |
| `gsc.report`                   | `site`, `request`; optional `maxPages`                                     |
| `ga.accounts`                  | None                                                                       |
| `ga.property`, `ga.key-events` | `property`                                                                 |
| `ga.realtime`                  | `property`, `request`; moving window, no offset                            |
| `ga.report`                    | `property`, `request`; optional `maxPages`                                 |
| `page`                         | `url`                                                                      |
| `robots`                       | `url`; reads that origin's `/robots.txt`, `/llms.txt`, `/llms-full.txt`    |
| `speed.psi`                    | `url`; optional `strategy` (`mobile` or `desktop`), `categories`           |
| `speed.crux`, `speed.history`  | `url`; optional `origin: true`, `formFactor`                               |
| `doctor`                       | `config`                                                                   |
| `crawl`                        | `config`; optional crawl bounds and `inspectLimit` (see [crawl](crawl.md)) |
| `investigate`                  | `config`, `url`, `startDate`, `endDate`; optional `maxPages`, `maxRows`    |
| `assess`                       | `snapshot`; optional `maxRows` (default 10, max 100)                       |
| `snapshot`                     | `config`, `startDate`, `endDate`; optional `maxPages`                      |

`operationSchema` and `configSchema` are exported for typed validation. The MCP
`observe` input uses the same schema. `page` observes fetched HTML, status,
redirects, canonical, robots directives, Open Graph and Twitter metas, hreflang
alternates, JSON-LD and a content hash. It does not execute browser JavaScript.

`speed.psi` requests the `performance` and `seo` Lighthouse categories unless
`categories` selects others from `performance`, `accessibility`, `best-practices`
and `seo`.

See [measurement and verification](measurement.md) for saved-snapshot assessments,
Realtime requests, freshness limits and repeatable browser checks.
See [investigating one URL](investigation.md) for fresh exact-page search, organic and technical evidence.

## HTML image evidence

`pagesight page --url https://example.com/` includes `descriptionLength`
(Unicode code points, or null) and `imageEvidence`. Images include raw `src`,
`altPresent`, `altText`, `inNoscript`, width/height, role and aria-hidden attributes.
Missing ALT has `altPresent: false, altText: null`; an explicitly empty ALT is
`altPresent: true, altText: ""`. Empty ALT can be appropriate for decorative images.
No description-length threshold or image-purpose verdict is imposed.

The inventory includes noscript fallback markup, retains at most 200 images,
and reports `omittedImages` and `truncated`. Fallback images follow ordinary images
in output; this is not DOM order. No scripts run or image URLs are requested.
The existing 2 MB page limit still applies. This is markup evidence, not a full
accessibility or rendered-page audit.

## Crawler policy evidence

`pagesight robots --url https://example.com/` reads that origin's `/robots.txt`
and reports its HTTP status, RFC 9309 parse errors, declared sitemaps, whether
Googlebot may fetch `/`, and each known AI crawler with its operator, category
and access. It also reports the status and byte size of `/llms.txt` and
`/llms-full.txt`; a file over 1 MB is reported without a size.

The AI crawler list comes from the [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt)
registry, fetched at run time and cached for 24 hours. When that fetch fails the
list is empty and a warning says so; an empty list is not evidence that nothing
is blocked. robots.txt states a policy; it does not prove how any crawler behaves.

## CLI

```sh
pagesight --help
pagesight discover --url https://example.com/ --providers gsc,ga
pagesight doctor --config seo.config.json
pagesight gsc report --site sc-domain:example.com --request report.json --max-pages 4
pagesight ga report --property 123456 --request ga-report.json
pagesight page --url https://example.com/
pagesight robots --url https://example.com/
pagesight speed psi --url https://example.com/ --categories performance,seo
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

## MCP

Run `pagesight mcp` to start the stdio MCP server. Configure your host to run
`bun /path/to/pagesight/packages/pagesight/src/index.ts mcp` with the environment above. Existing MCP
launch configurations must include the `mcp` argument; no arguments show CLI help.

`observe` is the only tool. It accepts `{ "request": <operation object> }` using
the operations above and returns the same evidence as the API and the CLI: exact
requests, provider responses, warnings and pagination status.
