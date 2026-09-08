import { type BingAction, bingFetch, bingMethods } from "../lib/bing.js";
import { capture, evidence, fail } from "./evidence.js";

export function bingObservation(action: BingAction, site?: string) {
  return capture(
    "bing",
    action,
    site ?? "accessible-sites",
    { method: bingMethods[action], ...(site === undefined ? {} : { siteUrl: site }) },
    () => bingFetch(action, site),
    [
      "Bing returns one provider-defined response. These methods support no date range or pagination; completeness is unknown.",
      ...(action === "sites"
        ? ["Site verification is not evidence of indexing or traffic."]
        : [
            "Raw Bing Date strings are retained. Reporting timezone is unknown; snapshot requested dates do not constrain this response.",
            action === "traffic"
              ? "Updated daily. Since 2023-03-24 traffic includes Web, Chat, News, Images, Videos and Knowledge Panel; it is not Google Web scope or isolated AI citation evidence."
              : "Top-row statistics updated weekly; missing queries/pages are unknown, not zero. Do not assume exhaustive coverage or a Web-only scope.",
            ...(action === "pages" ? ["In GetPageStats, the Query field contains the page URL."] : []),
          ]),
    ],
  );
}

export async function bingDiagnostics(
  action: "crawl-stats" | "crawl-issues" | "url-info" | "link-counts" | "url-links",
  site: string,
  url?: string,
  maxPages = 1,
) {
  const result = evidence("bing", action, site);
  result.warnings.push(
    "Provider dates, count periods and units are retained as reported. Empty reports are not proof of no issues or links.",
    "Crawl issues are not the Bing UI recommendations list. Link counts do not measure domain quality. InIndex and sitemap counts have different scopes.",
    "URL-info HttpStatus is provider metadata; zero is not a successful HTTP response. Indexed/crawled state is not a live fetch.",
  );
  const paginated = action === "link-counts" || action === "url-links";
  let page = 0;
  let rowsReturned = 0;
  let exhausted = false;
  let totalPages: number | undefined;
  for (; page < (paginated ? maxPages : 1); page++) {
    const parameters: Record<string, string> = {
      ...(url ? { [action === "url-links" ? "link" : "url"]: url } : {}),
      ...(paginated ? { page: String(page) } : {}),
    };
    const request = { method: bingMethods[action], siteUrl: site, ...parameters };
    try {
      const response = await bingFetch(action, site, parameters);
      result.pages.push({ request, response });
      if (!paginated) break;
      const d = response.d as { TotalPages: number; Links?: unknown[]; Details?: unknown[] };
      rowsReturned += (d.Links ?? d.Details ?? []).length;
      if (totalPages !== undefined && totalPages !== d.TotalPages) {
        result.status = "partial";
        result.warnings.push(
          "Provider TotalPages changed during pagination; coverage is unstable. Restart to obtain a fresh report.",
        );
        page++;
        break;
      }
      totalPages = d.TotalPages;
      if (page + 1 >= d.TotalPages) {
        exhausted = true;
        break;
      }
    } catch (error) {
      result.failedRequest = request;
      fail(result, error);
      break;
    }
  }
  if (paginated) {
    result.pagination = { exhausted, nextOffset: exhausted ? null : page, rowsReturned };
    result.warnings.push(
      "nextOffset is a zero-based provider page, not a row offset. Exhaustion describes the returned report, not exhaustive backlink coverage.",
    );
    if (!exhausted && result.status === "ok") result.status = "partial";
  }
  result.finishedAt = new Date().toISOString();
  return result;
}
