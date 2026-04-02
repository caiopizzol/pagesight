# Pagesight

[![npm version](https://img.shields.io/npm/v/pagesight.svg)](https://www.npmjs.com/package/pagesight)

See your site the way search engines and AI see it.

```bash
npm install pagesight
```

Google Search Console, PageSpeed Insights, Chrome UX Report, and 139+ AI crawlers. One package. No made-up rules.

Most SEO tools flag "title over 60 characters" and "only one H1 allowed." [Google's own engineers say those rules don't exist.](#why-not-other-seo-tools) Pagesight skips the myths and goes to the sources.

## Tools

### `audit`

One call. Everything checked. Prioritized.

Runs pagespeed, meta tags, robots.txt, sitemaps, and index status in parallel. Returns a ranked action list:

```
=== Site Audit: https://fipe.chat ===

6 findings:

HIGH    Missing canonical URL
HIGH    7,772 sitemap URLs submitted, 0 indexed
MEDIUM  Missing og:image — no social preview image
MEDIUM  Accessibility score: 89/100
LOW     Missing Twitter Card tags
LOW     No structured data (JSON-LD) found
```

### `pagespeed`

Run Google Lighthouse on any URL. Returns scores, Core Web Vitals (lab + field), opportunities with resource-level detail, and failing audits with element selectors and fix guidance.

- **Scores**: performance, accessibility, best practices, SEO
- **Core Web Vitals (lab)**: FCP, LCP, TBT, CLS, Speed Index, TTI
- **CrUX field data**: real Chrome user metrics (page + origin)
- **Opportunities**: ranked by severity with resource URLs and wasted ms/bytes
- **Failing audits**: element selectors, HTML snippets, explanations, learn-more links
- **Strategy**: `mobile` or `desktop`

### `metatags`

Fetch a page as Googlebot and report what search engines and social platforms see:

- **Document**: title, description, charset, viewport, canonical, robots
- **Open Graph**: og:title, og:description, og:image, og:url, og:type
- **Twitter Card**: twitter:card, twitter:title, twitter:description, twitter:image
- **Structured data**: JSON-LD blocks with field-level validation against Google's Rich Results requirements
- **Image validation**: HEAD-checks og:image and schema images, flags broken URLs, large files (>1 MB), and small dimensions
- **Redirect chain**: full chain with status codes (e.g., `http://example.com → 301 → https://example.com → 200`)
- **Not Found**: lists missing tags at a glance

### `inspect`

Ask Google: is this page indexed? What canonical did it choose?

Returns index status, canonical (yours vs Google's), crawl state, rich results validation, sitemaps, and referring URLs. Structured error messages when a property isn't verified.

### `sample_inspect`

Diagnose indexing issues across a sitemap. Samples URLs and batch-inspects them via Google Search Console:

- **Auto-discovery**: finds sitemaps from GSC, traverses sitemap indexes
- **Sampling**: random, first N, or evenly spaced across the sitemap
- **Summary**: indexed vs not-indexed breakdown with coverage states and fetch issues
- **Details**: per-URL verdict, coverage, page fetch, robots.txt, crawl time, canonical

```
=== Sample Inspection: sc-domain:fipe.chat ===
Sitemap: https://fipe.chat/sitemap.xml (7,772 URLs)
Sampled: 5

--- Summary ---

Indexed: 3/5
Not indexed: 2/5
  Discovered - currently not indexed: 1
  URL is unknown to Google: 1
```

### `performance`

Google Search Console search analytics. Clicks, impressions, CTR, and position data:

- **Dimensions**: `query`, `page`, `country`, `device`, `date`, `searchAppearance`, `hour`
- **Search types**: `web`, `image`, `video`, `news`, `discover`, `googleNews`
- **Filters**: `equals`, `contains`, `notEquals`, `notContains`, `includingRegex`, `excludingRegex`
- **Compare**: `compare: true` runs the previous period and shows deltas with top improved/regressed queries
- **Pagination**: up to 25,000 rows

### `crux`

Real-world Core Web Vitals from Chrome users (28-day rolling window):

- **Metrics**: LCP, FCP, INP, CLS, TTFB, RTT, navigation types, form factors
- **Granularity**: by URL or origin, by device (DESKTOP, PHONE, TABLET)
- **Data**: p75 values + histogram distributions
- **Graceful**: suggests origin-level data and pagespeed lab metrics when traffic is insufficient

### `crux_history`

Core Web Vitals trends over time — up to 40 weekly data points (~10 months):

- Trend detection (improved/stable/worse) with percentage change
- Recent data points table for core metrics
- Custom period count (1-40)

### `robots`

Analyze any site's robots.txt:

- **Syntax validation** per [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309)
- **AI crawler audit** — 139+ bots from the [ai-robots-txt](https://github.com/ai-robots-txt/ai.robots.txt) community registry
- **Bot categories**: training scrapers, AI search crawlers, AI assistants, AI agents
- **Per-bot status**: blocked or allowed, with the matched rule

```
=== robots.txt: https://www.nytimes.com ===
AI Crawlers: 35 blocked, 104 allowed (of 139 known)

  BLOCKED  GPTBot (OpenAI) — GPT model training
  BLOCKED  ClaudeBot (Anthropic) — Claude model training
  ALLOWED  Claude-User (Anthropic) — User-initiated fetching
```

### `sitemaps`

Search Console properties and sitemaps:

- `list_sites` — all properties with permission level
- `list_sitemaps` — sitemaps with submitted/indexed counts, error/warning counts
- `get_sitemap` — full details for a specific sitemap

### `setup`

Check auth status or walk through OAuth setup.

## Setup

### 1. Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use existing)
3. Enable: **Search Console API**, **PageSpeed Insights API**, **Chrome UX Report API**
4. Create **OAuth client ID** (Desktop app) — for Search Console
5. Create **API key** — for PageSpeed and CrUX

### 2. Configure

```env
GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GSC_CLIENT_SECRET=your-client-secret
GSC_REFRESH_TOKEN=your-refresh-token
GOOGLE_API_KEY=your-api-key
```

The `robots`, `metatags`, and `pagespeed` tools work without any credentials.

### 3. Use with your AI assistant

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

Then just ask:

```
"Run a full audit on my site"
"Is https://mysite.com indexed?"
"Run pagespeed on my homepage"
"Which AI crawlers can access my site?"
"Check the meta tags and OG images on this page"
"Compare my search performance to last month"
"Sample 5 URLs from my sitemap and check if they're indexed"
```

## Why not other SEO tools?

We checked every common SEO "rule" against official Google documentation:

- **"Title must be under 60 characters"** — Google: "there's no limit." Gary Illyes: "an externally made-up metric."
- **"Meta description must be 155 characters"** — Google: "there's no limit on how long a meta description can be."
- **"Only one H1 per page"** — John Mueller: "You can use H1 tags as often as you want. There's no limit."
- **"Minimum 300 words per page"** — Mueller: "the number of words on a page is not a quality factor."
- **"Text-to-HTML ratio matters"** — Mueller: "it makes absolutely no sense at all for SEO."

Tools that flag these are reporting their opinions. Pagesight only reports what the sources actually return.

## Development

```bash
bun install
bun run start     # start server
bun test          # run tests
bun run lint      # biome check
bun run format    # biome format
```

## License

MIT
