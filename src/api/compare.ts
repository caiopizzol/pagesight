import { z } from "zod";
import { RequestError } from "../lib/http.js";
import { capture, type Evidence } from "./evidence.js";
import type { ImportedSnapshot } from "./imported.js";
import { gaRequestSchema, gscRequestSchema } from "./schema.js";

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

function canonical(value: unknown): string {
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
class Incompatible extends Error {}
const requireSame = (a: unknown, b: unknown, message: string) => {
  if (canonical(a) !== canonical(b)) throw new Incompatible(message);
};

type SnapshotContext = ImportedSnapshot["pages"][0]["response"]["context"];

function report(observation: Evidence, context: SnapshotContext): Report {
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
      const collectedDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: response.metadata.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(observation.finishedAt));
      if (Date.parse(collectedDate) - Date.parse(current.end) < 3 * 86400000)
        current.warnings.push(
          "GA was collected fewer than three property-calendar days after the requested end date; recent data may still change.",
        );
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
    if (
      current.dimensions.some((d) =>
        /^(date|hour|dateHour|dateHourMinute|year|yearMonth|yearWeek|isoYear|isoYearIsoWeek|nthDay|nthHour|nthMinute|nthMonth|nthWeek|day|dayOfWeek|dayOfWeekName|week|isoWeek|month|minute)$/u.test(
          d,
        ),
      )
    )
      throw new Incompatible(
        "Time dimensions need a separate alignment policy; this comparison uses non-time row keys.",
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

function number(value: RawValue): number | null {
  if (typeof value === "string" && !/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(value)) return null;
  const result = Number(value);
  if (typeof value === "string" && !/^-?\d+$/u.test(value)) {
    const mantissa = value.split(/[eE]/u)[0];
    const significant = mantissa.replace(/[-.]/gu, "").replace(/^0+/u, "").replace(/0+$/u, "");
    if (significant.length > 15 || (result === 0 && /[1-9]/u.test(mantissa))) return null;
  }
  return Number.isFinite(result) && Math.abs(result) <= Number.MAX_SAFE_INTEGER ? result : null;
}

function metric(baseline: RawValue, current: RawValue) {
  const before = number(baseline);
  const after = number(current);
  if (before === null || after === null)
    return {
      baseline,
      current,
      delta: null,
      percentChange: null,
      reason: "Unsafe or invalid numeric value; raw values retained.",
    };
  const delta = after - before;
  if (!Number.isFinite(delta) || Math.abs(delta) > Number.MAX_SAFE_INTEGER)
    return { baseline, current, delta: null, percentChange: null, reason: "Numeric delta exceeds safe range." };
  const percent = before === 0 ? null : (delta / before) * 100;
  return { baseline, current, delta, percentChange: percent !== null && Number.isFinite(percent) ? percent : null };
}

function compareObservation(
  baseline: Evidence | undefined,
  current: Evidence | undefined,
  maxRows: number,
  beforeContext: SnapshotContext,
  afterContext: SnapshotContext,
) {
  const name = baseline?.name ?? current?.name;
  const warnings = [...new Set([...(baseline?.warnings ?? []), ...(current?.warnings ?? [])])];
  if (!baseline || !current)
    return {
      name,
      status: "unavailable",
      reason: "Observation missing from one snapshot; absence is not zero.",
      warnings,
    };
  if (
    baseline.provider !== current.provider ||
    baseline.operation !== current.operation ||
    baseline.target !== current.target
  )
    return { name, status: "incompatible", reason: "Observation provider, operation or target changed.", warnings };
  if (baseline.operation !== "report" || !["gsc", "ga"].includes(baseline.provider))
    return {
      name,
      status: "unsupported",
      reason:
        "This version compares GSC and GA reports only. Bing windows and other observations require a separate comparison policy.",
      warnings,
    };
  if (baseline.status === "error" || current.status === "error" || !baseline.pages.length || !current.pages.length)
    return { name, status: "unavailable", reason: "A provider report failed or has no response pages.", warnings };
  try {
    const a = report(baseline, beforeContext);
    const b = report(current, afterContext);
    requireSame(a.request, b.request, "Requested dimensions, metrics, filters or scope changed.");
    requireSame(
      a.semantics,
      b.semantics,
      "Provider aggregation, metric types, currency or reporting timezone changed.",
    );
    const durationA = Date.parse(a.end) - Date.parse(a.start);
    const durationB = Date.parse(b.end) - Date.parse(b.start);
    if (durationA !== durationB || a.end >= b.start)
      throw new Incompatible("Periods must have equal duration, with baseline ending before current starts.");
    const common = [...a.rows.keys()].filter((key) => b.rows.has(key)).sort();
    const onlyBaseline = [...a.rows.keys()].filter((key) => !b.rows.has(key)).sort();
    const onlyCurrent = [...b.rows.keys()].filter((key) => !a.rows.has(key)).sort();
    const limitations = [...new Set([...a.warnings, ...b.warnings])];
    const rows = common.slice(0, maxRows).map((key) => {
      const before = a.rows.get(key)!;
      const after = b.rows.get(key)!;
      return {
        keys: before.keys,
        metrics: Object.fromEntries(
          a.metrics.map((name, index) => [name, metric(before.values[index], after.values[index])]),
        ),
      };
    });
    if (rows.some((row) => Object.values(row.metrics).some((m) => m.delta === null)))
      limitations.push("Some numeric values could not be compared safely.");
    return {
      name,
      status: limitations.length || common.length > maxRows ? "limited" : "compared",
      baselinePeriod: { startDate: a.start, endDate: a.end },
      currentPeriod: { startDate: b.start, endDate: b.end },
      dimensions: a.dimensions,
      rows,
      commonRowCount: common.length,
      omittedCommonRows: Math.max(0, common.length - maxRows),
      rowScope: "observed-keys",
      baselineOnlyObserved: {
        count: onlyBaseline.length,
        keys: onlyBaseline.slice(0, maxRows).map((key) => a.rows.get(key)!.keys),
      },
      currentOnlyObserved: {
        count: onlyCurrent.length,
        keys: onlyCurrent.slice(0, maxRows).map((key) => b.rows.get(key)!.keys),
      },
      warnings: [
        ...warnings,
        ...limitations,
        "Only common observed rows have deltas. Missing rows are unknown; row sums are not exhaustive site totals. Position and CTR deltas retain their provider units.",
      ],
    };
  } catch (error) {
    return {
      name,
      status: "incompatible",
      reason:
        error instanceof Incompatible
          ? error.message
          : "Report request or response does not match the supported schema.",
      warnings,
    };
  }
}

export function compareSnapshots(baseline: ImportedSnapshot, current: ImportedSnapshot, maxRows: number) {
  if (baseline.target !== current.target)
    throw new RequestError("Snapshots must identify the same site", null, "invalid_input");
  const before = baseline.pages[0].response.observations;
  const after = current.pages[0].response.observations;
  const names = [...new Set([...before, ...after].map((o) => o.name))].sort();
  const source = (snapshot: ImportedSnapshot) => ({
    target: snapshot.target,
    startedAt: snapshot.startedAt,
    finishedAt: snapshot.finishedAt,
    canonicalSha256: Bun.CryptoHasher.hash("sha256", canonical(snapshot), "hex"),
  });
  return capture(
    "pagesight",
    "compare",
    baseline.target,
    { baseline: source(baseline), current: source(current), maxRows },
    async () => {
      const observations = names.map((name) =>
        compareObservation(
          before.find((o) => o.name === name),
          after.find((o) => o.name === name),
          maxRows,
          baseline.pages[0].response.context,
          current.pages[0].response.context,
        ),
      );
      return {
        comparisonVersion: 1,
        observations,
        summary: Object.fromEntries(
          ["compared", "limited", "incompatible", "unavailable", "unsupported"].map((status) => [
            status,
            observations.filter((o) => o.status === status).length,
          ]),
        ),
      };
    },
    [
      "Descriptive changes only; no causal attribution, ranking recommendations or automatic SEO changes.",
      ...new Set([...baseline.warnings, ...current.warnings]),
    ],
  );
}
