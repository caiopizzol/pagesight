# Feature map

## Site-only snapshot

**Surface:** CLI, checked at commit `f9398ea` with Bun 1.3.12.

**Start state:** A clean checkout, Bun, a POSIX shell with `/dev/stdin`, and
HTTPS access to `example.com`. Run from the repo root. No Google credentials needed.

**Steps:** Install dependencies, then snapshot one page:

```sh
VP_GIT_HOOKS=0 bun install --frozen-lockfile
bun --no-env-file src/index.ts snapshot \
  --config /dev/stdin --start 2026-08-01 --end 2026-08-28 <<'JSON'
{"site":"https://example.com/"}
JSON
```

Success prints JSON and exits `0`. The dates set the reporting window;
HTML comes from the live page.

**Anchors:** Check these JSON fields:

- Top level: `schemaVersion: 1`, `operation: "snapshot"`, `status: "ok"`.
- `pages[0].response`: `snapshotVersion: 1`.
- Within that response, `context.providers`: `web: "selected"`; `gsc`, `ga`,
  and `sitemap`: `"not_selected"`.
- Within `observations`, find `name: "page:https://example.com/"`. It has
  `provider: "web"`, `operation: "page"`, and `status: "ok"`. Its
  `pages[0].response` holds the fetched page details.

**Shortcut:** `bun --no-env-file src/index.ts --help` lists CLI commands.

**Code:** [Bin entry](src/index.ts) → [runCli](src/cli.ts) →
[execute](src/api/index.ts) → [snapshot](src/api/snapshot.ts).
[observePage](src/api/web.ts) fetches the HTML;
[schema](src/api/schema.ts) validates the request.

**Verification:** Replayed on 2026-09-07 (America/Sao_Paulo) in the worktree
and a separate clean copy. Both runs exited `0`, all JSON anchors matched,
and help worked.

The smallest existing check is in [API tests](__tests__/api.test.ts):

```sh
bun --no-env-file test __tests__/api.test.ts \
  --test-name-pattern 'site-only doctor and snapshot need no provider credentials and expose selection'
```

Passed. It checks the API with a local page: doctor works without Google
providers, and snapshot returns a named web observation. The replay above
covers CLI parsing and the public page.

**Status:** verified.

**Gaps:** Covers one live HTML page. Google access, browser JavaScript, and
historical HTML are untested. The public page and network can change.
