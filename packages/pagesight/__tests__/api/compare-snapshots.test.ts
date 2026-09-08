import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { capture, type Evidence } from "../../src/api/evidence.js";
import { execute } from "../../src/api/index.js";
import { gaReport, gscReport } from "../../src/api/reports.js";
import { configSchema, gaRequestSchema, gscRequestSchema } from "../../src/api/schema.js";
import { aggregate } from "../../src/api/evidence.js";
import { snapshotOperations } from "../../src/api/snapshot.js";
import { startHttpApi } from "../../src/http.js";
import { registerObserveTool } from "../../src/tools/observe.js";

const periods = [
  { startDate: "2026-07-04", endDate: "2026-07-31" },
  { startDate: "2026-08-01", endDate: "2026-08-28" },
];
function saved(observations: Evidence[]): Evidence {
  const result = aggregate("snapshot", "https://example.com/", {}, observations);
  const request = observations.find((o) => o.operation === "report")?.pages[0]?.request as
    | { startDate?: string; endDate?: string; dateRanges?: Array<{ startDate: string; endDate: string }> }
    | undefined;
  const requestedDates =
    request?.dateRanges?.[0] ??
    (request?.startDate ? { startDate: request.startDate, endDate: request.endDate } : periods[1]);
  Object.assign(result.pages[0].response as object, {
    snapshotVersion: 1,
    context: { config: { site: result.target }, requestedDates, observedGscDates: [requestedDates.endDate] },
  });
  return result;
}
async function gsc(period: number, rows = [{ keys: ["shared"], clicks: 2, impressions: 10, ctr: 0.2, position: 5 }]) {
  const result = await gscReport(
    "sc-domain:example.com",
    gscRequestSchema.parse({ ...periods[period], dimensions: ["query"] }),
    1,
    async () => ({ rows, responseAggregationType: "byProperty" }),
  );
  result.name = "gsc.report.query";
  return result;
}
async function ga(period: number, value: string, metadata: Record<string, unknown> = {}) {
  const result = await gaReport(
    "123",
    gaRequestSchema.parse({
      dateRanges: [periods[period]],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
    }),
    1,
    async () => ({
      dimensionHeaders: [{ name: "eventName" }],
      metricHeaders: [{ name: "eventCount", type: "TYPE_INTEGER" }],
      rows: [{ dimensionValues: [{ value: "success" }], metricValues: [{ value }] }],
      rowCount: 1,
      metadata: { timeZone: "UTC", ...metadata },
    }),
  );
  result.name = "ga.report.eventName";
  return result;
}
type Comparison = {
  name: string;
  status: string;
  reason?: string;
  warnings: string[];
  rows: Array<{
    keys: string[];
    metrics: Record<
      string,
      { baseline: string | number; current: string | number; delta: number | null; percentChange: number | null }
    >;
  }>;
  commonRowCount: number;
  omittedCommonRows: number;
  baselineOnlyObserved: { count: number; keys: string[][] };
  currentOnlyObserved: { count: number; keys: string[][] };
};
async function compare(a: Evidence[], b: Evidence[], maxRows = 100) {
  const result = await execute({ operation: "compare", baseline: saved(a), current: saved(b), maxRows });
  return (result.pages[0].response as { observations: Comparison[] }).observations;
}

test("comparison computes only common GSC rows without turning missing rows into zero", async () => {
  const row = (key: string, clicks: number) => ({
    keys: [key],
    clicks,
    impressions: 10,
    ctr: clicks / 10,
    position: 5,
  });
  const [result] = await compare(
    [await gsc(0, [row("shared", 2), row("gone", 9)])],
    [await gsc(1, [row("shared", 4), row("new", 7)])],
  );
  expect(result.status).toBe("compared");
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({
    keys: ["shared"],
    metrics: { clicks: { baseline: 2, current: 4, delta: 2, percentChange: 100 } },
  });
  expect(result.baselineOnlyObserved).toEqual({ count: 1, keys: [["gone"]] });
  expect(result.currentOnlyObserved).toEqual({ count: 1, keys: [["new"]] });
});

test("comparison refuses changed properties, filters, aggregation, unfinalized data and periods", async () => {
  const baseline = await gsc(0);
  for (const mutate of [
    (e: Evidence) => {
      e.target = "sc-domain:another.example";
    },
    (e: Evidence) => {
      (e.pages[0].request as Record<string, unknown>).type = "image";
    },
    (e: Evidence) => {
      (e.pages[0].request as Record<string, unknown>).dataState = "all";
    },
    (e: Evidence) => {
      (e.pages[0].request as Record<string, unknown>).dimensionFilterGroups = [
        { filters: [{ dimension: "country", operator: "equals", expression: "bra" }] },
      ];
    },
    (e: Evidence) => {
      (e.pages[0].request as Record<string, unknown>).startDate = "2026-07-31";
    },
    (e: Evidence) => {
      (e.pages[0].request as Record<string, unknown>).endDate = "2026-08-27";
    },
    (e: Evidence) => {
      (e.pages[0].response as Record<string, unknown>).responseAggregationType = "byPage";
    },
    (e: Evidence) => {
      (e.pages[0].response as Record<string, unknown>).metadata = { first_incomplete_date: "2026-08-27" };
    },
  ]) {
    const current = await gsc(1);
    mutate(current);
    const [result] = await compare([baseline], [current]);
    expect(result.status).toBe("incompatible");
    expect(result.rows).toBeUndefined();
  }
});

test("GA preserves numeric strings and flags thresholded sampled evidence", async () => {
  const [result] = await compare(
    [await ga(0, "2", { subjectToThresholding: true })],
    [await ga(1, "5", { samplingMetadatas: [{ samplesReadCount: "10" }], dataLossFromOtherRow: true })],
  );
  expect(result.status).toBe("limited");
  expect(result.rows[0].metrics.eventCount).toMatchObject({ baseline: "2", current: "5", delta: 3 });
  expect(result.warnings.join(" ")).toContain("sampled");
  expect(result.warnings.join(" ")).toContain("thresholding");
});

test("GA unknown or changed timezone and malformed headers prevent comparison", async () => {
  for (const metadata of [{ timeZone: "America/Sao_Paulo" }, { timeZone: "" }]) {
    expect((await compare([await ga(0, "1")], [await ga(1, "2", metadata)]))[0].status).toBe("incompatible");
  }
  const current = await ga(1, "2");
  (current.pages[0].response as Record<string, unknown>).metricHeaders = [{ name: "sessions" }];
  expect((await compare([await ga(0, "1")], [current]))[0].status).toBe("incompatible");
});

test("GA duplicate metric names cannot silently replace a compared value", async () => {
  const baseline = await ga(0, "2"),
    current = await ga(1, "4");
  for (const [observation, extra] of [
    [baseline, "9"],
    [current, "7"],
  ] as const) {
    const request = observation.pages[0].request as { metrics: Array<{ name: string }> };
    const response = observation.pages[0].response as {
      metricHeaders: Array<{ name: string; type: string }>;
      rows: Array<{ metricValues: Array<{ value: string }> }>;
    };
    request.metrics.push({ name: "eventCount" });
    response.metricHeaders.push({ name: "eventCount", type: "TYPE_INTEGER" });
    response.rows[0].metricValues.push({ value: extra });
  }
  const [result] = await compare([baseline], [current]);
  expect(result.status).toBe("incompatible");
  expect(result.reason).toContain("unique");
  expect(result.rows).toBeUndefined();
});

test("imported pagination must agree with retained report rows", async () => {
  for (const provider of [gsc, (period: number) => ga(period, "2")]) {
    const baseline = await provider(0);
    for (const pagination of [
      { exhausted: true, rowsReturned: 2, nextOffset: null },
      { exhausted: true, rowsReturned: 1, nextOffset: 1 },
      { exhausted: false, rowsReturned: 1, nextOffset: 2 },
    ]) {
      const current = await provider(1);
      current.pagination = pagination;
      const [result] = await compare([baseline], [current]);
      expect(result.status).toBe("incompatible");
      expect(result.reason).toContain("pagination");
      expect(result.rows).toBeUndefined();
    }
  }
});

test("invalid and unsafe numbers retain raw values without a fabricated delta", async () => {
  for (const value of ["9007199254740993", "NaN", "", "1e999", "1e-999", "9007199254740991.1", "1.00000000000000001"]) {
    const [result] = await compare([await ga(0, value)], [await ga(1, "2")]);
    expect(result.status).toBe("limited");
    expect(result.rows[0].metrics.eventCount).toMatchObject({ baseline: value, current: "2", delta: null });
  }
  const [zero] = await compare([await ga(0, "0")], [await ga(1, "2")]);
  expect(zero.rows[0].metrics.eventCount.percentChange).toBeNull();
});

test("pagination differences preserve observed rows, but gaps and duplicates are incompatible", async () => {
  const baseline = await gsc(0);
  baseline.status = "partial";
  baseline.pagination = { exhausted: false, rowsReturned: 1, nextOffset: 1 };
  const current = await gsc(1);
  (current.pages[0].request as Record<string, unknown>).rowLimit = 100;
  expect((await compare([baseline], [current]))[0].status).toBe("limited");
  (current.pages[0].request as Record<string, unknown>).startRow = 2;
  expect((await compare([baseline], [current]))[0].status).toBe("incompatible");
  const duplicate = await gsc(1);
  const response = duplicate.pages[0].response as { rows: unknown[] };
  response.rows.push(response.rows[0]);
  expect((await compare([baseline], [duplicate]))[0].status).toBe("incompatible");
});

test("failed providers and unsupported Bing reports remain explicit", async () => {
  const failed = await gsc(1);
  failed.status = "error";
  failed.pages = [];
  expect((await compare([await gsc(0)], [failed]))[0].status).toBe("unavailable");
  const bing = await capture(
    "bing",
    "traffic",
    "https://example.com/",
    { method: "GetRankAndTrafficStats" },
    async () => ({ d: [] }),
  );
  bing.name = "bing.traffic";
  expect((await compare([bing], [bing]))[0].status).toBe("unsupported");
  expect((await compare([bing], [await gsc(1)]))[0].status).toBe("unavailable");
});

test("snapshot imports reject old versions, malformed evidence, mismatched sites and duplicate names", async () => {
  for (const mutate of [
    (s: Evidence) => {
      (s.pages[0].response as Record<string, unknown>).snapshotVersion = 0;
    },
    (s: Evidence) => {
      s.target = "https://another.example/";
    },
    (s: Evidence) => {
      s.finishedAt = "not-a-timestamp";
    },
    (s: Evidence) => {
      const r = s.pages[0].response as { observations: Evidence[] };
      r.observations.push(r.observations[0]);
    },
    (s: Evidence) => {
      const r = s.pages[0].response as { observations: Evidence[] };
      delete r.observations[0].name;
    },
  ]) {
    const baseline = saved([await gsc(0)]);
    mutate(baseline);
    const error = await execute({ operation: "compare", baseline, current: saved([await gsc(1)]) }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ code: "invalid_input" });
  }
});

test("comparison output limits keep exact row counts and deterministic retained keys", async () => {
  const rows = ["c", "a", "b"].map((key) => ({ keys: [key], clicks: 1, impressions: 10, ctr: 0.1, position: 2 }));
  const [result] = await compare([await gsc(0, rows)], [await gsc(1, rows)], 1);
  expect(result.status).toBe("limited");
  expect(result.rows.map((r) => r.keys)).toEqual([["a"]]);
  expect(result.commonRowCount).toBe(3);
  expect(result.omittedCommonRows).toBe(2);
});

test("GSC trailing-date gaps are limited and periods must agree with snapshot context", async () => {
  const baseline = saved([await gsc(0)]),
    current = saved([await gsc(1)]);
  const context = (
    current.pages[0].response as { context: { observedGscDates: string[]; requestedDates: { endDate: string } } }
  ).context;
  context.observedGscDates = ["2026-08-26"];
  const first = await execute({ operation: "compare", baseline, current });
  expect(first.pages[0].response).toMatchObject({
    summary: { limited: 1, compared: 0 },
    observations: [{ status: "limited" }],
  });
  expect(JSON.stringify(first.pages[0].response)).toContain("trailing days");
  context.requestedDates.endDate = "2026-08-27";
  const second = await execute({ operation: "compare", baseline, current });
  expect(second.pages[0].response).toMatchObject({
    observations: [{ status: "incompatible", reason: "Report period does not match the snapshot context." }],
  });
});

test("GA recently collected reports are limited and cyclic time dimensions require alignment", async () => {
  const current = await ga(1, "3");
  current.finishedAt = "2026-08-29T12:00:00Z";
  expect((await compare([await ga(0, "1")], [current]))[0].status).toBe("limited");
  for (const period of [0, 1]) {
    const result = await ga(period, "2");
    (result.pages[0].request as Record<string, unknown>).dimensions = [{ name: "dayOfWeek" }];
    (result.pages[0].response as Record<string, unknown>).dimensionHeaders = [{ name: "dayOfWeek" }];
    const [comparison] = await compare(
      period === 0 ? [result] : [await ga(0, "1")],
      period === 1 ? [result] : [await ga(1, "2")],
    );
    expect(comparison.status).toBe("incompatible");
  }
});

test("GA temporal dimensions and expression aliases cannot be compared as stable keys", async () => {
  const results: Comparison[] = [];
  for (const dimension of [
    { name: "nthYear" },
    { name: "eventName", dimensionExpression: { lowerCase: { dimensionName: "nthYear" } } },
  ]) {
    const baseline = await ga(0, "1"),
      current = await ga(1, "2");
    for (const observation of [baseline, current]) {
      (observation.pages[0].request as Record<string, unknown>).dimensions = [dimension];
      const response = observation.pages[0].response as {
        dimensionHeaders: Array<{ name: string }>;
        rows: Array<{ dimensionValues: Array<{ value: string }> }>;
      };
      response.dimensionHeaders = [{ name: dimension.name }];
      response.rows[0].dimensionValues = [{ value: "0000" }];
    }
    const [result] = await compare([baseline], [current]);
    results.push(result);
  }
  expect(results.map((result) => result.status)).toEqual(["incompatible", "incompatible"]);
  for (const result of results) expect(result.rows).toBeUndefined();
});

test("all generated GA snapshot report dimensions remain comparable", async () => {
  const reports: Evidence[][] = [];
  for (const period of periods) {
    const observations: Evidence[] = [];
    for (const operation of snapshotOperations(
      configSchema.parse({ site: "https://example.com/", gaProperty: "123", productionHostname: "example.com" }),
      period.startDate,
      period.endDate,
      1,
    )) {
      if (operation.operation !== "ga.report") continue;
      const request = gaRequestSchema.parse(operation.request);
      const observation = await gaReport(operation.property, request, 1, async () => ({
        dimensionHeaders: request.dimensions,
        metricHeaders: request.metrics.map((metric) => ({ name: metric.name, type: "TYPE_INTEGER" })),
        rows: [
          {
            dimensionValues: request.dimensions.map(() => ({ value: "shared" })),
            metricValues: request.metrics.map(() => ({ value: "2" })),
          },
        ],
        rowCount: 1,
        metadata: { timeZone: "UTC" },
      }));
      observation.name = `ga.report.${observations.length}`;
      observations.push(observation);
    }
    reports.push(observations);
  }
  expect((await compare(reports[0], reports[1])).map((result) => result.status)).toEqual(Array(5).fill("compared"));
});

test("CLI comparison reads saved objects and agrees with the API", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pagesight-compare-"));
  const baseline = saved([await gsc(0)]),
    current = saved([await gsc(1)]);
  try {
    await Bun.write(join(dir, "before.json"), JSON.stringify(baseline));
    await Bun.write(join(dir, "after.json"), JSON.stringify(current));
    const child = Bun.spawn(
      [
        process.execPath,
        new URL("../../src/index.ts", import.meta.url).pathname,
        "compare",
        "--baseline",
        join(dir, "before.json"),
        "--current",
        join(dir, "after.json"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const output = await new Response(child.stdout).json();
    expect(await child.exited).toBe(0);
    expect(output.pages).toEqual((await execute({ operation: "compare", baseline, current })).pages);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("HTTP accepts snapshot objects above the former 1 MB cap and MCP uses the same comparison", async () => {
  const baseline = saved([await gsc(0)]),
    current = saved([await gsc(1)]);
  Object.assign(baseline.pages[0].response as object, { privateFixturePadding: "x".repeat(1_100_000) });
  const input = { operation: "compare", baseline, current };
  const token = "test-comparison-token-at-least-24-chars";
  const api = startHttpApi(token, 0);
  const server = new McpServer({ name: "compare-test", version: "1" });
  const client = new Client({ name: "compare-test-client", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  registerObserveTool(server);
  try {
    const direct = await execute(input);
    const response = await fetch(`${api.url}v1/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    expect((await response.json()).pages).toEqual(direct.pages);
    await server.connect(a);
    await client.connect(b);
    const result = await client.callTool({ name: "observe", arguments: { request: input } });
    expect((result.structuredContent as { pages: unknown }).pages).toEqual(direct.pages);
  } finally {
    await client.close();
    await server.close();
    await api.stop(true);
  }
});
