import { expect, test } from "bun:test";
import { pacificDaysAgo } from "../../src/shared/dates.js";

test("Pacific day arithmetic stays on calendar dates across DST and year boundaries", () => {
  const original = process.env.TZ;
  try {
    for (const tz of ["UTC", "America/Los_Angeles", "Asia/Tokyo"]) {
      process.env.TZ = tz;
      expect(pacificDaysAgo(1, new Date("2026-03-09T07:30:00Z"))).toBe("2026-03-08");
      expect(pacificDaysAgo(1, new Date("2026-11-02T07:30:00Z"))).toBe("2026-10-31");
      expect(pacificDaysAgo(1, new Date("2026-01-01T09:00:00Z"))).toBe("2025-12-31");
      expect(pacificDaysAgo(28, new Date("2026-08-29T19:00:00Z"))).toBe("2026-08-01");
      expect(pacificDaysAgo(3, new Date("2026-08-29T19:00:00Z"))).toBe("2026-08-26");
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
});
