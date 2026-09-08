import { querySearchAnalytics, type SearchAnalyticsFilter } from "../../providers/gsc.js";
import { pacificDaysAgo } from "../../shared/dates.js";
import { type SearchOptions } from "./schema.js";
import { textResult } from "./result.js";
export function extractPageText(html: string): string {
  // Extract text from HTML; this does not check rendered visibility.
  let text = html;
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim().toLowerCase();
  return text;
}

export function formatGapAnalysis(
  pageUrl: string,
  siteUrl: string,
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>,
  pageText: string,
): string {
  const lines: string[] = [`=== Keyword Gap Analysis: ${pageUrl} ===`, `Property: ${siteUrl}`, ""];

  if (queries.length === 0) {
    lines.push("No search queries found for this page.");
    return lines.join("\n");
  }

  const onPage: typeof queries = [];
  const gaps: typeof queries = [];

  for (const q of queries) {
    const words = q.query.toLowerCase().split(/\s+/);
    const allPresent = words.every((w) => pageText.includes(w));
    if (allPresent) {
      onPage.push(q);
    } else {
      gaps.push(q);
    }
  }

  lines.push(`Queries analyzed: ${queries.length}`);
  lines.push(`On page: ${onPage.length}`);
  lines.push(`Gaps (not on page): ${gaps.length}`);
  lines.push("");

  if (gaps.length > 0) {
    lines.push("--- Keyword Gaps (queries with impressions but missing from page) ---", "");
    gaps.sort((a, b) => b.impressions - a.impressions);
    for (const q of gaps.slice(0, 20)) {
      const ctr = (q.ctr * 100).toFixed(1);
      lines.push(
        `  "${q.query}" — ${q.impressions} imp, ${q.clicks} clicks, CTR ${ctr}%, pos ${q.position.toFixed(1)}`,
      );
    }
    if (gaps.length > 20) lines.push(`  ... and ${gaps.length - 20} more`);
    lines.push("");
  }

  if (onPage.length > 0) {
    lines.push("--- Already Targeted (query found on page) ---", "");
    onPage.sort((a, b) => b.impressions - a.impressions);
    for (const q of onPage.slice(0, 10)) {
      const ctr = (q.ctr * 100).toFixed(1);
      lines.push(
        `  "${q.query}" — ${q.impressions} imp, ${q.clicks} clicks, CTR ${ctr}%, pos ${q.position.toFixed(1)}`,
      );
    }
    if (onPage.length > 10) lines.push(`  ... and ${onPage.length - 10} more`);
    lines.push("");
  }

  const totalGapImpressions = gaps.reduce((sum, q) => sum + q.impressions, 0);
  const totalImpressions = queries.reduce((sum, q) => sum + q.impressions, 0);
  if (totalImpressions > 0) {
    const gapPct = Math.round((totalGapImpressions / totalImpressions) * 100);
    lines.push(`${gapPct}% of impressions come from queries not on the page — potential content opportunity.`);
  }

  return lines.join("\n");
}

// ── Tool registration ──

export async function runGaps(options: SearchOptions) {
  const { site_url, url, start_date, end_date, row_limit } = options;
  if (!url) return textResult("Error: url is required for gap analysis.");
  if (!site_url) return textResult("Error: site_url is required for gap analysis.");

  // Fetch page content and GSC queries in parallel
  const [pageRes, analyticsRes] = await Promise.all([
    fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1)", Accept: "text/html" },
      redirect: "follow",
    }),
    querySearchAnalytics(site_url, {
      startDate: start_date ?? pacificDaysAgo(28),
      endDate: end_date ?? pacificDaysAgo(3),
      dimensions: ["query"],
      rowLimit: row_limit ?? 500,
      dimensionFilterGroups: [
        {
          groupType: "and" as const,
          filters: [{ dimension: "page", operator: "equals", expression: url } as SearchAnalyticsFilter],
        },
      ],
    }),
  ]);

  if (!pageRes.ok) return textResult(`Error fetching ${url}: HTTP ${pageRes.status}`);
  const html = await pageRes.text();
  const pageText = extractPageText(html);

  const queries = (analyticsRes.rows ?? []).map((row) => ({
    query: row.keys[0],
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: row.position,
  }));

  return textResult(formatGapAnalysis(url, site_url, queries, pageText));
}
