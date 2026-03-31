# Pagesight

[![npm version](https://img.shields.io/npm/v/pagesight.svg)](https://www.npmjs.com/package/pagesight)

See your site the way search engines and AI see it.

```bash
npm install pagesight
```

Most SEO tools flag "title over 60 characters" and "only one H1 allowed." [Google's own engineers say those rules don't exist.](#why-not-other-seo-tools) Pagesight skips the myths and goes to the sources.

## Tools

### `inspect`

Ask Google: is this page indexed? What canonical did you choose? Any crawl errors? Structured data issues?

Returns index status, canonical (yours vs Google's), crawl status, rich results validation, sitemaps, and referring URLs.

### `pagespeed`

Run Google Lighthouse on any URL:

- **Scores**: performance, accessibility, best-practices, seo
- **Core Web Vitals (lab)**: FCP, LCP, TBT, CLS, Speed Index, TTI
- **CrUX field data**: real Chrome user metrics (page + origin)
- **Opportunities**: ranked by severity with potential savings
- **Strategy**: `mobile` or `desktop`

### `crux`

Real-world Core Web Vitals from Chrome users (28-day rolling window):

- **Metrics**: LCP, FCP, INP, CLS, TTFB, RTT, navigation types, form factors
- **Granularity**: by URL or origin, by device (DESKTOP, PHONE, TABLET)
- **Data**: p75 values + histogram distributions

### `crux_history`

Core Web Vitals trends over time — up to 40 weekly data points (~10 months):

- Trend detection (improved/stable/worse) with percentage change
- Recent data points table for core metrics
- Custom period count (1-40)

### `performance`

Google Search Console search analytics:

- **Dimensions**: `query`, `page`, `country`, `device`, `date`, `searchAppearance`, `hour`
- **Search types**: `web`, `image`, `video`, `news`, `discover`, `googleNews`
- **Filters**: `equals`, `contains`, `notEquals`, `notContains`, `includingRegex`, `excludingRegex`
- **Pagination**: up to 25,000 rows

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

Search Console properties and sitemaps (read-only):

- `list_sites` — all properties with permission level
- `get_site` — details for a specific property
- `list_sitemaps` — sitemaps with error/warning counts
- `get_sitemap` — full details for a specific sitemap

### `setup`

Check auth status or walk through OAuth interactively.

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

The `robots` tool works without any credentials.

### 3. Use with your AI assistant

```json
{
  "mcpServers": {
    "pagesight": {
      "command": "bun",
      "args": ["run", "/path/to/pagesight/src/index.ts"],
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
"Is https://mysite.com indexed?"
"Run pagespeed on my homepage"
"Which AI crawlers can access my site?"
"How have my Core Web Vitals changed?"
"Which queries bring traffic to this page?"
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
bun run lint      # biome check
bun run format    # biome format
```

## License

MIT
