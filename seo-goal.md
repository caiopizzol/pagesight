# Standalone agent SEO evidence

Status: active. This is the authoritative continuation of the completed initial
API increment, previously recorded in the initiating site's local goal file.
The user deferred that site's integration; all current work belongs in Pagesight.

Outcome: extend the shared Pagesight API with standalone provider setup, read-only
Bing Webmaster reporting, and careful snapshot comparison, publishing each verified
increment as a dependent PR. CLI, MCP and HTTP remain thin adapters. Never merge.

## Completion criteria

- [x] Existing API foundation implemented in PR #2 (`41f462b` locally), rebased onto Vite+ tooling. Eight valid review findings fixed; 67 tests and Vite+ checks pass before the setup layer.
- [x] Site-only, GSC-only and GA-only configs work; selected provider failures remain
      visible and unselected providers are explicitly identified. Old configs still work.
- [x] Discovery returns provider candidates and a usable nonsecret starter config
      without silently selecting a property. All interfaces share API behavior.
- [x] Bing read-only site discovery and documented traffic reports preserve raw
      responses, scope, limits, and safe errors; tests verify documented JSON contracts.
- [x] Snapshot comparison validates compatible evidence and produces descriptive
      changes without invented zeros, exhaustive coverage, or causal conclusions.
- [x] Each increment has focused tests, appropriate checks, usage documentation,
      resolved consultation findings, and a PR in a verified dependent stack.

## Scope and constraints

Bun/TypeScript, existing API conventions, and backward compatibility for current
configurations and MCP startup. No provider settings, index submissions, tracking
tags, automated SEO changes, AI-citation claims, or initiating-site integration.
Keep credentials and raw live reports out of this public repository. A missing
provider credential limits live verification; do not manufacture successful access.

## Sequence and evidence

1. `feat/standalone-setup` on `feat/seo-cli`: optional providers, discovery and
   standalone usage; ensure CI also runs for stacked PR bases.
2. `feat/bing-reports`: official Bing Webmaster JSON API and snapshot integration.
3. `feat/snapshot-comparison`: compatible snapshot evidence comparisons.

PR #2 remains the foundation. `gh stack` locally adopted it with trunk `main`.
All new layers will be checked and published as the implementation completes.
Expected writer: `caiopizzol` from repository Git config.

Consultation uses the existing Claude reviewer session
`357146f4-7fb4-4a86-b85e-12a7ef81dc33`. Its prior findings about credential provenance,
safe errors, date validation, and independent failures were verified and implemented.
The next design question is saved at `/tmp/pagesight-next-increments-review.md`.
No Bing credential variable was found in the process or shared agent env-file keys.
Standalone setup implemented; 64 tests and source typecheck pass. Page-only fixtures
exercise the API without Google auth, selection tests cover GSC-only/GA-only plans,
and discovery retains a successful provider alongside a failed one. Snapshot response
version and stable unique observation names support later comparison. Old full-config
tests still pass. The reviewer correctly identified generic wording, empty aggregates,
and property-selection ambiguity; these were corrected. No property is auto-selected.
The existing doctor GSC request retains its configured auth method; a broader credential
identity redesign is not needed for this layer. Next: live standalone smoke, final checks,
commit this layer, then Bing.

Standalone setup rebased onto the corrected foundation. Raw GSC discovery envelope
adapted with a regression test. Live discovery previously returned eight GSC and
one GA candidate; no IDs auto-selected. Private evidence is outside the repository.
Foundation push must retain the original remote guard d5fd56d7843259e9fe9a3200158f161a31e4dc98.
Next: publish foundation fixes and setup, then implement Bing and comparison.

Bing layer: four documented read operations, explicit optional discovery and snapshot
selection. 76 Bun tests pass; Vite+ has zero errors. Official Microsoft Learn JSON
examples back fixture tests. No live Bing credentials; this limits live verification.
Setup published at PR #4 in managed GitHub stack #5. The stack tool disabled PR #2
user-enabled auto-merge because stacks do not support it; no PR merged.

Bing consultation accepted after independent verification: retain documented numeric
ApiFault.ErrorCode safely, preserve credential-source metadata and document verbatim
registered URLs. Unknown timezone/raw Date strings need no invented metadata type.
Doctor traffic access is sufficient for the selected site; speculative null-response
handling and extra credential probes are deferred without live evidence.
Foundation and setup rebased onto TypeScript 7 main; 76 tests remain passing.

Foundation PR #2 and setup PR #4 were externally merged by caiopizzol on
2026-09-08 at 00:59:55–56 UTC. GitHub rebased Bing PR #6 onto main; local work
follows its current head 846ce4b without overwriting remote changes.
Comparison implementation: versioned snapshot validation, same-site report matching,
equal disjoint periods, request and metadata compatibility, raw values/common rows,
explicit unsupported observations and unknown missing rows. API/CLI/HTTP/MCP
transport parity tested, including a >1 MB pair. 87 tests, TS7 and Vite+ pass.
Final consultation findings addressed; next publish comparison layer and finish owner
monitoring for the active stack. No live Bing credential available.

Comparison consultation findings verified and addressed: typed snapshot date context,
trailing GSC dates and recent GA collection become limitations; canonicalSha256 labels
validated-object provenance rather than file bytes; summary counts expose incompatible
and unsupported outcomes. Time-key guard includes cyclic dimensions. Observed-only
keys stay useful evidence with explicit names and unknown absence rather than being
hidden for truncated reports. Missing provider aggregation remains incompatible rather
than inferred. Added unsafe decimal/underflow regressions independently of the review.

Final comparison verification: 89 Bun tests pass, TypeScript 7 and Vite+ checks pass
with four warnings in unchanged legacy tool code. Package archive built successfully.
Comparison changes are ready for a dependent PR above Bing #6.

All three increments are published in verified managed GitHub stack #5:

- #2 API foundation (merged externally), #4 standalone setup (merged externally).
- #6 Bing reports: https://github.com/caiopizzol/pagesight/pull/6
- #8 comparison: https://github.com/caiopizzol/pagesight/pull/8 (base feat/bing-reports).
  Implementation and publication criteria are met. Remaining work is external review
  monitoring of #6 and #8 plus any verified findings. PR6 owner found no current issue;
  89 final tests and package-import smoke pass at the top layer. No initiating-site
  integration was added, and no live Bing access has been claimed.

PR #8 owner validation reproduced two malformed-import failures: duplicate GA metric
names silently replaced values, and pagination counts/offsets could contradict the
retained rows while reporting a comparison. Both now return incompatible with
focused regressions. All 91 Bun tests, TypeScript 7 and Vite+ pass (four unchanged
legacy warnings). CI passed on the assigned remote head; Cubic review was queued.
These owner fixes still require publication and review at their new head.
