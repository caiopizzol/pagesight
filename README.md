<h1 align="center">Pagesight</h1>

<p align="center">
  Check your site's search traffic, analytics, and page performance.
  <br>
  Built for developers and AI assistants. Use the TypeScript API, CLI, local HTTP server, or MCP.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/pagesight"><img src="https://img.shields.io/npm/v/pagesight" alt="npm version"></a>
</p>

## Quick start

Requires [Bun](https://bun.sh). This page check needs no provider credentials:

```sh
bunx --bun pagesight page --url https://example.com
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

- [API, CLI, HTTP, and MCP](packages/pagesight/docs/usage.md)
- [Google and Bing credentials](packages/pagesight/docs/credentials.md)
- [Snapshots and comparisons](packages/pagesight/docs/snapshots.md)
- [Bing diagnostics, HTML images, and UI findings](packages/pagesight/docs/diagnostics.md)

MIT — see [LICENSE](LICENSE).

### Cloudflare edge and security evidence

Set `CLOUDFLARE_API_TOKEN` privately with read access to the selected zone's analytics.
Use the exact zone ID and hostname:

```sh
pagesight cloudflare audit --zone YOUR_32_HEX_ZONE_ID --hostname example.com \
  --start 2026-09-07T00:00:00Z --end 2026-09-08T00:00:00Z --limit 50 --out private-cloudflare.json
```

The shared `cloudflare.audit` operation is also available through HTTP and MCP `observe`.
It collects current dataset settings, HTTP groups ordered by count, and recent security
events in a half-open UTC interval of at most 24 hours. Each source retains its raw
GraphQL data and errors independently. The default limit is 50 rows per dataset
(maximum 100); reaching it means additional rows may exist. Empty results do not
establish zero traffic. Current settings expose availability and retention, and do
not prove the settings in effect during the requested historical interval.

Adaptive counts can be estimated: do not multiply them by `sampleInterval` or
interpret missing top results as vanished traffic. A user agent can be spoofed;
Cloudflare bot categories do not establish a specific search engine's indexing.
Edge and origin status differ, and origin status zero is not successful origin
access. These reports are not supported by Pagesight's GSC/GA comparisons or
conversion funnels. Paths omit query strings and must not be joined to query-bearing
analytics URLs. No client IP, query-string, cookie or authentication fields are
requested, but paths and user agents can still be sensitive; keep artifacts private.
The operation never changes DNS, cache, security or crawler settings.

Provider references: [sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/),
[limits](https://developers.cloudflare.com/analytics/graphql-api/limits/), and
[dataset settings](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/).

### Daily private observations

`technical.compare --current current.json [--baseline previous.json]` compares
exact requested HTML-page observations only when snapshot configuration matches.
It records status, redirect, canonical and robots changes; title, description and
HTML hash drift are informational. First runs and changed scopes establish a new
baseline. Availability failures and HTTP errors remain visible. Changes are not
automatically defects, and overlapping daily traffic windows are never compared.

For an external scheduler, the repository provides a finite runner:

```sh
bun --env-file /absolute/private.env scripts/observe-site.ts \
  --config /absolute/seo.config.json --state /absolute/private-state
```

The state directory must be private (0700). The runner writes unique dated run
directories with 0600 raw snapshot, alerts JSON/text and a manifest containing hashes,
source statuses and calendar windows. A lock serializes manual and scheduled calls;
a dead lock older than 40 minutes can be recovered. Malformed locks require
manual inspection: confirm no runner is active before removing `runner.lock`. The process has a 20-minute
maximum runtime. A timeout can leave an incomplete run and stale lock; inspect
those artifacts, not just the previous successful run. Missing UTC days since the
last usable snapshot are explicit gaps, never zero traffic.

Snapshots use the existing 28-day window ending three Pacific calendar days ago,
with one report page per source. Partial evidence is saved and can advance the
baseline; a provider-error snapshot does not replace it. Previous raw artifacts
are never overwritten. Daily windows overlap, so the alerts cover availability
and technical changes rather than traffic deltas. Weekly outcome analysis requires
separate, comparable windows. Exit 0 means collection completed, 3 means partial
or locked, and 1 means failure; inspect alerts independently of process status.

Use absolute paths in launchd/cron, pin a verified checkout, and redirect runner
stdout/stderr to private local files. After installation inspect scheduler state
and force one run, then read its manifest and alerts. A sleeping/offline laptop
cannot provide always-on collection; provider retention can prevent recovery of
missed windows. The runner sends no email, chat message or external notification.

For agents planning and verifying SEO improvements, follow the
[SEO agent workflow](docs/seo-agent-workflow.md): demand and content decisions,
site architecture, rendered-template/mobile checks, performance evidence,
authority research and a recurring observation cadence.
