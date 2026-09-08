import { expect, spyOn, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { configSchema, operationSchema } from "../../src/api/schema.js";
import { snapshotOperations, providerSelection } from "../../src/api/snapshot.js";

test("Bing preserves documented envelopes and dates without inventing a report window", async () => {
  const previous = process.env.BING_WEBMASTER_API_KEY;
  process.env.BING_WEBMASTER_API_KEY = "private-bing-key";
  const requests: URL[] = [];
  const row = {
    __type: "QueryStats:#Microsoft.Bing.Webmaster.Api",
    AvgClickPosition: 18,
    AvgImpressionPosition: 17,
    Clicks: 15,
    Date: "/Date(1316156400000-0700)/",
    Impressions: 100,
    Query: "query",
  };
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        requests.push(new URL(input instanceof Request ? input.url : input.toString()));
        return Response.json({ d: [row], providerExtra: true });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    for (const operation of ["bing.queries", "bing.pages", "bing.traffic"]) {
      const result = await execute({ operation, site: "https://example.com/" });
      expect(result.status).toBe("ok");
      expect(result.pages[0].response).toEqual({ d: [row], providerExtra: true });
      expect(result.pagination).toBeUndefined();
      expect(result.warnings.join(" ")).toContain("timezone is unknown");
      if (operation === "bing.traffic") expect(result.warnings.join(" ")).toContain("Knowledge Panel");
      if (operation === "bing.pages") expect(result.warnings.join(" ")).toContain("Query field contains the page URL");
      expect(JSON.stringify(result)).not.toContain("private-bing-key");
    }
    expect(requests.map((r) => r.pathname.split("/").pop())).toEqual([
      "GetQueryStats",
      "GetPageStats",
      "GetRankAndTrafficStats",
    ]);
    for (const request of requests) expect([...request.searchParams.keys()].sort()).toEqual(["apikey", "siteUrl"]);
    const sites = await execute({ operation: "bing.sites" });
    expect(sites.pages[0].request).toEqual({ method: "GetUserSites" });
    expect(requests[3].searchParams.has("siteUrl")).toBe(false);
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.BING_WEBMASTER_API_KEY;
    else process.env.BING_WEBMASTER_API_KEY = previous;
  }
});

test("Bing missing credentials, HTTP errors and fault envelopes stay safe and unavailable", async () => {
  const previous = process.env.BING_WEBMASTER_API_KEY;
  delete process.env.BING_WEBMASTER_API_KEY;
  let calls = 0;
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async () => {
        calls++;
        return calls === 1
          ? new Response("private-key=secret", { status: 403 })
          : Response.json({ ErrorCode: 1, Message: "private-key=secret" });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    expect((await execute({ operation: "bing.sites" })).error?.code).toBe("not_configured");
    expect(calls).toBe(0);
    process.env.BING_WEBMASTER_API_KEY = "private-key";
    for (const code of ["forbidden", "bing_fault_1"]) {
      const result = await execute({ operation: "bing.sites" });
      expect(result.error?.code).toBe(code);
      expect(result.status).toBe("error");
      expect(result.pages).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("private-key");
    }
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.BING_WEBMASTER_API_KEY;
    else process.env.BING_WEBMASTER_API_KEY = previous;
  }
});

test("Bing-only snapshots select three read operations and reject unsupported report parameters", () => {
  const config = configSchema.parse({ site: "https://example.com/", bingSite: "https://example.com/", pages: [] });
  const ops = snapshotOperations(config, "2026-08-01", "2026-08-28", 4);
  expect(ops.map((op) => op.operation)).toEqual(["bing.queries", "bing.pages", "bing.traffic"]);
  expect(providerSelection(config)).toMatchObject({ bing: "selected", ga: "not_selected", gsc: "not_selected" });
  for (const extra of [{ startDate: "2026-08-01" }, { maxPages: 2 }, { offset: 10 }])
    expect(
      operationSchema.safeParse({ operation: "bing.queries", site: "https://example.com/", ...extra }).success,
    ).toBe(false);
});

test("Bing discovery returns verified-site candidates without auto-selecting a site", async () => {
  const previous = process.env.BING_WEBMASTER_API_KEY;
  process.env.BING_WEBMASTER_API_KEY = "private-key";
  const row = { Url: "https://example.com/", IsVerified: true, AuthenticationCode: "public-verification-code" };
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(async () => Response.json({ d: [row] }), { preconnect: fetch.preconnect }),
  );
  try {
    const result = await execute({ operation: "discover", url: "https://example.com/", providers: ["bing"] });
    expect(result.status).toBe("ok");
    expect(result.pages[0].response).toMatchObject({
      candidates: { bing: [row] },
      providers: { bing: "selected", gsc: "not_selected" },
    });
    expect((result.pages[0].response as { config: { bingSite?: string } }).config.bingSite).toBeUndefined();
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.BING_WEBMASTER_API_KEY;
    else process.env.BING_WEBMASTER_API_KEY = previous;
  }
});

test("Bing diagnostics retain object envelopes and bound link pages", async () => {
  const previous = process.env.BING_WEBMASTER_API_KEY;
  process.env.BING_WEBMASTER_API_KEY = "secret";
  const urls: URL[] = [];
  let mode = "links";
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = new URL(input instanceof Request ? input.url : input.toString());
        urls.push(url);
        if (mode === "fault" && url.searchParams.get("page") === "1")
          return Response.json({ ErrorCode: 4, Message: "secret" });
        if (mode === "invalid") return Response.json({ d: { Links: [], TotalPages: -1 } });
        if (mode === "info")
          return Response.json({ d: { Url: "https://example.com/", HttpStatus: 0, AnchorCount: 1 } });
        if (mode === "issues") return Response.json({ d: [] });
        if (mode === "url-links")
          return Response.json({
            d: { Details: [{ Url: "https://referrer.example/", AnchorText: "Reference" }], TotalPages: 1 },
          });
        if (mode === "crawl") return Response.json({ d: [{ Code5xx: 69, InIndex: 7648 }] });
        if (mode === "empty") return Response.json({ d: { Links: [], TotalPages: 0 } });
        return Response.json({
          d: {
            Links: [{ Url: "https://example.com/", Count: 1 }],
            TotalPages: mode === "unstable" && url.searchParams.get("page") === "1" ? 3 : 2,
          },
        });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const input = { operation: "bing.link-counts", site: "https://example.com/" };
    const limited = await execute(input);
    expect(limited.status).toBe("partial");
    expect(limited.pagination).toEqual({ exhausted: false, nextOffset: 1, rowsReturned: 1 });
    const complete = await execute({ ...input, maxPages: 2 });
    expect(complete.pagination).toEqual({ exhausted: true, nextOffset: null, rowsReturned: 2 });
    expect(complete.pages[1].request).toMatchObject({ page: "1", method: "GetLinkCounts" });
    mode = "fault";
    const failed = await execute({ ...input, maxPages: 2 });
    expect(failed.status).toBe("partial");
    expect(failed.pages).toHaveLength(1);
    expect(failed.error?.code).toBe("bing_fault_4");
    expect(JSON.stringify(failed)).not.toContain("secret");
    mode = "unstable";
    expect((await execute({ ...input, maxPages: 3 })).warnings.join(" ")).toContain("TotalPages changed");
    mode = "empty";
    expect((await execute(input)).pagination).toEqual({ exhausted: true, nextOffset: null, rowsReturned: 0 });
    mode = "invalid";
    expect((await execute(input)).error?.code).toBe("invalid_response");
    mode = "info";
    const info = await execute({ operation: "bing.url-info", site: input.site, url: input.site });
    expect(info.pages[0].response).toMatchObject({ d: { HttpStatus: 0 } });
    expect(urls.at(-1)?.searchParams.get("url")).toBe(input.site);
    mode = "crawl";
    expect((await execute({ operation: "bing.crawl-stats", site: input.site })).status).toBe("ok");
    mode = "issues";
    expect((await execute({ operation: "bing.crawl-issues", site: input.site })).pages[0].response).toEqual({ d: [] });
    mode = "url-links";
    const links = await execute({ operation: "bing.url-links", site: input.site, url: input.site });
    expect(links.pagination).toEqual({ exhausted: true, nextOffset: null, rowsReturned: 1 });
    expect(urls.at(-1)?.searchParams.get("link")).toBe(input.site);
    expect(urls.at(-1)?.searchParams.has("url")).toBe(false);
    expect(operationSchema.safeParse({ ...input, maxPages: 21 }).success).toBe(false);
  } finally {
    mocked.mockRestore();
    if (previous === undefined) delete process.env.BING_WEBMASTER_API_KEY;
    else process.env.BING_WEBMASTER_API_KEY = previous;
  }
});
