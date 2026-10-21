import { clearGoogleTokens, googleAccessToken } from "./google-auth.js";
import { RequestError, requestJson } from "../shared/http.js";

const GSC_API = "https://searchconsole.googleapis.com/v1";
const WEBMASTERS_API = "https://www.googleapis.com/webmasters/v3";

async function gscFetch(url: string, body?: unknown): Promise<Record<string, unknown>> {
  const token = await googleAccessToken("gsc");
  try {
    return await requestJson<Record<string, unknown>>(url, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) clearGoogleTokens("gsc");
    throw error;
  }
}

// --- URL Inspection ---

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

interface SearchAnalyticsRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface SearchAnalyticsMetadata {
  first_incomplete_date?: string;
  first_incomplete_hour?: string;
}

export interface SearchAnalyticsResponse {
  rows: SearchAnalyticsRow[];
  responseAggregationType: string;
  metadata?: SearchAnalyticsMetadata;
}

interface SearchAnalyticsFilter {
  dimension: string;
  operator: string;
  expression: string;
}

interface SearchAnalyticsOptions {
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

interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export function listSitesResponse(): Promise<Record<string, unknown>> {
  return gscFetch(`${WEBMASTERS_API}/sites`);
}

export async function getSite(siteUrl: string): Promise<GscSite> {
  const data = await gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}`);
  return data as unknown as GscSite;
}

// --- Sitemaps ---

export function listSitemapsResponse(siteUrl: string): Promise<Record<string, unknown>> {
  return gscFetch(`${WEBMASTERS_API}/sites/${encodeURIComponent(siteUrl)}/sitemaps`);
}
