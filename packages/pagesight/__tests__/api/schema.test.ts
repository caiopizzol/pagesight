import { expect, test } from "bun:test";
import { defaultDates } from "../../src/shared/dates.js";
import { execute } from "../../src/api/index.js";
import { gscRequestSchema, operationSchema } from "../../src/api/schema.js";

const request = gscRequestSchema.parse({
  startDate: "2026-08-01",
  endDate: "2026-08-28",
  dimensions: ["query"],
  rowLimit: 2,
});
const config = { site: "https://example.com" };

test("API rejects invalid and future dates regardless of transport", async () => {
  expect(gscRequestSchema.safeParse({ ...request, startDate: "2026-02-30" }).success).toBe(false);
  expect(
    operationSchema.safeParse({ operation: "snapshot", config, startDate: "2099-01-01", endDate: "2099-01-28" })
      .success,
  ).toBe(false);
  expect(
    await execute({ operation: "ga.report", property: "123", request: {} }).catch((error: unknown) => error),
  ).toBeInstanceOf(Error);
  expect(defaultDates(new Date("2026-09-08T01:00:00Z"))).toEqual({ startDate: "2026-08-08", endDate: "2026-09-04" });
});
