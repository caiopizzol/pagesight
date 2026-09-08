import { aggregate, type Evidence } from "../../src/api/evidence.js";
import { gaReport, gscReport } from "../../src/api/reports.js";
import { gaRequestSchema, gscRequestSchema } from "../../src/api/schema.js";

export const periods = [
  { startDate: "2026-07-04", endDate: "2026-07-31" },
  { startDate: "2026-08-01", endDate: "2026-08-28" },
];
export function saved(observations: Evidence[]): Evidence {
  const result = aggregate("snapshot", "https://example.com/", {}, observations);
  const request = observations.find((o) => o.operation === "report")?.pages[0]?.request as
    | { startDate?: string; endDate?: string; dateRanges?: Array<{ startDate: string; endDate: string }> }
    | undefined;
  const requestedDates =
    request?.dateRanges?.[0] ??
    (request?.startDate ? { startDate: request.startDate, endDate: request.endDate } : periods[1]);
  Object.assign(result.pages[0].response as object, {
    snapshotVersion: 1,
    context: { config: { site: result.target }, requestedDates, observedGscDates: [requestedDates.endDate] },
  });
  return result;
}
export async function gsc(
  period: number,
  rows = [{ keys: ["shared"], clicks: 2, impressions: 10, ctr: 0.2, position: 5 }],
) {
  const result = await gscReport(
    "sc-domain:example.com",
    gscRequestSchema.parse({ ...periods[period], dimensions: ["query"] }),
    1,
    async () => ({ rows, responseAggregationType: "byProperty" }),
  );
  result.name = "gsc.report.query";
  return result;
}
export async function ga(period: number, value: string, metadata: Record<string, unknown> = {}) {
  const result = await gaReport(
    "123",
    gaRequestSchema.parse({
      dateRanges: [periods[period]],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
    }),
    1,
    async () => ({
      dimensionHeaders: [{ name: "eventName" }],
      metricHeaders: [{ name: "eventCount", type: "TYPE_INTEGER" }],
      rows: [{ dimensionValues: [{ value: "success" }], metricValues: [{ value }] }],
      rowCount: 1,
      metadata: { timeZone: "UTC", ...metadata },
    }),
  );
  result.name = "ga.report.eventName";
  return result;
}
