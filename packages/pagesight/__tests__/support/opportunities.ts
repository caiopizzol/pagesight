import { fixture } from "./assessment.js";
import { capture } from "../../src/api/evidence.js";
import { gscRequestSchema } from "../../src/api/schema.js";

export async function opportunityFixture() {
  const saved = await fixture();
  const body = saved.pages[0].response as any;
  body.context.config.gscSite = "sc-domain:example.com";
  const request = gscRequestSchema.parse({ startDate: "2026-08-01", endDate: "2026-08-28", dimensions: ["page"] });
  const observation = await capture("gsc", "report", "sc-domain:example.com", request, async () => ({
    rows: [
      { keys: ["https://example.com/a?x=1"], clicks: 1, impressions: 100, ctr: 0.01, position: 11 },
      { keys: ["https://example.com/b"], clicks: 0, impressions: 50, ctr: 0, position: 30 },
      { keys: ["https://example.com/popular"], clicks: 8, impressions: 200, ctr: 0.04, position: 2 },
    ],
    responseAggregationType: "byPage",
  }));
  observation.name = "gsc.report.page";
  observation.pagination = { exhausted: true, nextOffset: null, rowsReturned: 3 };
  body.observations.push(observation);
  for (const name of [
    "ga.report.landingPagePlusQueryString+sessionSource.organic",
    "ga.report.landingPagePlusQueryString+sessionSource+eventName.organic",
  ]) {
    const r = body.observations.find((o: any) => o.name === name);
    const keys = name.includes("eventName") ? ["/a?x=1", "google", "detail_view"] : ["/a?x=1", "google"];
    r.pages[0].response.rows[0].dimensionValues = keys.map((value) => ({ value }));
  }
  return saved;
}
