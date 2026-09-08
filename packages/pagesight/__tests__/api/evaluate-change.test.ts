import { expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { configSchema, operationSchema } from "../../src/api/schema.js";
import { snapshot } from "../../src/api/snapshot.js";
import { capture } from "../../src/api/evidence.js";

const record = {
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
async function fixture(startDate: string, endDate: string, timezone = "UTC") {
  const config = configSchema.parse({
    site: record.site,
    gscSite: "sc-domain:example.com",
    gaProperty: "123",
    pages: [],
  });
  return snapshot({ config, startDate, endDate, maxPages: 1 }, async (raw) => {
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
}
const data = (result: any) => result.pages[0].response;
test("change evidence binds actual report requests and preserves scope and source hashes", async () => {
  const baseline = await fixture("2026-07-01", "2026-07-28");
  const current = await fixture("2026-08-03", "2026-08-30");
  const result = await execute({ operation: "change.evaluate", record, baseline, current });
  const report = data(result);
  expect(report.state).toBe("descriptive");
  expect(report.scope).toContain("annotations");
  expect((result.pages[0].request as any).recordSha256).toHaveLength(64);
  expect(report.observations.find((o: any) => o.name === "gsc.report.query")).toMatchObject({
    status: "compared",
    deploymentDay: "2026-08-01",
    timezone: "America/Los_Angeles",
    gapDays: 5,
  });
  const altered = structuredClone(current) as any;
  altered.pages[0].response.observations.find(
    (o: any) => o.name === "ga.report.eventName",
  ).pages[0].request.dimensionFilter = undefined;
  const blocked = data(await execute({ operation: "change.evaluate", record, baseline, current: altered }));
  expect(blocked.observations.find((o: any) => o.name === "ga.report.eventName").status).toBe("incompatible");
});
test("deployment day differs by timezone and declared measurement changes block only GA", async () => {
  const baseline = await fixture("2026-07-01", "2026-07-28");
  const current = await fixture("2026-08-02", "2026-08-29");
  const report = data(await execute({ operation: "change.evaluate", record, baseline, current }));
  expect(report.observations.find((o: any) => o.name === "gsc.report.query").status).toBe("compared");
  expect(report.observations.find((o: any) => o.name === "ga.report.eventName").reason).toContain("After period");
  const later = await fixture("2026-08-03", "2026-08-30");
  const changed = data(
    await execute({
      operation: "change.evaluate",
      record: { ...record, measurementChanges: [{ at: record.deployedAt, description: "Tracking repair" }] },
      baseline,
      current: later,
    }),
  );
  expect(changed.observations.find((o: any) => o.name === "ga.report.eventName").reason).toContain(
    "measurement change",
  );
  expect(changed.observations.find((o: any) => o.name === "gsc.report.query").status).toBe("compared");
});
test("missing after data is pending and contaminated baselines cannot imply valid pending evidence", async () => {
  const baseline = await fixture("2026-07-01", "2026-07-28");
  const result = await execute({ operation: "change.evaluate", record, baseline });
  expect(result.status).toBe("partial");
  expect(data(result).state).toBe("pending");
  expect((result.pages[0].request as any).currentSha256).toBeNull();
  const contaminated = await fixture("2026-08-03", "2026-08-30");
  expect(data(await execute({ operation: "change.evaluate", record, baseline: contaminated })).state).toBe(
    "unavailable",
  );
  expect(
    operationSchema.safeParse({
      operation: "change.evaluate",
      record: { ...record, deployedAt: "2099-01-01T00:00:00Z" },
      baseline,
    }).success,
  ).toBe(false);
});

test("limited coverage stays limited and context annotations do not silently change evidence", async () => {
  const baseline = await fixture("2026-07-01", "2026-07-28");
  const current = (await fixture("2026-08-03", "2026-08-30")) as any;
  current.pages[0].response.observations.find((o: any) => o.name === "gsc.report.query").pagination.exhausted = false;
  current.pages[0].response.observations.find((o: any) => o.name === "gsc.report.query").pagination.nextOffset = 1;
  current.pages[0].response.context.config.context.measurementCaveats = ["Updated interpretation"];
  const result = await execute({
    operation: "change.evaluate",
    record: { ...record, overlappingChanges: [{ at: record.deployedAt, description: "Other title edit" }] },
    baseline,
    current,
  });
  expect(result.status).toBe("partial");
  expect(data(result)).toMatchObject({ confounded: true, contextChanged: true });
  expect(data(result).observations.find((o: any) => o.name === "gsc.report.query").status).toBe("limited");
  for (const observation of current.pages[0].response.observations.filter(
    (o: any) => o.provider === "ga" && o.operation === "report",
  ))
    observation.pages[0].response.metadata.timeZone = "invalid/timezone";
  const invalid = data(await execute({ operation: "change.evaluate", record, baseline, current }));
  expect(invalid.observations.find((o: any) => o.name === "ga.report.eventName").status).toBe("incompatible");
});
