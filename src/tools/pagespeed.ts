import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type PsiAudit,
  type PsiAuditDetailItem,
  type PsiCategoryType,
  type PsiResult,
  runPagespeed,
} from "../lib/psi.js";

function scoreLabel(score: number | null): string {
  if (score === null) return "N/A";
  const pct = Math.round(score * 100);
  if (pct >= 90) return `${pct} (good)`;
  if (pct >= 50) return `${pct} (needs improvement)`;
  return `${pct} (poor)`;
}

function scorePct(score: number | null): number | null {
  return score === null ? null : Math.round(score * 100);
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
  const opportunities: PsiAudit[] = [];

  for (const audit of Object.values(audits)) {
    if (audit.score === null || audit.score >= 1) continue;
    const mode = audit.scoreDisplayMode;
    const hasItems = (audit.details?.items?.length ?? 0) > 0;
    const hasNumeric = audit.numericValue && audit.numericValue > 0;
    if (mode === "metricSavings" || ((mode === "numeric" || mode === "binary") && hasNumeric)) {
      if (hasNumeric || hasItems) {
        opportunities.push(audit);
      }
    }
  }

  if (opportunities.length === 0) return [];

  opportunities.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const lines: string[] = ["--- Opportunities ---", ""];
  for (const audit of opportunities.slice(0, 10)) {
    const severity = (audit.score ?? 0) < 0.5 ? "HIGH" : (audit.score ?? 0) < 0.9 ? "MEDIUM" : "LOW";
    const unit = audit.numericUnit === "millisecond" ? "ms" : audit.numericUnit === "byte" ? " bytes" : "";
    const savings = audit.displayValue ?? `${Math.round(audit.numericValue ?? 0)}${unit}`;
    lines.push(`${severity}  ${audit.title}`);
    lines.push(`  Potential savings: ${savings}`);

    const items = audit.details?.items;
    if (items && items.length > 0) {
      for (const item of items.slice(0, 3)) {
        lines.push(...formatDetailItem(item));
      }
      if (items.length > 3) {
        lines.push(`  ... and ${items.length - 3} more resources`);
      }
    }
    lines.push("");
  }

  return lines;
}

function formatDiagnostics(audits: Record<string, PsiAudit>): string[] {
  const failing: PsiAudit[] = [];

  for (const audit of Object.values(audits)) {
    if (
      audit.score !== null &&
      audit.score < 0.5 &&
      (audit.scoreDisplayMode === "numeric" || audit.scoreDisplayMode === "metricSavings") &&
      audit.displayValue
    ) {
      failing.push(audit);
    }
  }

  if (failing.length === 0) return [];

  failing.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const lines: string[] = ["--- Diagnostics ---", ""];
  for (const audit of failing.slice(0, 10)) {
    lines.push(`${audit.title}: ${audit.displayValue}`);

    const linkMatch = audit.description?.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (linkMatch) lines.push(`  Learn more: ${linkMatch[1]}`);

    const items = audit.details?.items;
    if (items && items.length > 0) {
      for (const item of items.slice(0, 3)) {
        lines.push(...formatDetailItem(item));
      }
      if (items.length > 3) {
        lines.push(`  ... and ${items.length - 3} more`);
      }
    }
    lines.push("");
  }

  return lines;
}

function formatDetailItem(item: PsiAuditDetailItem): string[] {
  const lines: string[] = [];

  if (item.node) {
    const n = item.node;
    if (n.nodeLabel) lines.push(`  Element: "${n.nodeLabel}"`);
    if (n.selector) lines.push(`  Selector: ${n.selector}`);
    if (n.snippet) lines.push(`  HTML: ${n.snippet}`);
    if (n.explanation) lines.push(`  Issue: ${n.explanation}`);
  } else if (item.url) {
    const parts = [`  ${item.url}`];
    if (item.wastedMs) parts.push(`wastedMs=${Math.round(item.wastedMs)}`);
    if (item.wastedBytes) parts.push(`wastedBytes=${Math.round(item.wastedBytes)}`);
    if (item.totalBytes) parts.push(`totalBytes=${Math.round(item.totalBytes)}`);
    lines.push(parts.join("  "));
  }

  return lines;
}

function formatFailingAudits(audits: Record<string, PsiAudit>, categoryRefs: string[]): string[] {
  const failing: PsiAudit[] = [];

  for (const ref of categoryRefs) {
    const audit = audits[ref];
    if (audit && audit.score !== null && audit.score < 1) {
      failing.push(audit);
    }
  }

  if (failing.length === 0) return [];

  failing.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const lines: string[] = [];
  for (const audit of failing) {
    const severity = audit.score === 0 ? "FAIL" : (audit.score ?? 0) < 0.5 ? "WARN" : "INFO";
    lines.push(`[${severity}] ${audit.title}`);
    if (audit.displayValue) lines.push(`  Value: ${audit.displayValue}`);

    // Extract learn-more URL from description markdown
    const linkMatch = audit.description?.match(/\[.*?\]\((https?:\/\/[^)]+)\)/);
    if (linkMatch) lines.push(`  Learn more: ${linkMatch[1]}`);

    const items = audit.details?.items;
    if (items && items.length > 0) {
      const maxItems = 5;
      for (const item of items.slice(0, maxItems)) {
        lines.push(...formatDetailItem(item));
      }
      if (items.length > maxItems) {
        lines.push(`  ... and ${items.length - maxItems} more`);
      }
    }
    lines.push("");
  }

  return lines;
}

// --- Single URL formatting (existing) ---

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

  // Failing audits per non-performance category (a11y, SEO, best practices)
  for (const cat of Object.values(lhr.categories)) {
    if (cat.id === "performance" || !cat.auditRefs) continue;
    const score = cat.score !== null ? Math.round(cat.score * 100) : null;
    if (score === null || score >= 100) continue;

    const refs = cat.auditRefs.map((r) => r.id);
    const details = formatFailingAudits(lhr.audits, refs);
    if (details.length > 0) {
      lines.push(`--- ${cat.title} Issues ---`, "", ...details);
    }
  }

  // Timing
  lines.push(`Analysis took ${(lhr.timing.total / 1000).toFixed(1)}s`);

  return lines.join("\n");
}

// --- Batch formatting ---

function shortUrl(url: string, allUrls: string[]): string {
  try {
    const u = new URL(url);
    const path = u.pathname + u.search;
    const hasDuplicate = allUrls.some(
      (other) => other !== url && new URL(other).pathname + new URL(other).search === path,
    );
    return hasDuplicate ? u.hostname + path : path;
  } catch {
    return url;
  }
}

function formatDelta(a: number | null, b: number | null): string {
  if (a === null || b === null) return "";
  const diff = b - a;
  if (diff === 0) return "  (=)";
  return diff > 0 ? `  (+${diff})` : `  (${diff})`;
}

function formatBatchCompare(results: Array<{ url: string; result: PsiResult }>, strategy: string): string {
  const [a, b] = results;
  const lhrA = a.result.lighthouseResult;
  const lhrB = b.result.lighthouseResult;

  const lines: string[] = [
    `=== PageSpeed Compare (${strategy}) ===`,
    ``,
    `A: ${a.url}`,
    `B: ${b.url}`,
    `Lighthouse: ${lhrA.lighthouseVersion}`,
    "",
    "--- Scores ---",
    "",
  ];

  // Score comparison
  const catIds = Object.keys(lhrA.categories);
  for (const id of catIds) {
    const catA = lhrA.categories[id];
    const catB = lhrB.categories[id];
    if (!catA || !catB) continue;
    const pA = scorePct(catA.score);
    const pB = scorePct(catB.score);
    const delta = formatDelta(pA, pB);
    lines.push(`${catA.title}: ${pA ?? "N/A"} → ${pB ?? "N/A"}${delta}`);
  }
  lines.push("");

  // CWV comparison
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
    const auditA = lhrA.audits[id];
    const auditB = lhrB.audits[id];
    if (!auditA?.displayValue || !auditB?.displayValue) continue;
    cwvLines.push(`${auditA.title}: ${auditA.displayValue} → ${auditB.displayValue}`);
  }
  if (cwvLines.length > 0) {
    lines.push("--- Core Web Vitals (Lab) ---", "", ...cwvLines, "");
  }

  // Opportunities unique to each / shared
  const oppsA = collectOpportunityIds(lhrA.audits);
  const oppsB = collectOpportunityIds(lhrB.audits);
  const onlyA = [...oppsA].filter((id) => !oppsB.has(id));
  const onlyB = [...oppsB].filter((id) => !oppsA.has(id));
  const shared = [...oppsA].filter((id) => oppsB.has(id));

  if (onlyA.length > 0) {
    lines.push(`--- Opportunities (A only) ---`, "");
    for (const id of onlyA) lines.push(`  ${lhrA.audits[id].title}: ${lhrA.audits[id].displayValue ?? ""}`);
    lines.push("");
  }
  if (onlyB.length > 0) {
    lines.push(`--- Opportunities (B only) ---`, "");
    for (const id of onlyB) lines.push(`  ${lhrB.audits[id].title}: ${lhrB.audits[id].displayValue ?? ""}`);
    lines.push("");
  }
  if (shared.length > 0) {
    lines.push(`--- Shared Opportunities ---`, "");
    for (const id of shared) {
      lines.push(
        `  ${lhrA.audits[id].title}: ${lhrA.audits[id].displayValue ?? ""} → ${lhrB.audits[id].displayValue ?? ""}`,
      );
    }
    lines.push("");
  }

  const timeA = (lhrA.timing.total / 1000).toFixed(1);
  const timeB = (lhrB.timing.total / 1000).toFixed(1);
  lines.push(`Analysis took ${timeA}s + ${timeB}s`);

  return lines.join("\n");
}

function formatBatchTable(results: Array<{ url: string; result: PsiResult }>, strategy: string): string {
  const lines: string[] = [`=== Batch PageSpeed (${results.length} URLs, ${strategy}) ===`, ""];

  // Collect all category IDs from first result
  const catIds = Object.keys(results[0].result.lighthouseResult.categories);
  const catNames = catIds.map((id) => results[0].result.lighthouseResult.categories[id].title);

  // Score table
  lines.push("--- Scores ---", "");

  // Header
  const urlCol = "URL";
  const allUrls = results.map((r) => r.url);
  const urlWidth = Math.max(urlCol.length, ...results.map((r) => shortUrl(r.url, allUrls).length));
  const colWidth = Math.max(...catNames.map((n) => n.length), 4);
  lines.push(`${urlCol.padEnd(urlWidth)}  ${catNames.map((n) => n.padEnd(colWidth)).join("  ")}`);

  // Rows
  let bestPerf: { url: string; score: number } | null = null;
  let worstPerf: { url: string; score: number } | null = null;

  for (const { url, result } of results) {
    const lhr = result.lighthouseResult;
    const scores = catIds.map((id) => {
      const s = scorePct(lhr.categories[id]?.score);
      return s !== null ? String(s) : "N/A";
    });
    lines.push(`${shortUrl(url, allUrls).padEnd(urlWidth)}  ${scores.map((s) => s.padEnd(colWidth)).join("  ")}`);

    const perf = scorePct(lhr.categories.performance?.score);
    if (perf !== null) {
      if (!bestPerf || perf > bestPerf.score) bestPerf = { url: shortUrl(url, allUrls), score: perf };
      if (!worstPerf || perf < worstPerf.score) worstPerf = { url: shortUrl(url, allUrls), score: perf };
    }
  }

  lines.push("");
  if (bestPerf) lines.push(`Best: ${bestPerf.url} (${bestPerf.score})`);
  if (worstPerf && worstPerf.url !== bestPerf?.url) lines.push(`Worst: ${worstPerf.url} (${worstPerf.score})`);
  lines.push("");

  // Shared opportunities across pages
  const oppCounts = new Map<string, { title: string; count: number }>();
  for (const { result } of results) {
    for (const id of collectOpportunityIds(result.lighthouseResult.audits)) {
      const existing = oppCounts.get(id);
      if (existing) {
        existing.count++;
      } else {
        oppCounts.set(id, { title: result.lighthouseResult.audits[id].title, count: 1 });
      }
    }
  }

  const sharedOpps = [...oppCounts.entries()].filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count);
  if (sharedOpps.length > 0) {
    lines.push("--- Shared Opportunities ---", "");
    for (const [, { title, count }] of sharedOpps.slice(0, 10)) {
      lines.push(`  ${title} (${count}/${results.length} pages)`);
    }
    lines.push("");
  }

  const totalTime = results.reduce((sum, r) => sum + r.result.lighthouseResult.timing.total, 0);
  lines.push(`Total analysis time: ${(totalTime / 1000).toFixed(1)}s`);

  return lines.join("\n");
}

function collectOpportunityIds(audits: Record<string, PsiAudit>): Set<string> {
  const ids = new Set<string>();
  for (const [id, audit] of Object.entries(audits)) {
    if (audit.score === null || audit.score >= 1) continue;
    const mode = audit.scoreDisplayMode;
    const hasNumeric = audit.numericValue && audit.numericValue > 0;
    if (mode === "metricSavings" || ((mode === "numeric" || mode === "binary") && hasNumeric)) {
      if (hasNumeric || (audit.details?.items?.length ?? 0) > 0) {
        ids.add(id);
      }
    }
  }
  return ids;
}

async function runBatch(
  urls: string[],
  options: { strategy?: "mobile" | "desktop"; categories?: PsiCategoryType[]; locale?: string },
): Promise<Array<{ url: string; result?: PsiResult; error?: string }>> {
  const concurrency = 2;
  const results: Array<{ url: string; result?: PsiResult; error?: string }> = [];
  let i = 0;

  while (i < urls.length) {
    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (url) => {
        try {
          const result = await runPagespeed(url, options);
          return { url, result };
        } catch (err) {
          return { url, error: err instanceof Error ? err.message : String(err) };
        }
      }),
    );
    results.push(...settled);
    i += concurrency;
  }

  return results;
}

export function registerPagespeedTool(server: McpServer): void {
  server.tool(
    "pagespeed",
    "Analyze page performance using Google PageSpeed Insights. Accepts a single URL or multiple URLs (batch mode). With 2 URLs, returns a side-by-side comparison with deltas. With 3-10 URLs, returns a summary table with shared opportunities.",
    {
      url: z.string().url().optional().describe("Single URL to analyze. Use this OR urls, not both."),
      urls: z
        .array(z.string().url())
        .min(2)
        .max(10)
        .optional()
        .describe("Multiple URLs (2-10) for batch analysis. 2 URLs = compare mode, 3+ = summary table."),
      strategy: z.enum(["mobile", "desktop"]).optional().describe("Device strategy. Default: 'mobile'."),
      categories: z
        .array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
        .optional()
        .describe("Lighthouse categories to run. Default: all four."),
      locale: z.string().optional().describe("Locale for localized results (e.g., 'pt-BR', 'en')."),
    },
    async ({ url, urls, strategy, categories, locale }) => {
      const strat = (strategy as "mobile" | "desktop") ?? "mobile";
      const cats = categories as PsiCategoryType[] | undefined;
      const opts = { strategy: strat, categories: cats, locale };

      // Validate: must provide url or urls, not both
      if (url && urls) {
        return {
          content: [{ type: "text", text: "Error: provide either 'url' (single) or 'urls' (batch), not both." }],
        };
      }
      if (!url && !urls) {
        return {
          content: [{ type: "text", text: "Error: provide 'url' for single analysis or 'urls' for batch analysis." }],
        };
      }

      // Single URL — existing behavior
      if (url) {
        try {
          const result = await runPagespeed(url, opts);
          return { content: [{ type: "text", text: formatPagespeed(url, result) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: "text", text: `Error running PageSpeed analysis: ${msg}` }] };
        }
      }

      // Batch mode
      const batchUrls = urls as string[];
      const results = await runBatch(batchUrls, opts);

      // Separate successes and failures
      const successes = results.filter((r): r is { url: string; result: PsiResult } => !!r.result);
      const failures = results.filter((r): r is { url: string; error: string } => !!r.error);

      if (successes.length === 0) {
        const errorLines = failures.map((f) => `${f.url}: ${f.error}`);
        return { content: [{ type: "text", text: `All URLs failed:\n${errorLines.join("\n")}` }] };
      }

      let output: string;
      if (successes.length === 2) {
        output = formatBatchCompare(successes, strat);
      } else {
        output = formatBatchTable(successes, strat);
      }

      // Append any failures
      if (failures.length > 0) {
        const errorLines = failures.map((f) => `${f.url}: ${f.error}`);
        output += `\n\n--- Errors ---\n${errorLines.join("\n")}`;
      }

      return { content: [{ type: "text", text: output }] };
    },
  );
}
