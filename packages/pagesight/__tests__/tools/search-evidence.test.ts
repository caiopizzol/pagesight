import { expect, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { clearTokenCache } from "../../src/providers/gsc-auth.js";
import { addSitemapFindings, registerAuditTool } from "../../src/tools/audit.js";
import { formatComparison } from "../../src/tools/search.js";

test("deprecated indexed zero does not create a false indexing alarm", () => {
  const findings: Parameters<typeof addSitemapFindings>[1] = [];
  addSitemapFindings(
    [
      {
        path: "https://example.com/sitemap.xml",
        isPending: false,
        isSitemapsIndex: false,
        contents: [{ type: "web", submitted: "7913", indexed: "0" }],
        errors: "0",
        warnings: "0",
      },
    ],
    findings,
  );
  expect(findings).toEqual([]);
});

test("real sitemap processing failures remain actionable", () => {
  const findings: Parameters<typeof addSitemapFindings>[1] = [];
  addSitemapFindings(
    [{ path: "https://example.com/sitemap.xml", isPending: false, isSitemapsIndex: false, errors: "2", warnings: "1" }],
    findings,
  );
  expect(findings.map((f) => f.severity)).toEqual(["HIGH", "MEDIUM"]);
});

test("a row missing from either period is not a zero-click winner or loser", () => {
  const row = (key: string, clicks: number) => ({
    keys: [key],
    clicks,
    impressions: 100,
    ctr: clicks / 100,
    position: 5,
  });
  const output = formatComparison(
    "sc-domain:example.com",
    { rows: [row("only-current", 10), row("shared", 4)], responseAggregationType: "byPage" },
    { rows: [row("only-previous", 20), row("shared", 2)], responseAggregationType: "byPage" },
    ["page"],
    "2026-08-01",
    "2026-08-28",
    "2026-07-04",
    "2026-07-31",
  );
  expect(output).not.toContain("page=only-current");
  expect(output).not.toContain("page=only-previous");
  expect(output).toContain("page=shared");
  expect(output).toContain("not property totals");
});

test("legacy audit exposes a failed inspection and retains classified PageSpeed errors", async () => {
  const env = ["GSC_SERVICE_ACCOUNT_KEY", "GSC_CLIENT_ID", "GSC_CLIENT_SECRET", "GSC_REFRESH_TOKEN"];
  const previous = env.map((key) => process.env[key]);
  delete process.env.GSC_SERVICE_ACCOUNT_KEY;
  process.env.GSC_CLIENT_ID = "test-client";
  process.env.GSC_CLIENT_SECRET = "test-secret";
  process.env.GSC_REFRESH_TOKEN = "test-refresh";
  clearTokenCache();
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "test-access" });
        if (url.includes("urlInspection")) return new Response("private-inspection-error", { status: 403 });
        if (url.includes("pagespeedonline")) return new Response("private-psi-error", { status: 429 });
        if (url.includes("/sitemaps")) return Response.json({ sitemap: [] });
        if (url.includes("raw.githubusercontent.com")) return Response.json({});
        if (url.endsWith("robots.txt")) return new Response("User-agent: *\nAllow: /");
        return new Response("<html><head><title>Audit check</title></head></html>");
      },
      { preconnect: fetch.preconnect },
    ),
  );
  const server = new McpServer({ name: "audit-test", version: "1.0.0" });
  const client = new Client({ name: "audit-test-client", version: "1.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  registerAuditTool(server);
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const result = await client.callTool({
      name: "audit",
      arguments: { url: "https://example.com/", site_url: "sc-domain:example.com" },
    });
    const output = JSON.stringify(result.content);
    expect(output).toContain("results below are partial");
    expect(output).toContain("FAIL  Inspect:");
    expect(output).toContain("HTTP 403");
    expect(output).toContain("PageSpeed: SKIPPED (rate limited");
    expect(output).not.toContain("private-inspection-error");
    expect(output).not.toContain("private-psi-error");
  } finally {
    await client.close();
    await server.close();
    mocked.mockRestore();
    clearTokenCache();
    env.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
