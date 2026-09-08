# Track an SEO change without claiming causality

Keep a private JSON change record and saved snapshots from before and after a
verified deployment. `change.evaluate` checks report scope and calendar windows;
it does not execute the change or verify the supplied deployment timestamp.

```json
{
  "schemaVersion": 1,
  "id": "vehicle-title-20260908",
  "site": "https://example.com/",
  "affectedUrls": ["https://example.com/vehicle"],
  "description": "Clarified the vehicle page title",
  "hypothesis": "Searchers can better identify the model and price reference",
  "deployedAt": "2026-09-08T15:00:00Z",
  "expectedSignal": "Inspect query clicks and organic landing engagement",
  "measurementChanges": [],
  "overlappingChanges": []
}
```

Each context-change entry is `{ "at": "2026-09-08T15:00:00Z", "description": "Tracking repair" }`.
Record tag, consent, event-definition or property changes in `measurementChanges`;
other deployments or campaigns belong in `overlappingChanges`. Empty arrays are
explicit supplied context, not proof that no other change happened.

```sh
pagesight change evaluate --record change.json --baseline before.json --out pending.json
pagesight change evaluate --record change.json --baseline before.json --current after.json --out evaluation.json
```

The first command reports pending evidence and deployment days per usable report.
Choose equal-length windows ending before and starting after deployment day in
each provider's reporting timezone. Search Console uses Pacific calendar dates;
GA uses its response timezone. Instrumentation changes inside the combined GA
periods withhold GA deltas. Missing or incompatible reports remain explicit.
Reports retain freshness, thresholding, sampling and missing-row limitations.

Affected URLs are annotations: they do not filter or join snapshot rows. The
original property/hostname/channel scope remains in force. Context changes are
reported, and overlapping changes confound interpretation. Equal windows still
need weekday and seasonal interpretation; returned gap days and start weekdays
help assess that. Source and record hashes identify supplied artifacts, not their
authenticity. No ranking uplift, causal attribution, statistical significance or
success/failure judgment is produced. Cloudflare, Bing, HTML, crawl graphs and
inspection results are not compared by this operation. Both snapshots use the
strict configured-snapshot schema; API, CLI, HTTP and MCP share the operation.
