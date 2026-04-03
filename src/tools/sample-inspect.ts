import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { inspectUrl, listSitemaps } from "../lib/gsc.js";

export interface SitemapParseResult {
  urls: string[];
  isSitemapIndex: boolean;
  childSitemaps: string[];
}

export function parseSitemapXml(xml: string): SitemapParseResult {
  const urls: string[] = [];
  const childSitemaps: string[] = [];

  // Check if it's a sitemap index
  const isSitemapIndex = /<sitemapindex/i.test(xml);

  if (isSitemapIndex) {
    for (const m of xml.matchAll(/<sitemap[^>]*>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>[\s\S]*?<\/sitemap>/gi)) {
      childSitemaps.push(m[1].trim());
    }
  } else {
    for (const m of xml.matchAll(/<url[^>]*>[\s\S]*?<loc>\s*(.*?)\s*<\/loc>[\s\S]*?<\/url>/gi)) {
      urls.push(m[1].trim());
    }
  }

  return { urls, isSitemapIndex, childSitemaps };
}

export async function fetchSitemap(sitemapUrl: string): Promise<SitemapParseResult> {
  const res = await fetch(sitemapUrl, {
    headers: { "User-Agent": "Pagesight/1.0" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch sitemap ${sitemapUrl}: HTTP ${res.status}`);
  }

  const xml = await res.text();
  return parseSitemapXml(xml);
}

export function sampleUrls(urls: string[], count: number, strategy: string): string[] {
  if (urls.length <= count) return [...urls];

  if (strategy === "first") {
    return urls.slice(0, count);
  }

  if (strategy === "spread") {
    const step = Math.floor(urls.length / count);
    const sampled: string[] = [];
    for (let i = 0; i < count; i++) {
      sampled.push(urls[i * step]);
    }
    return sampled;
  }

  // random (default)
  const shuffled = [...urls];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export interface InspectionSummary {
  url: string;
  verdict: string;
  coverageState: string;
  pageFetchState: string;
  robotsTxtState: string;
  indexingState: string;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  error: string | null;
}

export async function inspectSingle(url: string, siteUrl: string): Promise<InspectionSummary> {
  try {
    const r = await inspectUrl(url, siteUrl);
    const idx = r.indexStatusResult;
    return {
      url,
      verdict: idx.verdict,
      coverageState: idx.coverageState,
      pageFetchState: idx.pageFetchState,
      robotsTxtState: idx.robotsTxtState,
      indexingState: idx.indexingState,
      lastCrawlTime: idx.lastCrawlTime ?? null,
      googleCanonical: idx.googleCanonical ?? null,
      error: null,
    };
  } catch (err) {
    return {
      url,
      verdict: "ERROR",
      coverageState: "ERROR",
      pageFetchState: "ERROR",
      robotsTxtState: "ERROR",
      indexingState: "ERROR",
      lastCrawlTime: null,
      googleCanonical: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function humanizeState(state: string): string {
  const map: Record<string, string> = {
    PAGE_FETCH_STATE_UNSPECIFIED: "not yet crawled",
    ROBOTS_TXT_STATE_UNSPECIFIED: "not yet checked",
    INDEXING_STATE_UNSPECIFIED: "not yet determined",
  };
  return map[state] ?? state;
}

function formatResults(siteUrl: string, sitemapUrl: string, totalUrls: number, results: InspectionSummary[]): string {
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

export function registerSampleInspectTool(server: McpServer): void {
  server.tool(
    "sample_inspect",
    "Sample URLs from a sitemap and batch-inspect them via Google Search Console. Diagnoses indexing issues by revealing patterns across multiple URLs — why pages aren't indexed, common fetch errors, robots.txt blocks.",
    {
      site_url: z.string().describe("GSC property (e.g., 'https://example.com/' or 'sc-domain:example.com')"),
      sitemap_url: z
        .string()
        .url()
        .optional()
        .describe("Sitemap URL to sample from. If omitted, discovers sitemaps from GSC."),
      sample_size: z.number().min(1).max(10).optional().describe("Number of URLs to inspect. Default: 5. Max: 10."),
      strategy: z
        .enum(["random", "first", "spread"])
        .optional()
        .describe("Sampling strategy. 'random' (default), 'first' (first N), 'spread' (evenly spaced)."),
    },
    async ({ site_url, sitemap_url, sample_size, strategy }) => {
      const count = sample_size ?? 5;
      const sampleStrategy = strategy ?? "random";

      try {
        // Discover sitemap URL if not provided
        let resolvedSitemapUrl = sitemap_url;
        if (!resolvedSitemapUrl) {
          const sitemaps = await listSitemaps(site_url);
          if (sitemaps.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: `No sitemaps found for ${site_url} in GSC. Provide a sitemap_url directly.`,
                },
              ],
            };
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
          return {
            content: [
              {
                type: "text",
                text: `Sitemap ${resolvedSitemapUrl} contains no URLs.`,
              },
            ],
          };
        }

        // Sample URLs
        const sampled = sampleUrls(parsed.urls, count, sampleStrategy);

        // Inspect each URL sequentially (API rate limits)
        const results: InspectionSummary[] = [];
        for (const url of sampled) {
          results.push(await inspectSingle(url, site_url));
        }

        return {
          content: [
            {
              type: "text",
              text: formatResults(site_url, resolvedSitemapUrl, parsed.urls.length, results),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
        };
      }
    },
  );
}
