import { getAccessToken } from "./auth.js";

const GSC_API = "https://searchconsole.googleapis.com/v1";
const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";

async function gscFetch(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GSC API error (${res.status}): ${err}`);
  }

  return res.json();
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
  const data = await gscFetch(`${GSC_API}/urlInspection/index:inspect`, {
    inspectionUrl,
    siteUrl,
  });
  return data.inspectionResult as InspectionResult;
}

// --- Search Analytics ---

export interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchAnalyticsResponse {
  rows: SearchAnalyticsRow[];
  responseAggregationType: string;
}

export async function querySearchAnalytics(
  siteUrl: string,
  options: {
    startDate: string;
    endDate: string;
    dimensions?: string[];
    type?: string;
    rowLimit?: number;
    dimensionFilterGroups?: Array<{ filters: Array<{ dimension: string; operator: string; expression: string }> }>;
    dataState?: string;
  },
): Promise<SearchAnalyticsResponse> {
  const body = {
    startDate: options.startDate,
    endDate: options.endDate,
    dimensions: options.dimensions ?? ["query", "page"],
    type: options.type ?? "web",
    rowLimit: options.rowLimit ?? 1000,
    dataState: options.dataState ?? "all",
    ...(options.dimensionFilterGroups ? { dimensionFilterGroups: options.dimensionFilterGroups } : {}),
  };

  const data = await gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, body);
  return data as unknown as SearchAnalyticsResponse;
}

// --- Sites ---

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export async function listSites(): Promise<GscSite[]> {
  const data = await gscFetch(`${WEBMASTERS_API}/sites`);
  return (data.siteEntry as GscSite[] | undefined) ?? [];
}

// --- Sitemaps ---

export interface GscSitemap {
  path: string;
  lastSubmitted?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  lastDownloaded?: string;
  warnings?: string;
  errors?: string;
  contents?: Array<{
    type: string;
    submitted?: string;
    indexed?: string;
  }>;
}

export async function listSitemaps(siteUrl: string): Promise<GscSitemap[]> {
  const data = await gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps`);
  return (data.sitemap as GscSitemap[] | undefined) ?? [];
}
