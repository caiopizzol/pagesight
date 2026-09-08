import { configSchema, operationSchema } from "../../src/api/schema.js";
import { snapshot } from "../../src/api/snapshot.js";
import { capture } from "../../src/api/evidence.js";
export const record = {
  schemaVersion: 1,
  id: "title-1",
  site: "https://example.com/",
  affectedUrls: ["https://example.com/item?q=1"],
  description: "Clarified title",
  hypothesis: "Searchers understand the page",
  deployedAt: "2026-08-02T00:30:00Z",
  expectedSignal: "Observe query clicks",
  measurementChanges: [],
  overlappingChanges: [],
};
export async function fixture(startDate: string, endDate: string, timezone = "UTC") {
  const config = configSchema.parse({
    site: record.site,
    gscSite: "sc-domain:example.com",
    gaProperty: "123",
    pages: [],
  });
  const result = await snapshot({ config, startDate, endDate, maxPages: 1 }, async (raw) => {
    const op = operationSchema.parse(raw);
    if (op.operation === "gsc.report") {
      const keys = op.request.dimensions.map((dim) => (dim === "date" ? endDate : "shared"));
      const result = await capture("gsc", "report", op.site, op.request, async () => ({
        rows: [{ keys, clicks: 2, impressions: 20, ctr: 0.1, position: 4 }],
        responseAggregationType: "byProperty",
      }));
      result.pagination = { exhausted: true, nextOffset: null, rowsReturned: 1 };
      return result;
    }
    if (op.operation === "ga.report") {
      const result = await capture("ga", "report", "properties/123", op.request, async () => ({
        dimensionHeaders: op.request.dimensions.map((d) => ({ name: d.name })),
        metricHeaders: op.request.metrics.map((m) => ({ name: m.name, type: "TYPE_INTEGER" })),
        rows: [
          {
            dimensionValues: op.request.dimensions.map(() => ({ value: "shared" })),
            metricValues: op.request.metrics.map(() => ({ value: "10" })),
          },
        ],
        rowCount: 1,
        metadata: { timeZone: timezone },
      }));
      result.pagination = { exhausted: true, nextOffset: null, rowsReturned: 1 };
      return result;
    }
    return capture("fixture", op.operation, record.site, {}, async () => ({}));
  });
  const at = new Date(Date.parse(endDate) + 2 * 86400000).toISOString();
  result.startedAt = at;
  result.finishedAt = at;
  for (const observation of (
    result.pages[0]!.response as { observations: Array<{ startedAt: string; finishedAt: string }> }
  ).observations) {
    observation.startedAt = at;
    observation.finishedAt = at;
  }
  return result;
}
