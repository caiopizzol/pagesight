import { clearGoogleTokens, googleAccessToken } from "./google-auth.js";
import { RequestError, requestJson } from "../shared/http.js";

export async function gaFetch<T>(path: string, body?: unknown, admin = false): Promise<T> {
  const token = await googleAccessToken("ga");
  const base = admin ? "https://analyticsadmin.googleapis.com/v1beta/" : "https://analyticsdata.googleapis.com/v1beta/";
  try {
    return await requestJson<T>(base + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) clearGoogleTokens("ga");
    throw error;
  }
}

export function normalizeGaProperty(id: string): string {
  const number = id.replace(/^properties\//, "");
  if (!/^\d+$/.test(number)) throw new RequestError("GA property must be a numeric ID", null, "invalid_input");
  return `properties/${number}`;
}

export interface GaReport {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  rowCount?: number;
  metadata?: {
    timeZone?: string;
    dataLossFromOtherRow?: boolean;
    subjectToThresholding?: boolean;
    samplingMetadatas?: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
