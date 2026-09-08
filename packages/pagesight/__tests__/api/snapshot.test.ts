import { expect, test } from "bun:test";
import { capture } from "../../src/api/evidence.js";
import { configSchema } from "../../src/api/schema.js";
import { snapshot } from "../../src/api/snapshot.js";

test("snapshots keep at most three operations in flight and finish all observations", async () => {
  let active = 0;
  let peak = 0;
  let finished = 0;
  const pages = Array.from({ length: 8 }, (_, i) => `https://example.com/${i}`);
  const result = await snapshot(
    {
      config: configSchema.parse({ site: "https://example.com", pages }),
      startDate: "2026-08-01",
      endDate: "2026-08-28",
      maxPages: 4,
    },
    async (request) => {
      active++;
      peak = Math.max(peak, active);
      await Bun.sleep(1);
      active--;
      finished++;
      return capture("web", "page", "https://example.com", request, async () => ({}));
    },
  );
  expect(peak).toBe(3);
  expect(active).toBe(0);
  expect(finished).toBe(8);
  expect(result.status).toBe("ok");
});
