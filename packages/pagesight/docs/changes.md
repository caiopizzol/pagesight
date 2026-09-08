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

## Plan follow-ups across saved experiments

Create a private `experiments.json` array. Paths are relative to that manifest's
folder; omit `current` until you have collected an after snapshot.

```json
[
  {
    "label": "Vehicle title",
    "record": "change.json",
    "baseline": "before.json",
    "current": "after.json"
  }
]
```

```sh
pagesight change followup --manifest experiments.json --format text
pagesight change followup --manifest experiments.json --lag-days 3 --out followup.json
```

API, HTTP and MCP use `{ "operation": "change.followup", "experiments": [...] }`
with embedded record and snapshot objects instead of paths. The batch accepts
1–50 entries; HTTP additionally limits the entire body to 32 MB, so large saved
snapshots may require smaller batches. Invalid entries and unreadable files stay
visible independently. Optional `asOf` is a UTC timestamp no later than now;
artifacts collected after it and deployments after it are invalid.

Each report has one of four states:

| State               | Next action                                                                           |
| ------------------- | ------------------------------------------------------------------------------------- |
| `waiting`           | Wait until its next collection date, then collect the explicit window.                |
| `ready_to_collect`  | Collect missing after evidence or replace an artifact collected before its buffer.    |
| `ready_to_evaluate` | Run `change evaluate` on the saved pair and inspect descriptive results and warnings. |
| `blocked`           | Inspect its reason and source diagnostics; more elapsed time alone does not fix it.   |

The suggested window starts the day after deployment in the report's timezone
and matches the baseline's inclusive duration. Collection defaults to three
calendar days after its end; `lagDays` accepts 1–30. This is a planning buffer,
not a provider SLA or proof of finalized data. The JSON exposes exact
`proposedWindow.startDate`, `endDate`, `collectOn` and `timezone`. Use those dates
explicitly, with the baseline's original configuration:

```sh
pagesight snapshot --config seo.config.json --start 2026-09-09 --end 2026-10-06 --out after.json
```

One snapshot has one date window. If report timezones produce different proposed
windows, collect each distinct window separately and use separate manifest entries
for the relevant reports, or choose one equal-duration window starting after all
provider-local deployment days and collect after every provider's buffer. The
latter may differ from proposed dates; supplied snapshots are checked on their
actual windows and saved collection dates. A report collected before its buffer
remains `waiting` until that date, then `ready_to_collect` until recollected;
time passing cannot mature a saved artifact. Do not rely on snapshot date defaults.
Keep each saved snapshot intact; editing its context does not change the underlying report scope.

GA tracking changes between baseline start and after end block that experiment;
a later snapshot or baseline cannot repair the historical comparison. Establish
a stable baseline for a future deployment instead. Unsupported daily time-series
reports remain blocked because they require an alignment policy. Missing providers
are not inferred: only configured or observed Google report names are listed.
Context changes, declared overlaps, source hashes, warnings and provider errors
remain visible in JSON. An entry can have both useful reports and blockers; the
`planned` entry state is not a success judgment. The envelope is `partial` (CLI
exit 3) while any report is waiting, missing or blocked, or any entry is invalid.

This operation reads saved artifacts. It does not collect data, update a scheduler,
send notifications, or establish an SEO effect.
