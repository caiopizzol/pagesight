import { expect, test } from "bun:test";
import { gaRealtime } from "../../src/api/ga-realtime.js";
import { operationSchema, gaRealtimeRequestSchema } from "../../src/api/schema.js";
import { RequestError } from "../../src/shared/http.js";

const request = gaRealtimeRequestSchema.parse({
  dimensions: [{ name: "eventName" }],
  metrics: [{ name: "eventCount" }],
  limit: 1,
});
const row = { dimensionValues: [{ value: "page_view" }], metricValues: [{ value: "2" }] };

test("realtime preserves the request, raw counts and quota without session attribution", async () => {
  const response = { rows: [row], rowCount: 1, propertyQuota: { tokensPerHour: { remaining: 5 } } };
  const result = await gaRealtime("123", request, async (q) => {
    expect(q.minuteRanges).toEqual([{ startMinutesAgo: 29, endMinutesAgo: 0 }]);
    return response;
  });
  expect(result.target).toBe("properties/123");
  expect(result.pages[0].response).toEqual(response);
  expect(result.status).toBe("ok");
  expect(result.warnings.join()).toContain("does not identify a particular browser test");
});

test("realtime truncation has no fabricated next offset or pagination request", async () => {
  const result = await gaRealtime("123", request, async () => ({ rows: [row], rowCount: 3 }));
  expect(result.status).toBe("partial");
  expect(result.pagination).toEqual({ exhausted: false, nextOffset: null, rowsReturned: 1 });
  expect(result.warnings.join()).toContain("no offset or page token");
});

test("empty realtime protobuf response is not a failed collection check", async () => {
  const result = await gaRealtime("123", request, async () => ({ metricHeaders: [{ name: "eventCount" }] }));
  expect(result.status).toBe("ok");
  expect(result.pagination?.rowsReturned).toBe(0);
  expect(result.warnings.join()).toContain("Empty rows do not prove collection failed");
});

test("realtime provider failures and malformed row counts remain visible", async () => {
  const failed = await gaRealtime("123", request, async () => {
    throw new RequestError("Quota", 429, "quota_exceeded");
  });
  expect(failed.status).toBe("error");
  expect(failed.error?.code).toBe("quota_exceeded");
  const malformed = await gaRealtime("123", request, async () => ({ rows: [row], rowCount: 0 }));
  expect(malformed.status).toBe("partial");
  expect(malformed.error?.code).toBe("invalid_response");
  expect(malformed.pages).toHaveLength(1);
});

test("realtime rejects historical pagination and reversed or oversized windows", () => {
  for (const extra of [
    { offset: 1 },
    { dateRanges: [] },
    { minuteRanges: [{ startMinutesAgo: 0, endMinutesAgo: 1 }] },
    { minuteRanges: [{ startMinutesAgo: 60 }] },
  ])
    expect(gaRealtimeRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
  expect(operationSchema.safeParse({ operation: "ga.realtime", property: "123", request, maxPages: 2 }).success).toBe(
    false,
  );
  expect(gaRealtimeRequestSchema.safeParse({ ...request, minuteRanges: [{ startMinutesAgo: 59 }] }).success).toBe(true);
});

test("Realtime is not collected in a historical snapshot or compared as period data", async () => {
  const { snapshotOperations } = await import("../../src/api/snapshot.js");
  const { configSchema } = await import("../../src/api/schema.js");
  const { saved } = await import("../support/comparison.js");
  const { execute } = await import("../../src/api/index.js");
  expect(
    snapshotOperations(
      configSchema.parse({ site: "https://example.com/", gaProperty: "123", pages: [] }),
      "2026-08-01",
      "2026-08-28",
      1,
    ).some((o) => o.operation === "ga.realtime"),
  ).toBe(false);
  const evidence = await gaRealtime("123", request, async () => ({ rows: [row], rowCount: 1 }));
  evidence.name = "ga.realtime";
  const result = await execute({ operation: "compare", baseline: saved([evidence]), current: saved([evidence]) });
  expect(JSON.stringify(result)).toContain('"status":"unsupported"');
});
