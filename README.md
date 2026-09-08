# Pagesight

[![npm version](https://img.shields.io/npm/v/pagesight.svg)](https://www.npmjs.com/package/pagesight)

See your site the way search engines and AI see it. Pagesight's shared TypeScript
API returns search, analytics, page and performance evidence. CLI, HTTP and MCP
are interfaces over that API.

Requires Bun. Install with `bun add pagesight`, or run the checkout after
`bun install`. The examples below use the `pagesight` bin; in the checkout use
`bun src/index.ts`.

## API

```ts
import { execute } from 'pagesight';

const report = await execute({
  operation: 'gsc.report',
  site: 'sc-domain:example.com',
  request: {
    startDate: '2026-08-01',
    endDate: '2026-08-28',
    dimensions: ['page'],
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

| Operation | Required inputs |
| --- | --- |
| `gsc.sites` | None |
| `gsc.sitemaps` | `site` |
| `gsc.inspect` | `site`, `url` |
| `gsc.report` | `site`, `request`; optional `maxPages` |
| `ga.accounts` | None |
| `ga.property`, `ga.key-events` | `property` |
| `ga.report` | `property`, `request`; optional `maxPages` |
| `page` | `url` |
| `speed.psi` | `url`; optional `strategy` (`mobile` or `desktop`) |
| `speed.crux`, `speed.history` | `url`; optional `origin: true`, `formFactor` |
| `doctor` | `config` |
| `snapshot` | `config`, `startDate`, `endDate`; optional `maxPages` |

`operationSchema` and `configSchema` are exported for typed validation. The MCP
`observe` input uses the same schema. `page` observes fetched HTML, status,
redirects, canonical, robots directives, JSON-LD and a content hash. It does not
execute browser JavaScript. The original MCP page tool retains its additional
link, social-meta and contrast checks.

## CLI

```sh
pagesight --help
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
{"startDate":"2026-08-01","endDate":"2026-08-28","dimensions":["page"]}
```

```json
{
  "dateRanges":[{"startDate":"2026-08-01","endDate":"2026-08-28"}],
  "dimensions":[{"name":"eventName"}],
  "metrics":[{"name":"eventCount"},{"name":"keyEvents"}],
  "dimensionFilter":{"filter":{"fieldName":"hostName","stringFilter":{"matchType":"EXACT","value":"example.com"}}}
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

## Site snapshots

A config holds nonsecret provider IDs and the site's meaning:

```json
{
  "site":"https://example.com/",
  "productionHostname":"example.com",
  "gscSite":"sc-domain:example.com",
  "gaProperty":"123456",
  "sitemap":"https://example.com/sitemap.xml",
  "pages":["https://example.com/"],
  "context":{
    "objective":"Help visitors use the product",
    "successEvents":[],
    "excludedKeyEvents":[],
    "locale":"en-US",
    "country":"US",
    "routes":[{"pattern":"/","purpose":"Public entry","indexing":"index"}],
    "measurementCaveats":[]
  }
}
```

CLI snapshots default to 28 days ending Pacific today minus three days. Supply both
`--start YYYY-MM-DD` and `--end YYYY-MM-DD` to reproduce another interval. The API
requires explicit dates. The country and locale are context, not implicit filters.

A snapshot collects independent GSC property/page/query/date reports and sitemaps;
GA property/key-event configuration, unfiltered hostname census, production channels,
named events and organic landing reports; configured page fetches and GSC inspections;
and a sitemap inventory bounded to five same-origin XML files and 8 MB.
This inventory accepts ordinary unprefixed sitemap XML; unsupported prefixed or
compressed documents are reported as incomplete rather than empty coverage.

Snapshots embed the config used, observations, content hashes, requested/observed
dates and unknown deployment/reference identities. A failed observation remains
visible while successful data is retained. `doctor` probes GSC, GA Admin, GA Data
and live HTML. Run speed operations to probe PSI/CrUX separately.

Interpretation rules:

- GSC query privacy exclusions and aggregation differences mean row sums are not
  property totals. Missing rows are not zero. Comparisons are descriptive, not causal.
- GA key events must be interpreted by name and the site's selected objective.
  A hostname filter excludes development hosts but not internal use of production.
- Sitemap membership is not indexing. Google's `contents[].indexed` field is deprecated.
  URL inspections describe the selected URLs in Google's stored state, not live access
  or a statistically representative whole-site coverage rate.
- PSI is a lab run. CrUX NOT_FOUND is no record for that scope, not zero performance.
  CrUX history periods overlap. AI referrals do not establish citations.
- Keep raw landing query strings and observed canonicals. Functional URL parameters
  need site-specific interpretation; Pagesight does not silently join GA to GSC.

## Credentials

| Provider | Configuration |
| --- | --- |
| Search Console | `GSC_SERVICE_ACCOUNT_KEY`, or `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` |
| GA4 | `PAGESIGHT_GA_CREDENTIALS`, then `GOOGLE_APPLICATION_CREDENTIALS`, then the usual local gcloud ADC file |
| PageSpeed | `GOOGLE_API_KEY` optional |
| CrUX | `GOOGLE_API_KEY` required |

GA accepts service-account JSON or `authorized_user` ADC JSON. Use
`analytics.readonly` permission and grant property access. Enable both Analytics
Admin and Data APIs. GSC authentication remains separate with `webmasters.readonly`.
No new consent flow or provider settings are created by the read API.

Keep credentials in an environment file outside the repository and use Bun's
`--env-file` option. No tokens, API-key URLs, or provider error bodies are included
in report envelopes. Configuration files and operation requests must contain only
nonsecret identifiers and report parameters.

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

No arguments, or `pagesight mcp`, still start the stdio MCP server. Configure your
host to run `bun /path/to/pagesight/src/index.ts` with the environment above.

The new `observe` tool accepts `{ "request": <operation object> }` and returns
structured API evidence. The original six tools remain available:

| Tool | Capability |
| --- | --- |
| `audit` | PageSpeed, metadata, robots, sitemap processing errors and URL inspection |
| `page` | Metadata, links, JSON-LD checks, redirects and contrast |
| `speed` | PageSpeed and CrUX snapshots/history |
| `search` | GSC reports, sitemap metadata and selected URL inspection |
| `ai` | Robots and crawler-registry checks, llms.txt detection |
| `setup` | Existing GSC authentication helpers |

The legacy text tools do not invent indexed counts from deprecated sitemap fields,
extrapolate sample verdicts to the whole site, or treat missing comparison rows as zero.
Use `observe` for exact request/response evidence and pagination status.

## Development

Install with Bun 1.3.12 (`bun install --frozen-lockfile`). Vite+ 0.3.0 provides formatting, linting, type checks, and commit hooks. TypeScript 7.0.2 provides the standalone typecheck command.

```sh
bun run check       # Format, lint, and type checks
bun run typecheck   # Check all TypeScript files without emitting output
bun run test        # Existing Bun test suite
bun run format      # Apply formatting
bun run start       # Start the MCP server with Bun
```

Tests cover pagination and partial failures, metadata preservation, live fixture
fetching, CLI/HTTP/MCP parity, and the original robots/authentication behavior.

## License

MIT
