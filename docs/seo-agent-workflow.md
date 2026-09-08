# Agent SEO workflow

Pagesight supplies evidence for decisions. Run this loop on a small cohort before
expanding it: establish access and measurement context, identify a question,
inspect the relevant pages, propose one change, verify the deployment, and collect
a comparable later window. Keep raw evidence private with dated filenames.

## Establish access and meaning

Run `pagesight doctor --config seo.config.json`. Verify the exact GSC property,
GA property and production hostname. Distinguish access failures from empty
reports. Define named meaningful events in project context, including introduction
dates and tracking changes. A configured key event is not a validated conversion.
Test the event against a real action and check provider data separately from the
browser request. Realtime activity cannot identify an individual test session.

GSC measures search visibility, GA measures collected activity, and edge analytics (Cloudflare)
sample edge requests. They have different omissions, timezones and units. Never combine
them into a conversion funnel or SEO score. Review access when a provider fails;
do not request broader credentials unless a specific read requires them.

## Find demand and decide what deserves investigation

1. Save a snapshot for a finalized reporting interval. Run `opportunities` against
   it, then `investigate` for one exact candidate URL. Inspect page-filtered queries,
   device/country mix, Google's stored inspection and current HTML. Property query
   totals cannot establish which queries led to a particular page.
2. Read query intent and the page together. Separate model/reference-price lookup,
   purchase intent, historical comparison, and unrelated queries. Low observed CTR
   alone does not establish a poor snippet; position and intent matter. Missing
   queries may be anonymized, and absent rows are not zero demand.
3. For wording or market questions, compare 2–5 terms in one Google Trends chart:
   same country, period, category, search type and term/topic type. Save the chart
   URL, capture time, accessible table, relative averages, equal-window direction
   and relevant related searches. Exclude the unfinished current week when comparing
   complete weeks. Trends is relative interest, not search volume; rounded zero and
   Breakout do not quantify demand. Check product/data coverage before acting on a
   rising query.
4. Inspect a bounded set of actual search results when intent or competing content
   remains uncertain. Save query, country/language, device, date, result URLs and
   observed features. Personalized samples are not stable rank tracking. A paid
   SERP provider is justified only for repeatable geographic/device coverage that
   the current question needs; record cost/coverage before subscribing.
5. Make a short brief: exact question, source pointers and dates, existing useful
   content, missing user answer, proposed page/cohort, verification plan, caveats.
   Improve a relevant existing page before creating overlapping pages. Similar
   keyword wording alone is not evidence of cannibalization; inspect query/page
   overlap, intent and canonicals before consolidation.

## Discovery, architecture and technical policy

Use bounded site discovery to inspect real HTML links, redirects, canonical edges,
robots policy, sitemap samples and link depth from selected seeds. Depth is measured
in that sample; sitemap membership does not establish internal links or a true
orphan. Prioritize broken paths from important hubs and useful links to relevant
content. Verify source and destination before adding links. Avoid site-wide
keyword anchors and mechanically linking every page to every other page.

Keep indexable, filtered, legacy and account-only routes explicit in project
context. A noindex diagnostic can be intentional. Check sitemap dates against
actual publication and content/reference versions; a future lastmod is not proof
that the underlying data is wrong. Validate structured data against visible facts:
reference prices are not inventory offers; do not invent availability, reviews,
shipping or merchant claims merely to satisfy a validator.

## Rendered-template and performance verification

Select one known URL per important template, plus an intentional noindex or
functional-filter example. Record browser, viewport, capture time, URL and navigation
path (direct load versus client navigation). Run `pagesight page --url URL` to save
server-HTML evidence. In an available browser tool, inspect the rendered page and
record the same metadata and headings with this read-only DOM expression:

```js
({
  url: location.href,
  title: document.title,
  canonical: [...document.querySelectorAll('link[rel="canonical"]')].map((e) => e.getAttribute("href")),
  robots: [...document.querySelectorAll('meta[name="robots"]')].map((e) => e.getAttribute("content")),
  description: document.querySelector('meta[name="description"]')?.getAttribute("content"),
  h1: [...document.querySelectorAll("h1")].map((e) => e.textContent),
  jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map((e) => e.textContent),
  linkCount: document.querySelectorAll("a[href]").length,
});
```

HTTP status, final URL, redirects and X-Robots-Tag come from the Pagesight page
response, not this DOM expression.

Retain exact values; distinguish duplicate tags, absent directives and legitimate
URL variants. Compare with the independently fetched HTML, noting timing/version
differences. Exercise one internal navigation and relevant filter state: confirm
URL, heading, content and metadata update together. Verify actual links, price or
other primary content, and a representative mobile viewport. Inspect a screenshot
and document overflow; a string search can miss nonbreaking spaces and does not
prove visibility. Check console errors without treating unrelated third-party
warnings as demonstrated indexing failures. Restore temporary viewport overrides.

Save raw browser observations/screenshots where the tool supports export. If export
is unavailable, retain the tool transcript and label manually transcribed artifacts;
do not claim they are original screenshots. Browser findings may be imported using
`evidence.import` with provider `other`, exact sampled URLs, capture time, coverage
and source label. Imports remain unverified by Pagesight. Avoid cookies, client IDs,
full tracking payloads and private browser data in shared artifacts.

Run `speed psi --url URL --strategy mobile` for lab evidence and `speed crux --url
URL` (or `--origin`) for field evidence. Save requests, collection windows, device
and response failures. PSI variability calls for repeated comparable lab conditions
when diagnosing a specific issue. CrUX no-record means unavailable evidence for
that scope. A visible fast load is not a Core Web Vitals measurement. Neither
successful rendering nor crawler permission proves Google indexed the page.

## Authority and trustworthy content

Start with first-party provenance, clear methodology, reference/publication dates,
limitations, ownership/contact and useful primary data. Cite original sources and
explain what the product adds. Inspect GSC's Links UI/export or Bing link reads when
available, retaining their coverage and dates. GSC Links has no supported Pagesight API endpoint; import its UI/export findings
with `evidence.import`, preserving dates and coverage. Existing API access does not imply
access to every UI-only report. If a competitor backlink question needs a third-party
index, specify the domains, export limits and cost first; different indexes are not
an exhaustive census and their authority scores are not Google ranking metrics.

Turn unique useful data or research into a concrete resource relevant publishers
can cite. Verify real mentions and source pages before proposing outreach. Drafting
an outreach idea does not authorize sending it. Avoid paid link schemes, bulk
unrelated guest posts and fabricated expertise or reviews.

## Cadence and decisions

- Daily: access/collection failures and technical regressions in a fixed small
  cohort. Keep errors and missed-run gaps; do not overwrite the last good evidence.
- Weekly: finalized GSC/GA opportunities, page/query intent checks and one small
  prioritized improvement with evidence and effort described in plain terms.
- Monthly or on reference-data publication: verify date/provenance accuracy,
  sitemap policy, template consistency, internal-link coverage and useful content.
- After deployments: run rendered/technical checks immediately; record deployment,
  measurement and overlapping changes; compare later equal windows with proper
  timezone and instrumentation gates. Leave outcomes pending or inconclusive when
  evidence is not available. No unsupported uplift claims.

Use an external scheduler for recurring collection, with bounded runs and private
credentials/artifacts. Record successful run times and failures separately from
traffic. Alerts should cite exact observations and changes; missing capped rows
cannot establish a disappearance. Provider retention can make a missed collection
unrecoverable. A scheduler on a sleeping/offline laptop is not an always-on service.

Further guidance: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide),
[helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content),
[structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies),
and [Google Trends data](https://support.google.com/trends/answer/4365533).
