import { RequestError, requestJson } from "../shared/http.js";

export const bingMethods = {
  "crawl-stats": "GetCrawlStats",
  "crawl-issues": "GetCrawlIssues",
  "url-info": "GetUrlInfo",
  "link-counts": "GetLinkCounts",
  "url-links": "GetUrlLinks",
  sites: "GetUserSites",
  queries: "GetQueryStats",
  pages: "GetPageStats",
  traffic: "GetRankAndTrafficStats",
} as const;
export type BingAction = keyof typeof bingMethods;

export async function bingFetch(
  action: BingAction,
  site?: string,
  parameters: Record<string, string> = {},
): Promise<Record<string, unknown> & { d: unknown }> {
  const key = process.env.BING_WEBMASTER_API_KEY;
  if (!key) throw new RequestError("Set BING_WEBMASTER_API_KEY", null, "not_configured");
  const url = new URL(`https://ssl.bing.com/webmaster/api.svc/json/${bingMethods[action]}`);
  url.searchParams.set("apikey", key);
  if (site !== undefined) url.searchParams.set("siteUrl", site);
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, value);
  const response = await requestJson<unknown>(url.href, { redirect: "error" });
  if (response && typeof response === "object" && "ErrorCode" in response && Number.isSafeInteger(response.ErrorCode))
    throw new RequestError("Bing returned an API fault", null, `bing_fault_${String(response.ErrorCode)}`);
  if (!response || typeof response !== "object" || !("d" in response))
    throw new RequestError("Bing returned an unexpected response envelope", null, "invalid_response");
  const d = response.d;
  const object = d !== null && typeof d === "object" && !Array.isArray(d);
  let valid: boolean;
  if (action === "url-info") valid = object && "Url" in d && typeof d.Url === "string";
  else if (action === "link-counts" || action === "url-links") {
    const rows = action === "link-counts" ? "Links" : "Details";
    valid =
      object &&
      rows in d &&
      Array.isArray(d[rows as keyof typeof d]) &&
      "TotalPages" in d &&
      Number.isSafeInteger(d.TotalPages) &&
      Number(d.TotalPages) >= 0;
  } else valid = Array.isArray(d);
  if (!valid) throw new RequestError("Bing returned an unexpected response envelope", null, "invalid_response");
  return response as Record<string, unknown> & { d: unknown };
}
