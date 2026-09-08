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
