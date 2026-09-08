import { RequestError, requestJson } from "../shared/http.js";

export const bingMethods = {
  sites: "GetUserSites",
  queries: "GetQueryStats",
  pages: "GetPageStats",
  traffic: "GetRankAndTrafficStats",
} as const;
export type BingAction = keyof typeof bingMethods;

export async function bingFetch(
  action: BingAction,
  site?: string,
): Promise<Record<string, unknown> & { d: unknown[] }> {
  const key = process.env.BING_WEBMASTER_API_KEY;
  if (!key) throw new RequestError("Set BING_WEBMASTER_API_KEY", null, "not_configured");
  const url = new URL(`https://ssl.bing.com/webmaster/api.svc/json/${bingMethods[action]}`);
  url.searchParams.set("apikey", key);
  if (site !== undefined) url.searchParams.set("siteUrl", site);
  const response = await requestJson<unknown>(url.href, { redirect: "error" });
  if (response && typeof response === "object" && "ErrorCode" in response && Number.isSafeInteger(response.ErrorCode))
    throw new RequestError("Bing returned an API fault", null, `bing_fault_${String(response.ErrorCode)}`);
  if (!response || typeof response !== "object" || !("d" in response) || !Array.isArray(response.d))
    throw new RequestError("Bing returned an unexpected response envelope", null, "invalid_response");
  return response as Record<string, unknown> & { d: unknown[] };
}
