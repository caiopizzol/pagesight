import { type SearchOptions } from "./schema.js";
import { runInspect } from "./inspection.js";
import { runCoverage } from "./coverage.js";
import { runListSites, runGetSite, runGetSitemap, runSitemaps } from "./sites.js";
import { runAnalytics } from "./analytics.js";
import { runGaps } from "./gaps.js";
import { runSample } from "./sample.js";
import { textResult } from "./result.js";
export async function runSearch(params: SearchOptions) {
  const { site_url, url, sitemap_url, sample_size, filter, start_date, end_date, dimensions, filters, compare } =
    params;
  // ── Route to action ──
  const hasAnalyticsParams = !!(start_date || end_date || dimensions || filters || compare);

  const resolvedAction =
    params.action ??
    (url && site_url && !hasAnalyticsParams
      ? "inspect"
      : sample_size || filter
        ? "sample"
        : hasAnalyticsParams
          ? "analytics"
          : sitemap_url && site_url
            ? "get_sitemap"
            : site_url
              ? "sitemaps"
              : "list_sites");

  try {
    switch (resolvedAction) {
      case "inspect":
        return await runInspect(params);
      case "sample":
        return await runSample(params);
      case "coverage":
        return await runCoverage(params);
      case "list_sites":
        return await runListSites();
      case "get_site":
        return await runGetSite(params);
      case "get_sitemap":
        return await runGetSitemap(params);
      case "sitemaps":
        return await runSitemaps(params);
      case "analytics":
        return await runAnalytics(params);
      case "gaps":
        return await runGaps(params);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return textResult(`Error: ${msg}`);
  }
}
