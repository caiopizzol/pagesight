import { expect, spyOn, test } from "bun:test";
import { execute } from "../../src/api/index.js";
import { gscRequestSchema } from "../../src/api/schema.js";
import { clearTokenCache } from "../../src/providers/gsc-auth.js";
import { inspectUrl, listSitemaps, listSites } from "../../src/providers/gsc.js";

test("GSC raw envelopes survive the API while legacy helpers keep their shapes", async () => {
  const keys = ["GSC_SERVICE_ACCOUNT_KEY", "GSC_CLIENT_ID", "GSC_CLIENT_SECRET", "GSC_REFRESH_TOKEN"];
  const previous = keys.map((key) => process.env[key]);
  delete process.env.GSC_SERVICE_ACCOUNT_KEY;
  process.env.GSC_CLIENT_ID = "test-client";
  process.env.GSC_CLIENT_SECRET = "test-secret";
  process.env.GSC_REFRESH_TOKEN = "test-refresh";
  clearTokenCache();
  const entries = [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }];
  const sitemaps = [{ path: "https://example.com/sitemap.xml" }];
  const inspection = { inspectionResultLink: "https://example.com/inspection" };
  const mocked = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: Parameters<typeof fetch>[0]) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "test-access" });
        if (url.includes("urlInspection"))
          return Response.json({ inspectionResult: inspection, providerMetadata: "inspection" });
        if (url.endsWith("/sitemaps")) return Response.json({ sitemap: sitemaps, providerMetadata: "sitemaps" });
        return Response.json({ siteEntry: entries, providerMetadata: "sites" });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    for (const [operation, marker] of [
      ["gsc.sites", "sites"],
      ["gsc.sitemaps", "sitemaps"],
      ["gsc.inspect", "inspection"],
    ]) {
      const input =
        operation === "gsc.sites"
          ? { operation }
          : operation === "gsc.sitemaps"
            ? { operation, site: "sc-domain:example.com" }
            : { operation, site: "sc-domain:example.com", url: "https://example.com/" };
      const result = await execute(input);
      expect(result.status).toBe("ok");
      expect(result.pages[0].response).toMatchObject({ providerMetadata: marker });
    }
    expect(await listSites()).toEqual(entries);
    expect(await listSitemaps("sc-domain:example.com")).toEqual(expect.arrayContaining(sitemaps));
    expect(await inspectUrl("https://example.com/", "sc-domain:example.com")).toEqual(
      expect.objectContaining(inspection),
    );
  } finally {
    mocked.mockRestore();
    clearTokenCache();
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});

test("GSC accepts the documented News Showcase aggregation", () => {
  expect(
    gscRequestSchema.parse({ startDate: "2026-08-01", endDate: "2026-08-28", aggregationType: "byNewsShowcasePanel" })
      .aggregationType,
  ).toBe("byNewsShowcasePanel");
});
