# Pagesight

Pagesight helps developers and AI assistants check a site's search traffic, analytics,
and page performance. It reads Google and Bing APIs and web pages, then shows what
it found. You decide what to fix.

Use it through the [TypeScript API, CLI, local HTTP API, or MCP](packages/pagesight/docs/usage.md).

## What you can do

- Find Google properties and Bing sites, then check access.
- Read Search Console, GA4, and Bing reports.
- Inspect HTML, metadata, images, indexing, and Bing crawl and link data.
- Check PageSpeed lab results and CrUX data from real visits.
- Save site snapshots and compare supported Google reports.
- Check robots rules and `llms.txt` with MCP `ai`.
- Import UI findings as attributed, unverified evidence.

See [credentials](packages/pagesight/docs/credentials.md),
[snapshots and comparisons](packages/pagesight/docs/snapshots.md), and
[Bing, images, and UI findings](packages/pagesight/docs/diagnostics.md) for details.

## What to expect

Pagesight reads data. It doesn't edit or deploy sites, submit indexing requests,
change provider settings, or promise more traffic. There's no hosted dashboard or
scheduler. The HTTP server runs locally and requires a bearer token.

Provider reports need credentials and property access. A site-only snapshot doesn't.
PageSpeed works without a key; CrUX needs one.

Page checks read HTML without running browser JavaScript. Image, JSON-LD, and
contrast checks aren't a full accessibility audit. Robots rules don't prove a bot
visited or followed them, and Pagesight doesn't measure AI citations.

Comparisons cover compatible GSC and GA snapshot reports with equal-length,
nonoverlapping periods. They don't compare Bing data or explain why values changed.
Bing traffic periods come from Bing; complete coverage and reporting timezone remain unknown.
Imported UI findings aren't fetched or verified.

## Read the results with context

The shared API keeps raw data, limits, and failures. One failed provider doesn't erase
other results. Missing rows aren't zero, a sitemap entry isn't proof of indexing,
and a GA key event isn't automatically a business outcome. Finishing pagination
doesn't prove complete coverage.

CLI, HTTP, and MCP `observe` share the same API. The six older MCP tools use separate
code and text output, so results can differ. Some checks use rules of thumb, and
`audit` can omit a crawler-registry failure. A clean report doesn't mean every check ran.

[Tests](packages/pagesight/__tests__) cover behavior with fixtures and mocks;
[CI](.github/workflows/ci.yml) checks formatting, types, and tests. Neither proves live
provider access.
