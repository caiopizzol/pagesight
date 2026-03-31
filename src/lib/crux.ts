const CRUX_API = "https://chromeuxreport.googleapis.com/v1/records";

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error("GOOGLE_API_KEY is required for CrUX API.");
  return key;
}

export type CruxFormFactor = "DESKTOP" | "PHONE" | "TABLET";

export type CruxMetric =
  | "cumulative_layout_shift"
  | "first_contentful_paint"
  | "interaction_to_next_paint"
  | "largest_contentful_paint"
  | "experimental_time_to_first_byte"
  | "round_trip_time"
  | "navigation_types"
  | "form_factors";

export interface CruxHistogramBin {
  start: number | string;
  end?: number | string;
  density: number;
}

export interface CruxMetricData {
  histogram?: CruxHistogramBin[];
  percentiles?: { p75: number | string };
  fractions?: Record<string, number>;
}

export interface CruxRecord {
  key: { formFactor?: string; origin?: string; url?: string };
  metrics: Record<string, CruxMetricData>;
  collectionPeriod: {
    firstDate: { year: number; month: number; day: number };
    lastDate: { year: number; month: number; day: number };
  };
}

export interface CruxResponse {
  record: CruxRecord;
  urlNormalizationDetails?: { originalUrl: string; normalizedUrl: string };
}

export interface CruxHistoryMetricData {
  histogramTimeseries?: Array<{
    start: number | string;
    end?: number | string;
    densities: Array<number | null>;
  }>;
  percentilesTimeseries?: { p75s: Array<number | string | null> };
  fractionTimeseries?: Record<string, { fractions: Array<number | null> }>;
}

export interface CruxHistoryRecord {
  key: { formFactor?: string; origin?: string; url?: string };
  metrics: Record<string, CruxHistoryMetricData>;
  collectionPeriods: Array<{
    firstDate: { year: number; month: number; day: number };
    lastDate: { year: number; month: number; day: number };
  }>;
}

export interface CruxHistoryResponse {
  record: CruxHistoryRecord;
  urlNormalizationDetails?: { originalUrl: string; normalizedUrl: string };
}

// --- CrUX Daily API ---

export async function queryCrux(options: {
  url?: string;
  origin?: string;
  formFactor?: CruxFormFactor;
  metrics?: string[];
}): Promise<CruxResponse> {
  const key = getApiKey();

  const body: Record<string, unknown> = {};
  if (options.url) body.url = options.url;
  if (options.origin) body.origin = options.origin;
  if (options.formFactor) body.formFactor = options.formFactor;
  if (options.metrics) body.metrics = options.metrics;

  const res = await fetch(`${CRUX_API}:queryRecord?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CrUX API error (${res.status}): ${err}`);
  }

  return res.json() as Promise<CruxResponse>;
}

// --- CrUX History API ---

export async function queryCruxHistory(options: {
  url?: string;
  origin?: string;
  formFactor?: CruxFormFactor;
  metrics?: string[];
  collectionPeriodCount?: number;
}): Promise<CruxHistoryResponse> {
  const key = getApiKey();

  const body: Record<string, unknown> = {};
  if (options.url) body.url = options.url;
  if (options.origin) body.origin = options.origin;
  if (options.formFactor) body.formFactor = options.formFactor;
  if (options.metrics) body.metrics = options.metrics;
  if (options.collectionPeriodCount) body.collectionPeriodCount = options.collectionPeriodCount;

  const res = await fetch(`${CRUX_API}:queryHistoryRecord?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`CrUX History API error (${res.status}): ${err}`);
  }

  return res.json() as Promise<CruxHistoryResponse>;
}
