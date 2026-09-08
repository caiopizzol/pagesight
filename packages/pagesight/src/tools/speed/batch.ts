import { type PsiAudit, type PsiCategoryType, type PsiResult, runPagespeed } from "../../providers/pagespeed.js";
import { scorePct } from "./pagespeed.js";
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

export function formatBatchCompare(results: Array<{ url: string; result: PsiResult }>, strategy: string): string {
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

export function formatBatchTable(results: Array<{ url: string; result: PsiResult }>, strategy: string): string {
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

export async function runBatch(
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
