# Pagesight

[![npm version](https://img.shields.io/npm/v/pagesight.svg)](https://www.npmjs.com/package/pagesight)

See your site the way search engines and AI see it.

```bash
npm install pagesight
```

Your AI assistant can write your code. Now it can see your site. Index status, performance, real-user metrics, search traffic, meta tags, structured data, AI crawler access, link health — one package, one call.

```
=== Site Audit: https://example.com ===

2 checks failed — results below are partial:

  FAIL  PageSpeed: quota exceeded
  FAIL  Sitemaps: permission denied

5 findings:

HIGH    Missing canonical URL
HIGH    22 sitemap URLs submitted, 0 indexed
        Auto-inspected 5 URLs:
        - 2/5 indexed
        - 3/5 Discovered - currently not indexed: /docs/, /pricing/, /about/
MEDIUM  Missing og:image — no social preview image
LOW     Missing Twitter Card tags
LOW     6/139 AI crawlers blocked
```

## Tools

6 tools organized by intent:

| Tool     | Intent                  | What it does                                                                                                                                                   |
| -------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit`  | How's my site?          | One-call site audit. Runs all checks in parallel. Prioritized findings with auto-drill-down on indexing issues.                                                |
| `page`   | What's on this URL?     | Meta tags, OG, Twitter Card, JSON-LD validation (19 schema types), internal link health, redirect chains, WCAG contrast checker. Batch mode for multiple URLs. |
| `speed`  | How fast is it?         | PageSpeed single/batch/compare with Lighthouse scores and opportunities. CrUX real-user metrics (snapshot + history trends).                                   |
| `search` | How's Google seeing me? | URL inspection, sample-inspect from sitemaps, sitemap management, search analytics with period-over-period comparison.                                         |
| `ai`     | How's AI seeing me?     | AI crawler audit (139+ bots by category), robots.txt validation (RFC 9309), llms.txt detection, path access checks.                                            |
| `setup`  | Auth config             | Auth status check and OAuth setup flow.                                                                                                                        |

## Setup

Add to your MCP config:

```json
{
  "mcpServers": {
    "pagesight": {
      "command": "npx",
      "args": ["pagesight"],
      "env": {
        "GSC_CLIENT_ID": "your-client-id",
        "GSC_CLIENT_SECRET": "your-secret",
        "GSC_REFRESH_TOKEN": "your-token",
        "GOOGLE_API_KEY": "your-api-key"
      }
    }
  }
}
```

`page`, `speed`, and `ai` work without credentials. `search` and `audit` (for GSC checks) require OAuth or a service account.

### Full setup

1. [Google Cloud Console](https://console.cloud.google.com/) — enable Search Console API, PageSpeed Insights API, Chrome UX Report API
2. Create OAuth client ID (Desktop app) + API key
3. Configure:

```env
GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GSC_CLIENT_SECRET=your-client-secret
GSC_REFRESH_TOKEN=your-refresh-token
GOOGLE_API_KEY=your-api-key
```

## Why Pagesight

Every data point comes from a verifiable source. Google's APIs, real Chrome users, RFC 9309, schema.org, a community-maintained bot registry. No invented scores. No rules we can't cite.

- **"Title must be under 60 characters"** — Gary Illyes: "an externally made-up metric."
- **"Only one H1 per page"** — John Mueller: "You can use H1 tags as often as you want."
- **"Minimum 300 words per page"** — Mueller: "not a quality factor."

Pagesight reports what the sources report. Nothing more.

## Development

Install with Bun 1.3.12 (`bun install --frozen-lockfile`). Vite+ 0.3.0 provides formatting, linting, type checks, and commit hooks.

```sh
bun run check       # Format, lint, and type checks
bun run test        # Existing Bun test suite
bun run format      # Apply formatting
bun run start       # Start the MCP server with Bun
```

With `vp` on your PATH, use `vp check` and `vp run test`. Tests use `bun:test` and require Bun; `vp test` invokes Vitest. The package publishes TypeScript source and has no build step.

The pre-commit hook checks staged files and runs the full type check. Hook setup and execution skip when local Vite+ development dependencies are absent.

## License

MIT
