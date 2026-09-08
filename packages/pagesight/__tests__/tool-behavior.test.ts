import { mockFetch, requestUrl } from "./support/fetch.js";
import { expect, test } from "bun:test";
import { registerPageTool } from "../src/tools/page/tool.js";
import { registerSearchTool } from "../src/tools/search.js";
import { registerSpeedTool } from "../src/tools/speed.js";
import { parseSitemapXml, sampleUrls } from "../src/lib/sitemap.js";
import { callTool } from "./support/mcp.js";

test("page contrast retains normal and large-text thresholds", async () => {
  const normal = await callTool(registerPageTool, "page", { foreground: "#000", background: "#fff" });
  expect(normal).toContain("21.00:1");
  expect(normal).toContain("WCAG AA (4.5:1): PASS");
  const large = await callTool(registerPageTool, "page", { foreground: "#000", background: "#fff", large_text: true });
  expect(large).toContain("WCAG AA (3:1): PASS");
  expect(await callTool(registerPageTool, "page", { foreground: "wrong", background: "#fff" })).toContain(
    "Invalid foreground",
  );
});

test("page reports broken internal links in single and batch modes", async () => {
  const fixture = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      return new URL(request.url).pathname === "/missing"
        ? new Response("Missing", { status: 404 })
        : new Response('<title>Fixture</title><a href="/missing">Broken</a>');
    },
  });
  try {
    const single = await callTool(registerPageTool, "page", { url: fixture.url.href });
    expect(single).toContain("404");
    const batch = await callTool(registerPageTool, "page", {
      urls: [fixture.url.href, new URL("/other", fixture.url).href],
    });
    expect(batch).toContain("Batch Page Analysis (2 URLs)");
    expect(batch).toContain("1 broken");
  } finally {
    await fixture.stop(true);
  }
});

test("search explicit actions validate their required inputs", async () => {
  expect(await callTool(registerSearchTool, "search", { action: "inspect" })).toContain("url is required");
  expect(await callTool(registerSearchTool, "search", { action: "get_site" })).toContain("site_url is required");
});

const pagespeed = {
  analysisUTCTimestamp: "2026-01-01T00:00:00Z",
  lighthouseResult: {
    configSettings: { emulatedFormFactor: "mobile" },
    lighthouseVersion: "12",
    categories: { performance: { id: "performance", title: "Performance", score: 0.9 } },
    audits: {},
    timing: { total: 1000 },
  },
};

test("speed preserves single, comparison, and partial batch results", async () => {
  const fetchMock = mockFetch(async (input) => {
    const target = new URL(requestUrl(input)).searchParams.get("url");
    return target?.includes("broken") ? new Response("failed", { status: 500 }) : Response.json(pagespeed);
  });
  try {
    expect(await callTool(registerSpeedTool, "speed", { url: "https://example.com/a" })).toContain("Performance: 90");
    const compare = await callTool(registerSpeedTool, "speed", {
      urls: ["https://example.com/a", "https://example.com/b"],
    });
    expect(compare).toContain("90");
    expect(compare).toContain("/a");
    expect(compare).toContain("/b");
    const partial = await callTool(registerSpeedTool, "speed", {
      urls: ["https://example.com/a", "https://example.com/broken"],
    });
    expect(partial).toContain("Errors");
    expect(partial).toContain("broken");
  } finally {
    fetchMock.mockRestore();
  }
});

test("speed auto-selects CrUX from origin and preserves missing-data output", async () => {
  const previous = process.env.GOOGLE_API_KEY;
  process.env.GOOGLE_API_KEY = "fixture";
  const calls: string[] = [];
  const fetchMock = mockFetch(async (input) => {
    calls.push(requestUrl(input));
    return new Response("missing", { status: 404 });
  });
  try {
    expect(await callTool(registerSpeedTool, "speed", { origin: "https://example.com" })).toContain("No CrUX data");
    expect(calls[0]).toContain("queryRecord");
    expect(
      await callTool(registerSpeedTool, "speed", { action: "crux_history", url: "https://example.com", periods: 2 }),
    ).toContain("No CrUX history data");
    expect(calls[1]).toContain("queryHistoryRecord");
  } finally {
    fetchMock.mockRestore();
    if (previous === undefined) delete process.env.GOOGLE_API_KEY;
    else process.env.GOOGLE_API_KEY = previous;
  }
});

test("legacy sitemap parsing and sampling keep URL order and input intact", () => {
  expect(
    parseSitemapXml("<sitemapindex><sitemap><loc>https://example.com/a.xml</loc></sitemap></sitemapindex>"),
  ).toEqual({ urls: [], isSitemapIndex: true, childSitemaps: ["https://example.com/a.xml"] });
  const urls = ["a", "b", "c", "d", "e", "f"];
  expect(sampleUrls(urls, 2, "first")).toEqual(["a", "b"]);
  expect(sampleUrls(urls, 2, "spread")).toEqual(["a", "d"]);
  expect(new Set(sampleUrls(urls, 3, "random")).size).toBe(3);
  expect(urls).toEqual(["a", "b", "c", "d", "e", "f"]);
  expect(parseSitemapXml("<urlset><url><loc>https://example.com/a</loc></url></urlset>").urls).toEqual([
    "https://example.com/a",
  ]);
});
