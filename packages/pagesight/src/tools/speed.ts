import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type CruxFormFactor,
  type CruxHistoryResponse,
  type CruxResponse,
  queryCrux,
  queryCruxHistory,
} from "../providers/crux.js";
import {
  hasApiKey,
  type PsiAudit,
  type PsiAuditDetailItem,
  type PsiCategoryType,
  type PsiResult,
  runPagespeed,
} from "../providers/pagespeed.js";

// --- PageSpeed helpers ---

const QUOTA_NOTE =
  "\n\nNote: No GOOGLE_API_KEY configured — using shared quota (400 req/day). Set your own key to avoid rate limits.";

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

  // Lab performance metrics
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
    lines.push("--- Lab Performance Metrics ---", "", ...cwvLines, "");
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
  if (results.length < 2) return "Error: compare requires at least 2 results.";
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

  // Lab performance comparison
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
    lines.push("--- Lab Performance Metrics ---", "", ...cwvLines, "");
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
  if (results.length === 0) return "Error: no results to display.";
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
  const oppCounts = new Map<string, { title: string; count: number; maxSavings: string }>();
  for (const { result } of results) {
    for (const id of collectOpportunityIds(result.lighthouseResult.audits)) {
      const audit = result.lighthouseResult.audits[id];
      const savings = audit.displayValue ?? "";
      const existing = oppCounts.get(id);
      if (existing) {
        existing.count++;
        if (savings && (!existing.maxSavings || savings > existing.maxSavings)) existing.maxSavings = savings;
      } else {
        oppCounts.set(id, { title: audit.title, count: 1, maxSavings: savings });
      }
    }
  }

  const sharedOpps = [...oppCounts.entries()].filter(([, v]) => v.count >= 2).sort((a, b) => b[1].count - a[1].count);
  if (sharedOpps.length > 0) {
    lines.push("--- Shared Opportunities ---", "");
    for (const [, { title, count, maxSavings }] of sharedOpps.slice(0, 10)) {
      const cleaned = maxSavings.replace(/^Est savings of /i, "");
      const savingsStr = cleaned ? `, up to ${cleaned}` : "";
      lines.push(`  ${title} (${count}/${results.length} pages${savingsStr})`);
    }
    lines.push("");
  }

  // A11y failures deduplicated across pages
  const a11yFailures = new Map<string, { title: string; count: number; pages: string[]; selectors: string[] }>();
  for (const { url, result } of results) {
    const lhr = result.lighthouseResult;
    const a11yCat = lhr.categories.accessibility;
    if (!a11yCat?.auditRefs) continue;

    for (const ref of a11yCat.auditRefs) {
      const audit = lhr.audits[ref.id];
      if (audit && audit.score !== null && audit.score < 1) {
        const page = shortUrl(url, allUrls);
        const selector = audit.details?.items?.[0]?.node?.selector ?? null;
        const existing = a11yFailures.get(ref.id);
        if (existing) {
          existing.count++;
          existing.pages.push(page);
          if (selector && !existing.selectors.includes(selector)) existing.selectors.push(selector);
        } else {
          a11yFailures.set(ref.id, {
            title: audit.title,
            count: 1,
            pages: [page],
            selectors: selector ? [selector] : [],
          });
        }
      }
    }
  }

  const sharedA11y = [...a11yFailures.entries()]
    .filter(([, v]) => v.count >= 2)
    .sort((a, b) => b[1].count - a[1].count);
  if (sharedA11y.length > 0) {
    lines.push("--- Accessibility Issues (shared) ---", "");
    for (const [, { title, count, pages, selectors }] of sharedA11y.slice(0, 10)) {
      lines.push(`  ${title} (${count}/${results.length} pages: ${pages.join(", ")})`);
      if (selectors.length > 0) {
        lines.push(`    Elements: ${selectors.slice(0, 3).join(", ")}`);
      }
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

// --- CrUX helpers ---

const METRIC_LABELS: Record<string, string> = {
  cumulative_layout_shift: "CLS",
  first_contentful_paint: "FCP",
  interaction_to_next_paint: "INP",
  largest_contentful_paint: "LCP",
  experimental_time_to_first_byte: "TTFB",
  round_trip_time: "RTT",
  navigation_types: "Navigation Types",
  form_factors: "Form Factors",
  largest_contentful_paint_image_element_render_delay: "LCP Image Render Delay",
  largest_contentful_paint_image_resource_load_delay: "LCP Image Load Delay",
  largest_contentful_paint_image_resource_load_duration: "LCP Image Load Duration",
  largest_contentful_paint_image_time_to_first_byte: "LCP Image TTFB",
  largest_contentful_paint_resource_type: "LCP Resource Type",
};

function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

function formatCrux(target: string, result: CruxResponse): string {
  const r = result.record;
  const period = r.collectionPeriod;
  const lines: string[] = [
    `=== CrUX: ${target} ===`,
    `Form factor: ${r.key.formFactor ?? "all"}`,
    `Period: ${formatDate(period.firstDate)} to ${formatDate(period.lastDate)}`,
    "",
  ];

  if (result.urlNormalizationDetails) {
    const norm = result.urlNormalizationDetails;
    if (norm.originalUrl !== norm.normalizedUrl) {
      lines.push(`Normalized: ${norm.originalUrl} → ${norm.normalizedUrl}`, "");
    }
  }

  lines.push("--- Metrics (p75) ---", "");

  for (const [key, metric] of Object.entries(r.metrics)) {
    const label = METRIC_LABELS[key] ?? key;

    if (metric.percentiles) {
      const val = metric.percentiles.p75;
      const unit = key === "cumulative_layout_shift" ? "" : "ms";
      lines.push(`${label}: ${val}${unit}`);

      if (metric.histogram) {
        const buckets = metric.histogram.map((b) => `${Math.round(b.density * 100)}%`).join(" / ");
        lines.push(`  Distribution (good/needs improvement/poor): ${buckets}`);
      }
    } else if (metric.fractions) {
      lines.push(`${label}:`);
      for (const [fKey, fVal] of Object.entries(metric.fractions)) {
        lines.push(`  ${fKey}: ${(fVal * 100).toFixed(1)}%`);
      }
    }
  }

  // Core Web Vitals assessment (Google ranking signal)
  const cwvMetrics = r.metrics;
  const lcp = cwvMetrics.largest_contentful_paint?.percentiles?.p75 as number | undefined;
  const inp = cwvMetrics.interaction_to_next_paint?.percentiles?.p75 as number | undefined;
  const cls = cwvMetrics.cumulative_layout_shift?.percentiles?.p75 as number | undefined;

  if (lcp !== undefined || inp !== undefined || cls !== undefined) {
    lines.push("", "--- Core Web Vitals Assessment ---", "");
    const lcpPass = lcp !== undefined && lcp <= 2500;
    const inpPass = inp !== undefined && inp <= 200;
    const clsPass = cls !== undefined && cls <= 0.1;

    if (lcp !== undefined)
      lines.push(`LCP: ${lcp}ms ${lcpPass ? "GOOD" : lcp <= 4000 ? "NEEDS IMPROVEMENT" : "POOR"} (threshold: 2500ms)`);
    if (inp !== undefined)
      lines.push(`INP: ${inp}ms ${inpPass ? "GOOD" : inp <= 500 ? "NEEDS IMPROVEMENT" : "POOR"} (threshold: 200ms)`);
    if (cls !== undefined)
      lines.push(`CLS: ${cls} ${clsPass ? "GOOD" : cls <= 0.25 ? "NEEDS IMPROVEMENT" : "POOR"} (threshold: 0.1)`);

    const allPresent = lcp !== undefined && inp !== undefined && cls !== undefined;
    if (allPresent) {
      const allPass = lcpPass && inpPass && clsPass;
      lines.push(
        "",
        allPass
          ? "Overall: PASS — all Core Web Vitals are good (positive ranking signal)"
          : "Overall: FAIL — not all Core Web Vitals pass (may affect rankings)",
      );
    }
  }

  return lines.join("\n");
}

function formatCruxHistory(target: string, result: CruxHistoryResponse): string {
  const r = result.record;
  const periods = r.collectionPeriods;
  const lines: string[] = [
    `=== CrUX History: ${target} ===`,
    `Form factor: ${r.key.formFactor ?? "all"}`,
    `Periods: ${periods.length} (${formatDate(periods[0].firstDate)} to ${formatDate(periods[periods.length - 1].lastDate)})`,
    "",
  ];

  if (result.urlNormalizationDetails) {
    const norm = result.urlNormalizationDetails;
    if (norm.originalUrl !== norm.normalizedUrl) {
      lines.push(`Normalized: ${norm.originalUrl} → ${norm.normalizedUrl}`, "");
    }
  }

  lines.push("--- p75 Trend ---", "");

  for (const [key, metric] of Object.entries(r.metrics)) {
    const label = METRIC_LABELS[key] ?? key;

    if (metric.percentilesTimeseries) {
      const values = metric.percentilesTimeseries.p75s;
      const first = values[0];
      const last = values[values.length - 1];
      const unit = key === "cumulative_layout_shift" ? "" : "ms";

      if (first === null && last === null) {
        lines.push(`${label}: insufficient data`);
        continue;
      }

      lines.push(
        `${label}: ${first ?? "N/A"}${first !== null ? unit : ""} → ${last ?? "N/A"}${last !== null ? unit : ""} (${values.length} points)`,
      );

      // Show trend direction
      if (first !== null && last !== null) {
        const f = Number(first);
        const l = Number(last);
        if (!Number.isNaN(f) && !Number.isNaN(l)) {
          const change = ((l - f) / f) * 100;
          const dir = change > 5 ? "worse" : change < -5 ? "improved" : "stable";
          lines.push(`  Trend: ${change > 0 ? "+" : ""}${change.toFixed(1)}% (${dir})`);
        }
      }
    } else if (metric.fractionTimeseries) {
      lines.push(`${label}: (fraction timeseries, ${periods.length} points)`);
      for (const [fKey, fData] of Object.entries(metric.fractionTimeseries)) {
        const fracs = fData.fractions;
        const first = fracs[0];
        const last = fracs[fracs.length - 1];
        if (first !== null && last !== null && !Number.isNaN(first) && !Number.isNaN(last)) {
          lines.push(`  ${fKey}: ${(first * 100).toFixed(1)}% → ${(last * 100).toFixed(1)}%`);
        }
      }
    }
  }

  // Show last 5 data points as table for core metrics
  const coreMetrics = ["largest_contentful_paint", "interaction_to_next_paint", "cumulative_layout_shift"];
  const available = coreMetrics.filter((m) => r.metrics[m]?.percentilesTimeseries);

  if (available.length > 0 && periods.length >= 5) {
    lines.push("", "--- Recent Data Points ---", "");
    const lastN = 5;
    const startIdx = periods.length - lastN;

    lines.push(`${"Date".padEnd(12)} ${available.map((m) => (METRIC_LABELS[m] ?? m).padEnd(10)).join(" ")}`);
    for (let i = startIdx; i < periods.length; i++) {
      const date = formatDate(periods[i].lastDate);
      const vals = available.map((m) => {
        const v = r.metrics[m].percentilesTimeseries?.p75s[i];
        return String(v ?? "N/A").padEnd(10);
      });
      lines.push(`${date.padEnd(12)} ${vals.join(" ")}`);
    }
  }

  return lines.join("\n");
}

// --- Unified speed tool ---

export function registerSpeedTool(server: McpServer): void {
  server.tool(
    "speed",
    "Analyze site performance. Run PageSpeed Insights (lab metrics, Lighthouse scores, opportunities) for single or multiple URLs, or query Chrome UX Report for real-world field data and historical trends.",
    {
      action: z
        .enum(["pagespeed", "crux", "crux_history"])
        .optional()
        .describe(
          "Which analysis to run. Auto-detected: 'pagespeed' when url/urls provided, 'crux' when origin provided.",
        ),
      url: z.string().url().optional().describe("URL to analyze (PageSpeed or CrUX)."),
      urls: z
        .array(z.string().url())
        .min(2)
        .max(10)
        .optional()
        .describe("Multiple URLs (2-10) for batch PageSpeed. 2 = compare, 3+ = summary table."),
      strategy: z.enum(["mobile", "desktop"]).optional().describe("Device strategy for PageSpeed. Default: 'mobile'."),
      categories: z
        .array(z.enum(["performance", "accessibility", "best-practices", "seo"]))
        .optional()
        .describe("Lighthouse categories. Default: all four."),
      locale: z.string().optional().describe("Locale for PageSpeed results."),
      origin: z.string().optional().describe("Origin for CrUX data (e.g., 'https://example.com'). Triggers CrUX mode."),
      form_factor: z.enum(["DESKTOP", "PHONE", "TABLET"]).optional().describe("CrUX device filter."),
      metrics: z
        .array(
          z.enum([
            "cumulative_layout_shift",
            "first_contentful_paint",
            "interaction_to_next_paint",
            "largest_contentful_paint",
            "experimental_time_to_first_byte",
            "round_trip_time",
            "navigation_types",
            "form_factors",
          ]),
        )
        .optional()
        .describe("CrUX metrics to query."),
      periods: z.number().min(1).max(40).optional().describe("CrUX history periods (1-40). Default: 25."),
    },
    async ({ action, url, urls, strategy, categories, locale, origin, form_factor, metrics, periods }) => {
      // Determine which action to run
      let resolvedAction = action;
      if (!resolvedAction) {
        if (urls) {
          resolvedAction = "pagespeed";
        } else if (origin && !url) {
          resolvedAction = "crux";
        } else if (periods) {
          resolvedAction = "crux_history";
        } else {
          resolvedAction = "pagespeed";
        }
      }

      // --- PageSpeed action ---
      if (resolvedAction === "pagespeed") {
        const strat = (strategy as "mobile" | "desktop") ?? "mobile";
        const cats = categories as PsiCategoryType[] | undefined;
        const opts = { strategy: strat, categories: cats, locale };

        if (url && urls) {
          return {
            content: [
              { type: "text" as const, text: "Error: provide either 'url' (single) or 'urls' (batch), not both." },
            ],
          };
        }
        if (!url && !urls) {
          return {
            content: [
              { type: "text" as const, text: "Error: provide 'url' for single analysis or 'urls' for batch analysis." },
            ],
          };
        }

        // Single URL
        if (url) {
          try {
            const result = await runPagespeed(url, opts);
            const text = formatPagespeed(url, result) + (hasApiKey() ? "" : QUOTA_NOTE);
            return { content: [{ type: "text" as const, text }] };
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: "text" as const, text: `Error running PageSpeed analysis: ${msg}` }] };
          }
        }

        // Batch mode
        const batchUrls = urls as string[];
        const results = await runBatch(batchUrls, opts);

        const successes = results.filter((r): r is { url: string; result: PsiResult } => !!r.result);
        const failures = results.filter((r): r is { url: string; error: string } => !!r.error);

        if (successes.length === 0) {
          const errorLines = failures.map((f) => `${f.url}: ${f.error}`);
          return { content: [{ type: "text" as const, text: `All URLs failed:\n${errorLines.join("\n")}` }] };
        }

        let output: string;
        if (successes.length === 2) {
          output = formatBatchCompare(successes, strat);
        } else {
          output = formatBatchTable(successes, strat);
        }

        if (failures.length > 0) {
          const errorLines = failures.map((f) => `${f.url}: ${f.error}`);
          output += `\n\n--- Errors ---\n${errorLines.join("\n")}`;
        }

        if (!hasApiKey()) output += QUOTA_NOTE;

        return { content: [{ type: "text" as const, text: output }] };
      }

      // --- CrUX action ---
      if (resolvedAction === "crux") {
        const cruxUrl = url;
        const cruxOrigin = origin;

        if (!cruxUrl && !cruxOrigin) {
          return { content: [{ type: "text" as const, text: "Error: provide url or origin for CrUX data." }] };
        }
        if (cruxUrl && cruxOrigin) {
          return { content: [{ type: "text" as const, text: "Error: provide url or origin, not both." }] };
        }

        try {
          const result = await queryCrux({
            url: cruxUrl,
            origin: cruxOrigin,
            formFactor: form_factor as CruxFormFactor | undefined,
            metrics,
          });
          return { content: [{ type: "text" as const, text: formatCrux(cruxUrl ?? cruxOrigin ?? "", result) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404")) {
            const target = cruxUrl ?? cruxOrigin ?? "";
            const lines = [`No CrUX data for ${target}.`, ""];
            lines.push("CrUX requires sufficient Chrome user traffic (roughly 1,000+ monthly visits).");
            if (cruxUrl) {
              const originUrl = new URL(cruxUrl).origin;
              lines.push(`Try origin-level data instead: origin "${originUrl}"`);
            }
            lines.push("For lab metrics without traffic requirements, use speed with a url instead.");
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
          if (msg.includes("SERVICE_DISABLED") || msg.includes("API_KEY_SERVICE_BLOCKED")) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Chrome UX Report API is not enabled or the API key doesn't have access. Enable the API at: https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com — and ensure your API key allows it (Credentials > API key > API restrictions).",
                },
              ],
            };
          }
          return { content: [{ type: "text" as const, text: `Error querying CrUX: ${msg}` }] };
        }
      }

      // --- CrUX History action ---
      if (resolvedAction === "crux_history") {
        const histUrl = url;
        const histOrigin = origin;

        if (!histUrl && !histOrigin) {
          return { content: [{ type: "text" as const, text: "Error: provide url or origin for CrUX history." }] };
        }
        if (histUrl && histOrigin) {
          return { content: [{ type: "text" as const, text: "Error: provide url or origin, not both." }] };
        }

        try {
          const result = await queryCruxHistory({
            url: histUrl,
            origin: histOrigin,
            formFactor: form_factor as CruxFormFactor | undefined,
            metrics,
            collectionPeriodCount: periods,
          });
          return { content: [{ type: "text" as const, text: formatCruxHistory(histUrl ?? histOrigin ?? "", result) }] };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("404")) {
            const target = histUrl ?? histOrigin ?? "";
            const lines = [`No CrUX history data for ${target}.`, ""];
            lines.push("CrUX requires sufficient Chrome user traffic (roughly 1,000+ monthly visits).");
            if (histUrl) {
              const originUrl = new URL(histUrl).origin;
              lines.push(`Try origin-level data instead: origin "${originUrl}"`);
            }
            lines.push("For lab metrics without traffic requirements, use speed with a url instead.");
            return { content: [{ type: "text" as const, text: lines.join("\n") }] };
          }
          if (msg.includes("SERVICE_DISABLED")) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "Chrome UX Report API is not enabled. Enable it at: https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com",
                },
              ],
            };
          }
          return { content: [{ type: "text" as const, text: `Error querying CrUX History: ${msg}` }] };
        }
      }

      return { content: [{ type: "text" as const, text: `Unknown action: ${resolvedAction}` }] };
    },
  );
}
