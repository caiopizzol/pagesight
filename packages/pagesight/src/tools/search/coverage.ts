import { listSitemaps } from "../../providers/gsc.js";
import { type SearchOptions } from "./schema.js";
import { humanizeState, type InspectionSummary, inspectSingle } from "./inspection.js";
import { fetchSitemap, sampleUrls } from "./sitemap-sampling.js";
import { textResult } from "./result.js";
const COVERAGE_FILTERS = [
  "not_indexed",
  "server_error",
  "redirect",
  "soft_404",
  "blocked",
  "duplicate",
  "discovered",
  "crawled_not_indexed",
] as const;

type CoverageFilter = (typeof COVERAGE_FILTERS)[number];

export function matchesCoverageFilter(result: InspectionSummary, filter: CoverageFilter): boolean {
  if (result.error) return false;
  const cs = result.coverageState.toLowerCase();
  const pf = result.pageFetchState.toLowerCase();
  switch (filter) {
    case "not_indexed":
      return result.verdict !== "PASS";
    case "server_error":
      return cs.includes("server error") || pf === "server_error";
    case "redirect":
      return cs.includes("redirect") || pf.includes("redirect");
    case "soft_404":
      return cs.includes("soft 404") || pf === "soft_404";
    case "blocked":
      return cs.includes("blocked");
    case "duplicate":
      return cs.includes("duplicate");
    case "discovered":
      return cs.includes("discovered");
    case "crawled_not_indexed":
      return cs.includes("crawled - currently not indexed");
    default:
      return false;
  }
}

function filterNameForState(state: string): string | null {
  const s = state.toLowerCase();
  if (s.includes("server error")) return "server_error";
  if (s.includes("blocked")) return "blocked";
  if (s.includes("redirect")) return "redirect";
  if (s.includes("soft 404")) return "soft_404";
  if (s.includes("duplicate")) return "duplicate";
  if (s.includes("discovered - currently not indexed")) return "discovered";
  if (s.includes("crawled - currently not indexed")) return "crawled_not_indexed";
  return null;
}

export function formatSampleResults(
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
  lines.push("--- Inspected sample ---", "");
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

function formatCoverage(siteUrl: string, sitemapUrl: string, totalUrls: number, results: InspectionSummary[]): string {
  const inspected = results.filter((r) => !r.error);
  const errors = results.filter((r) => r.error);
  const indexed = inspected.filter((r) => r.verdict === "PASS");
  const notIndexed = inspected.filter((r) => r.verdict !== "PASS");

  const lines: string[] = [
    `=== Index Coverage: ${siteUrl} ===`,
    `Sitemap: ${sitemapUrl} (${totalUrls.toLocaleString()} URLs)`,
    `Inspected: ${results.length}`,
    "",
  ];

  const total = inspected.length;
  if (total === 0) {
    lines.push("No URLs could be inspected.");
    if (errors.length > 0) {
      lines.push("");
      for (const e of errors) lines.push(`  ${e.url}: ${e.error}`);
    }
    return lines.join("\n");
  }

  // Group not-indexed by coverageState
  const issueGroups: Record<string, InspectionSummary[]> = {};
  for (const r of notIndexed) {
    const key = r.coverageState;
    if (!issueGroups[key]) issueGroups[key] = [];
    issueGroups[key].push(r);
  }
  const sortedIssues = Object.entries(issueGroups).sort((a, b) => b[1].length - a[1].length);

  // Breakdown
  lines.push("--- Breakdown ---", "");
  lines.push(`Indexed: ${indexed.length}/${total} (${Math.round((indexed.length / total) * 100)}%)`);
  lines.push(`Not indexed: ${notIndexed.length}/${total} (${Math.round((notIndexed.length / total) * 100)}%)`);
  for (const [state, urls] of sortedIssues) {
    lines.push(`  ${state}: ${urls.length}`);
  }
  if (errors.length > 0) {
    lines.push(`Inspection errors: ${errors.length}`);
  }

  lines.push("", "These verdicts describe only the inspected sample, not site-wide coverage.");

  // Example URLs per issue
  if (sortedIssues.length > 0) {
    lines.push("", "--- URLs by Issue ---", "");
    for (const [state, urls] of sortedIssues) {
      lines.push(`${state}:`);
      for (const u of urls.slice(0, 3)) {
        lines.push(`  ${u.url}`);
        if (u.lastCrawlTime) lines.push(`    Last crawled: ${u.lastCrawlTime}`);
        if (u.pageFetchState !== "SUCCESSFUL") lines.push(`    Fetch: ${humanizeState(u.pageFetchState)}`);
      }
      if (urls.length > 3) lines.push(`  ... and ${urls.length - 3} more in sample`);
      lines.push("");
    }
  }

  // Suggest drill-down
  const filterSuggestions = sortedIssues.map(([state]) => filterNameForState(state)).filter(Boolean);
  if (filterSuggestions.length > 0) {
    lines.push(`Drill deeper: search(action='sample', filter='...') to investigate specific issues.`);
    lines.push(`  Available filters: ${filterSuggestions.join(", ")}`);
  }

  return lines.join("\n");
}

export async function runCoverage(options: SearchOptions) {
  const { site_url, sitemap_url, sample_size, sample_strategy } = options;
  if (!site_url) return textResult("Error: site_url is required for coverage.");

  const count = sample_size ?? 20;
  const strategy = sample_strategy ?? "spread";

  // Discover sitemap URL if not provided
  let resolvedSitemapUrl = sitemap_url;
  if (!resolvedSitemapUrl) {
    const sitemaps = await listSitemaps(site_url);
    if (sitemaps.length === 0) {
      return textResult(`No sitemaps found for ${site_url} in GSC. Provide a sitemap_url directly.`);
    }
    const nonIndex = sitemaps.find((s) => !s.isSitemapsIndex);
    resolvedSitemapUrl = (nonIndex ?? sitemaps[0]).path;
  }

  let parsed = await fetchSitemap(resolvedSitemapUrl);

  if (parsed.isSitemapIndex && parsed.childSitemaps.length > 0) {
    const childUrl = parsed.childSitemaps[0];
    parsed = await fetchSitemap(childUrl);
    resolvedSitemapUrl = `${resolvedSitemapUrl} → ${childUrl}`;
  }

  if (parsed.urls.length === 0) {
    return textResult(`Sitemap ${resolvedSitemapUrl} contains no URLs.`);
  }

  const sampled = sampleUrls(parsed.urls, count, strategy);

  const results: InspectionSummary[] = [];
  for (const u of sampled) {
    results.push(await inspectSingle(u, site_url));
  }

  return textResult(formatCoverage(site_url, resolvedSitemapUrl, parsed.urls.length, results));
}
