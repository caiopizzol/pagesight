import { expect, test } from "bun:test";
import { gaFreshnessWarnings } from "../../src/api/ga-freshness.js";
import { gaReport } from "../../src/api/reports.js";
import { gaRequestSchema } from "../../src/api/schema.js";

test("freshness uses property calendar dates across midnight and DST", () => {
  const at = "2026-03-10T00:30:00Z";
  expect(gaFreshnessWarnings(["2026-03-07"], "America/Los_Angeles", at).join()).toContain("recent data");
  expect(gaFreshnessWarnings(["2026-03-07"], "Asia/Tokyo", at)).toEqual([]);
});

test("any recent range warns, without certifying older data as final", () => {
  expect(gaFreshnessWarnings(["2026-08-01", "2026-09-08"], "UTC", "2026-09-08T12:00:00Z").join()).toContain(
    "not a finalization guarantee",
  );
  expect(gaFreshnessWarnings(["2026-09-04"], "UTC", "2026-09-08T12:00:00Z")).toEqual([]);
});

test("unknown and invalid timezone preserve an explicit freshness limitation", () => {
  for (const zone of [undefined, "", "Invalid/Timezone"])
    expect(gaFreshnessWarnings(["2026-09-08"], zone, "2026-09-08T12:00:00Z").join()).toContain("could not be assessed");
});

test("successful intraday GA reports retain raw rows and warn about freshness", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const request = gaRequestSchema.parse({
    dateRanges: [{ startDate: today, endDate: today }],
    metrics: [{ name: "eventCount" }],
  });
  const response = {
    metricHeaders: [{ name: "eventCount" }],
    rows: [{ metricValues: [{ value: "24" }] }],
    rowCount: 1,
    metadata: { timeZone: "UTC" },
  };
  const result = await gaReport("123", request, 1, async () => response);
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toEqual(response);
  expect(result.warnings.join()).toContain("recent data may still change");
});
