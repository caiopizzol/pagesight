# Verify rendered SEO evidence on demand

`page.verify` compares fetched server HTML with a fresh anonymous Chromium load.
It can also click one exact internal link in a separate fresh context and compare
that result with the direct load. This is an observation at a specified capture
point, not Google's renderer or proof of indexing.

Install Chromium once from the Pagesight installation directory:

```sh
bunx playwright install chromium
# Linux machines may also require: bunx playwright install --with-deps chromium
```

Other Pagesight operations do not launch a browser. Missing browser binaries produce
`browser_unavailable` with setup guidance. CI installs Chromium for real browser tests.

```sh
pagesight render --url https://example.com/target
pagesight render --url https://example.com/target \
  --from-url https://example.com/source --link-selector 'a#target-link' \
  --settle-ms 1000 --timeout-ms 20000 --out render.json
```

The selector must match exactly one anchor, with a resolved `href` equal to the
requested target URL, no download attribute and same-tab navigation. Source and
target must share an origin. Selectors identify links, not buttons, forms or arbitrary
actions. Ambiguous links, navigation failures and URL mismatches never become empty
successful comparisons. The initial version does not exercise form-driven filters,
back/forward history, screenshots, or visual layout; use a browser workflow for those.

API, authenticated local HTTP and MCP `observe` take the same operation:

```json
{
  "operation": "page.verify",
  "url": "https://example.com/target",
  "navigation": { "fromUrl": "https://example.com/source", "linkSelector": "a#target-link" },
  "settleMs": 1000,
  "timeoutMs": 20000,
  "viewport": { "width": 1280, "height": 800 }
}
```

Browser paths wait for DOMContentLoaded, then a fixed settle interval; navigation
also waits for the exact target URL. `settleMs` is 0–5000 and `timeoutMs` is
1000–60000 per browser path, including source load and click. A late hydration
update can occur after capture. Use a larger explicit interval to investigate a
known delay; elapsed time never proves network or application completion.

The result retains independent server, direct and optional navigation observations:

- Arrays of title, description, canonical, robots, H1, JSON-LD and anchor values
  preserve duplicates and empty values. Canonical and anchor URLs include raw and
  resolved forms; JSON-LD syntax validity is separate from semantic validity.
- The server HTML hash identifies the independently fetched response; browser DOM
  hashes identify extracted evidence. Capture timestamps, browser version, viewport,
  requested/final URLs, document response status/redirect headers and X-Robots-Tag
  preserve provenance. A client route can have no target document response.
- DOM-field comparisons (including base href) are `equal`, `different`, `unavailable` or `not_requested`. Differences
  are data for investigation, not automatic defects. A capture failure makes the
  envelope partial when other evidence survives. Truncated captures are explicitly
  unavailable for comparison; missing values are not invented.

Server HTML uses Pagesight's user agent, a 2 MB response limit and a same-origin
redirect limit, then inert Chromium parsing. It can differ from the browser's
response because of user agents, timing, experiments or deployments. Raw HTML and
cookies are not returned. Keep URLs and extracted page content private when needed.

Each browser path uses fresh storage, a maximum of 500 attempted requests, blocked
service workers and WebSockets, and only GET/HEAD requests. Cross-origin top-level navigation and
downloads are blocked. These restrictions can change application behavior and are
reported with blocked-request counts. Subresources may use other origins; ordinary
page requests can reach analytics. No user browser profile or authentication state
is loaded. Browser network response sizes are not globally capped; the server HTML
limit is separate. Extracted fields cap at 200 items and 4000 characters per value.

Run this separately when investigating a URL or verifying a deployment. It does not
schedule analysis, alter production pages, validate rich-result eligibility, or
establish SEO impact.

`documentComparison` separately compares server/browser status and X-Robots-Tag.
DOM equality never implies equivalent HTTP responses; inspect both comparisons
and recorded redirect chains. Browser integration tests run in a separate Bun
process from provider/mock tests, under the same root verification command.
