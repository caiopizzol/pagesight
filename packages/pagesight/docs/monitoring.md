# Daily private observations

`pagesight technical compare --current current.json [--baseline previous.json]` compares
exact requested HTML-page observations only when snapshot configuration matches.
It records status, redirect, canonical and robots changes; title, description and
HTML hash drift are informational. First runs and changed scopes establish a new
baseline. Availability failures and HTTP errors remain visible. Changes are not
automatically defects, and overlapping daily traffic windows are never compared.

For an external scheduler, a Pagesight repository checkout provides a finite
runner (the runner script is not included in the npm package):

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
