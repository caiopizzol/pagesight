# Workspace and code cleanup

## Outcome

Completed the agreed assessment: a private Bun workspace with the published package
in `packages/pagesight`, ready for a future `apps/website`, clear internal ownership,
smaller tools, behavior-focused tests, and concise contributor docs.

Baseline: `04d4564` (origin/main, 2026-09-08).
Worktree: `/Users/cpolive/dev/personal/pagesight-cleanup`.
Branch: `refactor/workspace-cleanup`.
Assessment: `/Users/cpolive/.codex/artifacts/pagesight-assessment-20260908/proposal.md`.
Verification/review artifacts: `/Users/cpolive/.codex/artifacts/pagesight-cleanup-20260908`.

## Constraints

Preserve npm exports/bin, seven MCP tools, CLI/HTTP contracts, evidence identifiers,
and current provider/network semantics. Document the changed checkout entry path.
Keep one published package; no empty website, framework choice, generic provider layer,
or build pipeline. Leave the main checkout and its SEO feature work untouched.
Implementation is authorized; publishing, deployment, and a new PR are not requested.

## Completion criteria

- [x] Private root workspace, one lockfile, scoped checks, package metadata and release paths.
- [x] Frozen installation, real hook setup, package consumer smoke, isolated release preparation.
- [x] Provider/web/shared ownership and clear names; public facade, doctor, auth, and MCP extractions.
- [x] Page/search/speed split by responsibility with behavior and MCP coverage.
- [x] Tests grouped by subject with reusable setup and no historical regression buckets.
- [x] Concise README/guides/contributor map, corrected stale claims, valid source links.
- [x] Final verify and package smoke pass; no runtime import cycles; outside review addressed.

## Verification

- `bun run verify`: 113 tests, 468 assertions, 25 test files; no formatting, lint,
  or type errors/warnings. Source boundary check covers 58 modules.
- `bun run test:package`: external tarball consumer verifies API evidence identifiers,
  schemas, public RequestError, CLI help and exits 0/1/2/3, and all seven MCP tools.
  HTTP authentication, route handling, and API equivalence are covered by transport tests.
- Direct comparison with the pinned baseline: all seven MCP schemas and seven
  representative page/search/speed outputs match exactly.
- Frozen Bun installation passed after workspace migration and simulated version preparation.
- Real Vite+ pre-commit dispatcher passed. Only this worktree's inherited legacy
  hooksPath was corrected to `.vite-hooks/_`; original checkout config is untouched.
- Isolated semantic-release npm prepare and npm pack passed for version 0.17.2.
  `NPM_CONFIG_WORKSPACES_UPDATE=false` prevents npm from rebuilding Bun dependencies.
  The release job now sets it. No lock refresh was needed after the simulated bump.
- Isolated semantic-release dry-run selected 0.17.1 from a fixture package fix.
  Website-only analyzer input yields no release; mixed input retains the package bump.
  GitHub publication and AI release notes were excluded from this local dry-run.
  No package, tag, or GitHub release was published to the real repository.
- Local Markdown links and `git diff --check` passed.

## Review decisions and deliberate changes

Meta completed two implementation reviews in session
`9ee0c75a-be3d-4ed2-90cf-c082d9f2c83d`; records are under the artifact directory's
`meta/`. Accepted stronger consumer assertions, source checks, and final source-map
updates. Kept GSC sitemap sampling under its sole search owner, separate from strict
web inventory. Final feedback produced matching single/batch JSON-LD type handling
and compile-time exhaustive search/speed action guards.

Malformed object-valued JSON-LD `@type` labels now print JSON instead of
`[object Object]`; both single and batch cases have tests. Valid labels retain their
existing formatting. RequestError is an additive public export. No other intentional
runtime output changes were made.

Claude's implementation consultation reached its 600-second limit without a final
answer. Its records were inspected; it is not counted as approval. The earlier
completed assessment consultations remain in the assessment artifact directory.

## Resume

Implementation is complete and committed in reviewable local increments. The website
has not been scaffolded, and no PR or push was requested. If the user requests a PR,
review this branch against current main and rerun checks after any new changes.
This is the authoritative cleanup record; `seo-goal.md` tracks a separate goal.
