import { expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { capture, type Evidence } from "../../src/api/evidence.js";
import { opportunityFixture } from "../support/opportunities.js";
import { renderOpportunities } from "../../src/opportunities-text.js";

const body = (e: Evidence): any => e.pages[0].response;
const gsc = (s: Evidence): any => body(s).observations.find((o: Evidence) => o.name === "gsc.report.page");

test("selection uses explicit counts across all rows, retains metrics and explains limited associations", async () => {
  const snapshot = await opportunityFixture();
  const result = await execute({ operation: "opportunities", snapshot, maxRows: 1 });
  const out = body(result);
  expect(out.qualifyingObservedRows).toBe(2);
  expect(out.omittedCandidates).toBe(1);
  expect(out.candidates[0]).toMatchObject({
    url: "https://example.com/a?x=1",
    search: { metrics: { clicks: 1, impressions: 100, ctr: 0.01, position: 11 } },
  });
  expect(out.candidates[0].organic[1]).toMatchObject({
    association: "configured-origin-exact-path-not-canonical",
    rows: [{ keys: ["/a?x=1", "google", "detail_view"], values: ["100"] }],
  });
  expect(out.candidates[0].unknowns.join()).toContain("No usable exact-URL HTML");
  expect(renderOpportunities(result)).toContain("Next check:");
  expect(out.policy.snapshot).toBeUndefined();
  expect(out.snapshotSha256).toHaveLength(64);
});

test("query variations, scheme, origin and encoded paths are never silently folded together", async () => {
  for (const url of [
    "https://example.com/a",
    "https://example.com/a?x=2",
    "http://example.com/a?x=1",
    "https://other.example/a?x=1",
    "https://example.com/%61?x=1",
    "https://example.com/a/?x=1",
    "https://example.com/a?x=1#part",
  ]) {
    const snapshot = await opportunityFixture();
    gsc(snapshot).pages[0].response.rows[0].keys = [url];
    const out = body(await execute({ operation: "opportunities", snapshot, maxRows: 1 }));
    expect(out.candidates[0].organic.every((o: any) => o.rows.length === 0)).toBe(true);
    expect(out.candidates[0].unknowns.join()).toContain("not zero activity");
  }
});

test("mismatched GA scope is rejected and unavailable search cannot appear as a zero-candidate finding", async () => {
  const snapshot = await opportunityFixture();
  const ga = body(snapshot).observations.find(
    (o: Evidence) => o.name === "ga.report.landingPagePlusQueryString+sessionSource+eventName.organic",
  );
  delete ga.pages[0].request.dimensionFilter;
  const out = body(await execute({ operation: "opportunities", snapshot, maxRows: 1 }));
  expect(out.candidates[0].organic[1].rows).toEqual([]);
  gsc(snapshot).pages[0].request.dataState = "all";
  const missing = await execute({ operation: "opportunities", snapshot });
  expect(missing.status).toBe("partial");
  expect(body(missing)).toMatchObject({ searchReportAvailable: false, qualifyingObservedRows: null, candidates: [] });
});

test("technical evidence attaches by actual request/target, not observation names; directives remain contextual", async () => {
  const snapshot = await opportunityFixture();
  const url = "https://example.com/a?x=1";
  const html = await capture("web", "page", url, { url }, async () => ({
    url,
    finalUrl: url,
    status: 200,
    title: "A\u001btitle",
    description: null,
    canonical: "https://example.com/a",
    robots: ["robots: noindex"],
    xRobotsTag: null,
  }));
  html.name = `page:${url}`;
  body(snapshot).observations.push(html);
  const inspection = await capture(
    "gsc",
    "inspect",
    "sc-domain:example.com",
    { inspectionUrl: url, siteUrl: "sc-domain:example.com" },
    async () => ({
      inspectionResult: { indexStatusResult: { verdict: "PASS", lastCrawlTime: "2026-08-01T00:00:00Z" } },
    }),
  );
  inspection.name = `gsc.inspect:${url}`;
  body(snapshot).observations.push(inspection);
  let result = await execute({ operation: "opportunities", snapshot, maxRows: 1 });
  expect(body(result).candidates[0].technical).toHaveLength(2);
  expect(body(result).candidates[0].nextChecks.join()).toContain("intentional route policy");
  expect(renderOpportunities(result)).not.toContain("\u001b");
  html.target = "https://example.com/b";
  result = await execute({ operation: "opportunities", snapshot, maxRows: 1 });
  expect(body(result).candidates[0].technical).toHaveLength(1);
});

test("partial search keeps observed candidates without presenting exhaustive selection; invalid policy is rejected", async () => {
  const snapshot = await opportunityFixture();
  gsc(snapshot).status = "partial";
  gsc(snapshot).pagination.exhausted = false;
  gsc(snapshot).pagination.nextOffset = 3;
  const result = await execute({ operation: "opportunities", snapshot });
  expect(result.status).toBe("partial");
  expect(body(result).candidates[0].search.complete).toBe(false);
  expect(execute({ operation: "opportunities", snapshot, minImpressions: 0 })).rejects.toMatchObject({
    code: "invalid_input",
  });
  body(snapshot).context.config.productionHostname = "other.example";
  expect(execute({ operation: "opportunities", snapshot })).rejects.toMatchObject({ code: "invalid_input" });
});

test("invalid retained metrics are counted as unusable, not silently treated as an empty cohort", async () => {
  const snapshot = await opportunityFixture();
  const rows = gsc(snapshot).pages[0].response.rows;
  rows[0].impressions = 0.5;
  rows[1].ctr = -0.2;
  const result = await execute({ operation: "opportunities", snapshot });
  expect(result.status).toBe("partial");
  expect(body(result)).toMatchObject({ unusableSearchRows: 2, qualifyingObservedRows: 0 });
});

test("suggested follow-up requests validate and keep the exact page filter and reporting period", async () => {
  const { operationSchema } = await import("../../src/api/schema.js");
  const snapshot = await opportunityFixture();
  const result = await execute({ operation: "opportunities", snapshot, maxRows: 1 });
  const requests = body(result).candidates[0].suggestedRequests;
  for (const request of requests) expect(operationSchema.safeParse(request).success).toBe(true);
  expect(requests[0].request).toMatchObject({
    startDate: "2026-08-01",
    endDate: "2026-08-28",
    dimensions: ["query"],
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [{ dimension: "page", operator: "equals", expression: "https://example.com/a?x=1" }],
      },
    ],
  });
});

test("unassociated organic rows remain visible across URL variants, special values and display caps", async () => {
  const snapshot = await opportunityFixture();
  gsc(snapshot).pages[0].response.rows[0].keys = ["http://example.com/a?x=1"];
  const traffic = body(snapshot).observations.find(
    (o: Evidence) => o.name === "ga.report.landingPagePlusQueryString+sessionSource.organic",
  );
  traffic.pages[0].response.rows.push({
    dimensionValues: [{ value: "(other)" }, { value: "google" }],
    metricValues: [{ value: "3" }, { value: "2" }],
  });
  traffic.pages[0].response.rowCount = 2;
  traffic.pagination.rowsReturned = 2;
  let result = await execute({ operation: "opportunities", snapshot, maxRows: 1 });
  expect(body(result).candidates[0].organic[0].rows).toEqual([]);
  expect(body(result).unassociatedOrganic[0]).toMatchObject({
    observedRows: 2,
    omittedRows: 1,
    rows: [{ keys: ["/a?x=1", "google"], values: ["100", "100"] }],
  });
  result = await execute({ operation: "opportunities", snapshot, maxRows: 10 });
  expect(body(result).unassociatedOrganic[0].rows[1].keys[0]).toBe("(other)");
});

test("HTML and inspection canonicals never create GA associations and remain route-policy evidence", async () => {
  const snapshot = await opportunityFixture();
  const url = "https://example.com/a?x=1";
  const traffic = body(snapshot).observations.find(
    (o: Evidence) => o.name === "ga.report.landingPagePlusQueryString+sessionSource.organic",
  );
  traffic.pages[0].response.rows[0].dimensionValues[0].value = "/a";
  const html = await capture("web", "page", url, { url }, async () => ({
    url,
    finalUrl: url,
    status: 200,
    title: "A",
    description: null,
    canonical: "https://example.com/a",
    robots: [],
    xRobotsTag: null,
  }));
  html.name = `page:${url}`;
  const inspection = await capture(
    "gsc",
    "inspect",
    "sc-domain:example.com",
    { inspectionUrl: url, siteUrl: "sc-domain:example.com" },
    async () => ({
      inspectionResult: { indexStatusResult: { verdict: "PASS", googleCanonical: "https://example.com/a" } },
    }),
  );
  inspection.name = `gsc.inspect:${url}`;
  body(snapshot).observations.push(html, inspection);
  const result = await execute({ operation: "opportunities", snapshot, maxRows: 1 });
  const candidate = body(result).candidates[0];
  expect(candidate.url).toBe(url);
  expect(candidate.organic[0].rows).toEqual([]);
  expect(candidate.nextChecks.join()).toContain("reported canonical");
  expect(body(result).unassociatedOrganic[0].rows[0].keys[0]).toBe("/a");
  expect(candidate.unknowns.join()).toContain("property query totals are not page-level");
});

test("click-sorted assessment previews cannot hide zero-click pages from selection", async () => {
  const snapshot = await opportunityFixture();
  const report = gsc(snapshot);
  for (let i = 0; i < 110; i++)
    report.pages[0].response.rows.push({
      keys: [`https://example.com/high-${i}`],
      clicks: 20,
      impressions: 1000,
      ctr: 0.02,
      position: 2,
    });
  report.pagination.rowsReturned = 113;
  const result = await execute({ operation: "opportunities", snapshot, maxRows: 1, maxClicks: 0 });
  expect(body(result).candidates[0].url).toBe("https://example.com/b");
  expect(body(result).qualifyingObservedRows).toBe(1);
});
