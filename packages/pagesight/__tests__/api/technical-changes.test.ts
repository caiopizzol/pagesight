import { expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { snapshot } from "../../src/api/snapshot.js";
import { configSchema } from "../../src/api/schema.js";
import { capture } from "../../src/api/evidence.js";
async function fixture(status = 200, robots: string[] = [], site = "https://example.com/") {
  return snapshot(
    { config: configSchema.parse({ site }), startDate: "2026-08-01", endDate: "2026-08-28", maxPages: 1 },
    async () =>
      capture("web", "page", site, { url: site }, async () => ({
        url: site,
        finalUrl: site,
        status,
        canonical: site,
        robots,
        xRobotsTag: null,
        title: "Fixture",
        description: "Fixture page",
        sha256: "a".repeat(64),
        redirects: [],
      })),
  );
}
test("technical changes bind common URLs and flag policy changes separately from first-run errors", async () => {
  const baseline = await fixture();
  const current = await fixture(200, ["robots: noindex"]);
  const result = await execute({ operation: "technical.compare", baseline, current });
  expect(result.pages[0].response).toMatchObject({
    baselineState: "compatible",
    alerts: [
      {
        kind: "technical-change",
        message: "Observed robots changed; verify against intended route policy",
        before: [],
        after: ["robots: noindex"],
      },
    ],
  });
  expect((await execute({ operation: "technical.compare", current })).pages[0].response).toMatchObject({
    baselineState: "first-run",
    alerts: [],
  });
  const failed = await fixture(503);
  expect((await execute({ operation: "technical.compare", current: failed })).pages[0].response).toMatchObject({
    alerts: [{ kind: "http-error" }],
  });
});
test("scope changes and mismatched response identity cannot generate false regressions", async () => {
  const baseline = await fixture();
  const current = await fixture(200, ["robots: noindex"], "https://other.test/");
  expect((await execute({ operation: "technical.compare", baseline, current })).pages[0].response).toMatchObject({
    baselineState: "scope-reset",
    alerts: [],
  });
  const mismatched = (await fixture()) as any;
  mismatched.pages[0].response.observations[0].pages[0].response.url = "https://wrong.test/";
  expect(
    (await execute({ operation: "technical.compare", baseline, current: mismatched })).pages[0].response,
  ).toMatchObject({ alerts: [{ kind: "unknown" }] });
});
