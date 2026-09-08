import { expect, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import type { Evidence } from "../../src/api/evidence.js";
import { fixture } from "../support/assessment.js";
import { renderAssessment } from "../../src/assessment-text.js";

function content(e: Evidence): any {
  return e.pages[0].response;
}
function report(e: Evidence, name = "ga.report.eventName"): any {
  return content(e).observations.find((o: Evidence) => o.name === name);
}

test("assessment surfaces excluded events and hostname scope without inventing diagnoses", async () => {
  const saved = await fixture();
  const result = await execute({ operation: "assess", snapshot: saved, maxRows: 1 });
  const out = content(result);
  expect(result.status).toBe("ok");
  expect(out.findings.find((f: any) => f.code === "no-success-events")).toBeDefined();
  expect(out.findings.find((f: any) => f.code === "excluded-key-event")).toMatchObject({
    sources: ["ga.report.eventName"],
  });
  expect(out.findings.find((f: any) => f.code === "other-hostnames").message).toContain("does not invalidate");
  const table = out.tables.find((t: any) => t.observation === "ga.report.eventName");
  expect(table.scope).toBe("production");
  expect(table.observedRows).toBe(2);
  expect(table.displayedRows).toBe(1);
  expect(out.findings.find((f: any) => f.code === "configured-event-not-observed").message).toContain("purchase");
  expect(out.basis).toBe("saved-snapshot-not-reverified");
  expect(JSON.stringify(out)).not.toContain("duplicate tracking detected");
  expect(renderAssessment(result)).toContain("42 reported key events");
  expect(report(saved).pages[0].response.rows).toHaveLength(2);
});

test("caller-designated success events stay unverified and absent rows stay unknown", async () => {
  const saved = await fixture();
  content(saved).context.config.context.successEvents = ["purchase"];
  const result = await execute({ operation: "assess", snapshot: saved });
  expect(content(result).findings.find((f: any) => f.code === "success-events-unverified").message).toContain(
    "not independently validated",
  );
  expect(content(result).findings.find((f: any) => f.code === "success-event-not-observed").message).toContain(
    "not proof of zero",
  );
});

test("renamed reports with a different property, filters or period cannot become production evidence", async () => {
  for (const mutate of [
    (r: any) => {
      r.target = "properties/999";
    },
    (r: any) => {
      delete r.pages[0].request.dimensionFilter;
    },
    (r: any) => {
      r.pages[0].request.dateRanges[0].startDate = "2026-08-02";
    },
  ]) {
    const saved = await fixture();
    mutate(report(saved));
    const result = await execute({ operation: "assess", snapshot: saved });
    expect(result.status).toBe("partial");
    expect(content(result).tables.some((t: any) => t.observation === "ga.report.eventName")).toBe(false);
    expect(content(result).findings.some((f: any) => f.code === "report-unusable")).toBe(true);
  }
});

test("partial, sampled reports preserve row values and cannot become complete totals", async () => {
  const saved = await fixture();
  const r = report(saved);
  r.status = "partial";
  r.pagination.exhausted = false;
  r.pagination.nextOffset = 2;
  r.pages[0].response.rowCount = 8;
  r.pages[0].response.metadata.subjectToThresholding = true;
  const result = await execute({ operation: "assess", snapshot: saved });
  expect(result.status).toBe("partial");
  const table = content(result).tables.find((t: any) => t.observation === r.name);
  expect(table.complete).toBe(false);
  expect(table.limitations.join()).toContain("thresholding");
  expect(table.rows.find((r: any) => r.keys[0] === "explorer_visit").values[1]).toBe("42");
});

test("malformed row headers, duplicated rows and inconsistent rowCount never produce facts", async () => {
  for (const mutate of [
    (r: any) => {
      r.pages[0].response.metricHeaders[0].name = "bogus";
    },
    (r: any) => {
      r.pages[0].response.rows[1] = r.pages[0].response.rows[0];
    },
    (r: any) => {
      r.pages[0].response.rowCount = 3;
    },
  ]) {
    const saved = await fixture();
    mutate(report(saved));
    const result = await execute({ operation: "assess", snapshot: saved });
    expect(content(result).tables.some((t: any) => t.observation === "ga.report.eventName")).toBe(false);
    expect(result.status).toBe("partial");
  }
});

test("missing selected reports are unknown and controls in provider text are escaped", async () => {
  const saved = await fixture();
  content(saved).observations = content(saved).observations.filter(
    (o: Evidence) => o.name !== "ga.report.eventName.organic",
  );
  report(saved).pages[0].response.rows[1].dimensionValues[0].value = "unsafe\u001b[31m\u009b31m\nmessage";
  const result = await execute({ operation: "assess", snapshot: saved });
  expect(content(result).findings.some((f: any) => f.code === "report-unavailable")).toBe(true);
  expect(renderAssessment(result)).not.toContain("\u001b");
  expect(renderAssessment(result)).not.toContain("\u009b");
});

test("GSC byPage aggregation cannot be presented as property totals", async () => {
  const { gscReport } = await import("../../src/api/reports.js");
  const { gscRequestSchema } = await import("../../src/api/schema.js");
  const { saved } = await import("../support/comparison.js");
  const report = await gscReport(
    "sc-domain:example.com",
    gscRequestSchema.parse({ startDate: "2026-08-01", endDate: "2026-08-28" }),
    1,
    async () => ({
      responseAggregationType: "byPage",
      rows: [{ keys: [], clicks: 10, impressions: 100, ctr: 0.1, position: 4 }],
    }),
  );
  report.name = "gsc.report.property";
  const snapshot = saved([report]);
  content(snapshot).context.config.gscSite = "sc-domain:example.com";
  const result = await execute({ operation: "assess", snapshot });
  expect(content(result).tables).toEqual([]);
  expect(content(result).findings.some((f: any) => f.message.includes("byProperty response aggregation"))).toBe(true);
});

test("incomplete pagination cannot yield an ok assessment even if the supplied status says ok", async () => {
  for (const pagination of [undefined, { exhausted: false, nextOffset: 2, rowsReturned: 2 }]) {
    const snapshot = await fixture();
    report(snapshot).pagination = pagination;
    expect(report(snapshot).status).toBe("ok");
    const result = await execute({ operation: "assess", snapshot });
    expect(result.status).toBe("partial");
    expect(content(result).tables.find((t: any) => t.observation === "ga.report.eventName").complete).toBe(false);
  }
});
