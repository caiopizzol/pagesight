import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type PsiAudit, type PsiCategoryType, type PsiResult, runPagespeed } from "../lib/psi.js";

function scoreLabel(score: number | null): string {
  if (score === null) return "N/A";
  const pct = Math.round(score * 100);
  if (pct >= 90) return `${pct} (good)`;
  if (pct >= 50) return `${pct} (needs improvement)`;
  return `${pct} (poor)`;
}

function cwvRating(category: string): string {
  if (category === "FAST") return "good";
  if (category === "AVERAGE") return "needs improvement";
  if (category === "SLOW") return "poor";
  return category;
}

function formatLoadingExperience(label: string, exp: PsiResult["loadingExperience"]): string[] {
  if (!exp?.metrics || Object.keys(exp.metrics).length === 0) return [];

  const lines: string[] = [`--- ${label} (CrUX Field Data) ---`, ""];
  lines.push(`Overall: ${cwvRating(exp.overall_category)}`, "");

  const metricNames: Record<string, string> = {
    CUMULATIVE_LAYOUT_SHIFT_SCORE: "CLS",
    EXPERIMENTAL_TIME_TO_FIRST_BYTE: "TTFB",
    FIRST_CONTENTFUL_PAINT_MS: "FCP",
    FIRST_INPUT_DELAY_MS: "FID",
    INTERACTION_TO_NEXT_PAINT: "INP",
    LARGEST_CONTENTFUL_PAINT_MS: "LCP",
  };

  for (const [key, metric] of Object.entries(exp.metrics)) {
    const name = metricNames[key] ?? key;
    const unit = key.includes("LAYOUT_SHIFT") ? "" : "ms";
    const value = key.includes("LAYOUT_SHIFT") ? (metric.percentile / 100).toFixed(2) : `${metric.percentile}${unit}`;
    lines.push(`${name}: ${value} (${cwvRating(metric.category)})`);
  }

  return lines;
}

function formatOpportunities(audits: Record<string, PsiAudit>): string[] {
  const opportunities: Array<{ title: string; savings: string; score: number }> = [];

  for (const audit of Object.values(audits)) {
    if (audit.score !== null && audit.score < 1 && audit.numericValue && audit.numericValue > 0) {
      if (audit.scoreDisplayMode === "numeric" || audit.scoreDisplayMode === "binary") {
        const unit = audit.numericUnit === "millisecond" ? "ms" : audit.numericUnit === "byte" ? " bytes" : "";
        const savings = audit.displayValue ?? `${Math.round(audit.numericValue)}${unit}`;
        opportunities.push({ title: audit.title, savings, score: audit.score });
      }
    }
  }

  if (opportunities.length === 0) return [];

  opportunities.sort((a, b) => a.score - b.score);

  const lines: string[] = ["--- Opportunities ---", ""];
  for (const opp of opportunities.slice(0, 10)) {
    const severity = opp.score < 0.5 ? "HIGH" : opp.score < 0.9 ? "MEDIUM" : "LOW";
    lines.push(`${severity}  ${opp.title}`);
    lines.push(`  Potential savings: ${opp.savings}`);
  }

  return lines;
}

function formatDiagnostics(audits: Record<string, PsiAudit>): string[] {
  const failing: Array<{ title: string; displayValue: string }> = [];

  for (const audit of Object.values(audits)) {
    if (audit.score !== null && audit.score < 0.5 && audit.scoreDisplayMode === "numeric" && audit.displayValue) {
      failing.push({ title: audit.title, displayValue: audit.displayValue });
    }
  }

  if (failing.length === 0) return [];

  const lines: string[] = ["--- Diagnostics ---", ""];
  for (const item of failing.slice(0, 10)) {
    lines.push(`${item.title}: ${item.displayValue}`);
  }

  return lines;
}

function formatPagespeed(url: string, result: PsiResult): string {
  const lhr = result.lighthouseResult;
  const lines: string[] = [
    `=== PageSpeed: ${url} ===`,
    `Strategy: ${lhr.configSettings.emulatedFormFactor}`,
    `Lighthouse: ${lhr.lighthouseVersion}`,
    `Analyzed: ${result.analysisUTCTimestamp}`,
    "",
  ];

  // Runtime errors
  if (lhr.runtimeError) {
    lines.push(`ERROR: ${lhr.runtimeError.code} — ${lhr.runtimeError.message}`, "");
  }

  // Warnings
  if (lhr.runWarnings && lhr.runWarnings.length > 0) {
    for (const w of lhr.runWarnings) {
      lines.push(`WARNING: ${w}`);
    }
    lines.push("");
  }

  // Category scores
  lines.push("--- Scores ---", "");
  for (const cat of Object.values(lhr.categories)) {
    lines.push(`${cat.title}: ${scoreLabel(cat.score)}`);
  }
  lines.push("");

  // Core Web Vitals from audits
  const cwvIds = [
    "first-contentful-paint",
    "largest-contentful-paint",
    "total-blocking-time",
    "cumulative-layout-shift",
    "speed-index",
    "interactive",
  ];
  const cwvLines: string[] = [];
  for (const id of cwvIds) {
    const audit = lhr.audits[id];
    if (audit?.displayValue) {
      cwvLines.push(`${audit.title}: ${audit.displayValue} ${scoreLabel(audit.score)}`);
    }
  }
  if (cwvLines.length > 0) {
    lines.push("--- Core Web Vitals (Lab) ---", "", ...cwvLines, "");
  }

  // CrUX field data
  const pageExp = formatLoadingExperience("Page", result.loadingExperience);
  if (pageExp.length > 0) lines.push(...pageExp, "");

  const originExp = formatLoadingExperience("Origin", result.originLoadingExperience);
  if (originExp.length > 0) lines.push(...originExp, "");

  // Opportunities
  const opps = formatOpportunities(lhr.audits);
  if (opps.length > 0) lines.push(...opps, "");

  // Diagnostics
  const diags = formatDiagnostics(lhr.audits);
  if (diags.length > 0) lines.push(...diags, "");

  // Timing
  lines.push(`Analysis took ${(lhr.timing.total / 1000).toFixed(1)}s`);

  return lines.join("\n");
}

export function registerPagespeedTool(server: McpServer): void {
  server.tool(
    "pagespeed",
    "Analyze a page's performance using Google PageSpeed Insights API. Returns Lighthouse scores, Core Web Vitals (lab + field), opportunities, and diagnostics.",
    {
      url: z.string().url().describe("The URL to analyze."),
      strategy: z.enum(["mobile", "desktop"]).optional().describe("Device strategy. Default: 'mobile'."),
      categories: z
        .array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
        .optional()
        .describe("Lighthouse categories to run. Default: all four."),
      locale: z.string().optional().describe("Locale for localized results (e.g., 'pt-BR', 'en')."),
    },
    async ({ url, strategy, categories, locale }) => {
      try {
        const result = await runPagespeed(url, {
          strategy: strategy as "mobile" | "desktop" | undefined,
          categories: categories as PsiCategoryType[] | undefined,
          locale,
        });
        return { content: [{ type: "text", text: formatPagespeed(url, result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text", text: `Error running PageSpeed analysis: ${msg}` }] };
      }
    },
  );
}
