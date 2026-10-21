import { RequestError, requestJson } from "../shared/http.js";

const CRUX_API = "https://chromeuxreport.googleapis.com/v1/records";

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new RequestError("GOOGLE_API_KEY is required for CrUX API", null, "not_configured");
  return key;
}

type CruxFormFactor = "DESKTOP" | "PHONE" | "TABLET";

interface CruxHistogramBin {
  start: number | string;
  end?: number | string;
  density: number;
}

interface CruxMetricData {
  histogram?: CruxHistogramBin[];
  percentiles?: { p75: number | string };
  fractions?: Record<string, number>;
}

interface CruxRecord {
  key: { formFactor?: string; origin?: string; url?: string };
  metrics: Record<string, CruxMetricData>;
  collectionPeriod: {
    firstDate: { year: number; month: number; day: number };
    lastDate: { year: number; month: number; day: number };
  };
}

interface CruxResponse {
  record: CruxRecord;
  urlNormalizationDetails?: { originalUrl: string; normalizedUrl: string };
}

interface CruxHistoryMetricData {
  histogramTimeseries?: Array<{
    start: number | string;
    end?: number | string;
    densities: Array<number | null>;
  }>;
  percentilesTimeseries?: { p75s: Array<number | string | null> };
  fractionTimeseries?: Record<string, { fractions: Array<number | null> }>;
}

interface CruxHistoryRecord {
  key: { formFactor?: string; origin?: string; url?: string };
  metrics: Record<string, CruxHistoryMetricData>;
  collectionPeriods: Array<{
    firstDate: { year: number; month: number; day: number };
    lastDate: { year: number; month: number; day: number };
  }>;
}

interface CruxHistoryResponse {
  record: CruxHistoryRecord;
  urlNormalizationDetails?: { originalUrl: string; normalizedUrl: string };
}

// --- Shared fetch helper ---

async function cruxFetch<T>(
  endpoint: string,
  options: {
    url?: string;
    origin?: string;
    formFactor?: CruxFormFactor;
    metrics?: string[];
    collectionPeriodCount?: number;
  },
): Promise<T> {
  const key = getApiKey();

  const body: Record<string, unknown> = {};
  if (options.url) body.url = options.url;
  if (options.origin) body.origin = options.origin;
  if (options.formFactor) body.formFactor = options.formFactor;
  if (options.metrics) body.metrics = options.metrics;
  if (options.collectionPeriodCount !== undefined && options.collectionPeriodCount !== 0) {
    body.collectionPeriodCount = options.collectionPeriodCount;
  }

  return requestJson<T>(`${CRUX_API}:${endpoint}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- CrUX Daily API ---

export function queryCrux(options: {
  url?: string;
  origin?: string;
  formFactor?: CruxFormFactor;
  metrics?: string[];
}): Promise<CruxResponse> {
  return cruxFetch<CruxResponse>("queryRecord", options);
}

// --- CrUX History API ---

export function queryCruxHistory(options: {
  url?: string;
  origin?: string;
  formFactor?: CruxFormFactor;
  metrics?: string[];
  collectionPeriodCount?: number;
}): Promise<CruxHistoryResponse> {
  return cruxFetch<CruxHistoryResponse>("queryHistoryRecord", options);
}
