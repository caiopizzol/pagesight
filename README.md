# Pagesight

[![npm version](https://img.shields.io/npm/v/pagesight.svg)](https://www.npmjs.com/package/pagesight)

See your site the way search engines and AI see it.

```bash
npm install pagesight
```

Google Search Console + PageSpeed Insights + CrUX + 139 AI crawlers. One package.

## Tools

| Tool | What it does |
|------|-------------|
| `audit` | One-call site audit. Runs pagespeed + metatags + robots + sitemaps + inspect in parallel. Returns prioritized findings. |
| `pagespeed` | Lighthouse scores, Core Web Vitals, opportunities with resource URLs, failing audits with selectors and fix links. |
| `metatags` | OG, Twitter Card, canonical, JSON-LD with schema validation, redirect chain, image validation. |
| `inspect` | Google index status, canonical choice, crawl state, rich results. |
| `sample_inspect` | Sample URLs from a sitemap and batch-inspect via GSC. Diagnoses indexing patterns. |
| `performance` | Search analytics — clicks, impressions, CTR, position. `compare: true` for period-over-period deltas. |
| `crux` | Real-world Core Web Vitals from Chrome users (p75, histograms). |
| `crux_history` | CWV trends over time — up to 40 weekly data points. |
| `robots` | robots.txt validation (RFC 9309) + AI crawler audit (139+ bots). |
| `sitemaps` | GSC properties and sitemaps with submitted/indexed counts. |
| `setup` | Auth status and OAuth setup. |

```
=== Site Audit: https://fipe.chat ===

HIGH    Missing canonical URL
HIGH    7,772 sitemap URLs submitted, 0 indexed
MEDIUM  Missing og:image — no social preview image
MEDIUM  Accessibility score: 89/100
LOW     Missing Twitter Card tags
LOW     No structured data (JSON-LD) found
```

## Setup

1. [Google Cloud Console](https://console.cloud.google.com/) — enable Search Console API, PageSpeed Insights API, Chrome UX Report API
2. Create OAuth client ID (Desktop app) + API key
3. Configure:

```env
GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GSC_CLIENT_SECRET=your-client-secret
GSC_REFRESH_TOKEN=your-refresh-token
GOOGLE_API_KEY=your-api-key
```

`robots`, `metatags`, and `pagespeed` work without credentials.

### MCP config

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

## Why not other SEO tools?

We checked every common SEO "rule" against official Google documentation:

- **"Title must be under 60 characters"** — Gary Illyes: "an externally made-up metric."
- **"Only one H1 per page"** — John Mueller: "You can use H1 tags as often as you want."
- **"Minimum 300 words per page"** — Mueller: "not a quality factor."

Pagesight only reports what the sources actually return.

## License

MIT
