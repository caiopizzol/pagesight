import type { SpeedOptions } from "./schema.js";
import { hasApiKey, type PsiCategoryType, type PsiResult, runPagespeed } from "../../providers/pagespeed.js";
import { type CruxFormFactor, queryCrux, queryCruxHistory } from "../../providers/crux.js";
import { QUOTA_NOTE, formatPagespeed } from "./pagespeed.js";
import { formatBatchCompare, formatBatchTable, runBatch } from "./batch.js";
import { formatCrux, formatCruxHistory } from "./crux.js";

export async function analyzeSpeed({
  action,
  url,
  urls,
  strategy,
  categories,
  locale,
  origin,
  form_factor,
  metrics,
  periods,
}: SpeedOptions) {
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
        content: [{ type: "text" as const, text: "Error: provide either 'url' (single) or 'urls' (batch), not both." }],
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

  const unhandled: never = resolvedAction;
  return { content: [{ type: "text" as const, text: `Unknown action: ${String(unhandled)}` }] };
}
