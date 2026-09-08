import { expect, spyOn, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { execute } from "../src/api/index.js";
import { gscRequestSchema } from "../src/api/schema.js";
import { parseInventorySitemap } from "../src/api/sitemap.js";
import { observeSitemap } from "../src/api/web.js";
import { clearTokenCache } from "../src/lib/auth.js";
import { gaCredentialPath } from "../src/lib/ga.js";
import { inspectUrl, listSites, listSitemaps } from "../src/lib/gsc.js";
import { requestJson } from "../src/lib/http.js";

test("JSON syntax failures and interrupted response bodies have different safe errors", async () => {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === "/invalid") return new Response("private-invalid-json");
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("{"));
          },
        }),
      );
    },
  });
  try {
    const invalid = await requestJson(`${fixture.url}invalid`).catch((e: unknown) => e);
    expect(invalid).toMatchObject({ code: "invalid_response", status: 200 });
    const interrupted = await requestJson(`${fixture.url}slow`, {}, 50).catch((e: unknown) => e);
    expect(interrupted).toMatchObject({ code: "network_error", status: null });
    expect(JSON.stringify([invalid, interrupted])).not.toContain("private-invalid-json");
  } finally {
    await fixture.stop(true);
  }
});

test("empty GA credential variables fall through to the next source", () => {
  const keys = ["PAGESIGHT_GA_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS"];
  const previous = keys.map((key) => process.env[key]);
  try {
    process.env.PAGESIGHT_GA_CREDENTIALS = "";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/test-adc.json";
    expect(gaCredentialPath()).toBe("/tmp/test-adc.json");
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
    expect(gaCredentialPath()).toBe(join(homedir(), ".config/gcloud/application_default_credentials.json"));
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  }
});

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

test("sitemap XML decodes numeric entities once and preserves CDATA", () => {
  const result = parseInventorySitemap(
    "<urlset><url><loc>https://example.com/&#x61;?a=1&#38;b=2&amp;literal=&#x1F600;</loc></url><url><loc><![CDATA[https://example.com/?a=1&b=2]]></loc></url></urlset>",
  );
  expect(result.urls).toEqual(["https://example.com/a?a=1&b=2&literal=😀", "https://example.com/?a=1&b=2"]);
});

test("malformed sitemap content cannot claim complete empty coverage", () => {
  for (const xml of [
    "<urlset><url><loc>https://example.com/</loc></urlset>",
    "<urlset><url><loc>https://example.com/</loc></url>",
    "<urlset><url/></urlset>",
    "<urlset><url><loc/></url></urlset>",
    "<urlset><url><loc>https://example.com/</loc><loc>https://example.com/2</loc></url></urlset>",
    '<!DOCTYPE urlset [<!ENTITY foo "secret">]><urlset/>',
    "<urlset><url><loc>https://example.com/?a=1&bad;</loc></url></urlset>",
    "<urlset/><urlset/>",
  ])
    expect(() => parseInventorySitemap(xml)).toThrow();
  expect(parseInventorySitemap("<urlset/>").urls).toEqual([]);
});

test("large sitemap indexes schedule at most five documents and retain incompleteness", async () => {
  const requests: string[] = [];
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(req): Response {
      const path = new URL(req.url).pathname;
      requests.push(path);
      if (path === "/index.xml")
        return new Response(
          `<sitemapindex>${Array.from({ length: 20000 }, (_, i) => `<sitemap><loc>${fixture.url}${i}.xml</loc></sitemap>`).join("")}</sitemapindex>`,
        );
      return new Response("<urlset/>");
    },
  });
  try {
    const result = await observeSitemap(`${fixture.url}index.xml`);
    expect(requests).toHaveLength(5);
    expect(result.complete).toBe(false);
    expect(result.omittedChildReferences).toBe(19996);
    expect(result.unvisited).toHaveLength(0);
    expect(result.errors).toEqual([]);
  } finally {
    await fixture.stop(true);
  }
});
