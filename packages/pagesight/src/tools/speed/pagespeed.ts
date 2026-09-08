import { type PsiAudit, type PsiAuditDetailItem, type PsiResult } from "../../providers/pagespeed.js";
export const QUOTA_NOTE =
  "\n\nNote: No GOOGLE_API_KEY configured — using shared quota (400 req/day). Set your own key to avoid rate limits.";

function scoreLabel(score: number | null): string {
  if (score === null) return "N/A";
  const pct = Math.round(score * 100);
  if (pct >= 90) return `${pct} (good)`;
  if (pct >= 50) return `${pct} (needs improvement)`;
  return `${pct} (poor)`;
}

export function scorePct(score: number | null): number | null {
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

export function formatPagespeed(url: string, result: PsiResult): string {
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
