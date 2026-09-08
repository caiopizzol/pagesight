# Snapshots and comparisons

## Site snapshots

A minimal config needs only a site:

```json
{ "site": "https://example.com/" }
```

It collects that page without Google credentials. Add `gscSite` or `gaProperty`
to select those providers independently. Omitted providers appear as `not_selected`;
a selected provider that fails produces error evidence. `sitemap` is opt-in, and
`pages` defaults to the site URL. `productionHostname` defaults to its hostname.
Existing full configurations still work. Context defaults identify unspecified
objectives, locale and country rather than inferring them.

`discover` lists candidates from the selected Google providers and returns a usable
site-only config in `pages[0].response.config`. Copy that object to a config file,
then add the property IDs you verified. It does not automatically select properties:
GA account display names are not proof of hostname ownership. Discovery failures
remain independent; inspect raw responses and `nextPageToken` for incomplete lists.

A config holds nonsecret provider IDs and the site's meaning:

```json
{
  "site": "https://example.com/",
  "productionHostname": "example.com",
  "gscSite": "sc-domain:example.com",
  "gaProperty": "123456",
  "sitemap": "https://example.com/sitemap.xml",
  "pages": ["https://example.com/"],
  "context": {
    "objective": "Help visitors use the product",
    "successEvents": [],
    "excludedKeyEvents": [],
    "locale": "en-US",
    "country": "US",
    "routes": [{ "pattern": "/", "purpose": "Public entry", "indexing": "index" }],
    "measurementCaveats": []
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
when selected, plus live HTML. Run speed operations to probe PSI/CrUX separately.
Snapshot responses carry `snapshotVersion: 1` and stable observation `name` values,
also present in the summary, so identity does not depend on array position.

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

## Compare saved snapshots

Capture two snapshots with the same config and equal-length, nonoverlapping report
periods, then compare them locally:

```sh
pagesight snapshot --config seo.config.json --start 2026-07-04 --end 2026-07-31 --out before.json
pagesight snapshot --config seo.config.json --start 2026-08-01 --end 2026-08-28 --out after.json
pagesight compare --baseline before.json --current after.json --max-rows 100
```

The shared operation is `{ operation: "compare", baseline, current, maxRows: 100 }`,
where baseline and current are parsed snapshot evidence objects. Only the CLI reads
file paths. HTTP accepts objects up to 32 MB per request; larger pairs can use the
local API or CLI. MCP `observe` accepts the same object. `evidenceSchema` and
`snapshotEvidenceSchema` are exported for callers validating stored reports.

This first comparison supports GSC reports with non-time row keys and GA reports
using snapshot dimensions: `hostName`, `sessionDefaultChannelGroup`,
`sessionSourceMedium`, `eventName`, `landingPagePlusQueryString`, and `sessionSource`.
Reports without dimensions are also supported. Other GA dimensions and
`dimensionExpression` aliases require a separate comparison policy. It checks
snapshot format version 1, unique observation names, site, property, dimensions,
metrics, filters, aggregation, report periods and GA timezone/currency/metric types.
GSC data must be finalized. Time dimensions, Bing's provider-defined windows, HTML,
sitemap and provider metadata observations are explicitly unsupported for comparison.
Recapture snapshots created before versioned, named observations were introduced.

Each observation is `compared`, `limited`, `incompatible`, `unavailable`, or
`unsupported`. The outer evidence reports whether the comparison operation ran;
inspect the response status-count summary and per-observation statuses before using deltas. Partial pagination,
sampling, thresholding and high-cardinality aggregation remain visible limitations.
Missing trailing GSC date rows and recently collected GA data also mark comparisons
as limited; observed dates cannot prove complete coverage.
Only keys observed in both periods get numeric deltas. Keys seen in one period stay
unknown in the other, and their bounded lists include full counts. No row sums or
site-wide extrapolations are generated. Each row retains the original numeric values,
including GA strings; invalid or unsafe numbers get a null delta. Percent change is
null when the baseline is zero. CTR and position remain in their provider units.

`maxRows` defaults to 100 and is capped at 1,000 per observation/list; omitted counts
are explicit. The comparison includes `canonicalSha256` hashes of validated source objects, with
object keys sorted lexically and array order retained. These identify comparison
inputs, not raw file bytes; whitespace changes in saved JSON do not change them. Keep source snapshots for their full requests,
responses and metadata. Changes are descriptive and do not establish that an SEO
edit caused traffic changes; Pagesight does not apply SEO edits automatically.
