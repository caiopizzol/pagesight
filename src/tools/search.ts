import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type GscSite,
  type GscSitemap,
  getSite,
  getSitemap,
  type InspectionResult,
  inspectUrl,
  listSitemaps,
  listSites,
  querySearchAnalytics,
  type SearchAnalyticsFilter,
  type SearchAnalyticsResponse,
} from "../lib/gsc.js";
import { fetchSitemap, type InspectionSummary, inspectSingle, sampleUrls } from "../lib/sitemap.js";

// ── Inspect formatters ──

function formatInspection(url: string, siteUrl: string, r: InspectionResult): string {
  const idx = r.indexStatusResult;
  const lines: string[] = [
    `=== URL Inspection: ${url} ===`,
    `Property: ${siteUrl}`,
    "",
    "--- Index Status ---",
    "",
    `Verdict: ${idx.verdict}`,
    `Coverage: ${idx.coverageState}`,
    `Page fetch: ${idx.pageFetchState}`,
    `Robots.txt: ${idx.robotsTxtState}`,
    `Indexing: ${idx.indexingState}`,
    `Crawled as: ${idx.crawledAs ?? "unknown"}`,
  ];

  if (idx.lastCrawlTime) lines.push(`Last crawled: ${idx.lastCrawlTime}`);
  if (idx.userCanonical) lines.push(`Your canonical: ${idx.userCanonical}`);
  if (idx.googleCanonical) lines.push(`Google's canonical: ${idx.googleCanonical}`);

  if (idx.userCanonical && idx.googleCanonical && idx.userCanonical !== idx.googleCanonical) {
    lines.push(`\n⚠ CANONICAL MISMATCH: You declared "${idx.userCanonical}" but Google chose "${idx.googleCanonical}"`);
  }

  if (idx.sitemap && idx.sitemap.length > 0) {
    lines.push(`\nSitemaps: ${idx.sitemap.join(", ")}`);
  }

  if (idx.referringUrls && idx.referringUrls.length > 0) {
    lines.push(`\nReferring URLs: ${idx.referringUrls.join(", ")}`);
  }

  if (idx.verdict !== "PASS") {
    const gscUrl = `https://search.google.com/search-console/inspect?resource_id=${encodeURIComponent(siteUrl)}&id=${encodeURIComponent(url)}`;
    lines.push("", "→ This page is not indexed. Request indexing manually in Google Search Console:", `  ${gscUrl}`);
  }

  // Rich Results
  if (r.richResultsResult) {
    lines.push("", "--- Rich Results ---", "");
    lines.push(`Verdict: ${r.richResultsResult.verdict}`);

    for (const item of r.richResultsResult.detectedItems ?? []) {
      lines.push(`\nType: ${item.richResultType}`);
      for (const instance of item.items ?? []) {
        if (instance.name) lines.push(`  Name: ${instance.name}`);
        const issues = instance.issues ?? [];
        if (issues.length === 0) {
          lines.push("  Status: PASS");
        } else {
          for (const issue of issues) {
            lines.push(`  ${issue.severity}: ${issue.issueMessage}`);
          }
        }
      }
    }
  }

  // Mobile Usability (deprecated but still returned)
  if (r.mobileUsabilityResult) {
    lines.push("", "--- Mobile Usability (deprecated) ---", "");
    lines.push(`Verdict: ${r.mobileUsabilityResult.verdict}`);
    if (r.mobileUsabilityResult.issues) {
      for (const issue of r.mobileUsabilityResult.issues) {
        lines.push(`  ${issue.issueType}${issue.message ? `: ${issue.message}` : ""}`);
      }
    }
  }

  // Inspection link
  if (r.inspectionResultLink) {
    lines.push("", `Full report: ${r.inspectionResultLink}`);
  }

  return lines.join("\n");
}

// ── Sample-inspect formatters ──

function humanizeState(state: string): string {
  const map: Record<string, string> = {
    PAGE_FETCH_STATE_UNSPECIFIED: "not yet crawled",
    ROBOTS_TXT_STATE_UNSPECIFIED: "not yet checked",
    INDEXING_STATE_UNSPECIFIED: "not yet determined",
  };
  return map[state] ?? state;
}

function formatSampleResults(
  siteUrl: string,
  sitemapUrl: string,
  totalUrls: number,
  results: InspectionSummary[],
): string {
  const lines: string[] = [
    `=== Sample Inspection: ${siteUrl} ===`,
    `Sitemap: ${sitemapUrl} (${totalUrls.toLocaleString()} URLs)`,
    `Sampled: ${results.length}`,
    "",
  ];

  // Summary
  const verdictCounts: Record<string, number> = {};
  const coverageCounts: Record<string, number> = {};
  const fetchCounts: Record<string, number> = {};
  let indexed = 0;
  let errors = 0;

  for (const r of results) {
    if (r.error) {
      errors++;
      continue;
    }
    verdictCounts[r.verdict] = (verdictCounts[r.verdict] ?? 0) + 1;
    coverageCounts[r.coverageState] = (coverageCounts[r.coverageState] ?? 0) + 1;
    fetchCounts[r.pageFetchState] = (fetchCounts[r.pageFetchState] ?? 0) + 1;
    if (r.verdict === "PASS") indexed++;
  }

  const inspected = results.length - errors;
  lines.push("--- Summary ---", "");
  lines.push(`Indexed: ${indexed}/${inspected}`);

  if (indexed < inspected) {
    lines.push(`Not indexed: ${inspected - indexed}/${inspected}`);
    for (const [state, count] of Object.entries(coverageCounts)) {
      if (state !== "Submitted and indexed" && state !== "Indexing allowed") {
        lines.push(`  ${state}: ${count}`);
      }
    }
  }

  // Page fetch issues
  const fetchIssues = Object.entries(fetchCounts).filter(([s]) => s !== "SUCCESSFUL");
  if (fetchIssues.length > 0) {
    lines.push("");
    lines.push("Page fetch issues:");
    for (const [state, count] of fetchIssues) {
      lines.push(`  ${humanizeState(state)}: ${count}`);
    }
  }

  if (errors > 0) {
    lines.push(`\nInspection errors: ${errors}`);
  }

  // Individual results
  lines.push("", "--- Details ---", "");
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.url}`);
    if (r.error) {
      lines.push(`   Error: ${r.error}`);
    } else {
      lines.push(`   Verdict: ${r.verdict}`);
      lines.push(`   Coverage: ${r.coverageState}`);
      lines.push(`   Page fetch: ${humanizeState(r.pageFetchState)}`);
      if (r.robotsTxtState !== "ALLOWED") lines.push(`   Robots.txt: ${humanizeState(r.robotsTxtState)}`);
      if (r.indexingState !== "INDEXING_ALLOWED") lines.push(`   Indexing: ${humanizeState(r.indexingState)}`);
      if (r.lastCrawlTime) lines.push(`   Last crawled: ${r.lastCrawlTime}`);
      if (r.googleCanonical && r.googleCanonical !== r.url) {
        lines.push(`   Google canonical: ${r.googleCanonical}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Sitemaps formatters ──

function formatSites(sites: GscSite[]): string {
  if (sites.length === 0) return "No Search Console properties found.";

  const lines: string[] = [`=== GSC Properties (${sites.length}) ===`, ""];
  for (const site of sites) {
    lines.push(`${site.siteUrl} (${site.permissionLevel})`);
  }
  return lines.join("\n");
}

function formatSite(site: GscSite): string {
  return [`=== Site: ${site.siteUrl} ===`, "", `Permission: ${site.permissionLevel}`].join("\n");
}

function formatSitemapDetail(sm: GscSitemap): string {
  const lines: string[] = [`=== Sitemap: ${sm.path} ===`, ""];
  if (sm.type) lines.push(`Type: ${sm.type}`);
  if (sm.lastSubmitted) lines.push(`Submitted: ${sm.lastSubmitted}`);
  if (sm.lastDownloaded) lines.push(`Downloaded: ${sm.lastDownloaded}`);
  lines.push(`Pending: ${sm.isPending}`);
  lines.push(`Index: ${sm.isSitemapsIndex}`);
  if (sm.warnings) lines.push(`Warnings: ${sm.warnings}`);
  if (sm.errors) lines.push(`Errors: ${sm.errors}`);
  if (sm.contents && sm.contents.length > 0) {
    lines.push("", "Contents:");
    for (const c of sm.contents) {
      lines.push(`  ${c.type}: ${c.submitted ?? "?"} submitted, ${c.indexed ?? "?"} indexed`);
    }
  }
  return lines.join("\n");
}

function formatSitemaps(siteUrl: string, sitemaps: GscSitemap[]): string {
  if (sitemaps.length === 0) return `No sitemaps found for ${siteUrl}.`;

  const lines: string[] = [`=== Sitemaps: ${siteUrl} (${sitemaps.length}) ===`, ""];

  for (const sm of sitemaps) {
    lines.push(`${sm.path}`);
    if (sm.type) lines.push(`  Type: ${sm.type}`);
    if (sm.lastSubmitted) lines.push(`  Submitted: ${sm.lastSubmitted}`);
    if (sm.lastDownloaded) lines.push(`  Downloaded: ${sm.lastDownloaded}`);
    lines.push(`  Pending: ${sm.isPending}`);
    lines.push(`  Index: ${sm.isSitemapsIndex}`);
    if (sm.warnings) lines.push(`  Warnings: ${sm.warnings}`);
    if (sm.errors) lines.push(`  Errors: ${sm.errors}`);
    if (sm.contents) {
      for (const c of sm.contents) {
        lines.push(`  ${c.type}: ${c.submitted ?? "?"} submitted, ${c.indexed ?? "?"} indexed`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

// ── Performance formatters ──

interface Totals {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

function computeTotals(rows: SearchAnalyticsResponse["rows"]): Totals {
  const r = rows ?? [];
  const clicks = r.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = r.reduce((sum, row) => sum + row.impressions, 0);
  const ctr = impressions > 0 ? clicks / impressions : 0;
  const position = impressions > 0 ? r.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions : 0;
  return { clicks, impressions, ctr, position };
}

function pctChange(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? `+${current} (new)` : "0%";
  const change = ((current - previous) / previous) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
}

function formatPerformance(
  siteUrl: string,
  result: SearchAnalyticsResponse,
  dimensions: string[],
  startDate: string,
  endDate: string,
): string {
  const rows = result.rows ?? [];
  const lines: string[] = [
    `=== Search Performance: ${siteUrl} ===`,
    `Period: ${startDate} to ${endDate}`,
    `Dimensions: ${dimensions.join(", ")}`,
    `Aggregation: ${result.responseAggregationType ?? "auto"}`,
    `Results: ${rows.length}`,
    "",
  ];

  if (result.metadata) {
    if (result.metadata.first_incomplete_date)
      lines.push(`Data incomplete from: ${result.metadata.first_incomplete_date}`);
    if (result.metadata.first_incomplete_hour)
      lines.push(`Hourly data incomplete from: ${result.metadata.first_incomplete_hour}`);
    lines.push("");
  }

  if (rows.length === 0) {
    lines.push("No data found for this period and filters.");
    return lines.join("\n");
  }

  const totals = computeTotals(rows);

  if (totals.impressions < 10) {
    lines.push("⚠ Low data volume — trends may not be meaningful.", "");
  }

  lines.push(
    `--- Summary (${rows.length} rows returned) ---`,
    "",
    `Clicks: ${totals.clicks.toLocaleString()}`,
    `Impressions: ${totals.impressions.toLocaleString()}`,
    `Avg CTR: ${(totals.ctr * 100).toFixed(1)}%`,
    `Avg Position: ${totals.position.toFixed(1)}`,
    "",
    "--- Top Results ---",
    "",
  );

  const top = rows.slice(0, 25);
  for (const row of top) {
    const keys = row.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
    lines.push(`${keys}`);
    lines.push(
      `  Clicks: ${row.clicks} | Impressions: ${row.impressions} | CTR: ${(row.ctr * 100).toFixed(1)}% | Position: ${row.position.toFixed(1)}`,
    );
  }

  if (rows.length > 25) {
    lines.push("", `... and ${rows.length - 25} more rows`);
  }

  return lines.join("\n");
}

function formatComparison(
  siteUrl: string,
  current: SearchAnalyticsResponse,
  previous: SearchAnalyticsResponse,
  dimensions: string[],
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string,
): string {
  const curRows = current.rows ?? [];
  const prevRows = previous.rows ?? [];
  const cur = computeTotals(curRows);
  const prev = computeTotals(prevRows);

  const lines: string[] = [
    `=== Search Performance: ${siteUrl} ===`,
    `Current:  ${currentStart} to ${currentEnd}`,
    `Previous: ${previousStart} to ${previousEnd}`,
    `Dimensions: ${dimensions.join(", ")}`,
    "",
  ];

  if (cur.impressions < 10 && prev.impressions < 10) {
    lines.push("⚠ Low data volume — trends may not be meaningful.", "");
  }

  lines.push("--- Summary ---", "");
  lines.push("             Current     Previous    Change");
  lines.push(
    `Clicks:      ${String(cur.clicks.toLocaleString()).padEnd(12)} ${String(prev.clicks.toLocaleString()).padEnd(12)} ${pctChange(cur.clicks, prev.clicks)}`,
  );
  lines.push(
    `Impressions: ${String(cur.impressions.toLocaleString()).padEnd(12)} ${String(prev.impressions.toLocaleString()).padEnd(12)} ${pctChange(cur.impressions, prev.impressions)}`,
  );
  const curCtr = `${(cur.ctr * 100).toFixed(1)}%`;
  const prevCtr = `${(prev.ctr * 100).toFixed(1)}%`;
  lines.push(`Avg CTR:     ${curCtr.padEnd(12)} ${prevCtr.padEnd(12)} ${((cur.ctr - prev.ctr) * 100).toFixed(1)}pp`);
  const posStatus =
    prev.position === 0 && cur.position > 0
      ? "new"
      : cur.position < prev.position
        ? "improved"
        : cur.position > prev.position
          ? "regressed"
          : "stable";
  lines.push(
    `Avg Position:${String(cur.position.toFixed(1)).padEnd(13)} ${String(prev.position.toFixed(1)).padEnd(12)} ${posStatus} (${(cur.position - prev.position).toFixed(1)})`,
  );
  lines.push("");

  // Build lookup for previous period rows
  const prevMap = new Map<string, (typeof prevRows)[0]>();
  for (const row of prevRows) {
    prevMap.set(row.keys.join("|"), row);
  }

  // Find biggest movers (by click change)
  const movers: Array<{ keys: string[]; curClicks: number; prevClicks: number; curPos: number; prevPos: number }> = [];
  for (const row of curRows) {
    const key = row.keys.join("|");
    const prevRow = prevMap.get(key);
    movers.push({
      keys: row.keys,
      curClicks: row.clicks,
      prevClicks: prevRow?.clicks ?? 0,
      curPos: row.position,
      prevPos: prevRow?.position ?? 0,
    });
  }

  // Also include rows that disappeared (were in previous but not in current)
  const curKeys = new Set(curRows.map((r) => r.keys.join("|")));
  for (const row of prevRows) {
    const key = row.keys.join("|");
    if (!curKeys.has(key)) {
      movers.push({
        keys: row.keys,
        curClicks: 0,
        prevClicks: row.clicks,
        curPos: 0,
        prevPos: row.position,
      });
    }
  }

  // Sort by absolute click change descending
  movers.sort((a, b) => Math.abs(b.curClicks - b.prevClicks) - Math.abs(a.curClicks - a.prevClicks));

  const improved = movers.filter((m) => m.curClicks > m.prevClicks).slice(0, 10);
  const regressed = movers.filter((m) => m.curClicks < m.prevClicks).slice(0, 10);

  if (improved.length > 0) {
    lines.push("--- Improved ---", "");
    for (const m of improved) {
      const keys = m.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
      const posChange = m.prevPos > 0 ? ` | Position: ${m.prevPos.toFixed(1)} → ${m.curPos.toFixed(1)}` : "";
      lines.push(`${keys}`);
      lines.push(`  Clicks: ${m.prevClicks} → ${m.curClicks} (${pctChange(m.curClicks, m.prevClicks)})${posChange}`);
    }
    lines.push("");
  }

  lines.push("--- Regressed ---", "");
  if (regressed.length > 0) {
    for (const m of regressed) {
      const keys = m.keys.map((k, i) => `${dimensions[i] ?? "key"}=${k}`).join(" | ");
      const posChange = m.prevPos > 0 ? ` | Position: ${m.prevPos.toFixed(1)} → ${m.curPos.toFixed(1)}` : "";
      lines.push(`${keys}`);
      lines.push(`  Clicks: ${m.prevClicks} → ${m.curClicks} (${pctChange(m.curClicks, m.prevClicks)})${posChange}`);
    }
  } else {
    lines.push("(none)");
  }
  lines.push("");

  return lines.join("\n");
}

function daysAgo(n: number): string {
  // GSC dates are in Pacific Time. Use Intl to handle DST correctly.
  const d = new Date();
  d.setDate(d.getDate() - n);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return parts; // en-CA formats as YYYY-MM-DD
}

// ── Tool registration ──

export function registerSearchTool(server: McpServer): void {
  server.tool(
    "search",
    "Query Google Search Console. Inspect URL indexing status, sample-inspect sitemap URLs, list properties and sitemaps, or analyze search traffic (clicks, impressions, CTR, rankings).",
    {
      action: z
        .enum(["inspect", "sample", "sitemaps", "analytics", "list_sites", "get_site", "get_sitemap"])
        .optional()
        .describe("Action to perform. Auto-detected from params when unambiguous."),
      site_url: z.string().optional().describe("GSC property (e.g., 'sc-domain:example.com')."),
      url: z.string().url().optional().describe("URL to inspect in Google's index."),
      sitemap_url: z.string().url().optional().describe("Sitemap URL for sample inspection or get_sitemap."),
      sample_size: z.number().min(1).max(10).optional().describe("URLs to sample-inspect (1-10). Default: 5."),
      sample_strategy: z
        .enum(["random", "first", "spread"])
        .optional()
        .describe("Sampling strategy. Default: 'random'."),
      start_date: z.string().optional().describe("Start date (YYYY-MM-DD) for analytics. Default: 28 days ago."),
      end_date: z.string().optional().describe("End date (YYYY-MM-DD) for analytics. Default: 3 days ago."),
      dimensions: z
        .array(z.enum(["query", "page", "country", "device", "date", "searchAppearance", "hour"]))
        .optional()
        .describe("Analytics dimensions. Default: auto."),
      search_type: z
        .enum(["web", "image", "video", "news", "discover", "googleNews"])
        .optional()
        .describe("Search type for analytics."),
      data_state: z.enum(["all", "final", "hourly_all"]).optional().describe("Data freshness for analytics."),
      aggregation_type: z
        .enum(["auto", "byPage", "byProperty", "byNewsShowcasePanel"])
        .optional()
        .describe("Aggregation mode for analytics."),
      filters: z
        .array(
          z.object({
            dimension: z.enum(["query", "page", "country", "device", "searchAppearance"]),
            operator: z.enum(["equals", "contains", "notEquals", "notContains", "includingRegex", "excludingRegex"]),
            expression: z.string(),
          }),
        )
        .optional()
        .describe("Dimension filters for analytics."),
      row_limit: z.number().optional().describe("Max rows for analytics (1-25000). Default: 1000."),
      start_row: z.number().optional().describe("Pagination offset for analytics."),
      compare: z.boolean().optional().describe("Compare current vs previous period for analytics."),
    },
    async (params) => {
      const {
        site_url,
        url,
        sitemap_url,
        sample_size,
        sample_strategy,
        start_date,
        end_date,
        dimensions,
        search_type,
        data_state,
        aggregation_type,
        filters,
        row_limit,
        start_row,
        compare,
      } = params;

      // ── Route to action ──
      const hasAnalyticsParams = !!(start_date || end_date || dimensions || filters || compare);

      const resolvedAction =
        params.action ??
        (url && site_url && !hasAnalyticsParams
          ? "inspect"
          : sample_size
            ? "sample"
            : hasAnalyticsParams
              ? "analytics"
              : sitemap_url && site_url
                ? "get_sitemap"
                : site_url
                  ? "sitemaps"
                  : "list_sites");

      try {
        // ── inspect ──
        if (resolvedAction === "inspect") {
          if (!url) return textResult("Error: url is required for inspect.");
          if (!site_url) return textResult("Error: site_url is required for inspect.");

          try {
            const result = await inspectUrl(url, site_url);
            return textResult(formatInspection(url, site_url, result));
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("PERMISSION_DENIED")) {
              const domain = new URL(url).hostname;
              return textResult(
                [
                  `Error: Cannot inspect "${url}" — permission denied for property "${site_url}".`,
                  "",
                  "Possible causes:",
                  `  1. ${domain} is not a verified property in Google Search Console`,
                  `  2. The authenticated account does not have access to "${site_url}"`,
                  `  3. The property format is wrong — try "sc-domain:${domain}" or "https://${domain}/"`,
                  "",
                  "To verify a property: https://search.google.com/search-console",
                  "To check your auth: use the setup tool to verify credentials",
                ].join("\n"),
              );
            }
            return textResult(`Error inspecting URL: ${msg}`);
          }
        }

        // ── sample ──
        if (resolvedAction === "sample") {
          if (!site_url) return textResult("Error: site_url is required for sample.");

          const count = sample_size ?? 5;
          const strategy = sample_strategy ?? "random";

          // Discover sitemap URL if not provided
          let resolvedSitemapUrl = sitemap_url;
          if (!resolvedSitemapUrl) {
            const sitemaps = await listSitemaps(site_url);
            if (sitemaps.length === 0) {
              return textResult(`No sitemaps found for ${site_url} in GSC. Provide a sitemap_url directly.`);
            }
            // Pick the first non-index sitemap, or the first one
            const nonIndex = sitemaps.find((s) => !s.isSitemapsIndex);
            resolvedSitemapUrl = (nonIndex ?? sitemaps[0]).path;
          }

          // Fetch and parse sitemap
          let parsed = await fetchSitemap(resolvedSitemapUrl);

          // If it's a sitemap index, fetch the first child
          if (parsed.isSitemapIndex && parsed.childSitemaps.length > 0) {
            const childUrl = parsed.childSitemaps[0];
            parsed = await fetchSitemap(childUrl);
            resolvedSitemapUrl = `${resolvedSitemapUrl} → ${childUrl}`;
          }

          if (parsed.urls.length === 0) {
            return textResult(`Sitemap ${resolvedSitemapUrl} contains no URLs.`);
          }

          // Sample URLs
          const sampled = sampleUrls(parsed.urls, count, strategy);

          // Inspect each URL sequentially (API rate limits)
          const results: InspectionSummary[] = [];
          for (const u of sampled) {
            results.push(await inspectSingle(u, site_url));
          }

          return textResult(formatSampleResults(site_url, resolvedSitemapUrl, parsed.urls.length, results));
        }

        // ── list_sites ──
        if (resolvedAction === "list_sites") {
          const sites = await listSites();
          return textResult(formatSites(sites));
        }

        // ── get_site ──
        if (resolvedAction === "get_site") {
          if (!site_url) return textResult("Error: site_url is required for get_site.");
          const site = await getSite(site_url);
          return textResult(formatSite(site));
        }

        // ── get_sitemap ──
        if (resolvedAction === "get_sitemap") {
          if (!site_url) return textResult("Error: site_url is required for get_sitemap.");
          if (!sitemap_url) return textResult("Error: sitemap_url is required for get_sitemap.");
          const sm = await getSitemap(site_url, sitemap_url);
          return textResult(formatSitemapDetail(sm));
        }

        // ── sitemaps (list_sitemaps) ──
        if (resolvedAction === "sitemaps") {
          if (!site_url) return textResult("Error: site_url is required for sitemaps.");
          const sitemaps = await listSitemaps(site_url);
          return textResult(formatSitemaps(site_url, sitemaps));
        }

        // ── analytics ──
        if (resolvedAction === "analytics") {
          if (!site_url) return textResult("Error: site_url is required for analytics.");

          const startDate = start_date ?? daysAgo(28);
          const endDate = end_date ?? daysAgo(3);

          if (start_date && Number.isNaN(new Date(start_date).getTime())) {
            return textResult(`Error: invalid start_date "${start_date}". Use YYYY-MM-DD format.`);
          }
          if (end_date && Number.isNaN(new Date(end_date).getTime())) {
            return textResult(`Error: invalid end_date "${end_date}". Use YYYY-MM-DD format.`);
          }
          const dims = dimensions ?? ["query", "page"];

          const filterGroups =
            filters && filters.length > 0
              ? [{ groupType: "and" as const, filters: filters as SearchAnalyticsFilter[] }]
              : undefined;

          const queryOpts = {
            startDate,
            endDate,
            dimensions: dims,
            type: search_type,
            dataState: data_state,
            aggregationType: aggregation_type,
            rowLimit: row_limit ?? 1000,
            startRow: start_row,
            dimensionFilterGroups: filterGroups,
          };

          if (compare) {
            // Calculate previous period of equal length
            const start = new Date(startDate);
            const end = new Date(endDate);
            const durationMs = end.getTime() - start.getTime();
            const prevEnd = new Date(start.getTime() - 1 * 24 * 60 * 60 * 1000); // day before current start
            const prevStart = new Date(prevEnd.getTime() - durationMs);
            const prevStartDate = prevStart.toISOString().split("T")[0];
            const prevEndDate = prevEnd.toISOString().split("T")[0];

            const [current, previous] = await Promise.all([
              querySearchAnalytics(site_url, queryOpts),
              querySearchAnalytics(site_url, { ...queryOpts, startDate: prevStartDate, endDate: prevEndDate }),
            ]);

            return textResult(
              formatComparison(site_url, current, previous, dims, startDate, endDate, prevStartDate, prevEndDate),
            );
          }

          const result = await querySearchAnalytics(site_url, queryOpts);
          return textResult(formatPerformance(site_url, result, dims, startDate, endDate));
        }

        return textResult(`Error: Unknown action "${resolvedAction}".`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return textResult(`Error: ${msg}`);
      }
    },
  );
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}
