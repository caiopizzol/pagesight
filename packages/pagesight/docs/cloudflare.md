# Cloudflare edge and security evidence

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
