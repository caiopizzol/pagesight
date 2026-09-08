import { afterAll, expect, spyOn, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultDates } from "../src/api/dates.js";
import { capture } from "../src/api/evidence.js";
import { execute } from "../src/api/index.js";
import { gaReport, gscReport } from "../src/api/reports.js";
import { configSchema, gaRequestSchema, gscRequestSchema, operationSchema } from "../src/api/schema.js";
import { discover } from "../src/api/setup.js";
import { snapshot, snapshotOperations } from "../src/api/snapshot.js";
import { observePage, observeSitemap } from "../src/api/web.js";
import { startHttpApi } from "../src/http.js";
import { RequestError, requestJson } from "../src/lib/http.js";

const fixture = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req): Response {
    const url = new URL(req.url);
    if (url.pathname === "/sitemap.xml")
      return new Response(
        `<urlset><url><loc>${fixture.url}?a=1&amp;b=2</loc><lastmod>2099-01-01</lastmod></url></urlset>`,
      );
    if (url.pathname === "/bad") return new Response("private token=not-for-output", { status: 403 });
    if (url.pathname === "/bad-canonical")
      return new Response('<title>Still observable</title><link rel="canonical" href="http://[broken">');
    if (url.pathname === "/entities.xml")
      return new Response(`<urlset><url><loc>${fixture.url}?literal=&amp;lt;</loc></url></urlset>`);
    if (url.pathname === "/prefixed.xml")
      return new Response(
        `<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9"><sm:url><sm:loc>${fixture.url}</sm:loc></sm:url></sm:urlset>`,
      );
    return new Response(
      '<html><head><title>Example</title><link href="/canonical" rel="canonical"><meta content="noindex,follow" name="robots"><script type="application/ld+json">{"@type":"Vehicle"}</script></head></html>',
      { headers: { "Content-Type": "text/html" } },
    );
  },
});
const api = startHttpApi("test-token-with-at-least-24-characters", 0);
afterAll(async () => {
  await fixture.stop(true);
  await api.stop(true);
});
const request = gscRequestSchema.parse({
  startDate: "2026-08-01",
  endDate: "2026-08-28",
  dimensions: ["query"],
  rowLimit: 2,
});
const row = { keys: ["vehicle"], clicks: 1, impressions: 5, ctr: 0.2, position: 8 };
const config = configSchema.parse({
  site: fixture.url.href,
  gscSite: "sc-domain:example.com",
  gaProperty: "123",
  productionHostname: "127.0.0.1",
  sitemap: `${fixture.url}sitemap.xml`,
  pages: [],
  context: {
    objective: "Use price pages",
    locale: "pt-BR",
    country: "BR",
    routes: [],
    measurementCaveats: ["Delayed collection"],
  },
});

test("GSC exact-limit page is incomplete and records the effective defaults", async () => {
  const r = await gscReport("sc-domain:example.com", request, 1, async () => ({
    rows: [row, row],
    responseAggregationType: "byProperty",
  }));
  expect(r.status).toBe("partial");
  expect(r.pagination).toEqual({ exhausted: false, nextOffset: 2, rowsReturned: 2 });
  expect(r.pages[0].request).toMatchObject({ dataState: "final", startRow: 0, rowLimit: 2 });
  expect(r.warnings.join(" ")).toContain("Anonymized");
});

test("GSC paginates without claiming full query coverage", async () => {
  const offsets: number[] = [];
  const r = await gscReport("site", request, 3, async (q) => {
    offsets.push(q.startRow);
    return { rows: q.startRow ? [] : [row, row], responseAggregationType: "byProperty" };
  });
  expect(offsets).toEqual([0, 2]);
  expect(r.pagination?.exhausted).toBe(true);
  expect(r.warnings.join(" ")).toContain("API top-row limits");
});

test("a failed second page preserves the first response and failed request", async () => {
  const r = await gscReport("site", request, 3, async (q) => {
    if (q.startRow) throw new RequestError("Provider returned HTTP 429", 429, "quota_exceeded");
    return { rows: [row, row], responseAggregationType: "byProperty" };
  });
  expect(r.status).toBe("partial");
  expect(r.pages).toHaveLength(1);
  expect(r.error?.code).toBe("quota_exceeded");
  expect(r.failedRequest).toMatchObject({ startRow: 2 });
  expect(r.pagination?.nextOffset).toBe(2);
});

test("GA pagination preserves thresholding, sampling, quota and timezone", async () => {
  const q = gaRequestSchema.parse({
    dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-28" }],
    metrics: [{ name: "sessions" }],
    limit: 1,
  });
  const r = await gaReport("123", q, 2, async () => ({
    rows: [{ metricValues: [{ value: "1" }] }],
    rowCount: 2,
    metadata: {
      timeZone: "America/Sao_Paulo",
      subjectToThresholding: true,
      dataLossFromOtherRow: true,
      samplingMetadatas: [{ samplesReadCount: "10" }],
    },
    propertyQuota: { tokensPerDay: { remaining: 900 } },
  }));
  expect(r.pagination).toEqual({ exhausted: true, nextOffset: null, rowsReturned: 2 });
  expect(r.pages[1].request).toMatchObject({ offset: 1, returnPropertyQuota: true });
  expect(r.warnings).toHaveLength(3);
  expect(r.pages[0].response).toMatchObject({
    metadata: { timeZone: "America/Sao_Paulo" },
    propertyQuota: { tokensPerDay: { remaining: 900 } },
  });
});

test("GA zero rowCount omitted by protobuf is an empty report, not an auth error", async () => {
  const q = gaRequestSchema.parse({
    dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-28" }],
    metrics: [{ name: "sessions" }],
  });
  const r = await gaReport("123", q, 1, async () => ({
    metricHeaders: [{ name: "sessions" }],
    metadata: { timeZone: "UTC" },
  }));
  expect(r.status).toBe("ok");
  expect(r.pagination?.rowsReturned).toBe(0);
});

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

test("production reports filter hostname, while hostname census remains unfiltered", () => {
  const ops = snapshotOperations(config, "2026-08-01", "2026-08-28", 1).filter((o) => o.operation === "ga.report");
  const census = ops.find((o) => o.request.dimensions?.[0]?.name === "hostName");
  expect(census?.request.dimensionFilter).toBeUndefined();
  for (const op of ops.filter((o) => o !== census))
    expect(JSON.stringify(op.request.dimensionFilter)).toContain("127.0.0.1");
  expect(
    ops.some(
      (o) => o.request.dimensions?.[0]?.name === "eventName" && o.request.metrics.some((m) => m.name === "keyEvents"),
    ),
  ).toBe(true);
});

test("snapshot keeps config and successful observations when a provider fails", async () => {
  const r = await snapshot({ config, startDate: "2026-08-01", endDate: "2026-08-28", maxPages: 1 }, async (raw) => {
    const op = operationSchema.parse(raw);
    return capture(op.operation.startsWith("gsc") ? "gsc" : "ga", op.operation, "site", op, async () => {
      if (op.operation.startsWith("gsc")) throw new RequestError("denied", 403);
      return { rows: [] };
    });
  });
  expect(r.status).toBe("partial");
  expect(r.pages[0].response).toMatchObject({ context: { config, deploymentVersion: null, referenceIdentity: null } });
  expect(r.pages[0].response).toMatchObject({
    summary: expect.arrayContaining([
      expect.objectContaining({ provider: "gsc", status: "error", errorCode: "request_failed" }),
      expect.objectContaining({ provider: "web", status: "ok", errorCode: null }),
    ]),
  });
  expect(r.warnings.join(" ")).toContain("No validated success events");
});

test("site-only doctor and snapshot need no provider credentials and expose selection", async () => {
  const minimal = { site: fixture.url.href };
  const doctor = await execute({ operation: "doctor", config: minimal });
  expect(doctor.status).toBe("ok");
  expect(doctor.pages[0].response).toMatchObject({ providers: { gsc: "not_selected", ga: "not_selected" } });
  const result = await execute({
    operation: "snapshot",
    config: minimal,
    startDate: "2026-08-01",
    endDate: "2026-08-28",
  });
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toMatchObject({
    snapshotVersion: 1,
    observations: [expect.objectContaining({ provider: "web", name: `page:${fixture.url}` })],
  });
});

test("provider selection gates every dependent report and inspection", () => {
  for (const provider of ["gsc", "ga"]) {
    const selected = configSchema.parse({
      site: fixture.url.href,
      ...(provider === "gsc" ? { gscSite: "sc-domain:example.com" } : { gaProperty: "123" }),
    });
    const ops = snapshotOperations(selected, "2026-08-01", "2026-08-28", 1);
    expect(ops.every((op) => op.operation === "page" || op.operation.startsWith(provider))).toBe(true);
    expect(ops.some((op) => op.operation === `${provider}.report`)).toBe(true);
  }
  expect(configSchema.safeParse({ site: fixture.url.href, pages: [] }).success).toBe(false);
});

test("named observations remain unique and stable when a provider is removed", async () => {
  const collect = (raw: unknown) => {
    const op = operationSchema.parse(raw);
    return capture(op.operation.split(".")[0], op.operation, "site", op, async () => ({ rows: [] }));
  };
  const all = await snapshot({ config, startDate: "2026-08-01", endDate: "2026-08-28", maxPages: 1 }, collect);
  const gaOnly = await snapshot(
    {
      config: configSchema.parse({ ...config, gscSite: undefined }),
      startDate: "2026-08-01",
      endDate: "2026-08-28",
      maxPages: 1,
    },
    collect,
  );
  const names = (e: typeof all) =>
    (e.pages[0].response as { observations: Array<{ name: string }> }).observations.map((o) => o.name);
  expect(new Set(names(all)).size).toBe(names(all).length);
  expect(names(gaOnly)).toEqual(names(all).filter((name) => !name.startsWith("gsc.")));
});

test("discovery keeps independent failures and never infers a GA hostname from its name", async () => {
  const result = await discover(fixture.url.href, ["gsc", "ga"], async (raw) => {
    const op = operationSchema.parse(raw);
    return capture(op.operation.split(".")[0], op.operation, "accounts", op, async () => {
      if (op.operation === "gsc.sites") throw new RequestError("Not configured", null, "not_configured");
      return { accountSummaries: [{ propertySummaries: [{ property: "properties/123", displayName: "127.0.0.1" }] }] };
    });
  });
  expect(result.status).toBe("partial");
  const response = result.pages[0].response as { config: unknown; candidates: unknown };
  expect(configSchema.parse(response.config).gaProperty).toBeUndefined();
  expect(response.candidates).toMatchObject({ ga: [{ property: "properties/123" }] });
});

test("page inventory reads attribute order and preserves noindex without declaring index status", async () => {
  const page = await observePage(fixture.url.href);
  expect(page.title).toBe("Example");
  expect(page.robots).toEqual(["robots: noindex,follow"]);
  expect(page.canonical).toBe(`${fixture.url}canonical`);
  expect(page.structuredData).toEqual([{ value: { "@type": "Vehicle" }, validJson: true }]);
  const sitemap = await observeSitemap(`${fixture.url}sitemap.xml`);
  expect(sitemap.urls).toEqual([`${fixture.url}?a=1&b=2`]);
  expect(sitemap.futureLastmods).toEqual(["2099-01-01"]);
});

test("provider errors do not expose response bodies or credentials", async () => {
  const result = await capture("test", "read", "site", {}, () => requestJson(`${fixture.url}bad?key=secret-key`));
  expect(result.error?.httpStatus).toBe(403);
  expect(JSON.stringify(result)).not.toContain("secret-key");
  expect(JSON.stringify(result)).not.toContain("not-for-output");
});

test("malformed canonical keeps independently observed page evidence", async () => {
  const result = await execute({ operation: "page", url: `${fixture.url}bad-canonical` });
  expect(result.status).toBe("ok");
  expect(result.pages[0].response).toMatchObject({
    title: "Still observable",
    canonical: null,
    warnings: expect.arrayContaining(["Malformed canonical href; canonical is unknown."]),
  });
});

test("sitemap entities are decoded once and unsupported XML cannot imply empty complete coverage", async () => {
  const entities = await observeSitemap(`${fixture.url}entities.xml`);
  expect(entities.complete).toBe(true);
  expect(entities.urls).toEqual([`${fixture.url}?literal=&lt;`]);
  const prefixed = await observeSitemap(`${fixture.url}prefixed.xml`);
  expect(prefixed.complete).toBe(false);
  expect(prefixed.errors).toEqual([{ url: `${fixture.url}prefixed.xml`, code: "unsupported_sitemap" }]);
});

test("unexpected failures retain their class without exposing unsafe exception messages", async () => {
  const result = await capture("test", "read", "site", {}, async () => {
    throw new TypeError("private key=do-not-emit");
  });
  expect(result.error).toMatchObject({ code: "operation_failed", name: "TypeError" });
  expect(JSON.stringify(result)).not.toContain("do-not-emit");
});

test("GA metadata flags remaining pages and reports credential source without secrets", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pagesight-test-"));
  const previous = process.env.PAGESIGHT_GA_CREDENTIALS;
  process.env.PAGESIGHT_GA_CREDENTIALS = join(dir, "credentials.json");
  await Bun.write(
    process.env.PAGESIGHT_GA_CREDENTIALS,
    JSON.stringify({
      type: "authorized_user",
      client_id: "test-client",
      client_secret: "test-secret",
      refresh_token: "test-refresh",
    }),
  );
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (url: Parameters<typeof fetch>[0]) =>
        Response.json(
          (url instanceof Request ? url.url : url.toString()).includes("oauth2.googleapis.com")
            ? { access_token: "test-access" }
            : { accountSummaries: [], nextPageToken: "next-page" },
        ),
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const result = await execute({ operation: "ga.accounts" });
    expect(result.status).toBe("partial");
    expect(result.pages[0].response).toMatchObject({ nextPageToken: "next-page" });
    expect(result.credential).toEqual({
      source: "PAGESIGHT_GA_CREDENTIALS",
      type: "authorized_user",
      clientEmail: null,
    });
    for (const secret of ["test-secret", "test-refresh", "test-access"])
      expect(JSON.stringify(result)).not.toContain(secret);
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.PAGESIGHT_GA_CREDENTIALS;
    else process.env.PAGESIGHT_GA_CREDENTIALS = previous;
    await rm(dir, { recursive: true });
  }
});

test("HTTP calls the same API and rejects requests without the local API token", async () => {
  const url = `${api.url}v1/query`;
  expect((await fetch(url, { method: "POST", body: "{}" })).status).toBe(401);
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: "Bearer test-token-with-at-least-24-characters" },
    body: JSON.stringify({ operation: "page", url: fixture.url.href }),
  });
  const result = await response.json();
  expect(response.status).toBe(200);
  expect(result.provider).toBe("web");
  expect(result.pages[0].response.title).toBe("Example");
});

test("discovery extracts GSC candidates from the raw provider envelope", async () => {
  const sites = [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }];
  const result = await discover("https://example.com/", ["gsc"], () =>
    capture("gsc", "sites", "accessible-properties", {}, async () => ({ siteEntry: sites, extra: true })),
  );
  expect(result.pages[0].response).toMatchObject({ candidates: { gsc: sites } });
});
