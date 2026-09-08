# Standalone agent SEO evidence

Status: implementation and publication criteria complete. This is the authoritative
continuation of the initial API work. The initiating site's integration remains
deferred; all work in this record belongs to Pagesight.

## Objective and completion criteria

Extend the shared Pagesight API with standalone provider setup, read-only Bing
Webmaster reporting, and careful snapshot comparison. Publish each verified
increment as a dependent PR; CLI, MCP and HTTP remain thin adapters. Never merge.

- [x] API foundation implemented, valid review findings fixed, and tooling migrated
      to Vite+ and TypeScript 7.
- [x] Site-only, GSC-only and GA-only configs work. Selected provider failures remain
      visible, unselected providers are explicit, and existing configs still work.
- [x] Discovery returns provider candidates and a usable nonsecret starter config
      without selecting a property. All interfaces share API behavior.
- [x] Bing site discovery and documented traffic reports preserve raw responses,
      scope, limits and safe errors, with tests of documented JSON contracts.
- [x] Snapshot comparison validates compatible evidence and produces descriptive
      changes without invented zeros, exhaustive coverage or causal conclusions.
- [x] Each increment has focused tests, appropriate checks, usage documentation,
      resolved consultation findings and a published PR in the dependent stack.

## Verified publication and review evidence

Inspected on 2026-09-08 UTC; readiness applies to the exact commits below.

- [PR #2: API foundation](https://github.com/caiopizzol/pagesight/pull/2) and
  [PR #4: standalone setup](https://github.com/caiopizzol/pagesight/pull/4) were
  merged externally by `caiopizzol` at 00:59:55 and 00:59:56 UTC.
- [PR #6: Bing reports](https://github.com/caiopizzol/pagesight/pull/6), head
  [`7d9a26a`](https://github.com/caiopizzol/pagesight/commit/7d9a26a404c7ca24a766962ec7e219ab874a1d4d),
  is open, non-Draft and conflict-free. CI and Cubic passed; its owner reported
  no unresolved findings and ready to merge.
- [PR #8: snapshot comparison](https://github.com/caiopizzol/pagesight/pull/8), head
  [`beb1ee0`](https://github.com/caiopizzol/pagesight/commit/beb1ee00952fe7202362591d57a488f2e2328635),
  is published above #6, open, non-Draft and conflict-free.
  [CI passed](https://github.com/caiopizzol/pagesight/actions/runs/34176714837);
  Cubic completed successfully at 01:32:27 UTC. Its
  [temporal-dimension finding](https://github.com/caiopizzol/pagesight/pull/8#discussion_r3953524344)
  was fixed, acknowledged by Cubic and resolved. No unresolved threads remain.

At the verified comparison implementation, all 93 Bun tests, TypeScript 7 and
Vite+ pass; four warnings remain in unchanged legacy tools. Tests include provider
failures, pagination, malformed imports, numeric safety, generated GA snapshot
reports, CLI/HTTP/MCP parity and a payload above 1 MB. Package archive and import
smoke checks also passed during implementation. [README.md](README.md) documents
usage and [PRODUCT.md](PRODUCT.md) maps the supported behavior and boundaries.

## Consultation and review decisions

Claude consultation used session `357146f4-7fb4-4a86-b85e-12a7ef81dc33`.
Findings were verified independently before changes.

- Setup preserves independent provider failures and credential provenance.
  Discovery retains raw GSC envelopes and never auto-selects properties. A broader
  credential-identity redesign was not needed for this increment.
- Bing uses four documented read operations. Preserve registered URLs verbatim,
  raw provider date strings, credential-source metadata and safe numeric
  `ApiFault.ErrorCode`. Do not invent reporting timezone, date ranges or coverage.
  Doctor traffic access is sufficient; extra credential probes and speculative
  null-response behavior remain deferred without evidence.
- Comparison checks versioned, named snapshots, site/property, equal disjoint
  periods, requests, metadata and contiguous rows. Missing trailing GSC dates and
  recent GA collection are limitations. Missing aggregation stays incompatible.
- `canonicalSha256` identifies validated objects, not file bytes. Status counts
  expose incompatible and unsupported observations. Observed-only keys remain
  explicitly unknown in the other period, including when pagination is partial.
  Unsafe numeric values keep raw evidence and null deltas.
- Duplicate GA metric names and pagination counts/offsets that contradict retained
  rows are incompatible. GA comparison accepts only the six snapshot dimension
  names, or no dimensions, and rejects dimension expressions. This closes both
  `nthYear` and temporal-alias cases while retaining all generated GA reports.
  GSC date/hour keys require a separate alignment policy.

## Scope and remaining review work

Use Bun/TypeScript and existing API conventions; retain configuration and MCP
startup compatibility. No provider settings, index submissions, tracking tags,
automated SEO changes, AI-citation claims or initiating-site integration.
Credentials and raw live reports stay outside this public repository.

No Bing API key was available, so live Bing access is unverified. Microsoft Learn
JSON contracts and fixtures support the implemented behavior; they do not prove
live access. Google discovery was exercised without auto-selecting IDs.

Implementation completion is separate from PR monitoring. After publication of
any newer commit, verify CI and the expected Cubic reviewer at that exact head,
then resolve only verified findings. The only remaining workflow is this final
review/check monitoring of active PRs; no merge, queue or auto-merge action.

Expected GitHub writer: `caiopizzol`, verified against repository Git config.
Expected reviewer: `cubic-dev-ai[bot]` (GitHub App 1082092).

## Bing assessment follow-up — 2026-09-08

The preceding publication notes are historical. This follow-up assesses the supplied
Bing UI screenshots and exports against live site/provider evidence; it does not
reopen the completed implementation stack or authorize a version bump.

Outcome: recommend evidence-backed fipe.chat improvements and the smallest Pagesight
capabilities needed to support an agent assessment. Website implementation, IndexNow
submission, and provider-setting changes are outside this assessment.

- [x] Read the four supplied Bing recommendation screenshots and both URL CSVs.
- [x] Verify the affected pages against live HTML and local source.
- [x] Compare existing Pagesight Bing operations with official API contracts and
      bounded live probes of crawl, URL-info, and link methods.
- [x] Incorporate and independently check the requested outside consultation.
- [x] Deliver a prioritized website recommendation and API-first, CLI-default backlog
      with evidence provenance, coverage limits, and unresolved questions.

Browser discovery returned no connected browsers, so live UI navigation is unavailable.
The comparison uses supplied UI evidence; additional UI-only reports remain unverified.
Private working artifacts: `/tmp/pagesight-bing-assessment/` (including consultation).
Final local report: `/Users/cpolive/.local/state/pagesight/bing-assessment-20260908.md`.
Assessment complete within the available UI evidence. Consultation session
`61529e5d-4cc2-47eb-84c1-aeab22b0931f` completed with a follow-up incorporating live probes.
Next proposed implementation: Bing crawl/URL reads, shared HTML image evidence,
then lightweight UI evidence imports. Live authenticated UI navigation remains
unverified until a browser is connected. Preserve private provider responses outside this repository.

## Authorized implementation — 2026-09-08

User authorized the Pagesight backlog after the assessment. Branch: feat/bing-assessment,
based on the CLI-default work. No site edits, index submissions or major version bump.

- [x] Add five Bing read operations with method-specific envelopes and bounded link pagination.
- [x] Add shared page image evidence, including empty ALT and noscript, and description length.
- [x] Add lightweight attributed UI finding import without inferred scan dates or coverage.
- [x] Verify API/CLI/HTTP/MCP behavior, update usage docs and consult on the completed changes.

Resume with the first unchecked criterion. Keep provider responses outside tracked source.

Implementation evidence: 109 Bun tests and Vite+ checks pass (four existing legacy
warnings). All five new Bing CLI reads and two page inspections passed against the
assessment site; raw results stay in the private assessment directory. UI import
parity is verified through API, CLI, HTTP and MCP. Claude implementation review
found the stale MCP operation description, now fixed. Live URL-info includes the
required Url string; fixture tests cover link parameter naming, empty crawl issues,
partial pagination and image parser behavior. Package version remains 0.17.0.

Rebased onto main at 04d4564, including merged PRs #10 and #11. The only
conflict was the shared HTTP reader import; retained the upstream bounded reader
and the new image inspection import. Final tests and Vite+ checks passed after
resolution. Implementation criteria are complete. Published for review as
[PR #12](https://github.com/caiopizzol/pagesight/pull/12), branch feat/bing-assessment.
Implementation and publication are complete; hosted CI/review readiness is separate.
No merge is authorized.
