# Provider diagnostics and imported findings

## Bing crawl, URL and backlink evidence

```sh
pagesight bing crawl-stats --site https://example.com/
pagesight bing crawl-issues --site https://example.com/
pagesight bing url-info --site https://example.com/ --url https://example.com/page
pagesight bing link-counts --site https://example.com/ --max-pages 4
pagesight bing url-links --site https://example.com/ --url https://example.com/page --max-pages 4
```

These read operations use `BING_WEBMASTER_API_KEY` and the registered site URL.
They expose Microsoft's `GetCrawlStats`, `GetCrawlIssues`, `GetUrlInfo`,
`GetLinkCounts` and `GetUrlLinks` JSON methods. Link reports start at page zero;
`maxPages` defaults to one and accepts 1–20. Hitting the limit returns partial
status (CLI exit 3); raise the limit to repeat from page zero. `nextOffset` is a
provider page number. Failed later requests preserve successful pages. Changing
`TotalPages` stops pagination with partial coverage.

Raw provider dates and counts stay intact. Do not derive daily error rates without
verifying their periods and units. `HttpStatus: 0` in URL metadata is not an HTTP
success. Link report exhaustion does not establish a complete backlink inventory;
empty rows are not zero links, and link counts do not measure domain quality.
`InIndex` and sitemap counts have different scopes. Crawl issues are not the UI
recommendations list. These operations are explicit reads; existing snapshot
provider selection and call counts are unchanged.

## HTML image evidence

`pagesight page --url https://example.com/` now includes `descriptionLength`
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

## Import provider UI findings

Use a small JSON transcription when a UI report has no verified API equivalent:

```json
{
  "provider": "bing",
  "site": "https://example.com/",
  "source": {
    "kind": "csv",
    "label": "Affected URLs export; rule copied from report screen",
    "capturedAt": null,
    "scannedAt": null,
    "coverage": "Only affected URLs were exported; total site coverage unknown"
  },
  "findings": [
    {
      "rule": "Meta descriptions are too short",
      "severity": "unknown",
      "urls": ["https://example.com/explore"]
    }
  ]
}
```

```sh
pagesight evidence import --request findings.json --out imported.json
```

This validates JSON, preserves its attribution and labels it `user-import` and
`unverified`. It does not parse screenshots/CSV automatically, contact the provider,
fetch listed URLs or verify the finding. Use null for unknown capture/scan dates;
known dates must be ISO timestamps with offsets. Do not infer severity from a
URL-only CSV. Sources can be `csv`, `screenshot` or `manual`; providers can be
`bing`, `gsc` or `other`. An optional `source.artifactSha256` is caller supplied,
not verified. The generated `normalizedDocumentSha256` identifies normalized JSON,
not original file bytes. Import at most 100 findings and 1,000 URL references.

All additions use the shared API: operation names are `bing.crawl-stats`,
`bing.crawl-issues`, `bing.url-info`, `bing.link-counts`, `bing.url-links`, and
`evidence.import` (with a `document` field). They are also available through HTTP
`POST /v1/query`, CLI `api --request`, and MCP `observe`.
