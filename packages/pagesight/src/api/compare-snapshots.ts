import { canonical, normalizeReport, parseNumericValue, Incompatible, requireSame } from "./report-table.js";
import { RequestError } from "../shared/http.js";
import { capture, type Evidence } from "./evidence.js";
import type { ImportedSnapshot } from "./evidence-schema.js";

function metric(baseline: number | string, current: number | string) {
  const before = parseNumericValue(baseline);
  const after = parseNumericValue(current);
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

type SnapshotContext = ImportedSnapshot["pages"][0]["response"]["context"];

export function compareObservation(
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
    const a = normalizeReport(baseline, beforeContext);
    const b = normalizeReport(current, afterContext);
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
