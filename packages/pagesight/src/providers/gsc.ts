import { clearTokenCache, getAccessToken } from "./gsc-auth.js";
import { RequestError, requestJson } from "../shared/http.js";

const GSC_API = "https://searchconsole.googleapis.com/v1";
const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";

async function gscFetch(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  try {
    return await requestJson<Record<string, unknown>>(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) clearTokenCache();
    throw error;
  }
}

// --- URL Inspection ---

export interface InspectionResult {
  inspectionResultLink: string;
  indexStatusResult: {
    verdict: string;
    coverageState: string;
    robotsTxtState: string;
    indexingState: string;
    lastCrawlTime?: string;
    pageFetchState: string;
    googleCanonical?: string;
    userCanonical?: string;
    sitemap?: string[];
    referringUrls?: string[];
    crawledAs: string;
  };
  richResultsResult?: {
    verdict: string;
    detectedItems: Array<{
      richResultType: string;
      items: Array<{
        name?: string;
        issues: Array<{ issueMessage: string; severity: string }>;
      }>;
    }>;
  };
  mobileUsabilityResult?: {
    verdict: string;
    issues?: Array<{ issueType: string; message?: string }>;
  };
}

export async function inspectUrl(inspectionUrl: string, siteUrl: string): Promise<InspectionResult> {
  const data = await inspectUrlResponse(inspectionUrl, siteUrl);
  return data.inspectionResult as InspectionResult;
}

export async function inspectUrlResponse(inspectionUrl: string, siteUrl: string): Promise<Record<string, unknown>> {
  const data = await gscFetch(`${GSC_API}/urlInspection/index:inspect`, {
    inspectionUrl,
    siteUrl,
  });
  if (!data.inspectionResult) {
    throw new Error("GSC API returned no inspection result");
  }
  return data;
}

// --- Search Analytics ---

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsMetadata {
  first_incomplete_date?: string;
  first_incomplete_hour?: string;
}

export interface SearchAnalyticsResponse {
  rows: SearchAnalyticsRow[];
  responseAggregationType: string;
  metadata?: SearchAnalyticsMetadata;
}

export interface SearchAnalyticsFilter {
  dimension: string;
  operator: string;
  expression: string;
}

export interface SearchAnalyticsOptions {
  startDate: string;
  endDate: string;
  dimensions?: string[];
  type?: string;
  rowLimit?: number;
  startRow?: number;
  dimensionFilterGroups?: Array<{ groupType?: string; filters: SearchAnalyticsFilter[] }>;
  dataState?: string;
  aggregationType?: string;
}

export async function querySearchAnalytics(
  siteUrl: string,
  options: SearchAnalyticsOptions,
): Promise<SearchAnalyticsResponse> {
  const body: Record<string, unknown> = {
    startDate: options.startDate,
    endDate: options.endDate,
    dimensions: options.dimensions ?? ["query", "page"],
    type: options.type ?? "web",
    rowLimit: options.rowLimit ?? 1000,
    dataState: options.dataState ?? "final",
  };

  if (options.startRow !== undefined) body.startRow = options.startRow;
  if (options.aggregationType) body.aggregationType = options.aggregationType;
  if (options.dimensionFilterGroups) body.dimensionFilterGroups = options.dimensionFilterGroups;

  const data = await gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, body);
  return data as unknown as SearchAnalyticsResponse;
}

// --- Sites ---

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function listSites(): Promise<GscSite[]> {
  const data = await listSitesResponse();
  return (data.siteEntry as GscSite[] | undefined) ?? [];
}

export function listSitesResponse(): Promise<Record<string, unknown>> {
  return gscFetch(`${WEBMASTERS_API}/sites`);
}

export async function getSite(siteUrl: string): Promise<GscSite> {
  const data = await gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}`);
  return data as unknown as GscSite;
}

// --- Sitemaps ---

export interface GscSitemapContent {
  type: string;
  submitted?: string;
  indexed?: string;
}

export interface GscSitemap {
  path: string;
  lastSubmitted?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  type?: string;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: GscSitemapContent[];
}

export async function listSitemaps(siteUrl: string): Promise<GscSitemap[]> {
  const data = await listSitemapsResponse(siteUrl);
  return (data.sitemap as GscSitemap[] | undefined) ?? [];
}

export function listSitemapsResponse(siteUrl: string): Promise<Record<string, unknown>> {
  return gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps`);
}

export async function getSitemap(siteUrl: string, feedpath: string): Promise<GscSitemap> {
  const data = await gscFetch(
    `${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps/${encodeURIComponent(feedpath)}`,
  );
  return data as unknown as GscSitemap;
}
