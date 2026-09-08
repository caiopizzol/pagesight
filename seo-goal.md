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
- [ ] Snapshot comparison validates compatible evidence and produces descriptive
      changes without invented zeros, exhaustive coverage, or causal conclusions.
- [ ] Each increment has focused tests, appropriate checks, usage documentation,
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
