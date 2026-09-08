import { expect, test } from "bun:test";
import { capture } from "../../src/api/evidence.js";
import { investigate, investigationOperations } from "../../src/api/investigation.js";
import { operationSchema, configSchema } from "../../src/api/schema.js";
import { renderInvestigation } from "../../src/investigation-text.js";

const input = {
  config: configSchema.parse({ site: "https://example.com", gscSite: "sc-domain:example.com", gaProperty: "123" }),
  url: "https://example.com/A?b=2&a=1",
  startDate: "2026-08-01",
  endDate: "2026-08-28",
  maxPages: 1,
  maxRows: 2,
};
const metrics = { clicks: 0, impressions: 30, ctr: 0, position: 12 };
const body = (e: Awaited<ReturnType<typeof investigate>>): any => e.pages[0].response;

test("investigation uses exact raw page filters and distinct breakdowns, and validates every planned request", () => {
  const plan = investigationOperations(input);
  expect(plan).toHaveLength(9);
  for (const item of plan) expect(operationSchema.safeParse(item.request).success).toBe(true);
  const search = plan.filter((p) => p.request.operation === "gsc.report");
  expect(search.map((p) => (p.request as any).request.dimensions)).toEqual([
    [],
    ["query"],
    ["device"],
    ["country"],
    ["date"],
  ]);
  for (const { request } of search)
    expect((request as any).request).toMatchObject({
      dataState: "final",
      aggregationType: "byPage",
      startDate: input.startDate,
      endDate: input.endDate,
      dimensionFilterGroups: [
        { groupType: "and", filters: [{ dimension: "page", operator: "equals", expression: input.url }] },
      ],
    });
  for (const { request } of plan.filter((p) => p.request.operation === "ga.report"))
    expect((request as any).request.dimensionFilter.andGroup.expressions).toEqual([
      {
        filter: {
          fieldName: "hostName",
          stringFilter: { matchType: "EXACT", value: "example.com", caseSensitive: true },
        },
      },
      {
        filter: {
          fieldName: "sessionDefaultChannelGroup",
          stringFilter: { matchType: "EXACT", value: "Organic Search", caseSensitive: true },
        },
      },
      {
        filter: {
          fieldName: "landingPagePlusQueryString",
          stringFilter: { matchType: "EXACT", value: "/A?b=2&a=1", caseSensitive: true },
        },
      },
    ]);
});

test("unsupported GA URL associations preserve search and technical follow-ups", () => {
  for (const url of [
    "http://example.com/A",
    "https://other.test/A",
    "https://example.com/A#",
    "https://EXAMPLE.com/A",
    "https://example.com/A#x",
  ]) {
    const plan = investigationOperations({ ...input, url });
    expect(plan.some((p) => p.request.operation === "ga.report")).toBe(false);
    expect(plan.find((p) => p.name === "html")?.request).toEqual({ operation: "page", url });
    expect((plan[0].request as any).request.dimensionFilterGroups[0].filters[0].expression).toBe(url);
  }
  expect(
    operationSchema.safeParse({ operation: "investigate", ...input, url: "https://user:pass@example.com" }).success,
  ).toBe(false);
  expect(operationSchema.safeParse({ operation: "investigate", ...input, endDate: "2026-07-01" }).success).toBe(false);
  expect(operationSchema.safeParse({ operation: "investigate", ...input, endDate: "2999-07-01" }).success).toBe(false);
});

test("independent failures retain successful evidence, privacy metadata and missing daily dates without zero filling", async () => {
  const result = await investigate(input, async (raw) => {
    const op = operationSchema.parse(raw);
    if (op.operation === "gsc.inspect") throw new Error("private credential must not escape");
    if (op.operation === "gsc.report") {
      const d = op.request.dimensions[0];
      const rows =
        d === "date"
          ? ["2026-08-03", "2026-08-01"].map((date) => ({ keys: [date], ...metrics }))
          : d === "query"
            ? ["a", "b", "c"].map((q) => ({ keys: [q], ...metrics }))
            : d
              ? []
              : [{ keys: [], ...metrics }];
      const e = await capture("gsc", "report", op.site, op.request, async () => ({
        responseAggregationType: "byPage",
        rows,
      }));
      e.pagination = { exhausted: d !== "query", rowsReturned: rows.length, nextOffset: d === "query" ? 3 : null };
      if (d === "query") e.status = "partial";
      return e;
    }
    if (op.operation === "ga.report")
      return capture("ga", "report", op.property, op.request, async () => ({
        dimensionHeaders: op.request.dimensions,
        metricHeaders: op.request.metrics,
        rows: [
          {
            dimensionValues: op.request.dimensions.map((d, i) => ({ value: i === 0 ? "/A?b=2&a=1" : d.name })),
            metricValues: op.request.metrics.map(() => ({ value: "2" })),
          },
        ],
        metadata: { timeZone: "America/Sao_Paulo", subjectToThresholding: true },
      }));
    return capture("web", "page", input.url, { url: input.url }, async () => ({
      url: input.url,
      finalUrl: input.url,
      status: 200,
      title: "Price",
      description: "Reference price",
      canonical: input.url,
      robots: ["googlebot: none"],
      xRobotsTag: null,
    }));
  });
  expect(result.status).toBe("partial");
  expect(body(result).observations).toHaveLength(9);
  const brief = body(result).brief;
  expect(brief.tables.find((t: any) => t.source === "search.query")).toMatchObject({
    observedRows: 3,
    omittedRows: 1,
    paginationExhausted: false,
  });
  expect(brief.tables.find((t: any) => t.source === "search.date").rows.map((r: any) => r.keys[0])).toEqual([
    "2026-08-01",
    "2026-08-03",
  ]);
  expect(brief.tables.find((t: any) => t.source === "organic.events").metadata[0].subjectToThresholding).toBe(true);
  expect(brief.unknowns.join()).toContain("search.device: no usable observed rows");
  expect(brief.nextChecks[0]).toContain("intentional route policy");
  expect(JSON.stringify(result)).not.toContain("private credential");
  const text = renderInvestigation(result);
  expect(text).toContain("googlebot: none");
  expect(text).toContain("not event location");
  expect(text).toContain("subjectToThresholding");
});

test("malformed provider rows remain raw and cannot become brief findings", async () => {
  const result = await investigate(input, async (raw) => {
    const op = operationSchema.parse(raw);
    return capture(
      op.operation.startsWith("gsc") ? "gsc" : "ga",
      op.operation.endsWith("report") ? "report" : "other",
      input.url,
      "request" in op ? op.request : {},
      async () => ({ responseAggregationType: "byPage", rows: [{ keys: [], ...metrics, clicks: 100 }] }),
    );
  });
  expect(result.status).toBe("partial");
  expect(body(result).brief.tables.find((t: any) => t.source === "search.totals")).toMatchObject({
    rows: [],
    unusableRows: 1,
  });
  expect(body(result).observations[0].pages[0].response.rows[0].clicks).toBe(100);
});

test("capped history keeps newest observed dates; technical brief retains redirects, warnings and safe text", async () => {
  const result = await investigate(input, async (raw) => {
    const op = operationSchema.parse(raw);
    if (op.operation === "gsc.report") {
      const dimensions = op.request.dimensions;
      return capture("gsc", "report", op.site, op.request, async () => ({
        responseAggregationType: "byPage",
        rows:
          dimensions[0] === "date"
            ? ["2026-08-01", "2026-08-03", "2026-08-28"].map((date) => ({ keys: [date], ...metrics }))
            : [],
      }));
    }
    if (op.operation === "page")
      return capture("web", "page", input.url, { url: input.url }, async () => ({
        url: input.url,
        finalUrl: "https://example.com/new",
        status: 200,
        title: "untrusted\u009b\u2028title",
        description: null,
        canonical: null,
        robots: [],
        xRobotsTag: null,
        redirects: [{ url: input.url, status: 302, location: "/new" }],
        warnings: ["Malformed canonical href; canonical is unknown."],
      }));
    return capture("pagesight", "failed-observation", input.url, op, async () => {
      throw new Error("fixture unavailable");
    });
  });
  const date = body(result).brief.tables.find((t: any) => t.source === "search.date");
  expect(date.rows.map((r: any) => r.keys[0])).toEqual(["2026-08-03", "2026-08-28"]);
  expect(date).toMatchObject({ observedRows: 3, omittedRows: 1, displayPolicy: "newest-observed-dates-ascending" });
  const html = body(result).brief.technical.find((t: any) => t.source === "html");
  expect(html.evidence.redirects[0].status).toBe(302);
  expect(html.warnings).toContain("Malformed canonical href; canonical is unknown.");
  const text = renderInvestigation(result);
  expect(text).not.toMatch(/[\u009b\u2028]/u);
  expect(text).toContain("\\u009b");
});

test("a malformed retained request cannot discard independent HTML evidence", async () => {
  const result = await investigate(input, async (raw) => {
    const op = operationSchema.parse(raw);
    if (op.operation === "gsc.report" || op.operation === "ga.report")
      return capture(
        op.operation.startsWith("gsc") ? "gsc" : "ga",
        "report",
        input.url,
        { invalid: true },
        async () => ({}),
      );
    return capture("web", "page", input.url, { url: input.url }, async () => ({
      url: input.url,
      finalUrl: input.url,
      status: 200,
      title: "Retained",
      description: null,
      canonical: input.url,
      robots: [],
      xRobotsTag: null,
    }));
  });
  expect(result.status).toBe("partial");
  expect(body(result).brief.unknowns.join()).toContain("unusable request");
  expect(body(result).brief.technical.find((t: any) => t.source === "html").evidence.title).toBe("Retained");
});
