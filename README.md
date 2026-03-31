# Sitelint

Lint your site for search engines and AI.

An open-source MCP server powered by Google APIs. Inspect indexing status, validate structured data, track search performance, measure Core Web Vitals — directly from Google's own data. No guesswork. No made-up rules.

## Install

```bash
bun install
```

## Tools

### `inspect`

Inspect a URL using Google's index. Returns index status, canonical (yours vs Google's), crawl status, rich results validation, mobile usability, sitemaps, and referring URLs.

### `pagespeed`

Analyze performance with Google PageSpeed Insights API v5:

- **Lighthouse scores**: performance, accessibility, best-practices, seo
- **Core Web Vitals (lab)**: FCP, LCP, TBT, CLS, Speed Index, TTI
- **CrUX field data**: real-world metrics from Chrome users (page + origin level)
- **Opportunities**: ranked by severity with potential savings
- **Strategy**: `mobile` or `desktop`
- **Locale**: localized results (e.g., `pt-BR`)

### `crux`

Query Chrome UX Report for real-world Core Web Vitals (28-day rolling window):

- **Metrics**: LCP, FCP, INP, CLS, TTFB, RTT, navigation types, form factors
- **Granularity**: by URL or origin, by device type (DESKTOP, PHONE, TABLET)
- **Data**: p75 values + histogram distributions (good/needs improvement/poor)

### `crux_history`

CrUX trends over time — up to 40 weekly data points (~10 months):

- Same metrics as `crux` but as timeseries
- Trend detection (improved/stable/worse)
- Recent data points table for core metrics
- Custom period count (1-40)

### `performance`

Query Google Search Console search analytics with full API support:

- **Dimensions**: `query`, `page`, `country`, `device`, `date`, `searchAppearance`, `hour`
- **Search types**: `web`, `image`, `video`, `news`, `discover`, `googleNews`
- **Filter operators**: `equals`, `contains`, `notEquals`, `notContains`, `includingRegex`, `excludingRegex`
- **Aggregation**: `auto`, `byPage`, `byProperty`, `byNewsShowcasePanel`
- **Data freshness**: `all`, `final`, `hourly_all`
- **Pagination**: `row_limit` (up to 25,000) + `start_row` offset

### `sitemaps`

Manage Search Console properties and sitemaps (read-only):

- `list_sites` — list all GSC properties
- `get_site` — get details for a specific property
- `list_sitemaps` — list sitemaps for a property
- `get_sitemap` — get details for a specific sitemap

### `setup`

Check auth status or walk through the OAuth setup flow.

## Setup

### 1. Create Google Cloud credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable these APIs:
   - **Google Search Console API**
   - **PageSpeed Insights API**
   - **Chrome UX Report API**
4. Create **OAuth client ID** (Desktop app) for Search Console
5. Create **API key** for PageSpeed and CrUX

### 2. Authorize Search Console

```bash
# Use the setup tool to walk through OAuth, or manually:
# 1. Visit the auth URL with your client_id
# 2. Authorize, copy the code from redirect URL
# 3. Exchange for refresh token
```

### 3. Configure

Create a `.env` file:

```env
GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GSC_CLIENT_SECRET=your-client-secret
GSC_REFRESH_TOKEN=your-refresh-token
GOOGLE_API_KEY=your-api-key
```

Or use a service account for Search Console:

```env
GSC_SERVICE_ACCOUNT_KEY=/path/to/service-account.json
GOOGLE_API_KEY=your-api-key
```

## Usage

### As an MCP server

Add to your Claude Code, Cursor, or any MCP client config:

```json
{
  "mcpServers": {
    "sitelint": {
      "command": "bun",
      "args": ["run", "/path/to/sitelint/src/index.ts"],
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

Then ask your AI assistant:

- "Inspect https://mysite.com"
- "Run pagespeed on my homepage"
- "Show CrUX data for my site"
- "How have my Core Web Vitals changed over time?"
- "Which queries bring traffic to this page?"
- "Show me Discover performance"

### Run directly

```bash
bun run src/index.ts
```

## Philosophy

Every check is backed by Google's own data. No made-up rules, no industry conventions passed off as standards.

We researched every common SEO "rule" against official Google documentation:

- **Title length limits?** Google: "there's no limit." Gary Illyes: "externally made-up metric."
- **Meta description length?** Google: "no limit on how long a meta description can be."
- **Must have exactly one H1?** John Mueller: "You can use H1 tags as often as you want."
- **Word count minimum?** Mueller: "the number of words on a page is not a quality factor."

Instead of guessing, Sitelint asks Google directly.

## Development

```bash
bun run lint      # biome check
bun run format    # biome format
bun test          # run tests
```

## License

MIT
