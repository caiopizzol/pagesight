# Sitelint

Lint your site for search engines and AI.

An open-source MCP server powered by Google Search Console. Inspect indexing status, validate structured data, track search performance — directly from Google's index. No guesswork. No made-up rules. Only data Google actually reports.

## Install

```bash
bun install
```

## Tools

### `inspect`

Inspect a URL using Google's index. Returns index status, canonical (yours vs Google's), crawl status, rich results validation, mobile usability, sitemaps, and referring URLs.

### `performance`

Query search analytics with full API support:

- **Dimensions**: `query`, `page`, `country`, `device`, `date`, `searchAppearance`, `hour`
- **Search types**: `web`, `image`, `video`, `news`, `discover`, `googleNews`
- **Filter operators**: `equals`, `contains`, `notEquals`, `notContains`, `includingRegex`, `excludingRegex`
- **Aggregation**: `auto`, `byPage`, `byProperty`, `byNewsShowcasePanel`
- **Data freshness**: `all` (includes fresh), `final` (finalized only), `hourly_all` (hourly granularity)
- **Pagination**: `row_limit` (up to 25,000) + `start_row` offset

### `sitemaps`

Manage Search Console properties and sitemaps (read-only):

- `list_sites` — list all GSC properties
- `get_site` — get details for a specific property
- `list_sitemaps` — list sitemaps for a property
- `get_sitemap` — get details for a specific sitemap (type, errors, warnings, contents)

Action is auto-detected from parameters.

### `setup`

Check auth status or walk through the OAuth setup flow interactively.

## Setup

Sitelint uses the Google Search Console API. You need OAuth credentials.

### 1. Create Google Cloud credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or use an existing one)
3. Enable **Google Search Console API**
4. Go to **Credentials** > **Create Credentials** > **OAuth client ID**
5. Select **Desktop app**, name it "Sitelint"
6. Download the JSON file

### 2. Authorize

Run the OAuth flow to get a refresh token:

```bash
# Start the server and use the setup tool, or manually:
# 1. Visit the auth URL with your client_id
# 2. Authorize access to Search Console
# 3. Copy the code from the redirect URL
# 4. Exchange it for a refresh token
```

### 3. Configure

Create a `.env` file in the project root:

```env
GSC_CLIENT_ID=your-client-id.apps.googleusercontent.com
GSC_CLIENT_SECRET=your-client-secret
GSC_REFRESH_TOKEN=your-refresh-token
```

Or use a service account:

```env
GSC_SERVICE_ACCOUNT_KEY=/path/to/service-account.json
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
        "GSC_REFRESH_TOKEN": "your-token"
      }
    }
  }
}
```

Then ask your AI assistant:

- "Is https://mysite.com indexed?"
- "What canonical did Google choose for this page?"
- "Show me search performance for my site"
- "Which queries bring traffic to this page?"
- "Show me Discover performance"
- "List my sitemaps and any errors"

### Run directly

```bash
bun run src/index.ts
```

## What you get

### URL Inspection

```
=== URL Inspection: https://example.com ===

Verdict: PASS
Coverage: Submitted and indexed
Page fetch: SUCCESSFUL
Robots.txt: ALLOWED
Crawled as: MOBILE
Last crawled: 2026-03-30T08:59:15Z
Google's canonical: https://example.com
Your canonical: https://example.com

--- Rich Results ---
Type: Article
  Status: PASS
```

### Search Performance

```
=== Search Performance: sc-domain:example.com ===
Period: 2026-03-03 to 2026-03-28

Clicks: 1,200
Impressions: 45,000
Avg CTR: 2.7%
Avg Position: 8.3

--- Top Results ---
best widgets 2026 | https://example.com/widgets
  Clicks: 89 | Impressions: 3,200 | CTR: 2.8% | Position: 5.1
```

## Philosophy

Every check is backed by Google's own data. No made-up rules, no industry conventions passed off as standards.

We researched every common SEO "rule" against official Google documentation:

- **Title length limits?** Google: "there's no limit." Gary Illyes: "externally made-up metric."
- **Meta description length?** Google: "no limit on how long a meta description can be."
- **Must have exactly one H1?** John Mueller: "You can use H1 tags as often as you want. There's no limit."
- **Word count minimum?** Mueller: "the number of words on a page is not a quality factor."

Instead of guessing, Sitelint asks Google directly via the Search Console API.

## Development

```bash
bun run lint      # biome check
bun run format    # biome format
bun test          # run tests
```

## License

MIT
