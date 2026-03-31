# Sitelint

Google's data, your AI assistant's hands.

An open-source MCP server that gives AI assistants direct access to Google Search Console, PageSpeed Insights, and Chrome UX Report. No made-up rules. No invented scores. Just what Google actually reports about your site.

Most SEO tools flag "title over 60 characters" and "only one H1 allowed." [Google's own engineers say those rules don't exist.](#why-not-other-seo-tools) Sitelint skips the myths and asks Google directly.

## Tools

Seven tools. Three Google APIs. One install.

### `inspect`

Ask Google: is this page indexed? What canonical did you choose? Any crawl errors? Structured data issues?

Returns index status, canonical (yours vs Google's), crawl status, rich results validation, sitemaps, and referring URLs — directly from Google's index.

### `pagespeed`

Run Google Lighthouse on any URL:

- **Scores**: performance, accessibility, best-practices, seo
- **Core Web Vitals (lab)**: FCP, LCP, TBT, CLS, Speed Index, TTI
- **CrUX field data**: real Chrome user metrics when available (page + origin)
- **Opportunities**: ranked by severity with potential savings
- **Strategy**: `mobile` or `desktop`
- **Locale**: localized results (e.g., `pt-BR`)

### `crux`

Real-world Core Web Vitals from Chrome users (28-day rolling window):

- **Metrics**: LCP, FCP, INP, CLS, TTFB, RTT, navigation types, form factors
- **Granularity**: by URL or origin, by device (DESKTOP, PHONE, TABLET)
- **Data**: p75 values + histogram distributions (good/needs improvement/poor)

### `crux_history`

Core Web Vitals trends over time — up to 40 weekly data points (~10 months):

- Trend detection (improved/stable/worse) with percentage change
- Recent data points table for LCP, INP, CLS
- Custom period count (1-40)

### `performance`

Google Search Console search analytics with full API coverage:

- **Dimensions**: `query`, `page`, `country`, `device`, `date`, `searchAppearance`, `hour`
- **Search types**: `web`, `image`, `video`, `news`, `discover`, `googleNews`
- **Filters**: `equals`, `contains`, `notEquals`, `notContains`, `includingRegex`, `excludingRegex`
- **Aggregation**: `auto`, `byPage`, `byProperty`, `byNewsShowcasePanel`
- **Data freshness**: `all`, `final`, `hourly_all`
- **Pagination**: up to 25,000 rows with offset

### `sitemaps`

Search Console properties and sitemaps (read-only):

- `list_sites` — all GSC properties with permission level
- `get_site` — details for a specific property
- `list_sitemaps` — sitemaps with error/warning counts and content types
- `get_sitemap` — full details for a specific sitemap

### `setup`

Check auth status or walk through OAuth interactively.

## Setup

### 1. Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use existing)
3. Enable three APIs:
   - **Google Search Console API**
   - **PageSpeed Insights API**
   - **Chrome UX Report API**
4. Create **OAuth client ID** (Desktop app) — for Search Console
5. Create **API key** — for PageSpeed and CrUX

### 2. Authorize Search Console

Use the `setup` tool to walk through OAuth, or manually:

1. Visit the auth URL with your client ID
2. Authorize access to Search Console
3. Copy the code from the redirect URL
4. Exchange it for a refresh token

### 3. Configure

```env
GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GSC_CLIENT_SECRET=your-client-secret
GSC_REFRESH_TOKEN=your-refresh-token
GOOGLE_API_KEY=your-api-key
```

## Usage

Add to Claude Code, Cursor, or any MCP client:

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

Then just talk to your AI assistant:

```
"Is https://mysite.com indexed?"
"What canonical did Google choose for this page?"
"Run pagespeed on my homepage, mobile"
"Show me CrUX data for my site on phones"
"How have my Core Web Vitals changed over the last 10 months?"
"Which queries bring traffic to this page?"
"Show me image search performance"
"Any sitemap errors?"
```

## Why not other SEO tools?

We researched every common SEO "rule" against official Google documentation. Most are myths:

- **"Title must be under 60 characters"** — Google: "there's no limit." Gary Illyes called it "an externally made-up metric."
- **"Meta description must be 155 characters"** — Google: "there's no limit on how long a meta description can be."
- **"Only one H1 per page"** — John Mueller: "You can use H1 tags as often as you want. There's no limit."
- **"Minimum 300 words per page"** — Mueller: "the number of words on a page is not a quality factor, not a ranking factor."
- **"Text-to-HTML ratio matters"** — Mueller: "it makes absolutely no sense at all for SEO."

Tools that flag these "issues" are reporting their opinions, not Google's data. Sitelint only reports what Google's APIs actually return.

## Development

```bash
bun install       # install dependencies
bun run start     # start MCP server
bun run lint      # biome check
bun run format    # biome format
```

## License

MIT
