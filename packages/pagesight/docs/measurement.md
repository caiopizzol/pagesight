# Understand and verify analytics

Start by checking whether the measurements answer the site's objective. A working
Google connection and a high key-event count do not establish successful visits.

## Read a snapshot

Collect evidence, then produce a readable assessment:

```sh
pagesight snapshot --config seo.config.json --out observations/baseline.json
pagesight assess --snapshot observations/baseline.json --format text --max-rows 5
pagesight assess --snapshot observations/baseline.json --out observations/assessment.json
```

`assess` makes no provider calls. It reads a version-1 saved snapshot and returns
structured findings, selected report rows, scope, source observation names and
limits. The optional text format renders those same facts. Its snapshot hash
identifies normalized JSON, not original file bytes or verified provenance.
Older snapshots without versioned, named observations must be recollected.

The assessment separates GA-configured key events, observed event counts,
caller-designated `context.successEvents`, and `context.excludedKeyEvents`.
Designation is not independent validation. Exclusions label rows; they never
remove raw evidence. An event's name or ratio of key events to events does not
establish its trigger, business meaning, or whether tracking is duplicated.

The report tables include GSC property/page/query evidence and GA hostname,
production channel/event, and organic landing/event evidence when available.
Each table shows its original dimension and metric names. Rows are ordered by
the first metric, then row keys; only the requested number are displayed. They
are observed rows, not exhaustive search rankings. No totals are inferred by
summing session, user, page or query rows. Bing and page observations retain
provider status but have no generated performance conclusions in this version.

A missing or unusable selected report produces an explicit unknown. Unrelated
hostnames in the census do not invalidate correctly production-filtered reports;
filtering to production also does not identify the owner's visits there. Supplied
snapshot claims are not authenticated again. A successful assessment is not a
certificate of healthy tracking.

## Check recent activity

Save this request as `realtime.json`:

```json
{
  "dimensions": [{ "name": "eventName" }],
  "metrics": [{ "name": "eventCount" }],
  "minuteRanges": [{ "startMinutesAgo": 29, "endMinutesAgo": 0 }],
  "limit": 100
}
```

```sh
pagesight ga realtime --property 123456 --request realtime.json --out observations/realtime.json
```

The equivalent API request is
`{ operation: "ga.realtime", property: "123456", request: ... }`. HTTP and MCP
`observe` accept it too. It uses the existing read-only GA credentials.

Realtime is a moving window, normally the last 30 minutes. Analytics 360 permits
up to 60 minutes; ranges beyond 29 minutes ago are left for Google to authorize.
Two ranges may overlap and count the same event in both. Supported dimensions
and metrics differ from historical reports; Google validates requested fields.
No production hostname filter is automatically added. Do not assume historical
filters such as `hostName` are supported in Realtime.

The API has no offset or page token. When `rowCount` exceeds returned rows,
Pagesight marks the result partial with `nextOffset: null`; narrow the query or
raise `limit` (maximum 250,000). Empty results do not prove collection failed.
Realtime is deliberately excluded from period snapshots and comparisons.

Historical `ga.report` results warn when collected fewer than three property
calendar days after any requested end date. Unknown timezone means freshness
cannot be assessed. This is a precaution, not a promise that older data is final:
Google describes typical processing of 24–48 hours, possible late arrivals and
later attribution changes. Read collection times and warnings alongside counts.

## Verify a real user flow

Keep separate evidence for each stage:

| Stage                     | Evidence                                                              | What it establishes                                                            |
| ------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Provider access           | `doctor`                                                              | Credentials can read the selected properties                                   |
| Browser emission          | DevTools network capture                                              | The browser attempted to send an event                                         |
| Endpoint response         | Response to that exact request                                        | The endpoint responded; event acceptance or processing is not established      |
| Recent reported activity  | `ga realtime`                                                         | Matching aggregate property activity appeared; not attribution to your test    |
| Stored reported activity  | `ga report`                                                           | Rows exist for the requested dates and filters; recent data may still change   |
| Validated product outcome | Observed user action plus event definition and corroborating evidence | The event represents the site's intended useful action within the tested scope |

1. Define a small case with its expected events: for example, open an explorer,
   change one brand filter, open a result, then view its history. Include the
   expected page URLs, event names and counts. State the browser, observation
   window and whether the test is on production. Production tests generate traffic.
2. Run `doctor`, then capture a Realtime report as context. Perform the case in
   an isolated browser session while recording network requests and responses.
   Capture all relevant collection destinations, not just one assumed hostname.
3. Inspect event names, destination measurement ID, URL and duplicate requests.
   Distinguish one action from automatic history events, retries and unrelated
   requests. Record the actual results; do not infer them from aggregate ratios.
4. Query Realtime again and a historical report with explicit dates and production
   filters after allowing processing time. Other visitors may contribute to both.
   Do not manufacture event names or claim session-level attribution from totals.
5. Save a small attributed finding using the existing import format. Raw captures
   may contain cookies, client/session IDs, tokens or sensitive URL parameters;
   keep them private and transcribe only the fields needed to explain the result.
6. Repeat the same case after a tracking change. Record both evidence sets and
   the deployed version. Pagesight itself does not edit tags or provider settings.

Example `verification.json` (illustrative, not a completed test):

```json
{
  "provider": "ga",
  "site": "https://example.com/",
  "source": {
    "kind": "manual",
    "label": "Explorer brand-change browser check",
    "capturedAt": null,
    "scannedAt": null,
    "coverage": "One browser session and one filter change; timestamps not supplied"
  },
  "findings": [
    {
      "rule": "One filter change attempted two page_view requests",
      "severity": "unknown",
      "urls": ["https://example.com/explore"],
      "notes": "Expected one request. Both requests received HTTP 204. Their presence in aggregate GA reports does not identify this test session. See the private capture for timing and destination."
    }
  ]
}
```

```sh
pagesight evidence import --request verification.json --out observations/verification.json
```

The import remains `user-import` with `verification: "unverified"`: Pagesight
stores the attribution but does not replay the flow, fetch a capture or verify
its claims. It is separate from `assess`; imports cannot silently upgrade snapshot
facts or turn an unverified assertion into a provider result.

References: [Realtime REST API](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runRealtimeReport),
[Realtime dimensions and metrics](https://developers.google.com/analytics/devguides/reporting/data/v1/realtime-api-schema),
[GA data freshness](https://support.google.com/analytics/answer/11198161).

## Connect organic landings to observed actions

Snapshots now include `ga.report.landingPagePlusQueryString+sessionSource+eventName.organic`:
raw landing path/query string, session source and event name with `eventCount`,
filtered to the configured production hostname and `Organic Search` sessions.
It uses the same date window and bounded pagination as other snapshot reports.
`assess --format text` exposes the rows and scope; `compare` compares common rows
in compatible saved snapshots. Older snapshots lack this report: assessment marks
it unavailable and comparison retains absence as unknown, never zero.

An agent can inspect a meaningful event such as `price_detail_view` alongside
`ga.report.landingPagePlusQueryString+sessionSource.organic`, which retains landing
traffic. The event table associates occurrences with the session's first pageview,
not necessarily the page where the event happened. Repeat occurrences are possible;
these counts are not unique sessions, a funnel, or a conversion rate. An event
name does not establish its business meaning. Keep instrumentation/deployment dates
in the investigation record before interpreting before/after changes.

Use raw GA landing paths as evidence. Query strings, `(not set)` and `(other)` remain
visible. Do not automatically join them to Search Console's canonical page URLs,
reconcile GSC clicks with GA sessions, or infer SEO causality. High-cardinality
landing/event combinations may be partial, sampled, thresholded or aggregated;
check pagination and metadata. Default assessment row caps may hide the event of
interest: increase `--max-rows`, inspect the saved report, or use `ga report` with
an explicit event filter. Empty or missing event rows, especially shortly after
instrumentation, do not prove zero activity or broken collection.

Source: [Google's Data API schema](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
defines landing page as the first pageview in a session and event count as occurrences.
