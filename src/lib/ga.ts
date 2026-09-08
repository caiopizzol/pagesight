import { homedir } from "node:os";
import { join } from "node:path";
import { getOAuthToken, getServiceAccountToken } from "./auth.js";
import { RequestError, requestJson } from "./http.js";

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
let cached: { path: string; token: string; expiresAt: number } | undefined;
let pending: Promise<string> | undefined;

export function gaCredentialPath(): string {
  return (
    process.env.PAGESIGHT_GA_CREDENTIALS ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    join(homedir(), ".config/gcloud/application_default_credentials.json")
  );
}

export async function gaAccessToken(): Promise<string> {
  const path = gaCredentialPath();
  if (cached?.path === path && cached.expiresAt > Date.now()) return cached.token;
  if (pending) return pending;
  pending = (async () => {
    if (!(await Bun.file(path).exists()))
      throw new RequestError(
        "Set PAGESIGHT_GA_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS to a Google credential JSON file",
        null,
        "not_configured",
      );
    let key: { type?: string; client_id?: string; client_secret?: string; refresh_token?: string };
    try {
      key = await Bun.file(path).json();
      if (!key || typeof key !== "object") throw new Error();
    } catch {
      throw new RequestError("Cannot parse configured GA credential JSON", null, "invalid_credentials");
    }
    let token: string;
    if (key.type === "service_account") token = await getServiceAccountToken(path, SCOPE);
    else if (
      key.type === "authorized_user" &&
      typeof key.client_id === "string" &&
      key.client_id &&
      typeof key.client_secret === "string" &&
      key.client_secret &&
      typeof key.refresh_token === "string" &&
      key.refresh_token
    ) {
      token = await getOAuthToken(key.client_id, key.client_secret, key.refresh_token);
    } else
      throw new RequestError(
        "Supported GA credentials: service_account or authorized_user ADC",
        null,
        "unsupported_credentials",
      );
    cached = { path, token, expiresAt: Date.now() + 3_000_000 };
    return token;
  })();
  try {
    return await pending;
  } finally {
    pending = undefined;
  }
}

export async function gaFetch<T>(path: string, body?: unknown, admin = false): Promise<T> {
  const token = await gaAccessToken();
  const base = admin ? "https://analyticsadmin.googleapis.com/v1beta/" : "https://analyticsdata.googleapis.com/v1beta/";
  try {
    return await requestJson<T>(base + path, {
      method: body ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error instanceof RequestError && error.status === 401) cached = undefined;
    throw error;
  }
}

export function gaProperty(id: string): string {
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

export async function gaCredentialInfo() {
  const source = process.env.PAGESIGHT_GA_CREDENTIALS
    ? "PAGESIGHT_GA_CREDENTIALS"
    : process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? "GOOGLE_APPLICATION_CREDENTIALS"
      : "gcloud_adc";
  try {
    const key = await Bun.file(gaCredentialPath()).json();
    return {
      source,
      type: typeof key.type === "string" ? key.type : null,
      clientEmail: typeof key.client_email === "string" ? key.client_email : null,
    };
  } catch {
    return { source, type: null, clientEmail: null };
  }
}
