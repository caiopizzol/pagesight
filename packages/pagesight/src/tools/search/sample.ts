import { listSitemaps } from "../../providers/gsc.js";
import { type SearchOptions } from "./schema.js";
import { humanizeState, type InspectionSummary, inspectSingle } from "./inspection.js";
import { matchesCoverageFilter, formatSampleResults } from "./coverage.js";
import { fetchSitemap, sampleUrls } from "./sitemap-sampling.js";
import { textResult } from "./result.js";

export async function runSample(options: SearchOptions) {
  const { site_url, sitemap_url, sample_size, sample_strategy, filter } = options;
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
    const nonIndex = sitemaps.find((s) => !s.isSitemapsIndex);
    resolvedSitemapUrl = (nonIndex ?? sitemaps[0]).path;
  }

  // Fetch and parse sitemap
  let parsed = await fetchSitemap(resolvedSitemapUrl);

  if (parsed.isSitemapIndex && parsed.childSitemaps.length > 0) {
    const childUrl = parsed.childSitemaps[0];
    parsed = await fetchSitemap(childUrl);
    resolvedSitemapUrl = `${resolvedSitemapUrl} → ${childUrl}`;
  }

  if (parsed.urls.length === 0) {
    return textResult(`Sitemap ${resolvedSitemapUrl} contains no URLs.`);
  }

  if (filter) {
    // Filtered sample: inspect more URLs, return only matches
    const scanLimit = Math.min(count * 5, 50, parsed.urls.length);
    const pool = sampleUrls(parsed.urls, scanLimit, strategy);
    const matched: InspectionSummary[] = [];
    let scanned = 0;

    for (const u of pool) {
      const result = await inspectSingle(u, site_url);
      scanned++;
      if (matchesCoverageFilter(result, filter)) {
        matched.push(result);
        if (matched.length >= count) break;
      }
    }

    if (matched.length === 0) {
      return textResult(
        [
          `=== Filtered Sample: ${site_url} ===`,
          `Sitemap: ${resolvedSitemapUrl} (${parsed.urls.length.toLocaleString()} URLs)`,
          `Filter: ${filter}`,
          `Scanned: ${scanned} | Matched: 0`,
          "",
          `No URLs matching "${filter}" found in ${scanned} inspected URLs.`,
          "Try a larger sample_size or a different filter.",
        ].join("\n"),
      );
    }

    const lines: string[] = [
      `=== Filtered Sample: ${site_url} ===`,
      `Sitemap: ${resolvedSitemapUrl} (${parsed.urls.length.toLocaleString()} URLs)`,
      `Filter: ${filter}`,
      `Scanned: ${scanned} | Matched: ${matched.length}`,
      "",
      "--- Matching URLs ---",
      "",
    ];

    for (let i = 0; i < matched.length; i++) {
      const r = matched[i];
      lines.push(`${i + 1}. ${r.url}`);
      lines.push(`   Coverage: ${r.coverageState}`);
      lines.push(`   Page fetch: ${humanizeState(r.pageFetchState)}`);
      if (r.robotsTxtState !== "ALLOWED") lines.push(`   Robots.txt: ${humanizeState(r.robotsTxtState)}`);
      if (r.indexingState !== "INDEXING_ALLOWED") lines.push(`   Indexing: ${humanizeState(r.indexingState)}`);
      if (r.lastCrawlTime) lines.push(`   Last crawled: ${r.lastCrawlTime}`);
      if (r.googleCanonical && r.googleCanonical !== r.url) {
        lines.push(`   Google canonical: ${r.googleCanonical}`);
      }
      lines.push("");
    }

    if (matched.length < count && scanned >= scanLimit) {
      lines.push(
        `Found ${matched.length}/${count} requested — scanned ${scanned} URLs (limit ${scanLimit}). Increase sample_size for a wider scan.`,
      );
    }

    return textResult(lines.join("\n"));
  }

  const sampled = sampleUrls(parsed.urls, count, strategy);

  const results: InspectionSummary[] = [];
  for (const u of sampled) {
    results.push(await inspectSingle(u, site_url));
  }

  return textResult(formatSampleResults(site_url, resolvedSitemapUrl, parsed.urls.length, results));
}
