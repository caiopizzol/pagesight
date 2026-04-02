import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  type CruxFormFactor,
  type CruxHistoryResponse,
  type CruxResponse,
  queryCrux,
  queryCruxHistory,
} from "../lib/crux.js";

function formatDate(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

const METRIC_LABELS: Record<string, string> = {
  cumulative_layout_shift: "CLS",
  first_contentful_paint: "FCP",
  interaction_to_next_paint: "INP",
  largest_contentful_paint: "LCP",
  experimental_time_to_first_byte: "TTFB",
  round_trip_time: "RTT",
  navigation_types: "Navigation Types",
  form_factors: "Form Factors",
};

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

export function registerCruxTool(server: McpServer): void {
  server.tool(
    "crux",
    "Query Chrome UX Report (CrUX) for real-world Core Web Vitals data. Returns p75 metrics from actual Chrome users over a 28-day rolling window.",
    {
      url: z.string().optional().describe("Specific page URL. Provide either url or origin."),
      origin: z.string().optional().describe("Origin URL (e.g., 'https://example.com'). Provide either url or origin."),
      form_factor: z
        .enum(["DESKTOP", "PHONE", "TABLET"])
        .optional()
        .describe("Filter by device type. Omit for all devices."),
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
        .describe("Specific metrics to return. Default: all available."),
    },
    async ({ url, origin, form_factor, metrics }) => {
      if (!url && !origin) {
        return { content: [{ type: "text", text: "Error: provide either url or origin, not both." }] };
      }
      if (url && origin) {
        return { content: [{ type: "text", text: "Error: provide either url or origin, not both." }] };
      }
      try {
        const result = await queryCrux({
          url,
          origin,
          formFactor: form_factor as CruxFormFactor | undefined,
          metrics,
        });
        return { content: [{ type: "text", text: formatCrux(url ?? origin ?? "", result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404")) {
          const target = url ?? origin ?? "";
          const lines = [`No CrUX data for ${target}.`, ""];
          lines.push("CrUX requires sufficient Chrome user traffic (roughly 1,000+ monthly visits).");
          if (url) {
            const originUrl = new URL(url).origin;
            lines.push(`Try origin-level data instead: origin "${originUrl}"`);
          }
          lines.push("For lab metrics without traffic requirements, use the pagespeed tool.");
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        if (msg.includes("SERVICE_DISABLED") || msg.includes("API_KEY_SERVICE_BLOCKED")) {
          return {
            content: [
              {
                type: "text",
                text: "Chrome UX Report API is not enabled or the API key doesn't have access. Enable the API at: https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com — and ensure your API key allows it (Credentials > API key > API restrictions).",
              },
            ],
          };
        }
        return { content: [{ type: "text", text: `Error querying CrUX: ${msg}` }] };
      }
    },
  );

  server.tool(
    "crux_history",
    "Query CrUX History API for Core Web Vitals trends over time. Returns up to 40 weekly data points (~10 months) of real-world performance data.",
    {
      url: z.string().optional().describe("Specific page URL. Provide either url or origin."),
      origin: z.string().optional().describe("Origin URL (e.g., 'https://example.com'). Provide either url or origin."),
      form_factor: z
        .enum(["DESKTOP", "PHONE", "TABLET"])
        .optional()
        .describe("Filter by device type. Omit for all devices."),
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
        .describe("Specific metrics to return. Default: all available."),
      periods: z
        .number()
        .min(1)
        .max(40)
        .optional()
        .describe("Number of collection periods (1-40). Default: 25. Each is a 28-day window."),
    },
    async ({ url, origin, form_factor, metrics, periods }) => {
      if (!url && !origin) {
        return { content: [{ type: "text", text: "Error: provide either url or origin, not both." }] };
      }
      if (url && origin) {
        return { content: [{ type: "text", text: "Error: provide either url or origin, not both." }] };
      }
      try {
        const result = await queryCruxHistory({
          url,
          origin,
          formFactor: form_factor as CruxFormFactor | undefined,
          metrics,
          collectionPeriodCount: periods,
        });
        return { content: [{ type: "text", text: formatCruxHistory(url ?? origin ?? "", result) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("404")) {
          const target = url ?? origin ?? "";
          const lines = [`No CrUX history data for ${target}.`, ""];
          lines.push("CrUX requires sufficient Chrome user traffic (roughly 1,000+ monthly visits).");
          if (url) {
            const originUrl = new URL(url).origin;
            lines.push(`Try origin-level data instead: origin "${originUrl}"`);
          }
          lines.push("For lab metrics without traffic requirements, use the pagespeed tool.");
          return { content: [{ type: "text", text: lines.join("\n") }] };
        }
        if (msg.includes("SERVICE_DISABLED")) {
          return {
            content: [
              {
                type: "text",
                text: "Chrome UX Report API is not enabled. Enable it at: https://console.cloud.google.com/apis/library/chromeuxreport.googleapis.com",
              },
            ],
          };
        }
        return { content: [{ type: "text", text: `Error querying CrUX History: ${msg}` }] };
      }
    },
  );
}
