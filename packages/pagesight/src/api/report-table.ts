import { z } from "zod";
import type { Evidence } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";
import { gaRequestSchema, gscRequestSchema } from "./schema.js";
import { gaFreshnessWarnings } from "./ga-freshness.js";

const gscRow = z
  .object({
    keys: z.array(z.string()).optional(),
    clicks: z.number().finite(),
    impressions: z.number().finite(),
    ctr: z.number().finite(),
    position: z.number().finite(),
  })
  .passthrough();
const gscResponse = z
  .object({
    rows: z.array(gscRow).default([]),
    responseAggregationType: z.string().min(1),
    metadata: z.record(z.unknown()).optional(),
  })
  .passthrough();
const gaResponse = z
  .object({
    dimensionHeaders: z.array(z.object({ name: z.string() })).default([]),
    metricHeaders: z.array(z.object({ name: z.string(), type: z.string().optional() })).min(1),
    rows: z
      .array(
        z.object({
          dimensionValues: z.array(z.object({ value: z.string() })).default([]),
          metricValues: z.array(z.object({ value: z.string() })),
        }),
      )
      .default([]),
    metadata: z.object({ timeZone: z.string().min(1), currencyCode: z.string().optional() }).passthrough(),
  })
  .passthrough();
const gaComparisonDimensions = new Set([
  "hostName",
  "sessionDefaultChannelGroup",
  "sessionSourceMedium",
  "eventName",
  "landingPagePlusQueryString",
  "sessionSource",
]);

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}

type RawValue = number | string;
type Report = {
  request: unknown;
  start: string;
  end: string;
  dimensions: string[];
  metrics: string[];
  semantics: unknown;
  rows: Map<string, { keys: string[]; values: RawValue[] }>;
  warnings: string[];
};
export class Incompatible extends Error {}
export const requireSame = (a: unknown, b: unknown, message: string) => {
  if (canonical(a) !== canonical(b)) throw new Incompatible(message);
};

type SnapshotContext = ImportedSnapshot["pages"][0]["response"]["context"];

export function normalizeReport(observation: Evidence, context: SnapshotContext): Report {
  let report: Report | undefined;
  let offset = 0;
  for (const page of observation.pages) {
    let current: Omit<Report, "rows">;
    let rows: Array<{ keys: string[]; values: RawValue[] }>;
    if (observation.provider === "gsc") {
      const q = gscRequestSchema.parse(page.request);
      const response = gscResponse.parse(page.response);
      if (
        q.dataState !== "final" ||
        Object.keys(response.metadata ?? {}).some((key) => key.startsWith("first_incomplete"))
      )
        throw new Incompatible("GSC data must be finalized.");
      if (q.startRow !== offset)
        throw new Incompatible("Report must contain contiguous pages starting at offset zero.");
      if (q.dimensions.some((dimension) => dimension === "date" || dimension === "hour"))
        throw new Incompatible(
          "Time dimensions need a separate alignment policy; this comparison uses non-time row keys.",
        );
      const { startDate, endDate, startRow: _startRow, rowLimit: _rowLimit, ...scope } = q;
      current = {
        request: scope,
        start: startDate,
        end: endDate,
        dimensions: q.dimensions,
        metrics: ["clicks", "impressions", "ctr", "position"],
        semantics: { aggregation: response.responseAggregationType, timezone: "America/Los_Angeles" },
        warnings: [],
      };
      if (!context.observedGscDates.includes(endDate))
        current.warnings.push(
          "GSC has no observed date row for the requested end date; trailing days may be unavailable or have no activity.",
        );
      rows = response.rows.map((r) => ({ keys: r.keys ?? [], values: [r.clicks, r.impressions, r.ctr, r.position] }));
    } else {
      const q = gaRequestSchema.parse(page.request);
      const response = gaResponse.parse(page.response);
      if (q.dateRanges.length !== 1) throw new Incompatible("GA comparison requires exactly one date range.");
      if (
        q.dimensions.some(
          (dimension) => !gaComparisonDimensions.has(dimension.name) || Object.hasOwn(dimension, "dimensionExpression"),
        )
      )
        throw new Incompatible("GA comparison supports only snapshot dimension names without dimension expressions.");
      if (q.offset !== offset) throw new Incompatible("Report must contain contiguous pages starting at offset zero.");
      const { dateRanges, offset: _offset, limit: _limit, returnPropertyQuota: _quota, ...scope } = q;
      const dimensions = q.dimensions.map((d) => d.name);
      const metrics = q.metrics.map((m) => m.name);
      if (new Set(metrics).size !== metrics.length)
        throw new Incompatible("GA metric names must be unique to preserve every compared value.");
      requireSame(
        response.dimensionHeaders.map((h) => h.name),
        dimensions,
        "GA dimension headers must match the request.",
      );
      requireSame(
        response.metricHeaders.map((h) => h.name),
        metrics,
        "GA metric headers must match the request.",
      );
      current = {
        request: scope,
        start: dateRanges[0].startDate,
        end: dateRanges[0].endDate,
        dimensions,
        metrics,
        semantics: {
          timezone: response.metadata.timeZone,
          currency: response.metadata.currencyCode ?? null,
          metrics: response.metricHeaders,
        },
        warnings: [],
      };
      if (response.metadata.subjectToThresholding) current.warnings.push("GA report is subject to thresholding.");
      if (response.metadata.dataLossFromOtherRow)
        current.warnings.push("GA high-cardinality rows were combined into (other).");
      if (Array.isArray(response.metadata.samplingMetadatas) && response.metadata.samplingMetadatas.length)
        current.warnings.push("GA report is sampled.");
      current.warnings.push(...gaFreshnessWarnings([current.end], response.metadata.timeZone, observation.finishedAt));
      if (response.metricHeaders.some((h) => h.type === "TYPE_CURRENCY") && !response.metadata.currencyCode)
        throw new Incompatible("GA currency metrics require a known response currency.");
      rows = response.rows.map((r) => ({
        keys: r.dimensionValues.map((v) => v.value),
        values: r.metricValues.map((v) => v.value),
      }));
    }
    requireSame(
      { startDate: current.start, endDate: current.end },
      { startDate: context.requestedDates.startDate, endDate: context.requestedDates.endDate },
      "Report period does not match the snapshot context.",
    );
    if (report) {
      requireSame(
        [report.request, report.start, report.end, report.semantics],
        [current.request, current.start, current.end, current.semantics],
        "Report scope or metadata changed between pages.",
      );
      report.warnings.push(...current.warnings);
    } else report = { ...current, rows: new Map() };
    for (const row of rows) {
      if (row.keys.length !== current.dimensions.length || row.values.length !== current.metrics.length)
        throw new Incompatible("Row shape does not match the requested dimensions and metrics.");
      const key = canonical(row.keys);
      if (report.rows.has(key)) throw new Incompatible("Duplicate row keys make this report ambiguous.");
      report.rows.set(key, row);
    }
    offset += rows.length;
  }
  if (!report) throw new Incompatible("No report pages available.");
  if (observation.provider === "ga") {
    const totals = observation.pages.map((p) => (p.response as { rowCount?: number }).rowCount ?? 0);
    if (
      totals.some((n) => !Number.isSafeInteger(n) || n < offset || n !== totals[0]) ||
      (observation.pagination?.exhausted && totals[0] !== offset)
    )
      throw new Incompatible("GA rowCount conflicts with retained rows or completeness.");
  }

  if (
    observation.pagination &&
    (observation.pagination.rowsReturned !== offset ||
      observation.pagination.nextOffset !== (observation.pagination.exhausted ? null : offset))
  )
    throw new Incompatible("Report pagination does not match the retained rows.");
  if (observation.status !== "ok" || !observation.pagination?.exhausted || observation.error)
    report.warnings.push(
      "Report has incomplete pagination or a provider failure; only observed common rows can be compared.",
    );
  return report;
}

export function parseNumericValue(value: RawValue): number | null {
  if (typeof value === "string" && !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value)) return null;
  const result = Number(value);
  if (typeof value === "string" && !/^-?\d+$/u.test(value)) {
    const mantissa = value.split(/[eE]/u)[0];
    const significant = mantissa.replace(/[-.]/gu, "").replace(/^0+/u, "").replace(/0+$/u, "");
    if (significant.length > 15 || (result === 0 && /[1-9]/u.test(mantissa))) return null;
  }
  return Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER ? result : null;
}
