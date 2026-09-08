import { requestJson } from "../shared/http.js";

const PSI_API = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export interface PsiCategory {
  id: string;
  title: string;
  score: number | null;
  auditRefs?: Array<{ id: string; weight: number }>;
}

export interface PsiAuditDetailItem {
  node?: {
    selector: string;
    snippet?: string;
    nodeLabel?: string;
    explanation?: string;
  };
  // Table-style items (performance opportunities, SEO, etc.)
  url?: string;
  wastedBytes?: number;
  wastedMs?: number;
  totalBytes?: number;
  // Generic key-value items
  [key: string]: unknown;
}

export interface PsiAuditDetails {
  type: string;
  items?: PsiAuditDetailItem[];
  overallSavingsMs?: number;
  overallSavingsBytes?: number;
}

export interface PsiAudit {
  id: string;
  title: string;
  description: string;
  score: number | null;
  scoreDisplayMode: string;
  displayValue?: string;
  numericValue?: number;
  numericUnit?: string;
  details?: PsiAuditDetails;
}

export interface PsiMetric {
  percentile: number;
  distributions: Array<{ min: number; max?: number; proportion: number }>;
  category: string;
}

export interface PsiLoadingExperience {
  id: string;
  metrics: Record<string, PsiMetric>;
  overall_category: string;
}

export interface PsiResult {
  id: string;
  loadingExperience?: PsiLoadingExperience;
  originLoadingExperience?: PsiLoadingExperience;
  lighthouseResult: {
    requestedUrl: string;
    finalUrl: string;
    lighthouseVersion: string;
    fetchTime: string;
    audits: Record<string, PsiAudit>;
    categories: Record<string, PsiCategory>;
    timing: { total: number };
    runtimeError?: { code: string; message: string };
    runWarnings?: string[];
    configSettings: {
      emulatedFormFactor: string;
      locale: string;
    };
  };
  analysisUTCTimestamp: string;
}

export type PsiStrategy = "mobile" | "desktop";
export type PsiCategoryType = "performance" | "accessibility" | "best-practices" | "seo";

export function hasApiKey(): boolean {
  return !!process.env.GOOGLE_API_KEY;
}

export async function runPagespeed(
  url: string,
  options?: {
    strategy?: PsiStrategy;
    categories?: PsiCategoryType[];
    locale?: string;
  },
): Promise<PsiResult> {
  const params = new URLSearchParams({ url });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const strategy = options?.strategy ?? "mobile";
  params.set("strategy", strategy);

  const categories = options?.categories ?? ["performance", "accessibility", "best-practices", "seo"];
  for (const cat of categories) {
    params.append("category", cat);
  }

  if (options?.locale) params.set("locale", options.locale);

  return requestJson<PsiResult>(`${PSI_API}?${params}`, { headers: { "User-Agent": "Pagesight/0.17" } }, 60_000);
}
