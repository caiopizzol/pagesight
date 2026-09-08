import { type CruxHistoryResponse, type CruxResponse } from "../../providers/crux.js";
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

export function formatCrux(target: string, result: CruxResponse): string {
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

export function formatCruxHistory(target: string, result: CruxHistoryResponse): string {
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
