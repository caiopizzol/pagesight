# Workspace and code cleanup

## Outcome

Implement the agreed assessment: a private Bun workspace with the published package
in `packages/pagesight`, ready for a future `apps/website`, followed by clear internal
ownership, smaller tools, behavior-focused tests, and concise contributor docs.

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
- [ ] Provider/web/shared ownership and clear names; public facade, doctor, auth, and MCP extractions.
- [ ] Page/search/speed split by responsibility with behavior and MCP coverage.
- [ ] Tests grouped by subject with reusable setup and no historical regression buckets.
- [ ] Concise README/guides/contributor map, corrected stale claims, valid source links.
- [ ] Final verify and package smoke pass; no import cycles; outside review addressed.

## Progress and resume

Workspace migration implemented. `bun run verify`: 103 tests / 429 assertions, four
pre-existing warnings; package consumer passed API/CLI/MCP. Frozen install passed.
Real Vite+ hook dispatched successfully after correcting this worktree's inherited
legacy hooksPath to `.vite-hooks/_` (main checkout config untouched).
Isolated semantic-release npm prepare + npm pack passed for version 0.17.2 with
NPM_CONFIG_WORKSPACES_UPDATE=false; frozen install passed afterward. Without this
setting npm attempted to reify Bun dependencies. CI now sets it. Analyzer checks:
website-only -> no release; package fix and mixed history -> patch.
Next: collect migration review, commit workspace baseline, then behavior coverage and
source ownership/extraction. No live release or website deployment is in scope.
Reuse Claude session `6b6f5438-bc37-4269-ae5e-f3497f6528cd` through the existing
reviewer directory `/Users/cpolive/.codex/artifacts/pagesight-cleanup-20260908/claude`.
This file is the authoritative cleanup progress record; `seo-goal.md` tracks another goal.
