import { expect, test } from "bun:test";
import { gaReport, gscReport } from "../../src/api/reports.js";
import { gaRequestSchema, gscRequestSchema } from "../../src/api/schema.js";
import { RequestError } from "../../src/shared/http.js";

const request = gscRequestSchema.parse({
  startDate: "2026-08-01",
  endDate: "2026-08-28",
  dimensions: ["query"],
  rowLimit: 2,
});
const row = { keys: ["vehicle"], clicks: 1, impressions: 5, ctr: 0.2, position: 8 };
test("GSC exact-limit page is incomplete and records the effective defaults", async () => {
  const r = await gscReport("sc-domain:example.com", request, 1, async () => ({
    rows: [row, row],
    responseAggregationType: "byProperty",
  }));
  expect(r.status).toBe("partial");
  expect(r.pagination).toEqual({ exhausted: false, nextOffset: 2, rowsReturned: 2 });
  expect(r.pages[0].request).toMatchObject({ dataState: "final", startRow: 0, rowLimit: 2 });
  expect(r.warnings.join(" ")).toContain("Anonymized");
});

test("GSC paginates without claiming full query coverage", async () => {
  const offsets: number[] = [];
  const r = await gscReport("site", request, 3, async (q) => {
    offsets.push(q.startRow);
    return { rows: q.startRow ? [] : [row, row], responseAggregationType: "byProperty" };
  });
  expect(offsets).toEqual([0, 2]);
  expect(r.pagination?.exhausted).toBe(true);
  expect(r.warnings.join(" ")).toContain("API top-row limits");
});

test("a failed second page preserves the first response and failed request", async () => {
  const r = await gscReport("site", request, 3, async (q) => {
    if (q.startRow) throw new RequestError("Provider returned HTTP 429", 429, "quota_exceeded");
    return { rows: [row, row], responseAggregationType: "byProperty" };
  });
  expect(r.status).toBe("partial");
  expect(r.pages).toHaveLength(1);
  expect(r.error?.code).toBe("quota_exceeded");
  expect(r.failedRequest).toMatchObject({ startRow: 2 });
  expect(r.pagination?.nextOffset).toBe(2);
});

test("GA pagination preserves thresholding, sampling, quota and timezone", async () => {
  const q = gaRequestSchema.parse({
    dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-28" }],
    metrics: [{ name: "sessions" }],
    limit: 1,
  });
  const r = await gaReport("123", q, 2, async () => ({
    rows: [{ metricValues: [{ value: "1" }] }],
    rowCount: 2,
    metadata: {
      timeZone: "America/Sao_Paulo",
      subjectToThresholding: true,
      dataLossFromOtherRow: true,
      samplingMetadatas: [{ samplesReadCount: "10" }],
    },
    propertyQuota: { tokensPerDay: { remaining: 900 } },
  }));
  expect(r.pagination).toEqual({ exhausted: true, nextOffset: null, rowsReturned: 2 });
  expect(r.pages[1].request).toMatchObject({ offset: 1, returnPropertyQuota: true });
  expect(r.warnings).toHaveLength(3);
  expect(r.pages[0].response).toMatchObject({
    metadata: { timeZone: "America/Sao_Paulo" },
    propertyQuota: { tokensPerDay: { remaining: 900 } },
  });
});

test("GA zero rowCount omitted by protobuf is an empty report, not an auth error", async () => {
  const q = gaRequestSchema.parse({
    dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-28" }],
    metrics: [{ name: "sessions" }],
  });
  const r = await gaReport("123", q, 1, async () => ({
    metricHeaders: [{ name: "sessions" }],
    metadata: { timeZone: "UTC" },
  }));
  expect(r.status).toBe("ok");
  expect(r.pagination?.rowsReturned).toBe(0);
});
